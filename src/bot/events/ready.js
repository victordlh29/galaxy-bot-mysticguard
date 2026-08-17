const client = require('../client');
const { ChannelType } = require('discord.js');
const { deploy } = require('../deploy-commands');
const { getConfig } = require('../../utils/config');
const { buildRulesEmbed, DEFAULT_RULES_TEXT } = require('../../utils/rulesEmbed');
const { updatePresence } = require('../../utils/presence');
const { detectAdminRoles } = require('../../utils/permissions');
const { getDefaultGuildId } = require('../../utils/defaultGuild');
const { startVoiceTick, isTickActive } = require('../../utils/voiceXp');
const { logToChannel } = require('../../utils/logger');

async function reconcileVoiceXp() {
  for (const guild of client.guilds.cache.values()) {
    try {
      const config = await getConfig(guild.id);
      if (!config.xp || !config.xp.enabled || !config.xp.voiceEnabled) continue;
      for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildVoice) continue;
        for (const [userId, m] of channel.members) {
          if (m.user.bot || isTickActive(guild.id, userId)) continue;
          startVoiceTick(config, guild, userId);
        }
      }
    } catch (_) {}
  }
}

module.exports = {
  name: 'clientReady',
  once: true,
  async execute() {
    console.log(`[BOT] Conectado como ${client.user.tag} (${client.user.id})`);
    await deploy();
    updatePresence();

    const defaultId = await getDefaultGuildId(client);
    console.log(
      `[BOT] Servidor por defecto (DB): ${defaultId ? client.guilds.cache.get(defaultId)?.name || defaultId : 'ninguno'}`
    );

    const base = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || 'http://localhost:3000';
    const heartbeatUrl = `${base}/api/heartbeat`;
    setInterval(async () => {
      try {
        await fetch(heartbeatUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'x-heartbeat-secret': process.env.HEARTBEAT_SECRET },
          body: JSON.stringify({ bot: 'online', guilds: client.guilds.cache.size })
        });
      } catch (_) {}
    }, 30000);

    for (const guild of client.guilds.cache.values()) {
      const config = await getConfig(guild.id);
      if (!Array.isArray(config.adminRoles) || !config.adminRoles.length) {
        const detected = detectAdminRoles(guild);
        if (detected.length) {
          await config.updateOne({ $set: { adminRoles: detected } });
          console.log(`[ROLES] Admins auto-detectados en ${guild.name}: ${detected.length} rol(es)`);
        }
      }
      if (config.rules.enabled && config.rules.channelId && config.rules.messageId) {
        try {
          const channel = guild.channels.cache.get(config.rules.channelId);
          if (channel && channel.isTextBased()) {
            const msg = await channel.messages.fetch(config.rules.messageId).catch(() => null);
            if (!msg) {
              const text = config.rules.text || DEFAULT_RULES_TEXT;
              const created = await channel.send({ embeds: [buildRulesEmbed(text, { guild })] });
              await config.updateOne({ $set: { 'rules.messageId': created.id } });
              await created.react(config.rules.emoji || '✅');
            }
          }
        } catch (err) {
          console.error(`[READY] error revisando reglas en ${guild.id}:`, err.message);
        }
      }
      if (config.rules.enabled && (!config.rules.roleId || !guild.roles.cache.get(config.rules.roleId))) {
        await logToChannel(
          guild,
          config,
          '⚠️ **Reglas activas pero sin rol de acceso**: quien reaccione ✅ no recibirá ningún rol. Configura el rol **Hoobits** en el dashboard (Reglas → Crear rol de acceso) para cerrar la puerta de entrada.'
        );
      }
    }
    console.log('[BOT] Listo.');
    await reconcileVoiceXp();
    setInterval(reconcileVoiceXp, 60000);
  }
};

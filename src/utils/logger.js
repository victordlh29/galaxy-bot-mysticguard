const { EmbedBuilder } = require('discord.js');
const CommandLog = require('../models/CommandLog');
const { getConfig } = require('./config');

const EVENT_LABELS = {
  'member-join': 'Miembro entró',
  'member-leave': 'Miembro salió',
  'member-nickname': 'Apodo cambiado',
  'member-role-add': 'Roles añadidos',
  'member-role-remove': 'Roles quitados',
  'server-boost': 'Boost del servidor',
  'server-unboost': 'Boost quitado',
  'server-update': 'Servidor actualizado',
  'role-create': 'Rol creado',
  'role-update': 'Rol actualizado',
  'role-delete': 'Rol eliminado',
  'voice-join': 'Entrada a canal de voz',
  'voice-leave': 'Salida de canal de voz',
  'voice-switch': 'Cambio de canal de voz',
  'antispam': 'Anti-spam',
  'antispam-flood': 'Anti-spam (flood)',
  'rules-accept': 'Reglas aceptadas',
  'reaction-add': 'Reacción añadida',
  'message-delete': 'Mensaje borrado',
  'message-edit': 'Mensaje editado',
  'manual-xp': 'XP ajustado manualmente'
};

function buildLogEmbed(guild, { icon, title, description, userTag, footerLabel }) {
  const avatar = guild && guild.client ? guild.client.user.displayAvatarURL({ size: 64 }) : undefined;
  // La hora la pinta DISCORD (.setTimestamp), no el host: Discord la renderiza en la zona
  // horaria e idioma de QUIEN LEE, así que el sello coincide siempre con la hora real del
  // mensaje. Antes se formateaba aquí con la TZ del proceso — y el hosting corre en UTC,
  // así que el usuario veía el registro desfasado varias horas respecto al mensaje.
  const embed = new EmbedBuilder()
    .setColor('#5B21B6')
    .setAuthor({ name: `MysticGuard · ${guild ? guild.name : 'Servidor'}`, iconURL: avatar })
    .setTitle(`${icon} ${EVENT_LABELS[title] || title}`)
    .setDescription(description || '—')
    .setFooter({ text: `MysticGuard · ${footerLabel}`, iconURL: avatar })
    .setTimestamp(new Date());
  if (userTag) embed.addFields({ name: 'Usuario', value: userTag, inline: true });
  return embed;
}

async function logCommand(guildId, { type = 'command', command = '', userId = '', userTag = '', details = '' }) {
  try {
    await CommandLog.create({ guildId, type, command, userId, userTag, details });
  } catch (err) {
    console.error('[LOG] error guardando log:', err.message);
  }
  try {
    const client = require('../bot/client');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return;
    const config = await getConfig(guildId);
    if (!config.logs.enabled || !config.logs.channelId) return;
    const channel = guild.channels.cache.get(config.logs.channelId);
    if (!channel || !channel.isTextBased()) return;
    const isEvent = type === 'event';
    await channel.send({
      embeds: [
        buildLogEmbed(guild, {
          icon: isEvent ? '📌' : '🛠️',
          title: command,
          description: details,
          userTag,
          footerLabel: `Registro de ${isEvent ? 'Eventos' : 'Comandos'}`
        })
      ]
    });
  } catch (err) {
    console.error('[LOG] error reenviando al canal:', err.message);
  }
}

async function logToChannel(guild, config, text) {
  if (!config.logs.enabled || !config.logs.channelId) return;
  try {
    const channel = guild.channels.cache.get(config.logs.channelId);
    if (!channel || !channel.isTextBased()) return;
    await channel.send({ embeds: [buildLogEmbed(guild, { icon: '🔔', title: 'Registro', description: text, footerLabel: 'Registro del servidor' })] });
  } catch (err) {
    console.error('[LOG] error enviando log al canal:', err.message);
  }
}

module.exports = { logCommand, logToChannel, buildLogEmbed };
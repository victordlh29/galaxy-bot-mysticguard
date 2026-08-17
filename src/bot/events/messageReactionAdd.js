const { getConfig } = require('../../utils/config');
const { safeAddRole } = require('../../utils/roles');
const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'messageReactionAdd',
  async execute(reaction, user) {
    if (user.bot) return;
    try {
      if (reaction.partial) await reaction.fetch();
      if (reaction.message.partial) await reaction.message.fetch();
    } catch (_) {
      return;
    }
    const guild = reaction.message.guild;
    if (!guild) return;

    const config = await getConfig(guild.id);

    const emojiKey = reaction.emoji.name || reaction.emoji.id;
    const channelName = reaction.message.channel && reaction.message.channel.name ? reaction.message.channel.name : 'canal desconocido';
    const msgLink = `https://discord.com/channels/${guild.id}/${reaction.message.channelId}/${reaction.message.id}`;

    await logCommand(guild.id, {
      type: 'event',
      command: 'reaction-add',
      userId: user.id,
      userTag: user.tag,
      details: `Reaccionó con ${emojiKey} en #${channelName} — [mensaje](${msgLink})`
    });

    if (!config.rules.enabled) return;
    if (reaction.message.id !== config.rules.messageId) return;

    const configEmoji = (config.rules.emoji || '✅').trim();
    if (emojiKey !== configEmoji && emojiKey !== configEmoji.replace(':', '')) return;

    const member = guild.members.cache.get(user.id) || (await guild.members.fetch(user.id).catch(() => null));
    if (!member) return;

    const assigned = await safeAddRole(guild, member, config.rules.roleId, 'Reaccionó al mensaje de reglas (Hoobits)');
    if (assigned) {
      await logCommand(guild.id, {
        type: 'event',
        command: 'rules-accept',
        userId: user.id,
        userTag: user.tag,
        details: 'Aceptó las reglas y obtuvo el rol de acceso'
      });
    }
  }
};

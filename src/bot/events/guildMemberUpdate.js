const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember) {
    if (!newMember.guild || newMember.user.bot) return;
    const guildId = newMember.guild.id;
    const userId = newMember.id;
    const userTag = newMember.user.tag;

    try {
      if (oldMember.partial) await oldMember.fetch();
    } catch (_) {}

    const oldNick = oldMember.nickname || newMember.user.username;
    const newNick = newMember.nickname || newMember.user.username;
    if (oldNick !== newNick) {
      await logCommand(guildId, {
        type: 'event',
        command: 'member-nickname',
        userId,
        userTag,
        details: `Apodo: ${oldNick} → ${newNick}`
      });
    }

    const added = newMember.roles.cache.filter((r) => r.id !== guildId && !oldMember.roles.cache.has(r.id));
    const removed = oldMember.roles.cache.filter((r) => r.id !== guildId && !newMember.roles.cache.has(r.id));
    if (added.size) {
      await logCommand(guildId, {
        type: 'event',
        command: 'member-role-add',
        userId,
        userTag,
        details: `Roles añadidos: ${added.map((r) => r.name).join(', ')}`
      });
    }
    if (removed.size) {
      await logCommand(guildId, {
        type: 'event',
        command: 'member-role-remove',
        userId,
        userTag,
        details: `Roles quitados: ${removed.map((r) => r.name).join(', ')}`
      });
    }

    if (!oldMember.premiumSince && newMember.premiumSince) {
      await logCommand(guildId, {
        type: 'event',
        command: 'server-boost',
        userId,
        userTag,
        details: 'Mejoró el servidor 🚀'
      });
    } else if (oldMember.premiumSince && !newMember.premiumSince) {
      await logCommand(guildId, {
        type: 'event',
        command: 'server-unboost',
        userId,
        userTag,
        details: 'Quitó el boost del servidor'
      });
    }
  }
};
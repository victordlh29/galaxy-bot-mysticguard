const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild) {
    if (!newGuild.id) return;
    try {
      if (oldGuild.partial) await oldGuild.fetch();
    } catch (_) {}
    const changes = [];
    if (oldGuild.name !== newGuild.name) changes.push(`nombre: ${oldGuild.name} → ${newGuild.name}`);
    if (oldGuild.icon !== newGuild.icon) changes.push('icono');
    if (oldGuild.banner !== newGuild.banner) changes.push('banner');
    if (oldGuild.premiumTier !== newGuild.premiumTier) {
      changes.push(`nivel de boost: ${oldGuild.premiumTier} → ${newGuild.premiumTier}`);
    }
    if (!changes.length) return;
    await logCommand(newGuild.id, {
      type: 'event',
      command: 'server-update',
      userId: '',
      userTag: '',
      details: `Servidor: ${changes.join(', ')}`
    });
  }
};
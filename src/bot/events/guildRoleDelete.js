const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildRoleDelete',
  async execute(role) {
    if (!role.guild) return;
    await logCommand(role.guild.id, {
      type: 'event',
      command: 'role-delete',
      userId: '',
      userTag: '',
      details: `Rol eliminado: **${role.name}**`
    });
  }
};
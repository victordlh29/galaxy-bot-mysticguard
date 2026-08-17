const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildRoleCreate',
  async execute(role) {
    if (!role.guild) return;
    await logCommand(role.guild.id, {
      type: 'event',
      command: 'role-create',
      userId: '',
      userTag: '',
      details: `Rol creado: **${role.name}**`
    });
  }
};
const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildRoleUpdate',
  async execute(oldRole, newRole) {
    if (!newRole.guild) return;
    const changes = [];
    if (oldRole.name !== newRole.name) changes.push(`nombre: ${oldRole.name} → ${newRole.name}`);
    if (oldRole.color !== newRole.color) changes.push('color');
    if (oldRole.position !== newRole.position) changes.push('posición');
    if (oldRole.permissions.bitfield !== newRole.permissions.bitfield) changes.push('permisos');
    if (oldRole.hoist !== newRole.hoist) changes.push('mostrar por separado');
    if (oldRole.mentionable !== newRole.mentionable) changes.push('mencionable');
    if (!changes.length) return;
    await logCommand(newRole.guild.id, {
      type: 'event',
      command: 'role-update',
      userId: '',
      userTag: '',
      details: `Rol **${newRole.name}**: ${changes.join(', ')}`
    });
  }
};
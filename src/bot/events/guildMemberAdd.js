const { getConfig } = require('../../utils/config');
const { safeAddRole } = require('../../utils/roles');
const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildMemberAdd',
  async execute(member) {
    const config = await getConfig(member.guild.id);

    if (config.welcome.enabled && config.welcome.channelId) {
      const channel = member.guild.channels.cache.get(config.welcome.channelId);
      if (channel && channel.isTextBased()) {
        const msg = config.welcome.message
          .replaceAll('{user}', `<@${member.id}>`)
          .replaceAll('{server}', member.guild.name);
        channel.send(msg).catch(() => {});
      }
    }

    let assigned = null;
    if (config.autorole.enabled) {
      assigned = await safeAddRole(
        member.guild,
        member,
        config.autorole.roleId || config.xp.gainRole,
        'Nuevo miembro: rol de bienvenida (Mago Blanco)'
      );
    }

    await logCommand(member.guild.id, {
      type: 'event',
      command: 'member-join',
      userId: member.id,
      userTag: member.user.tag,
      details: assigned ? 'Se unió y recibió su rol de bienvenida' : 'Se unió al servidor'
    });
  }
};

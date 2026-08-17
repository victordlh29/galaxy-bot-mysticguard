const { getConfig } = require('../../utils/config');
const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'guildMemberRemove',
  async execute(member) {
    await logCommand(member.guild.id, {
      type: 'event',
      command: 'member-leave',
      userId: member.id,
      userTag: member.user.tag,
      details: 'Salió del servidor'
    });

    const config = await getConfig(member.guild.id);
    if (config.goodbye && config.goodbye.enabled && config.goodbye.channelId) {
      const channel = member.guild.channels.cache.get(config.goodbye.channelId);
      if (channel && channel.isTextBased()) {
        const msg = config.goodbye.message
          .replaceAll('{user}', member.user.username)
          .replaceAll('{server}', member.guild.name);
        channel.send(msg).catch(() => {});
      }
    }
  }
};

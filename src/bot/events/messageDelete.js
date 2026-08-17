const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
    if (!message.guild) return;
    if (message.author && message.author.bot) return;

    const channelName = message.channel && message.channel.name ? message.channel.name : 'canal desconocido';
    let content = message.content || '';

    if (message.partial || !content) {
      try {
        await message.fetch();
        content = message.content || '';
      } catch (_) {
        content = '';
      }
    }

    const details = content
      ? `Eliminó un mensaje en #${channelName}: "${content.slice(0, 500)}"`
      : `Eliminó un mensaje en #${channelName} (contenido no disponible)`;

    await logCommand(message.guild.id, {
      type: 'event',
      command: 'message-delete',
      userId: message.author ? message.author.id : '',
      userTag: message.author ? message.author.tag : 'Usuario desconocido',
      details
    });
  }
};
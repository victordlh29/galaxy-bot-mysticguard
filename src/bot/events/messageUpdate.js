const { logCommand } = require('../../utils/logger');

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage) {
    if (!newMessage.guild) return;
    if (newMessage.author && newMessage.author.bot) return;

    try {
      if (oldMessage.partial) await oldMessage.fetch();
      if (newMessage.partial) await newMessage.fetch();
    } catch (_) {}

    const oldContent = oldMessage.content || '';
    const newContent = newMessage.content || '';
    if (!oldContent && !newContent) return;
    if (oldContent === newContent) return;

    const channelName = newMessage.channel && newMessage.channel.name ? newMessage.channel.name : 'canal desconocido';

    await logCommand(newMessage.guild.id, {
      type: 'event',
      command: 'message-edit',
      userId: newMessage.author ? newMessage.author.id : '',
      userTag: newMessage.author ? newMessage.author.tag : 'Usuario desconocido',
      details: `Editó un mensaje en #${channelName}: "${oldContent.slice(0, 300)}" → "${newContent.slice(0, 300)}"`
    });
  }
};
const { updatePresence } = require('../../utils/presence');
const { invalidateDefaultGuildId, getCachedDefaultGuildId } = require('../../utils/defaultGuild');

module.exports = {
  name: 'guildDelete',
  execute(guild) {
    console.log(`[BOT] Salí del servidor ${guild.name} (${guild.id})`);
    if (getCachedDefaultGuildId() === guild.id) {
      console.log('[BOT] Era el servidor por defecto; se re-detecta en el próximo arranque');
      invalidateDefaultGuildId();
    }
    updatePresence();
  }
};

const { updatePresence } = require('../../utils/presence');
const { ensureAdminRoles } = require('../../utils/permissions');

module.exports = {
  name: 'guildCreate',
  async execute(guild) {
    console.log(`[BOT] Entré al servidor ${guild.name} (${guild.id})`);
    try {
      const config = await ensureAdminRoles(guild);
      console.log(
        `[ROLES] Admins detectados en ${guild.name}: ${config.adminRoles.length} rol(es) (dueño: ${guild.ownerId})`
      );
    } catch (err) {
      console.error(`[ROLES] error detectando admins en ${guild.name}:`, err.message);
    }
    updatePresence();
  }
};

const client = require('../bot/client');
const { ActivityType } = require('discord.js');

function updatePresence() {
  const count = client.guilds.cache.size;
  const text = `✨ /play | MysticGuard · ${count} servidores`;
  try {
    client.user.setPresence({
      activities: [{ type: ActivityType.Custom, name: text, state: text }],
      status: 'online'
    });
  } catch (err) {
    console.error('[PRESENCE]', err.message);
  }
}

module.exports = { updatePresence };

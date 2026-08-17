const BotSettings = require('../models/BotSettings');

let cachedDefaultGuildId = null;

function invalidateDefaultGuildId() {
  cachedDefaultGuildId = null;
}

function getCachedDefaultGuildId() {
  return cachedDefaultGuildId;
}

async function saveDefaultGuildId(guildId) {
  try {
    await BotSettings.updateOne(
      { key: 'default' },
      { $set: { defaultGuildId: guildId } },
      { upsert: true }
    );
    cachedDefaultGuildId = guildId;
  } catch (err) {
    console.error('[SETTINGS] error guardando servidor por defecto:', err.message);
  }
}

async function getDefaultGuildId(client) {
  if (cachedDefaultGuildId && client.guilds.cache.has(cachedDefaultGuildId)) {
    return cachedDefaultGuildId;
  }
  try {
    const doc = await BotSettings.findOne({ key: 'default' });
    if (doc && doc.defaultGuildId && client.guilds.cache.has(doc.defaultGuildId)) {
      cachedDefaultGuildId = doc.defaultGuildId;
      return cachedDefaultGuildId;
    }
  } catch (err) {
    console.error('[SETTINGS] error leyendo servidor por defecto:', err.message);
  }
  const first = client.guilds.cache.first();
  if (first) {
    await saveDefaultGuildId(first.id);
  } else {
    cachedDefaultGuildId = null;
  }
  return cachedDefaultGuildId;
}

module.exports = { getDefaultGuildId, saveDefaultGuildId, invalidateDefaultGuildId, getCachedDefaultGuildId };

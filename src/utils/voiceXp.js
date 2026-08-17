const { addXp } = require('./xp');
const { applyXpRoles } = require('./roles');
const Member = require('../models/Member');

const voiceTicks = new Map();

function startVoiceTick(config, guild, userId) {
  const key = `${guild.id}:${userId}`;
  if (voiceTicks.has(key)) return;
  const tickSec = (config.xp && config.xp.voiceTickSec) || 60;
  const interval = setInterval(async () => {
    const m = guild.members.cache.get(userId);
    if (!m || !m.voice || !m.voice.channel) {
      clearInterval(interval);
      voiceTicks.delete(key);
      return;
    }
    try {
      const { doc } = await addXp(guild.id, userId, (config.xp && config.xp.xpPerVoiceMin) || 10);
      await Member.updateOne({ guildId: guild.id, userId }, { $inc: { voiceMinutes: 1 } });
      await applyXpRoles(guild, m, config, doc.xp);
    } catch (err) {
      console.error(`[VOICE-XP] error en tick de ${userId}:`, err.message);
    }
  }, tickSec * 1000);
  interval.unref && interval.unref();
  voiceTicks.set(key, interval);
}

function stopVoiceTick(guildId, userId) {
  const key = `${guildId}:${userId}`;
  const tick = voiceTicks.get(key);
  if (tick) {
    clearInterval(tick);
    voiceTicks.delete(key);
  }
}

function isTickActive(guildId, userId) {
  return voiceTicks.has(`${guildId}:${userId}`);
}

module.exports = { startVoiceTick, stopVoiceTick, isTickActive };
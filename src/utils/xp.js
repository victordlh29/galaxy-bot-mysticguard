const Member = require('../models/Member');

const XP_ROLE_NAMES = ['Mago Oscuro', 'Mago Mítico', 'Mago Divino', 'Seres Míticos', 'Semi Dioses'];

function xpForLevel(level, base = 100, growth = 1.6) {
  let total = 0;
  for (let i = 0; i < level; i++) total += Math.floor(base * Math.pow(growth, i));
  return total;
}

function levelForXp(xp, base = 100, growth = 1.6) {
  let level = 0;
  let total = 0;
  while (total + Math.floor(base * Math.pow(growth, level)) <= xp) {
    total += Math.floor(base * Math.pow(growth, level));
    level++;
  }
  return { level, needed: Math.floor(base * Math.pow(growth, level)) };
}

async function addXp(guildId, userId, amount) {
  const doc = await Member.findOneAndUpdate(
    { guildId, userId },
    { $inc: { xp: amount }, $setOnInsert: { level: 0, voiceMinutes: 0 } },
    { new: true, upsert: true }
  );
  const { level, needed } = levelForXp(doc.xp);
  let leveledUp = false;
  if (level > doc.level) {
    doc.level = level;
    doc.needed = needed;
    await doc.save();
    leveledUp = true;
  }
  return { doc, leveledUp, level, needed };
}

async function getMember(guildId, userId) {
  return Member.findOneAndUpdate(
    { guildId, userId },
    { $setOnInsert: { level: 0, xp: 0, voiceMinutes: 0 } },
    { new: true, upsert: true }
  );
}

module.exports = { addXp, getMember, levelForXp, xpForLevel, XP_ROLE_NAMES };

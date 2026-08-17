const { logToChannel } = require('./logger');

async function safeAddRole(guild, member, roleId, reason) {
  if (!roleId) return false;
  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;
    if (member.roles.cache.has(roleId)) return false;
    await member.roles.add(roleId, reason);
    return true;
  } catch (err) {
    console.error(`[ROLES] error asignando rol ${roleId}:`, err.message);
    return false;
  }
}

async function safeRemoveRole(guild, member, roleId, reason) {
  if (!roleId) return false;
  try {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;
    if (!member.roles.cache.has(roleId)) return false;
    await member.roles.remove(roleId, reason);
    return true;
  } catch (err) {
    console.error(`[ROLES] error quitando rol ${roleId}:`, err.message);
    return false;
  }
}

async function applyXpRoles(guild, member, config, currentXp) {
  const added = [];
  const xpRoles = [...config.xp.roles].sort((a, b) => a.xp - b.xp);
  for (const xr of xpRoles) {
    if (currentXp >= xr.xp) {
      const ok = await safeAddRole(guild, member, xr.roleId, `XP alcanzado: ${xr.name || xr.roleId}`);
      if (ok) added.push(xr);
    }
  }
  if (added.length) {
    await logToChannel(
      guild,
      config,
      `🎉 **${member.user.username}** ha subido de rango: ${added
        .map((r) => {
          const roleName = r.name || guild.roles.cache.get(r.roleId)?.name || r.roleId;
          return `${r.emoji || ''} ${roleName}`.trim();
        })
        .join(', ')}`
    );
  }
  return added;
}

module.exports = { safeAddRole, safeRemoveRole, applyXpRoles };

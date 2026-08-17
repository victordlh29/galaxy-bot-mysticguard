const { PermissionsBitField } = require('discord.js');
const { getConfig } = require('./config');

const ADMIN_ROLE_KEYWORDS = [
  'admin',
  'administrador',
  'administrative',
  'owner',
  'dueñ',
  'fundador',
  'founder',
  'ceo',
  'director',
  'dirección',
  'direccion',
  'management',
  'jefe',
  'boss',
  'staff',
  'leadership',
  'lider',
  'líder'
];

function isSuperAdmin(userId) {
  return !!process.env.OWNER_ID && String(process.env.OWNER_ID) === String(userId);
}

function isGuildOwner(member) {
  return !!member && !!member.guild && member.id === member.guild.ownerId;
}

function hasAdminPermission(member) {
  return !!member && !!member.permissions && member.permissions.has(PermissionsBitField.Flags.Administrator);
}

function hasConfiguredAdminRole(member, config) {
  if (!member || !config) return false;
  const ids = Array.isArray(config.adminRoles) ? config.adminRoles : [];
  return ids.some((id) => member.roles.cache.has(id));
}

function isAdmin(member, config) {
  if (!member) return false;
  if (isSuperAdmin(member.id)) return true;
  if (isGuildOwner(member)) return true;
  if (hasAdminPermission(member)) return true;
  return hasConfiguredAdminRole(member, config);
}

function canControlMusic(member, config) {
  if (isAdmin(member, config)) return true;
  if (!member || !config || !config.music) return false;
  const roleId = config.music.controlRoleId;
  return !!roleId && member.roles.cache.has(roleId);
}

function detectAdminRoles(guild) {
  const detected = [];
  for (const role of guild.roles.cache.values()) {
    if (role.managed || role.id === guild.id) continue;
    if (role.permissions.has(PermissionsBitField.Flags.Administrator)) {
      detected.push(role.id);
      continue;
    }
    const name = (role.name || '').toLowerCase();
    if (ADMIN_ROLE_KEYWORDS.some((k) => name.includes(k))) detected.push(role.id);
  }
  return detected;
}

async function ensureAdminRoles(guild) {
  const config = await getConfig(guild.id);
  if (!Array.isArray(config.adminRoles) || !config.adminRoles.length) {
    const detected = detectAdminRoles(guild);
    if (detected.length) {
      await config.updateOne({ $set: { adminRoles: detected } });
      config.adminRoles = detected;
    }
  }
  return config;
}

module.exports = {
  isSuperAdmin,
  isGuildOwner,
  hasAdminPermission,
  hasConfiguredAdminRole,
  isAdmin,
  canControlMusic,
  detectAdminRoles,
  ensureAdminRoles,
  ADMIN_ROLE_KEYWORDS
};

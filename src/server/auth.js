const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { isAdmin: hasAdminAccess } = require('../utils/permissions');
const { getConfig } = require('../utils/config');
const MegaAdmin = require('../models/MegaAdmin');
const { verifyPassword } = require('../utils/password');
const { getDefaultGuildId } = require('../utils/defaultGuild');

const OAUTH_BASE = 'https://discord.com/api/oauth2/authorize';
const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const API_BASE = 'https://discord.com/api/v10';

const SCOPES = ['identify', 'guilds'];

function baseUrl() {
  return process.env.PUBLIC_URL || process.env.DASHBOARD_URL || 'http://localhost:3000';
}

function oauthRedirectUri() {
  return process.env.PUBLIC_URL ? baseUrl() + '/api/auth/discord/callback' : process.env.DISCORD_REDIRECT_URI;
}

async function exchangeCode(code) {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      grant_type: 'authorization_code',
      code,
      redirect_uri: oauthRedirectUri()
    })
  });
  if (!res.ok) throw new Error(`OAuth error ${res.status}`);
  return res.json();
}

async function fetchUser(accessToken) {
  const res = await fetch(`${API_BASE}/users/@me`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) throw new Error(`User fetch error ${res.status}`);
  return res.json();
}

function buildSession(req, user, { isSuperAdmin, isMegaAdmin, isOwner, isAdmin, isMultiAdmin, canMusic, guild, member }) {
  if (!req.session.csrf) {
    req.session.csrf = crypto.randomBytes(24).toString('hex');
  }
  req.session.user = {
    id: user.id,
    username: user.username,
    global_name: user.global_name || user.username,
    avatar: user.avatar,
    isSuperAdmin,
    isMegaAdmin,
    isOwner,
    isAdmin,
    canMusic: !!canMusic,
    isMultiAdmin: !!isMultiAdmin,
    guildId: guild ? guild.id : null,
    guildName: guild ? guild.name : null,
    memberRoles: member ? member.roles.cache.map((r) => r.id) : [],
    discriminator: user.discriminator
  };
}

router.get('/login', (req, res) => {
  const url = new URL(OAUTH_BASE);
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', oauthRedirectUri());
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', SCOPES.join(' '));
  res.redirect(url.toString());
});

router.get('/logout', (req, res) => {
  const sid = req.session.id;
  req.session.destroy(() => {
    if (sid) res.clearCookie('connect.sid');
    res.redirect('/');
  });
});

const callbackHandler = async (req, res) => {
  try {
    const { code } = req.query;
    if (!code) return res.status(400).json({ error: 'Falta el código de autorización' });

    const tokenData = await exchangeCode(code);
    const user = await fetchUser(tokenData.access_token);

    const client = req.app.get('client');
    const isSuperAdmin = process.env.OWNER_ID === user.id;

    if (isSuperAdmin) {
      const guild = client.guilds.cache.get(await getDefaultGuildId(client));
      buildSession(req, user, {
        isSuperAdmin: true,
        isMegaAdmin: false,
        isOwner: guild ? guild.ownerId === user.id : false,
        isAdmin: true,
        canMusic: true,
        isMultiAdmin: false,
        guild: guild || null,
        member: null
      });
      return res.redirect(baseUrl() || '/');
    }

    const defaultGuild = client.guilds.cache.get(await getDefaultGuildId(client));
    const ordered = [];
    if (defaultGuild) ordered.push(defaultGuild);
    for (const g of client.guilds.cache.values()) {
      if (!defaultGuild || g.id !== defaultGuild.id) ordered.push(g);
    }

    let chosen = null;
    let memberGuild = null;
    const ownedGuilds = [];
    const adminGuilds = [];
    for (const guild of ordered) {
      const member = await guild.members.fetch(user.id).catch(() => null);
      if (!member) continue;
      if (!memberGuild) memberGuild = { guild, member };
      const config = await getConfig(guild.id);
      const adminAccess = hasAdminAccess(member, config);
      if (guild.ownerId === user.id) {
        ownedGuilds.push(guild);
      } else if (adminAccess) {
        adminGuilds.push(guild);
      }
      if (!chosen && adminAccess) chosen = { guild, member, config };
    }
    if (!chosen && memberGuild) {
      chosen = {
        guild: memberGuild.guild,
        member: memberGuild.member,
        config: await getConfig(memberGuild.guild.id)
      };
    }

    if (!chosen) {
      return res.redirect('/denied');
    }

    const isOwner = chosen.guild.ownerId === user.id;
    const musicControl = isOwner || hasAdminAccess(chosen.member, chosen.config);
    buildSession(req, user, {
      isSuperAdmin: false,
      isMegaAdmin: false,
      isOwner,
      isAdmin: isOwner || hasAdminAccess(chosen.member, chosen.config),
      canMusic:
        musicControl ||
        (chosen.config.music &&
          chosen.config.music.controlRoleId &&
          chosen.member.roles.cache.has(chosen.config.music.controlRoleId)),
      isMultiAdmin: ownedGuilds.length > 0 && adminGuilds.length > 0,
      guild: chosen.guild,
      member: chosen.member
    });
    res.redirect(baseUrl() || '/');
  } catch (err) {
    console.error('[AUTH] error:', err.message);
    res.status(500).json({ error: 'Error en la autenticación: ' + err.message });
  }
};

router.get('/callback', callbackHandler);
router.get('/discord/callback', callbackHandler);

router.post('/mega-admin/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'Usuario y contraseña requeridos' });
    const doc = await MegaAdmin.findOne({ username: String(username).trim().toLowerCase() });
    if (!doc || !verifyPassword(password, doc.passwordSalt, doc.passwordHash)) {
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    buildSession(req, { id: doc._id.toString(), username: doc.username, global_name: doc.name || doc.username, avatar: null, discriminator: '0' }, {
      isSuperAdmin: false,
      isMegaAdmin: true,
      isOwner: false,
      isAdmin: true,
      canMusic: true,
      isMultiAdmin: false,
      guild: null,
      member: null
    });
    res.json({ ok: true, user: req.session.user, csrf: req.session.csrf });
  } catch (err) {
    console.error('[AUTH] mega-admin error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.get('/me', (req, res) => {
  if (!req.session.user) return res.json({ user: null, csrf: null });
  res.json({ user: req.session.user, csrf: req.session.csrf || null });
});

module.exports = router;

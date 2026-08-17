const express = require('express');
const router = express.Router();
const { ChannelType } = require('discord.js');
const { getConfig, updateConfig } = require('../utils/config');
const { buildRulesEmbed, DEFAULT_RULES_TEXT } = require('../utils/rulesEmbed');
const Member = require('../models/Member');
const CommandLog = require('../models/CommandLog');
const { safeAddRole, applyXpRoles } = require('../utils/roles');
const { isAdmin, canControlMusic } = require('../utils/permissions');
const { levelForXp, xpForLevel } = require('../utils/xp');
const { logCommand } = require('../utils/logger');
const player = require('../music/PlayerManager');
const { getDefaultGuildId, saveDefaultGuildId, getCachedDefaultGuildId } = require('../utils/defaultGuild');

router.use((req, res, next) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    const token = req.headers['x-csrf-token'];
    if (!token || !req.session.csrf || token !== req.session.csrf) {
      return res.status(403).json({ error: 'Token CSRF inválido o ausente' });
    }
  }
  next();
});

function currentGuildId(req) {
  return (req.session.user && req.session.user.guildId) || getCachedDefaultGuildId();
}

async function resolveGuildAccess(req) {
  const client = req.app.get('client');
  const u = req.session.user;
  let guildId = currentGuildId(req);
  if (!guildId || !client.guilds.cache.has(guildId)) {
    guildId = await getDefaultGuildId(client);
  }
  const guild = client.guilds.cache.get(guildId);
  u.guildId = guildId;
  u.guildName = guild ? guild.name : null;
if (u.isMegaAdmin || u.isSuperAdmin) {
    u.isOwner = false;
    u.isAdmin = true;
    u.canMusic = true;
    return guild;
  }
  u.isOwner = false;
  u.isAdmin = false;
  u.isMember = false;
  u.canMusic = false;
  u.memberRoles = [];
  if (!guild) return null;
  let member = guild.members.cache.get(u.id);
  if (!member) member = await guild.members.fetch(u.id).catch(() => null);
  if (!member) return guild;
  u.isMember = true;
  const config = await getConfig(guild.id);
  u.isOwner = guild.ownerId === u.id;
  u.isAdmin = isAdmin(member, config);
  u.memberRoles = Array.from(member.roles.cache.keys());
  u.canMusic = u.isAdmin || canControlMusic(member, config);
  return guild;
}

router.use(async (req, res, next) => {
  if (!req.session.user) return next();
  try {
    await resolveGuildAccess(req);
  } catch (err) {
    console.error('[API] error refrescando acceso:', err.message);
  }
  next();
});

function requireAuth(req, res, next) {
  if (!req.session.user) return res.status(401).json({ error: 'No autenticado' });
  next();
}

function requireMember(req, res, next) {
  requireAuth(req, res, () => {
    const u = req.session.user;
    if (u.isSuperAdmin || u.isMegaAdmin || u.isOwner || u.isAdmin || u.isMember) return next();
    res.status(403).json({ error: 'Permiso denegado: no eres miembro del servidor' });
  });
}

function requireMusicControl(req, res, next) {
  requireMember(req, res, () => {
    if (req.session.user.canMusic) return next();
    res.status(403).json({ error: 'Permiso denegado: solo el rol de control de música (o un admin) puede usar el reproductor' });
  });
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    const u = req.session.user;
    if (u.isSuperAdmin || u.isMegaAdmin || u.isOwner || u.isAdmin) return next();
    res.status(403).json({ error: 'Permiso denegado: necesitas ser administrador' });
  });
}

function requireOwner(req, res, next) {
  requireAuth(req, res, () => {
    const u = req.session.user;
    if (u.isSuperAdmin || u.isMegaAdmin || u.isOwner || u.isAdmin) return next();
    res.status(403).json({ error: 'Permiso denegado: solo el dueño puede configurar' });
  });
}

function requireMega(req, res, next) {
  requireAuth(req, res, () => {
    const u = req.session.user;
    if (u.isSuperAdmin || u.isMegaAdmin) return next();
    res.status(403).json({ error: 'Permiso denegado: solo el mega admin puede ver esto' });
  });
}

router.post('/heartbeat', (req, res) => {
  if (req.headers['x-heartbeat-secret'] !== process.env.HEARTBEAT_SECRET) {
    return res.status(401).json({ error: 'Secreto inválido' });
  }
  const data = req.body || {};
  res.json({ ok: true, receivedAt: Date.now(), bot: data.bot || 'online' });
});

router.get('/guild', requireMember, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    const config = await getConfig(currentGuildId(req));
    const online = guild
      ? guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
      : 0;
    const isMega = req.session.user.isSuperAdmin || req.session.user.isMegaAdmin;
    const topDocs = isMega ? await Member.find({ guildId: currentGuildId(req) }).sort({ xp: -1 }).limit(5) : [];
    const top = topDocs.map((m) => ({
      userId: m.userId,
      username: guild?.members?.cache?.get(m.userId)?.user?.username || m.userId,
      xp: m.xp,
      level: m.level,
      voiceMinutes: m.voiceMinutes
    }));
    res.json({
      config,
      guild: guild
        ? {
            id: guild.id,
            name: guild.name,
            icon: guild.icon,
            memberCount: guild.memberCount,
            online,
            ownerId: guild.ownerId
          }
        : null,
      top
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guilds', requireMega, async (req, res) => {
  try {
    const client = req.app.get('client');
    const defaultId = await getDefaultGuildId(client);
    const guilds = [];
    for (const guild of client.guilds.cache.values()) {
      const config = await getConfig(guild.id);
      const online = guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size;
      const botVoice = player.getQueue(guild.id)?.connection?.joinConfig?.channelId || null;
      const botVoiceName = botVoice ? guild.channels.cache.get(botVoice)?.name || botVoice : null;
      const ownerName = guild.members.cache.get(guild.ownerId)?.user?.username || null;
      guilds.push({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount,
        online,
        ownerId: guild.ownerId,
        ownerName,
        botVoice,
        botVoiceName,
        isManaged: guild.id === defaultId,
        musicPlaying: player.isPlaying(guild.id),
        musicTrack: player.nowPlaying(guild.id)?.title || null,
        welcomeEnabled: !!(config.welcome && config.welcome.enabled && config.welcome.channelId),
        rulesEnabled: !!(config.rules && config.rules.enabled && config.rules.messageId),
        adminRolesCount: (config.adminRoles || []).length
      });
    }
    guilds.sort((a, b) => (b.isManaged ? 1 : 0) - (a.isManaged ? 1 : 0) || a.name.localeCompare(b.name));
    res.json({ guilds, currentId: currentGuildId(req), defaultId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guilds/mine', requireAuth, async (req, res) => {
  try {
    const u = req.session.user;
    if (!u.isSuperAdmin && !u.isMegaAdmin && !u.isMultiAdmin) {
      return res.status(403).json({ error: 'Permiso denegado: no tienes acceso multi-servidor' });
    }
    const client = req.app.get('client');
    const defaultId = await getDefaultGuildId(client);
    const guilds = [];
    for (const guild of client.guilds.cache.values()) {
      let member = guild.members.cache.get(u.id);
      if (!member) member = await guild.members.fetch(u.id).catch(() => null);
      if (!member) continue;
      const config = await getConfig(guild.id);
      const isOwnerHere = guild.ownerId === u.id;
      const isAdminHere = isOwnerHere || isAdmin(member, config);
      if (!isAdminHere) continue;
      const botVoice = player.getQueue(guild.id)?.connection?.joinConfig?.channelId || null;
      guilds.push({
        id: guild.id,
        name: guild.name,
        icon: guild.icon,
        memberCount: guild.memberCount,
        ownerId: guild.ownerId,
        ownerName: guild.members.cache.get(guild.ownerId)?.user?.username || null,
        role: isOwnerHere ? 'owner' : 'admin',
        isManaged: guild.id === defaultId,
        botVoice,
        botVoiceName: botVoice ? guild.channels.cache.get(botVoice)?.name || botVoice : null,
        musicPlaying: player.isPlaying(guild.id),
        musicTrack: player.nowPlaying(guild.id)?.title || null,
        welcomeEnabled: !!(config.welcome && config.welcome.enabled && config.welcome.channelId),
        rulesEnabled: !!(config.rules && config.rules.enabled && config.rules.messageId),
        adminRolesCount: (config.adminRoles || []).length
      });
    }
    guilds.sort((a, b) => (b.isManaged ? 1 : 0) - (a.isManaged ? 1 : 0) || a.name.localeCompare(b.name));
    res.json({ guilds, currentId: currentGuildId(req) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/guilds/default', requireMega, async (req, res) => {
  try {
    const { guildId } = req.body || {};
    const client = req.app.get('client');
    if (!guildId || !client.guilds.cache.has(guildId)) {
      return res.status(400).json({ error: 'Servidor inválido' });
    }
    await saveDefaultGuildId(guildId);
    res.json({ ok: true, defaultId: guildId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/guilds/select', requireAuth, async (req, res) => {
  try {
    const { guildId } = req.body || {};
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(guildId);
    if (!guild) return res.status(400).json({ error: 'Servidor inválido' });
    const u = req.session.user;
    if (!u.isMegaAdmin && !u.isSuperAdmin) {
      let member = guild.members.cache.get(u.id);
      if (!member) member = await guild.members.fetch(u.id).catch(() => null);
      const config = member ? await getConfig(guild.id) : null;
      if (!member || !isAdmin(member, config)) {
        return res.status(403).json({ error: 'No tienes acceso a ese servidor' });
      }
    }
    req.session.user.guildId = guildId;
    await resolveGuildAccess(req);
    res.json({ ok: true, guildId, guildName: guild.name });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guild/channels', requireMember, (req, res) => {
  const client = req.app.get('client');
  const guild = client.guilds.cache.get(currentGuildId(req));
  if (!guild) return res.json({ channels: [], botVoiceChannelId: null });
  const botVoiceChannelId = player.getQueue(currentGuildId(req))?.connection?.joinConfig?.channelId || null;
  const channels = guild.channels.cache
    .filter((c) => [ChannelType.GuildText, ChannelType.GuildVoice, ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.AnnouncementThread, ChannelType.PublicThread].includes(c.type))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parent: c.parent?.name || null,
      voiceMembers: c.type === ChannelType.GuildVoice ? c.members.size : 0
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
  res.json({ channels, botVoiceChannelId });
});

router.get('/guild/roles', requireAdmin, (req, res) => {
  const client = req.app.get('client');
  const guild = client.guilds.cache.get(currentGuildId(req));
  if (!guild) return res.json({ roles: [] });
  const roles = guild.roles.cache
    .filter((r) => r.id !== guild.id && !r.managed)
    .map((r) => ({ id: r.id, name: r.name, color: r.hexColor, position: r.position }))
    .sort((a, b) => b.position - a.position);
  res.json({ roles });
});

router.put('/guild/config', requireOwner, async (req, res) => {
  try {
    const patch = req.body;
    if (!patch || typeof patch !== 'object') return res.status(400).json({ error: 'Body inválido' });
    const config = await updateConfig(currentGuildId(req), patch);
    res.json({ ok: true, config });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guild/rules-default', requireAdmin, (req, res) => {
  res.json({ text: DEFAULT_RULES_TEXT });
});

router.post('/guild/setup-rules', requireOwner, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    const config = await getConfig(guild.id);
    const channel = guild.channels.cache.get(req.body.channelId || config.rules.channelId);
    if (!channel || !channel.isTextBased()) {
      return res.status(400).json({ error: 'Canal de texto inválido' });
    }
    const text =
      req.body.text ||
      config.rules.text ||
      DEFAULT_RULES_TEXT;
    const msg = await channel.send({ embeds: [buildRulesEmbed(text, { guild })] });
    await msg.react(config.rules.emoji || '✅');
    await config.updateOne({
      $set: {
        'rules.channelId': channel.id,
        'rules.messageId': msg.id,
        'rules.enabled': true,
        'rules.text': text
      }
    });
    res.json({ ok: true, messageId: msg.id, channelId: channel.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/guild/rules-access', requireAdmin, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });
    const config = await getConfig(guild.id);
    const roleId = config.rules.roleId || '';
    const role = roleId ? guild.roles.cache.get(roleId) : null;
    const warnings = [];
    if (!roleId) {
      warnings.push('No hay rol de acceso configurado: quien acepte las reglas no recibe ningún rol.');
    } else if (!role) {
      warnings.push(`El rol de acceso configurado ya no existe en el servidor (ID: ${roleId}).`);
    } else if (role.id === guild.id) {
      warnings.push('El rol de acceso es @everyone: no sirve como llave porque todos ya lo tienen.');
    }
    const textChannels = guild.channels.cache.filter(
      (ch) => ch.type === ChannelType.GuildText || ch.type === ChannelType.GuildAnnouncement
    );
    let protectedCount = 0;
    let rulesRoleGrants = 0;
    const openChannels = [];
    for (const ch of textChannels.values()) {
      const everyone = ch.permissionOverwrites.cache.get(guild.id);
      const denied = !!everyone && everyone.deny.has('ViewChannel');
      if (denied) {
        protectedCount++;
        if (role && ch.permissionOverwrites.cache.get(role.id)?.allow.has('ViewChannel')) rulesRoleGrants++;
      } else {
        openChannels.push(ch.name);
      }
    }
    if (!protectedCount) {
      warnings.push(
        'Ningún canal está restringido: @everyone ve todo. En Discord, quita el permiso "Ver canal" a @everyone en los canales que quieras proteger; el rol de acceso será la llave.'
      );
    } else if (role && rulesRoleGrants < protectedCount) {
      warnings.push(
        `${protectedCount - rulesRoleGrants} canal(es) protegido(s) no dan acceso al rol de reglas: añade "Ver canal = ✔" al rol de acceso en esos canales.`
      );
    }
    res.json({
      ok: !warnings.length,
      roleConfigured: !!roleId,
      role: role ? { id: role.id, name: role.name } : null,
      protectedChannels: protectedCount,
      rulesRoleGrants,
      openChannels,
      warnings
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/guild/rules-access/create-role', requireOwner, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    if (!guild) return res.status(404).json({ error: 'Servidor no encontrado' });
    const config = await getConfig(guild.id);
    let role = config.rules.roleId ? guild.roles.cache.get(config.rules.roleId) : null;
    if (!role || role.id === guild.id) {
      const name = (req.body.name || 'Hoobits').trim().slice(0, 100);
      role = await guild.roles.create({
        name,
        reason: 'Rol de acceso base (aceptar reglas) creado desde el dashboard'
      });
      await config.updateOne({ $set: { 'rules.roleId': role.id } });
    }
    res.json({ ok: true, role: { id: role.id, name: role.name } });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/guild/sync-roles', requireOwner, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    const config = await getConfig(guild.id);
    const members = await guild.members.fetch();
    let assigned = 0;
    for (const member of members.values()) {
      if (member.user.bot) continue;
      const xpDoc = await Member.findOne({ guildId: guild.id, userId: member.id });
      if (!xpDoc) continue;
      const added = await applyXpRoles(guild, member, config, xpDoc.xp);
      assigned += added.length;
    }
    res.json({ ok: true, assigned });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/logs', requireAdmin, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const guildId = currentGuildId(req);
    const filter = { guildId };
    if (req.query.type === 'command' || req.query.type === 'event') filter.type = req.query.type;
    if (req.query.command) filter.command = req.query.command;
    if (req.query.q) {
      const rx = new RegExp(String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ userTag: rx }, { details: rx }];
    }
    const [logs, cmdTypes] = await Promise.all([
      CommandLog.find(filter).sort({ createdAt: -1 }).limit(limit),
      CommandLog.aggregate([
        { $match: { guildId } },
        { $group: { _id: { command: '$command', type: '$type' } } },
        { $sort: { '_id.command': 1 } }
      ])
    ]);
    const commands = cmdTypes.map((t) => ({ command: t._id.command, type: t._id.type }));
    res.json({ logs, commands });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats', requireMega, async (req, res) => {
  try {
    const client = req.app.get('client');
    const guild = client.guilds.cache.get(currentGuildId(req));
    const online = guild
      ? guild.members.cache.filter((m) => m.presence && m.presence.status !== 'offline').size
      : 0;
    const messages = await CommandLog.countDocuments({ guildId: currentGuildId(req), type: 'command' });
    const members = await Member.countDocuments({ guildId: currentGuildId(req) });
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMessages = await CommandLog.countDocuments({
      guildId: currentGuildId(req),
      type: 'command',
      createdAt: { $gte: today }
    });
    res.json({
      guildId: currentGuildId(req),
      online,
      members,
      messages,
      todayMessages,
      uptime: Math.floor(process.uptime())
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/music/:action', requireMusicControl, async (req, res) => {
  try {
    const guildId = currentGuildId(req);
    const { action } = req.params;
    const config = await getConfig(guildId);
    let result = { ok: true };
    switch (action) {
case 'volume': {
        const parsed = parseInt(req.body.volume);
        const vol = Math.max(0, Math.min(100, Number.isFinite(parsed) ? parsed : config.music.volume));
        player.setVolume(guildId, vol);
        await config.updateOne({ $set: { 'music.volume': vol } });
        result.volume = vol;
        break;
      }
      case 'skip':
        result.skipped = player.skip(guildId) ? true : false;
        break;
      case 'stop':
        player.stop(guildId);
        break;
      case 'pause':
        result.paused = player.pause(guildId);
        break;
      case 'resume':
        result.resumed = player.resume(guildId);
        break;
      case 'loop':
        result.loop = player.toggleLoop(guildId);
        break;
      case 'autoplay':
        result.autoplay = player.toggleAutoplay(guildId);
        break;
      case 'filter': {
        const allowed = ['off', 'bassboost', 'bassboost-lite', '8d', 'nightcore', 'vaporwave', 'karaoke'];
        const f = req.body.filter;
        result.filter = allowed.includes(f) ? player.setFilter(guildId, f) : player.setFilter(guildId, 'off');
        break;
      }
case 'eq': {
        const band = parseInt(req.body.band);
        const gain = parseInt(req.body.gain);
        result.eq = player.setEq(guildId, band, gain);
        await config.updateOne({ $set: { 'music.eq': result.eq } }).catch(() => {});
        break;
      }
      case 'play': {
        const { query, channelId } = req.body;
        if (!query) return res.status(400).json({ error: 'Falta el texto de búsqueda' });
const client = require('../bot/client');
        const guild = client.guilds.cache.get(guildId);
        if (!guild) return res.status(400).json({ error: 'Bot no está en ese servidor' });
const savedVol = typeof config.music.volume === 'number' ? config.music.volume : 40;
const savedEq = Array.isArray(config.music.eq) && config.music.eq.length === 10 ? [...config.music.eq] : null;
        player.getQueue(guildId, savedVol, savedEq);
        let voiceChannel = player.getQueue(guildId).connection
          ? client.channels.cache.get(player.getQueue(guildId).connection.joinConfig.channelId)
          : null;
        if (!voiceChannel && channelId) {
          const ch = guild.channels.cache.get(channelId);
          if (ch && ch.type === ChannelType.GuildVoice) voiceChannel = ch;
        }
        if (!voiceChannel) {
          return res.status(400).json({ error: 'El bot no está en un canal de voz. Únete a uno y usa /play, o pasa channelId.' });
        }
const tracks = await player.resolveQuery(query);
        if (!tracks.length) return res.status(400).json({ error: 'Sin resultados' });
        const q = player.getQueue(guildId, savedVol);
        q.textChannel = guild.channels.cache.get(config.music.commandChannelId) || null;
        const startPos = q.tracks.length;
        await player.play(guildId, voiceChannel, tracks[0]);
        if (tracks.length > 1) {
          for (let i = 1; i < tracks.length; i++) q.tracks.push(tracks[i]);
        }
        result.added = tracks.length;
        result.position = startPos + 1;
        result.track = tracks[0];
        break;
      }
      default:
        return res.status(400).json({ error: 'Acción inválida' });
    }
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stats/activity', requireMega, async (req, res) => {
  try {
    const days = 7;
    const type = req.query.type === 'event' ? 'event' : req.query.type === 'all' ? 'all' : 'command';
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - (days - 1));
    const filter = {
      guildId: currentGuildId(req),
      createdAt: { $gte: start }
    };
    if (type !== 'all') filter.type = type;
    const logs = await CommandLog.find(filter).select('createdAt').lean();

    const byDay = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = d.toISOString().slice(0, 10);
      byDay[key] = { date: key, count: 0 };
    }
    for (const l of logs) {
      const key = new Date(l.createdAt).toISOString().slice(0, 10);
      if (byDay[key]) byDay[key].count++;
    }
    const series = Object.values(byDay);
    res.json({ series, total: logs.length, type });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/music/status', requireMember, async (req, res) => {
  const guildId = currentGuildId(req);
  const config = await getConfig(guildId);
  const savedVol = typeof config.music.volume === 'number' ? config.music.volume : 40;
  const client = require('../bot/client');
  const guild = client.guilds.cache.get(guildId);
  const q = player.getQueue(guildId, savedVol, Array.isArray(config.music.eq) && config.music.eq.length === 10 ? [...config.music.eq] : null);
  const st = player.getState(guildId) || {};
  res.json({
    playing: player.isPlaying(guildId),
    paused: q ? q.player.state.status === 'paused' : false,
    nowPlaying: player.nowPlaying(guildId),
    queueLength: player.queueList(guildId).length,
    queue: player.queueList(guildId).map((t) => ({ title: t.title, url: t.url, duration: t.duration })),
    volume: savedVol,
    filter: st.filter || 'off',
    eq: st.eq || Array(10).fill(0),
    loop: !!st.loop,
    autoplay: !!st.autoplay,
    voiceChannels: guild
      ? guild.channels.cache
          .filter((c) => c.type === ChannelType.GuildVoice)
          .map((c) => ({ id: c.id, name: c.name, members: c.members.size }))
      : [],
currentVoice: q && q.connection ? q.connection.joinConfig.channelId : null,
    canMusic: !!req.session.user.canMusic,
    memberRoles: Array.isArray(req.session.user.memberRoles) ? req.session.user.memberRoles : [],
    warnings: player.getWarnings()
  });
});

router.get('/members', requireAdmin, async (req, res) => {
  try {
    const guildId = currentGuildId(req);
    const guild = req.app.get('client').guilds.cache.get(guildId);
    const search = (req.query.search || '').toString().trim().toLowerCase();
    const docs = await Member.find({ guildId }).sort({ xp: -1, userId: 1 }).limit(500).lean();
    const rows = docs.map((m) => ({
      userId: m.userId,
      username: guild?.members?.cache?.get(m.userId)?.user?.username || null,
      xp: m.xp,
      level: m.level,
      voiceMinutes: m.voiceMinutes,
      infractions: m.infractions || 0
    }));
    const filtered = search
      ? rows.filter((r) => (r.username || '').toLowerCase().includes(search) || r.userId.includes(search))
      : rows;
    res.json({
      members: filtered,
      total: docs.length,
      canEdit: !!req.session.user && (req.session.user.isSuperAdmin || req.session.user.isMegaAdmin)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/members/xp', requireAdmin, async (req, res) => {
  try {
    const guildId = currentGuildId(req);
    const { userId, xp, level, mode } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'userId es requerido' });
    }
    let finalXp;
    let finalLevel;
    if (mode === 'level' && Number.isInteger(level) && level >= 0 && level <= 100000) {
      finalLevel = level;
      finalXp = xpForLevel(level);
    } else {
      if (typeof xp !== 'number' || !Number.isFinite(xp) || xp < 0 || xp > 99999999) {
        return res.status(400).json({ error: 'xp (0-99999999) es requerido' });
      }
      finalXp = Math.floor(xp);
      finalLevel = levelForXp(finalXp).level;
    }
    const doc = await Member.findOneAndUpdate(
      { guildId, userId },
      { $set: { xp: finalXp, level: finalLevel, needed: levelForXp(finalXp).needed } },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    const guild = req.app.get('client').guilds.cache.get(guildId);
    const member = guild?.members?.cache?.get(userId);
    if (member) {
      const config = await getConfig(guildId);
      await applyXpRoles(guild, member, config, doc.xp);
    }
    const u = req.session.user;
    const detail =
      mode === 'level'
        ? `Nivel de <@${userId}> establecido a ${finalLevel} (XP ${finalXp})`
        : `XP de <@${userId}> establecido a ${finalXp} (nivel ${finalLevel})`;
    logCommand(guildId, {
      type: 'event',
      command: 'manual-xp',
      userId: u.id,
      userTag: u.global_name || u.username || u.id,
      details: detail
    }).catch(() => {});
    res.json({ ok: true, userId, xp: doc.xp, level: doc.level, voiceMinutes: doc.voiceMinutes });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;


const { getConfig } = require('../../utils/config');
const { addXp, getMember } = require('../../utils/xp');
const { safeAddRole, applyXpRoles } = require('../../utils/roles');
const { logCommand } = require('../../utils/logger');
const { isAdmin } = require('../../utils/permissions');
const Member = require('../../models/Member');

const floodState = new Map();

const DANGEROUS_EXT = ['.exe', '.scr', '.bat', '.cmd', '.vbs', '.ps1', '.lnk', '.jar', '.msi', '.com', '.hta', '.reg', '.sh', '.apk', '.js'];
const INVITE_RE = /(?:discord\.gg|discord(?:app)?\.com\/invite)\/[a-z0-9-_]+/i;

function extList(config) {
  const extra = Array.isArray(config.antispam.dangerousExtensions) ? config.antispam.dangerousExtensions : [];
  return [...DANGEROUS_EXT, ...extra.map((e) => String(e).toLowerCase())].map((e) => (e.startsWith('.') ? e : '.' + e));
}

function isDangerousFileName(name, config) {
  return name.toLowerCase().split('.').slice(1).some((p) => extList(config).includes('.' + p));
}

function findDangerousUrl(content, config) {
  const urls = content.match(/https?:\/\/[^\s<>"]+/gi) || [];
  for (const u of urls) {
    const clean = u.split(/[?#]/)[0].toLowerCase().replace(/^https?:\/\//, '');
    const slash = clean.lastIndexOf('/');
    if (slash < 0) continue;
    const tail = clean.slice(slash + 1);
    if (extList(config).some((e) => tail.endsWith(e))) return u;
  }
  return null;
}

async function handleViolation(message, config, reason, action, minutes, forceDelete = false) {
  if (forceDelete || config.antispam.deleteMessage) {
    message.delete().catch(() => {});
  }
  const now = Date.now();
  const xpDoc = await getMember(message.guild.id, message.author.id);
  const lastInf = xpDoc.lastInfractionAt ? new Date(xpDoc.lastInfractionAt).getTime() : 0;
  const resetMs = (config.antispam.resetMinutes || 30) * 60000;
  const infractions = lastInf && now - lastInf > resetMs ? 1 : (xpDoc.infractions || 0) + 1;
  await Member.updateOne(
    { guildId: message.guild.id, userId: message.author.id },
    { $set: { infractions, lastInfractionAt: new Date() } }
  );
  const warn = (config.antispam.warnMessage || 'Hey {user}, eso no está permitido en **{server}**.')
    .replaceAll('{user}', `<@${message.author.id}>`)
    .replaceAll('{server}', message.guild.name);
  if (action === 'mute' && infractions >= (config.antispam.maxInfractions || 3)) {
    const mins = minutes || 10;
    await message.member.timeout(mins * 60000, `Anti-spam: ${reason}`).catch(() => {});
    message.channel.send(`🔇 ${warn}\nHas sido silenciado por **${mins} minutos**.`).catch(() => {});
  } else {
    message.channel
      .send(`⚠️ ${warn} (motivo: ${reason})`)
      .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
      .catch(() => {});
  }
  await logCommand(message.guild.id, {
    type: 'event',
    command: 'antispam',
    userId: message.author.id,
    userTag: message.author.tag,
    details: `${reason} en ${message.channel}`
  });
}

module.exports = {
  name: 'messageCreate',
  async execute(message) {
    if (message.author.bot || !message.guild) return;
    if (message.channel.type === 'dm') return;

    const config = await getConfig(message.guild.id);
    const member = message.member;

    const now = Date.now();

    if (config.xp.enabled && config.xp.textEnabled && member) {
      const xpDoc = await getMember(message.guild.id, message.author.id);
      const canGain = !xpDoc.lastMessageAt || now - xpDoc.lastMessageAt.getTime() >= config.xp.textCooldownSec * 1000;
      if (canGain) {
        const amount = Math.max(1, Math.round((config.xp.xpPerText || 15) * (0.8 + Math.random() * 0.4)));
        const { doc } = await addXp(message.guild.id, message.author.id, amount);
        await Member.updateOne(
          { guildId: message.guild.id, userId: message.author.id },
          { $set: { lastMessageAt: new Date() } }
        );
        const gained = await applyXpRoles(message.guild, member, config, doc.xp);
        if (config.xp.gainRole && !member.roles.cache.has(config.xp.gainRole)) {
          await safeAddRole(message.guild, member, config.xp.gainRole, 'Escribió en el chat: rol de regalo (Mago Blanco)');
        }
      }
    }

    if (!member) return;
    const isImmune = isAdmin(member, config);
    const ignored = Array.isArray(config.antispam.ignoreChannels) ? config.antispam.ignoreChannels : [];
    const inIgnored = ignored.includes(message.channel.id);

    if (config.antispam.blockDangerousFiles !== false && !isImmune && !inIgnored) {
      const maxAtt = parseInt(config.antispam.maxAttachments, 10) || 0;
      if (maxAtt > 0 && message.attachments.size > maxAtt) {
        await handleViolation(message, config, `Demasiados adjuntos (${message.attachments.size} > ${maxAtt})`, 'warn', 10, true);
        return;
      }
      const badFile = [...message.attachments.values()].find((a) => isDangerousFileName(a.name, config));
      if (badFile) {
        await handleViolation(message, config, `Archivo peligroso: ${badFile.name}`, 'mute', 10, true);
        return;
      }
      const badUrl = findDangerousUrl(message.content, config);
      if (badUrl) {
        await handleViolation(message, config, `Enlace a archivo peligroso: ${badUrl}`, 'mute', 10, true);
        return;
      }
    }

    if (!config.antispam.enabled || isImmune) return;
    if (inIgnored) return;

    if (config.antispam.words.length) {
      const content = message.content.toLowerCase();
      const hit = config.antispam.words.find((w) => w.word && content.includes(w.word.toLowerCase()));
      if (hit) {
        await handleViolation(message, config, `Palabra prohibida: ${hit.word}`, hit.action || 'warn', hit.muteMinutes || 10);
        return;
      }
    }

    const inviteAllowed = Array.isArray(config.antispam.inviteAllowedChannels) ? config.antispam.inviteAllowedChannels : [];
    if (config.antispam.blockInvites !== false && !inviteAllowed.includes(message.channel.id)) {
      const m = message.content.match(INVITE_RE);
      if (m) {
        await handleViolation(message, config, `Enlace de invitación: ${m[0]}`, 'mute', 10);
        return;
      }
    }

    const fl = config.antispam.flood || {};
    if (fl.enabled) {
      const key = message.guild.id + ':' + message.author.id;
      const win = (fl.windowSec || 6) * 1000;
      const limit = fl.limit || 6;
      const arr = (floodState.get(key) || []).filter((t) => now - t < win);
      arr.push(now);
      floodState.set(key, arr);
      if (arr.length >= limit) {
        const flWarn = (fl.warnMessage || 'Hey {user}, evita el flood de mensajes en **{server}**.')
          .replaceAll('{user}', `<@${message.author.id}>`)
          .replaceAll('{server}', message.guild.name);
        if (fl.action === 'mute') {
          const minutes = fl.muteMinutes || 10;
          await member.timeout(minutes * 60 * 1000, 'Anti-spam: flood de mensajes').catch(() => {});
          message.channel.send(`🔇 ${flWarn}\nSilenciado por **${minutes} minutos**.`).catch(() => {});
        } else {
          message.channel
            .send(`⚠️ ${flWarn}`)
            .then((m) => setTimeout(() => m.delete().catch(() => {}), 6000))
            .catch(() => {});
        }
        await logCommand(message.guild.id, {
          type: 'event',
          command: 'antispam-flood',
          userId: message.author.id,
          userTag: message.author.tag,
          details: `Flood: ${arr.length} mensajes en ${fl.windowSec}s (límite ${limit}) en ${message.channel}`
        });
        floodState.delete(key);
      }
    }
  }
};
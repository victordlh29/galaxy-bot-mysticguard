const GuildConfig = require('../models/GuildConfig');
const { DEFAULT_RULES_TEXT, OLD_RULES_TEXT } = require('./rulesEmbed');

const DEFAULT_CONFIG = {
  welcome: { enabled: true, channelId: '', message: 'Bienvenido {user} a **{server}**! Disfruta tu estancia y lee las reglas.' },
  goodbye: { enabled: false, channelId: '', message: 'Adiós {user}! Esperamos verte pronto en **{server}**.' },
  autorole: { enabled: true, roleId: '' },
  rules: {
    enabled: true,
    channelId: '',
    messageId: '',
    emoji: '✅',
    roleId: '',
    text: DEFAULT_RULES_TEXT
  },
  xp: {
    enabled: true,
    textEnabled: true,
    voiceEnabled: true,
    textCooldownSec: 60,
    voiceTickSec: 60,
    xpPerText: 15,
    xpPerVoiceMin: 10,
    gainRole: '',
    roles: []
  },
  antispam: {
    enabled: true,
    deleteMessage: true,
    warnMessage: 'Hey {user}, esa palabra no está permitida en **{server}**.',
    words: [],
    maxInfractions: 3,
    resetMinutes: 30,
    ignoreChannels: [],
    blockInvites: true,
    inviteAllowedChannels: [],
    blockDangerousFiles: true,
    dangerousExtensions: [],
    maxAttachments: 0,
    flood: {
      enabled: true,
      limit: 6,
      windowSec: 6,
      action: 'warn',
      muteMinutes: 10,
      warnMessage: 'Hey {user}, evita el flood de mensajes en **{server}**.'
    }
  },
  music: { enabled: true, volume: 40, commandChannelId: '', controlRoleId: '', ignoreChannels: [] },
  logs: { enabled: true, channelId: '' },
  adminRoles: []
};

async function getConfig(guildId) {
  let config = await GuildConfig.findOne({ guildId });
  if (!config) {
    config = await GuildConfig.create({ guildId, ...JSON.parse(JSON.stringify(DEFAULT_CONFIG)) });
  } else {
    const sets = {};
    if (config.rules && config.rules.text === OLD_RULES_TEXT) {
      sets['rules.text'] = DEFAULT_RULES_TEXT;
    }
    if (!config.music || typeof config.music !== 'object') {
      sets.music = { ...JSON.parse(JSON.stringify(DEFAULT_CONFIG.music)), eq: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] };
    } else {
      if (typeof config.music.volume !== 'number') sets['music.volume'] = DEFAULT_CONFIG.music.volume;
      if (typeof config.music.controlRoleId !== 'string') sets['music.controlRoleId'] = '';
      if (!Array.isArray(config.music.ignoreChannels)) sets['music.ignoreChannels'] = [];
      if (!Array.isArray(config.music.eq) || config.music.eq.length !== 10) {
        sets['music.eq'] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      }
    }
    if (Object.keys(sets).length) {
      await config.updateOne({ $set: sets });
      for (const [k, v] of Object.entries(sets)) {
        const path = k.split('.');
        let target = config;
        while (path.length > 1) target = target[path.shift()];
        target[path[0]] = v;
      }
    }
    if (!config.antispam || typeof config.antispam !== 'object') {
      const as = JSON.parse(JSON.stringify(DEFAULT_CONFIG.antispam));
      as.words = [];
      await config.updateOne({ $set: { antispam: as } });
      config.antispam = as;
    } else {
      const asSets = {};
      if (typeof config.antispam.resetMinutes !== 'number') asSets['antispam.resetMinutes'] = 30;
      if (!Array.isArray(config.antispam.ignoreChannels)) asSets['antispam.ignoreChannels'] = [];
      if (typeof config.antispam.blockInvites !== 'boolean') asSets['antispam.blockInvites'] = true;
      if (!Array.isArray(config.antispam.inviteAllowedChannels)) asSets['antispam.inviteAllowedChannels'] = [];
      if (typeof config.antispam.blockDangerousFiles !== 'boolean') asSets['antispam.blockDangerousFiles'] = true;
      if (!Array.isArray(config.antispam.dangerousExtensions)) asSets['antispam.dangerousExtensions'] = [];
      if (typeof config.antispam.maxAttachments !== 'number') asSets['antispam.maxAttachments'] = 0;
      if (!config.antispam.flood || typeof config.antispam.flood !== 'object') {
        asSets['antispam.flood'] = JSON.parse(JSON.stringify(DEFAULT_CONFIG.antispam.flood));
      }
      if (Object.keys(asSets).length) {
        await config.updateOne({ $set: asSets });
        for (const [k, v] of Object.entries(asSets)) {
          const path = k.split('.');
          let target = config;
          while (path.length > 1) target = target[path.shift()];
          target[path[0]] = v;
        }
      }
    }
  }
  return config;
}

function mergeDeep(target, source) {
  const out = { ...target };
  for (const key of Object.keys(source || {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && !(source[key] instanceof Date)) {
      out[key] = mergeDeep(target[key], source[key]);
    } else {
      out[key] = source[key];
    }
  }
  return out;
}

async function updateConfig(guildId, patch) {
  const config = await getConfig(guildId);
  const merged = mergeDeep(config.toObject(), patch);
  merged.guildId = guildId;
  delete merged._id;
  delete merged.__v;
  delete merged.createdAt;
  delete merged.updatedAt;
  const updated = await GuildConfig.findOneAndUpdate({ guildId }, merged, { new: true, upsert: true });
  return updated;
}

module.exports = { getConfig, updateConfig, DEFAULT_CONFIG, mergeDeep };

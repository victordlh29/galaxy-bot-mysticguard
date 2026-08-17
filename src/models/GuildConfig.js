const { Schema, model } = require('mongoose');
const { DEFAULT_RULES_TEXT } = require('../utils/rulesEmbed');

const WordSchema = new Schema(
  {
    word: { type: String, required: true, trim: true, lowercase: true },
    action: { type: String, enum: ['delete', 'warn', 'mute'], default: 'delete' },
    muteMinutes: { type: Number, default: 10 }
  },
  { _id: true }
);

const XpRoleSchema = new Schema(
  {
    roleId: { type: String, required: true },
    xp: { type: Number, required: true, default: 0 },
    name: { type: String, default: '' },
    emoji: { type: String, default: '' }
  },
  { _id: false }
);

const guildConfigSchema = new Schema(
  {
    guildId: { type: String, required: true, unique: true, index: true },
    welcome: {
      enabled: { type: Boolean, default: true },
      channelId: { type: String, default: '' },
      message: {
        type: String,
        default: 'Bienvenido {user} a **{server}**! Disfruta tu estancia y lee las reglas.'
      }
    },
    goodbye: {
      enabled: { type: Boolean, default: false },
      channelId: { type: String, default: '' },
      message: {
        type: String,
        default: 'Adiós {user}! Esperamos verte pronto en **{server}**.'
      }
    },
    autorole: {
      enabled: { type: Boolean, default: true },
      roleId: { type: String, default: '' }
    },
    rules: {
      enabled: { type: Boolean, default: true },
      channelId: { type: String, default: '' },
      messageId: { type: String, default: '' },
      emoji: { type: String, default: '✅' },
      roleId: { type: String, default: '' },
      text: {
        type: String,
        default: DEFAULT_RULES_TEXT
      }
    },
    xp: {
      enabled: { type: Boolean, default: true },
      textEnabled: { type: Boolean, default: true },
      voiceEnabled: { type: Boolean, default: true },
      textCooldownSec: { type: Number, default: 60 },
      voiceTickSec: { type: Number, default: 60 },
      xpPerText: { type: Number, default: 15 },
      xpPerVoiceMin: { type: Number, default: 10 },
      gainRole: { type: String, default: '' },
      roles: { type: [XpRoleSchema], default: [] }
    },
    antispam: {
      enabled: { type: Boolean, default: true },
      deleteMessage: { type: Boolean, default: true },
      warnMessage: {
        type: String,
        default: 'Hey {user}, esa palabra no está permitida en **{server}**.'
      },
      words: { type: [WordSchema], default: [] },
      maxInfractions: { type: Number, default: 3 },
      resetMinutes: { type: Number, default: 30 },
      ignoreChannels: { type: [String], default: [] },
      blockInvites: { type: Boolean, default: true },
      inviteAllowedChannels: { type: [String], default: [] },
      blockDangerousFiles: { type: Boolean, default: true },
      dangerousExtensions: { type: [String], default: [] },
      maxAttachments: { type: Number, default: 0, min: 0 },
      flood: {
        enabled: { type: Boolean, default: true },
        limit: { type: Number, default: 6 },
        windowSec: { type: Number, default: 6 },
        action: { type: String, enum: ['warn', 'mute'], default: 'warn' },
        muteMinutes: { type: Number, default: 10 },
        warnMessage: {
          type: String,
          default: 'Hey {user}, evita el flood de mensajes en **{server}**.'
        }
      }
    },
    music: {
      enabled: { type: Boolean, default: true },
      volume: { type: Number, default: 40, min: 0, max: 100 },
      commandChannelId: { type: String, default: '' },
      controlRoleId: { type: String, default: '' },
      eq: { type: [Number], default: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0] }
    },
    logs: {
      enabled: { type: Boolean, default: true },
      channelId: { type: String, default: '' }
    },
    adminRoles: { type: [String], default: [] }
  },
  { timestamps: true }
);

module.exports = model('GuildConfig', guildConfigSchema);

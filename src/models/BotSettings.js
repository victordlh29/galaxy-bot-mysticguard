const { Schema, model } = require('mongoose');

const botSettingsSchema = new Schema(
  {
    key: { type: String, required: true, unique: true, default: 'default' },
    defaultGuildId: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = model('BotSettings', botSettingsSchema);

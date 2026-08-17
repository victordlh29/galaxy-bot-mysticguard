const { Schema, model } = require('mongoose');

const memberSchema = new Schema(
  {
    guildId: { type: String, required: true, index: true },
    userId: { type: String, required: true, index: true },
    xp: { type: Number, default: 0 },
    level: { type: Number, default: 0 },
    voiceMinutes: { type: Number, default: 0 },
    lastMessageAt: { type: Date, default: null },
    infractions: { type: Number, default: 0 },
    lastInfractionAt: { type: Date, default: null },
    mutedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

memberSchema.index({ guildId: 1, userId: 1 }, { unique: true });

module.exports = model('Member', memberSchema);

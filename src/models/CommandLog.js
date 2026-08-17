const { Schema, model } = require('mongoose');

const commandLogSchema = new Schema(
  {
    guildId: { type: String, index: true },
    type: { type: String, default: 'command' },
    command: { type: String, default: '' },
    userId: { type: String, default: '' },
    userTag: { type: String, default: '' },
    details: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now, index: true }
  },
  { timestamps: true }
);

module.exports = model('CommandLog', commandLogSchema);

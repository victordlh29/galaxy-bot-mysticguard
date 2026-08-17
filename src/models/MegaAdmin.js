const { Schema, model } = require('mongoose');

const megaAdminSchema = new Schema(
  {
    username: { type: String, required: true, unique: true, index: true, trim: true, lowercase: true },
    passwordSalt: { type: String, required: true },
    passwordHash: { type: String, required: true },
    name: { type: String, default: '' }
  },
  { timestamps: true }
);

module.exports = model('MegaAdmin', megaAdminSchema);

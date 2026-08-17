require('dotenv').config();
const mongoose = require('mongoose');
const MegaAdmin = require('../models/MegaAdmin');
const { hashPassword } = require('../utils/password');

async function main() {
  const [username, password, name] = process.argv.slice(2);
  if (!username || !password) {
    console.log('Uso: npm run megaadmin -- <usuario> <contraseña> [nombre]');
    console.log('Ej.:  npm run megaadmin -- juanito 1234 "Juan Pérez"');
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
  const cleanUser = String(username).trim().toLowerCase();
  const { salt, hash } = hashPassword(password);
  const doc = await MegaAdmin.findOneAndUpdate(
    { username: cleanUser },
    { $set: { username: cleanUser, passwordSalt: salt, passwordHash: hash, name: name || '' } },
    { new: true, upsert: true }
  );
  console.log(`[MEGAADMIN] ${name || cleanUser} registrado/actualizado (id: ${doc._id})`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('[MEGAADMIN] error:', err.message);
  process.exit(1);
});

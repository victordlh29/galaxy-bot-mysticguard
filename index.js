require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const client = require('./src/bot/client');
const { registerEvents } = require('./src/bot/events/index');
const { createApp } = require('./src/server/app');
const { deploy } = require('./src/bot/deploy-commands');

if (!process.env.SESSION_SECRET) {
  console.error('[SEC] SESSION_SECRET no configurado — negándose a arrancar (el fallback público es inseguro).');
  process.exit(1);
}

const CRASH_LOG = path.join(__dirname, 'crash.log');

function logFatal(kind, err) {
  const line = `\n[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : err}`;
  try {
    fs.appendFileSync(CRASH_LOG, line + '\n');
  } catch (_) {}
  try {
    console.error(line);
  } catch (_) {}
}

process.on('unhandledRejection', (err) => logFatal('Rechazo no manejado', err));
process.on('uncaughtException', (err) => {
  logFatal('Excepción no capturada', err);
  process.exit(1);
});
process.on('exit', (code) => {
  if (code !== 0) {
    try { fs.appendFileSync(CRASH_LOG, `[${new Date().toISOString()}] Proceso terminado con código ${code}\n`); } catch (_) {}
  }
});

async function start() {
  try {
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 15000 });
    console.log('[DB] MongoDB conectado');
  } catch (err) {
    console.error('[DB] No se pudo conectar a MongoDB:', err.message);
    process.exit(1);
  }

  registerEvents();

  const app = createApp({ client });
  const port = process.env.PORT || 3000;
  const base = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || `http://localhost:${port}`;
  app.listen(port, () => {
    console.log(`[HTTP] Dashboard en ${base}`);
    console.log(`[HTTP] Activity en ${base}/activity`);
  });

  try {
    await client.login(process.env.DISCORD_TOKEN);
  } catch (err) {
    console.error('[BOT] Error de login:', err.message);
    process.exit(1);
  }
}

start();

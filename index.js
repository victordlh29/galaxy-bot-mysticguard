require('dotenv').config();

// Consolas de Windows (cmd/PowerShell 5.1) interpretan los acentos UTF-8 con otra
// codepage y muestran mojibake (á→ǭ, "—"→�, etc.). Normalizamos a ASCII puro SOLO
// lo que sale por consola (definido ANTES del bootstrap para cubrir su diag);
// los mensajes a Discord/web no pasan por console.* y conservan sus tildes.
const DIACRITICS = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ü: 'u', ñ: 'n',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ü: 'U', Ñ: 'N',
  '¿': '?', '¡': '!', '—': '-', '–': '-', '…': '...',
  '→': '->', '←': '<-', '“': '"', '”': '"', '‘': "'", '’': "'"
};
function toAscii(s) {
  return String(s).replace(/[áéíóúüñÁÉÍÓÚÜÑ¿¡—–…→←“”‘’]/g, (c) => DIACRITICS[c] || c);
}
if (process.platform === 'win32') {
  const orig = { log: console.log, info: console.info, warn: console.warn, error: console.error };
  for (const k of Object.keys(orig)) {
    console[k] = (...args) => orig[k](...args.map(toAscii));
  }
}
console.log('[BOOT] build 2026-09-21 - Lavalink/Riffy (sin yt-dlp ni POT) + nodo local solo en Windows');
// Fix de DNS para hostings con whitelist (p. ej. free tier de HeavenCloud): su DNS no
// resuelve mongodb.net (ESERVFAIL en SRV y shards) y bloquea DNS externo. Si detectado,
// escribe los shards de Atlas con IPs fijas en /etc/hosts (el contenedor corre como root)
// y conecta con URI no-SRV. Silencioso cuando el DNS del host funciona. Allow overrides:
// MONGODB_SHARD_HOSTS + MONGODB_SHARD_IPS (p. ej. si Atlas rota las IPs).
async function fixAtlasDns() {
  if (process.platform === 'win32') { console.log('[BOOT] fixAtlasDns: skip (Windows).'); return; }
  const uri = process.env.MONGODB_URI || '';
  if (!uri.startsWith('mongodb+srv://') || !uri.includes('mongodb.net')) { console.log('[BOOT] fixAtlasDns: URI no es Atlas SRV, skip.'); return; }
  const m = uri.match(/^mongodb\+srv:\/\/([^@]+)@([^/?#]+)([^?#]*)(.*)$/);
  if (!m) { console.log('[BOOT] fixAtlasDns: la URI SRV no encajó en el patrón, skip.'); return; }
  const cluster = m[2];
  const srvResolves = await new Promise((res) => {
    const t = setTimeout(() => res(false), 5000);
    require('dns').resolveSrv(`_mongodb._tcp.${cluster}`, (e, addrs) => { clearTimeout(t); res(!e && addrs && addrs.length > 0); });
  });
  if (srvResolves) { console.log('[BOOT] fixAtlasDns: el DNS del host SI resuelve ' + cluster + ', sin fix.'); return; }
  console.log('[BOOT] fixAtlasDns: DNS bloqueado para ' + cluster + ', aplicando workaround de Atlas.');
  const override = process.env.MONGODB_SHARD_HOSTS && process.env.MONGODB_SHARD_IPS;
  const shards = override
    ? process.env.MONGODB_SHARD_HOSTS.split(',').map((h, i) => {
        const [host, port] = h.trim().split(':');
        return { host, port: port || 27017, ip: (process.env.MONGODB_SHARD_IPS || '').split(',')[i].trim() };
      }).filter((s) => s.host && s.ip)
    : [
        { host: 'ac-ecn2c1m-shard-00-00.ho4ie6g.mongodb.net', ip: '89.192.9.170', port: 27017 },
        { host: 'ac-ecn2c1m-shard-00-01.ho4ie6g.mongodb.net', ip: '89.192.9.179', port: 27017 },
        { host: 'ac-ecn2c1m-shard-00-02.ho4ie6g.mongodb.net', ip: '89.192.9.173', port: 27017 },
      ];
  if (!shards.length) { console.log('[BOOT] fixAtlasDns: sin shards utilizables, skip.'); return; }
  const fs = require('fs');
  let hostsWritable = false;
  try {
    const hostsFile = '/etc/hosts';
    const current = fs.existsSync(hostsFile) ? fs.readFileSync(hostsFile, 'utf8') : '';
    if (!current.includes('galaxy-bot-atlas-fix')) {
      let block = '\n# galaxy-bot-atlas-fix\n';
      for (const s of shards) block += `${s.ip} ${s.host}\n`;
      fs.appendFileSync(hostsFile, block);
    }
    hostsWritable = true;
    console.log('[BOOT] fixAtlasDns: /etc/hosts actualizado con los shards.');
  } catch (err) {
    console.log('[BOOT] fixAtlasDns: no se pudo escribir /etc/hosts (' + (err.code || err.message) + '); usando IPs directas con TLS no validado.');
  }
  const addQuery = (q) => (q ? q + '&tls=true' : '?tls=true');
  const creds = m[1];
  const newUri = hostsWritable
    ? `mongodb://${creds}@${shards.map((s) => s.host).join(',')}${m[3]}${addQuery(m[4])}`
    : `mongodb://${creds}@${shards.map((s) => `${s.ip}:${s.port}`).join(',')}${m[3]}${addQuery(m[4])}${m[4] ? '&tlsAllowInvalidCertificates=true' : '&' + 'tlsAllowInvalidCertificates=true'}`;
  process.env.MONGODB_URI = newUri;
  console.log(`[BOOT] DNS de Atlas bloqueado en este hosting (SRV ${cluster}). Fix aplicado: ${hostsWritable ? '/etc/hosts + URI directa' : 'IPs directas'} (${shards.length} shards).`);
}
// Bootstrap de dependencias: corre SIEMPRE (el panel de hosting lanza `node index.js`
// directamente e ignora npm start), instala lo que falte antes de cargar el resto.
// Va tras dotenv para que el diagnóstico de entorno vea también el .env local.
require('./src/scripts/ensure-deps').run();
// OJO: el POT provider (vendor/pot-provider) ya NO se arranca — con Lavalink/Riffy la
// extracción la hace el nodo, así que los PO tokens de yt-dlp no intervenían en nada y
// solo gastaban RAM/CPU en el arranque. src/music/potProvider.js queda sin uso.
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const client = require('./src/bot/client');
const { registerEvents } = require('./src/bot/events/index');
const { createApp } = require('./src/server/app');
const { deploy } = require('./src/bot/deploy-commands');
const player = require('./src/music/PlayerManager');

if (process.env.PUBLIC_URL) process.env.PUBLIC_URL = process.env.PUBLIC_URL.replace(/\/+$/, '');
if (process.env.DASHBOARD_URL) process.env.DASHBOARD_URL = process.env.DASHBOARD_URL.replace(/\/+$/, '');

if (!process.env.SESSION_SECRET) {
  console.error('[SEC] SESSION_SECRET no configurado — negándose a arrancar (el fallback público es inseguro).');
  process.exit(1);
}

const CRASH_LOG = path.join(__dirname, 'crash.log');

// Errores de red transitorios (ws de Lavalink, DNS, SSL del fallback Atlas, etc.) NO
// deben tumbar el bot: un handshake timeout de un nodo de música solo es una conexión
// muerta puntual. El resto de excepciones no capturadas sigue siendo fatal.
const NET_ERROR_RE = /handshake|timed out|ETIMEDOUT|ECONNREFUSED|ECONNRESET|socket hang up|fetch failed|proxy error|connect timeout|network issue|getaddrinfo|tlsv1 alert|querySrv|ESERVFAIL|SERVFAIL|MongoServerSelectionError|server selection timed out/i;

function logFatal(kind, err) {
  const line = `\n[${new Date().toISOString()}] ${kind}: ${err && err.stack ? err.stack : err}`;
  try {
    fs.appendFileSync(CRASH_LOG, toAscii(line) + '\n');
  } catch (_) {}
  try {
    console.error(line);
  } catch (_) {}
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function withRetry(label, attempts, delayMs, fn) {
  let lastErr;
  for (let i = 1; i <= attempts; i++) {
    try { return await fn(); }
    catch (err) {
      lastErr = err;
      console.error(`[RETRY] ${label} (${i}/${attempts}): ${toAscii(String(err.message))}`);
      if (i === attempts) break;
      await sleep(delayMs);
    }
  }
  throw lastErr;
}

process.on('unhandledRejection', (err) => {
  // Ruido esperado: (1) tras un TrackEnd loadfailed, Riffy llama player.play() con la
  // cola ya vacía (reproducimos UN track a la vez) y esa promesa se rechaza sola;
  // (2) llamadas REST internas de Riffy (PATCH /sessions de RESUME, GET /v4/info)
  // que fallan cuando el egress del hosting flaquea — Riffy lo reintenta solo.
  const msg = err && err.message ? String(err.message) : String(err);
  if (/Queue is empty|Unable to play for Player|Making Node Request|Network Issue|connection is not initiated/i.test(msg)) return;
  logFatal('Rechazo no manejado', err);
});
process.on('uncaughtException', (err) => {
  logFatal('Excepción no capturada', err);
  if (err instanceof Error && NET_ERROR_RE.test(String(err.message))) {
    console.error('[FATAL] Error de red transitorio; el proceso continúa (conexión muerta puntual).');
    return;
  }
  process.exit(1);
});
process.on('exit', (code) => {
  if (code !== 0) {
    try { fs.appendFileSync(CRASH_LOG, toAscii(`[${new Date().toISOString()}] Proceso terminado con código ${code}\n`)); } catch (_) {}
  }
});

async function start() {
  const originalUri = process.env.MONGODB_URI;
  await fixAtlasDns();
  const connectOnce = (uri, label) => withRetry(label, 3, 10000, () => mongoose.connect(uri, { serverSelectionTimeoutMS: 12000 }));
  let dbOk = false;
  try {
    await connectOnce(process.env.MONGODB_URI, 'MongoDB');
    dbOk = true;
  } catch (err) {
    if (process.env.MONGODB_URI !== originalUri) {
      console.warn('[DB] Fallback a la URI SRV original (el fix de IPs pudo estar stale)...');
      try { await connectOnce(originalUri, 'MongoDB (SRV original)'); dbOk = true; }
      catch (err2) { console.error('[DB] No se pudo conectar a MongoDB (ni fix ni SRV):', err2.message); }
    } else {
      console.error('[DB] No se pudo conectar a MongoDB:', err.message);
    }
  }
  if (!dbOk) process.exit(1);
  console.log('[DB] MongoDB conectado');

  registerEvents();

  const app = createApp({ client });
  const port = process.env.PORT || process.env.SERVER_PORT || 3000;
  const base = process.env.PUBLIC_URL || process.env.DASHBOARD_URL || `http://localhost:${port}`;
  app.listen(port, () => {
    console.log(`[HTTP] Dashboard en ${base}`);
    console.log(`[HTTP] Activity en ${base}/activity`);
  });

  try {
    await withRetry('Login Discord', 6, 20000, () => client.login(process.env.DISCORD_TOKEN));
  } catch (err) {
    console.error('[BOT] Error de login tras reintentos:', err.message);
    process.exit(1);
  }

  try {
    await player.initLavalink(client);
  } catch (err) {
    console.error('[MUSIC] Lavalink init falló:', err.message);
  }
}

start();

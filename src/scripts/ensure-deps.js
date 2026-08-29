// Bootstrap de arranque: verifica dependencias críticas y las instala si faltan.
// Cubre plataformas que extraen el código SIN reconstruir node_modules (p. ej. subir
// un zip a justrunmy y que quede el node_modules de una versión anterior).
const { spawnSync } = require('child_process');
const path = require('path');
const { existsSync, mkdirSync, chmodSync, renameSync, createWriteStream, statSync, rmSync, openSync, readSync, closeSync } = require('fs');
const { createHash } = require('crypto');

async function sha256File(p) {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256');
    require('fs').createReadStream(p)
      .on('data', (c) => h.update(c))
      .on('end', () => resolve(h.digest('hex')))
      .on('error', reject);
  });
}

// Verifica el binario contra los SHA2-256SUMS oficiales de la release.
// Una descarga corrompida a mitad de archivo pasa el chequeo de tamaño pero
// produce justo este fallo: "decompression resulted in return code -1".
async function verificarShaStandalone(tmpPath) {
  try {
    const r = await fetch('https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS', { signal: AbortSignal.timeout(20000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const txt = await r.text();
    const line = txt.split('\n').find((l) => l.trim().split(/\s+/)[1] === 'yt-dlp_linux');
    if (!line) throw new Error('hash no encontrado en SUMS');
    const expected = line.trim().split(/\s+/)[0].toLowerCase();
    const actual = await sha256File(tmpPath);
    if (actual !== expected) {
      rmSync(tmpPath, { force: true });
      throw new Error(`SHA NO coincide (${actual.slice(0, 12)}… ≠ ${expected.slice(0, 12)}…)`);
    }
    console.log('[BOOT] yt-dlp standalone verificado (SHA256 OK)');
    return true;
  } catch (e) {
    console.log(`[BOOT] AVISO: no se pudo verificar SHA del standalone: ${e.message}`);
    return false;
  }
}
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');

const YT_DLP_LINUX_URL = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_linux';
const ROOT = path.join(__dirname, '..', '..');

const REQUIRED = [
  'discord.js',
  '@discordjs/voice',
  'express',
  'express-session',
  'connect-mongo',
  'mongoose',
  'helmet',
  'express-rate-limit',
  'dotenv',
  'ffmpeg-static',
  'youtube-dl-exec'
];

function missingNow() {
  const miss = [];
  for (const m of REQUIRED) {
    try {
      require.resolve(m);
    } catch (_) {
      miss.push(m);
    }
  }
  return miss;
}

function runInstall(args) {
  return spawnSync('npm', args, {
    cwd: path.join(__dirname, '..', '..'),
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
}

// yt-dlp SIEMPRE standalone en Linux: el zipapp depende de la versión de Python del host y
// ha dado Tracebacks arbitrarios (wispbyte: python3.9 explota al ejecutarlo). El binario
// standalone elimina toda dependencia de Python.
const MIN_STANDALONE_BYTES = 20 * 1024 * 1024; // el binario real pesa ~30 MB; menos = truncado/corrupto

// PyInstaller (standalone) extrae a /tmp/_MEIxxxx en cada ejecución y borra al salir;
// si el proceso muere antes, quedan restos que llenan el disco de contenedores pequeños
// y rompen la siguiente extracción ("Failed to extract ... decompression resulted in -1").
function limpiarMeiStale() {
  try {
    const tmp = require('os').tmpdir();
    const items = require('fs').readdirSync(tmp).filter((d) => d.startsWith('_MEI'));
    let freed = 0;
    for (const d of items) {
      try {
        const full = path.join(tmp, d);
        freed += require('fs').statSync(full).size;
        require('fs').rmSync(full, { recursive: true, force: true });
      } catch (_) {}
    }
    if (items.length) console.log(`[BOOT] Limpiados ${items.length} residuos _MEI de yt-dlp en ${tmp}`);
  } catch (_) {}
}

async function ensureYtDlpRuntime() {
  if (process.platform === 'win32') return;
  limpiarMeiStale();
  const binDir = path.join(ROOT, 'node_modules', 'youtube-dl-exec', 'bin');
  const target = path.join(binDir, 'yt-dlp');
  const marker = path.join(binDir, '.standalone-ok');
  // Binario truncado/corrupto (descarga interrumpida): forzar re-descarga.
  try {
    if (existsSync(target) && statSync(target).size < MIN_STANDALONE_BYTES) {
      console.log('[BOOT] yt-dlp standalone parece corrupto (tamaño anómalo); re-descargando...');
      rmSync(target, { force: true });
      rmSync(marker, { force: true });
    }
  } catch (_) {}
  if (existsSync(marker)) {
    console.log('[BOOT] yt-dlp standalone ya instalado');
    return;
  }
  console.log('[BOOT] Descargando yt-dlp standalone (~30 MB, sin depender de Python)...');
  const res = await fetch(YT_DLP_LINUX_URL);
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} descargando yt-dlp_linux`);
  mkdirSync(binDir, { recursive: true });
  // Streaming a disco: NO bufferizar en memoria (contenedor con poca RAM → OOM kill 137).
  const tmp = `${target}.download`;
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
  await verificarShaStandalone(tmp);
  chmodSync(tmp, 0o755);
  renameSync(tmp, target);
  writeMarker(marker);
  console.log('[BOOT] yt-dlp standalone instalado');
}

function writeMarker(marker) {
  require('fs').writeFileSync(marker, String(Date.now()));
}

// PO Token provider (bgutil): instalar dependencias en el HOST porque canvas es nativo
// y los node_modules traídos de otro SO no sirven. El build/ TS ya viene compilado en el
// zip: si existe, solo hacen falta deps de runtime (--omit=dev, sin tsc).
// stdio SIEMPRE heredado: un fallo de npm sin log fue indetectable en el hosting.
async function ensurePotProviderRuntime() {
  const dir = path.join(ROOT, 'vendor', 'pot-provider');
  const entry = path.join(dir, 'build', 'main.js');
  if (!existsSync(path.join(dir, 'package.json'))) return;
  if (existsSync(entry) && existsSync(path.join(dir, 'node_modules'))) {
    console.log('[BOOT] POT provider ya compilado');
    return;
  }
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  // El provider declara engines >=22 y el host puede correr 20: no dejar que npm lo bloquee.
  const npmEnv = { ...process.env, npm_config_engine_strict: 'false' };
  const needBuild = !existsSync(entry);
  console.log(`[BOOT] POT provider: instalando dependencias en el host${needBuild ? ' + compilando (tsc)' : ''}...`);

  const install = (extra) => spawnSync(npmBin, ['ci', ...extra, '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', env: npmEnv })
    .status === 0 || spawnSync(npmBin, ['install', ...extra, '--no-audit', '--no-fund'], { cwd: dir, stdio: 'inherit', env: npmEnv }).status === 0;

  if (!install(needBuild ? [] : ['--omit=dev'])) {
    console.warn('[BOOT] AVISO: npm falló para POT provider (ver log superior); música seguirá sin PO tokens');
    return;
  }

  if (needBuild) {
    const tsc = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['tsc'], { cwd: dir, stdio: 'inherit' });
    if (tsc.status !== 0) {
      console.warn('[BOOT] AVISO: tsc falló para POT provider (ver log superior); música seguirá sin PO tokens');
      return;
    }
  }

  console.log('[BOOT] POT provider listo');
  // Dependencias instaladas: reintentar arranque del servidor (el primer start() se
  // saltó por node_modules ausentes).
  try {
    require(path.join(__dirname, '..', 'music', 'potProvider')).start();
  } catch (e) {
    console.warn(`[BOOT] AVISO: no se pudo relanzar el POT provider: ${e.message}`);
  }
}

// Opción 3 anti bot-check: binarios de Cloudflare WARP (wgcf + wireproxy) para Linux.
// Versiones pineadas (los assets de wgcf llevan el número en el nombre). Streaming a
// disco como el standalone, para no bufferizar en RAM.
const WARP_DIR = path.join(ROOT, 'vendor', 'warp');
const WARP_BIN = path.join(WARP_DIR, 'bin');
const WGCF_VERSION = '2.2.22';
const WIREPROXY_VERSION = '1.0.9';

// Un binario truncado/corrupto pasa existsSync pero el kernel rechaza el execve y
// sh lo interpreta como script (síntoma visto en justrunmy: "wireproxy: 1: <basura>: not found").
// Validar el magic ELF (\x7fELF) detecta eso antes de intentar ejecutarlo.
function esElf(p) {
  try {
    const fd = openSync(p, 'r');
    const buf = Buffer.alloc(4);
    const n = readSync(fd, buf, 0, 4, 0);
    closeSync(fd);
    return n === 4 && buf[0] === 0x7f && buf[1] === 0x45 && buf[2] === 0x4c && buf[3] === 0x46;
  } catch (_) {
    return false;
  }
}

async function ensureWarpBinaries() {
  if (process.platform === 'win32') return;
  const wgcf = path.join(WARP_BIN, 'wgcf');
  const wireproxy = path.join(WARP_BIN, 'wireproxy');
  mkdirSync(WARP_BIN, { recursive: true });
  // Binarios corruptos cacheados de un boot anterior: borrarlos para forzar re-descarga.
  for (const t of [wgcf, wireproxy]) {
    if (existsSync(t) && !esElf(t)) {
      console.warn(`[BOOT] WARP ${path.basename(t)} corrupto (magic ELF inválido); borrado para re-descargar`);
      rmSync(t, { force: true });
    }
  }
  if (existsSync(wgcf) && existsSync(wireproxy)) {
    console.log('[BOOT] WARP: binarios ya descargados');
    return;
  }
  const downloads = [
    ['wgcf', wgcf, false],
    ['wireproxy', wireproxy, true]
  ];
  for (const [nombre, target, esTgz] of downloads) {
    if (existsSync(target)) continue; // ya existe y pasó el chequeo ELF
    const url = esTgz
      ? `https://github.com/pufferffish/wireproxy/releases/download/v${WIREPROXY_VERSION}/wireproxy_linux_amd64.tar.gz`
      : `https://github.com/ViRb3/wgcf/releases/download/v${WGCF_VERSION}/wgcf_${WGCF_VERSION}_linux_amd64`;
    let ok = false;
    let ultimoError = '';
    for (let intento = 1; intento <= 2 && !ok; intento++) {
      try {
        console.log(`[BOOT] WARP: descargando ${nombre}${intento > 1 ? ` (reintento ${intento})` : ''}...`);
        const res = await fetch(url, { signal: AbortSignal.timeout(60000) });
        if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
        const tmp = `${target}.download`;
        if (esTgz) {
          const tgz = tmp;
          await pipeline(Readable.fromWeb(res.body), createWriteStream(tgz));
          spawnSync('tar', ['-xzf', tgz, '-C', WARP_BIN, nombre], { stdio: 'ignore' });
          rmSync(tgz, { force: true });
          if (!existsSync(target)) throw new Error('tar no extrajo el binario');
        } else {
          await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));
          renameSync(tmp, target);
        }
        chmodSync(target, 0o755);
        if (!esElf(target)) {
          rmSync(target, { force: true });
          throw new Error('el contenido descargado no es un binario ELF válido');
        }
        ok = true;
      } catch (e) {
        ultimoError = e.message;
      }
    }
    if (!ok) {
      console.warn(`[BOOT] AVISO: WARP ${nombre} falló tras 2 intentos: ${ultimoError}`);
      return;
    }
  }
  console.log('[BOOT] WARP: binarios listos');
  try {
    require(path.join(__dirname, '..', 'music', 'warpProxy')).start();
  } catch (e) {
    console.warn(`[BOOT] AVISO: no se pudo relanzar WARP: ${e.message}`);
  }
}

// Diagnóstico de entorno para el hosting: metadatos de YT_COOKIES/YT_PROXY.
// NUNCA imprime el contenido de las cookies.
function diagEnv() {  const c = process.env.YT_COOKIES;
  if (!c || !c.trim()) {
    console.log('[BOOT] DIAG YT_COOKIES: NO seteada → no habrá intentos con cookies');
  } else {
    const norm = c.replace(/\\n/g, '\n').replace(/\r\n/g, '\n');
    const lines = norm.split('\n').map((l) => l.trim()).filter(Boolean);
    const ytLines = lines.filter((l) => l.includes('youtube.com')).length;
    const hasTab = lines.some((l) => l.includes('\t'));
    const netscape = ytLines > 0 && (hasTab || lines.some((l) => l.startsWith('#HttpOnly_')));
    const looksLikePath = lines.length === 1 && !hasTab && !ytLines;
    let verdict = netscape ? 'formato Netscape OK' : '¡NO parece formato Netscape!';
    if (looksLikePath) verdict = 'parece una RUTA, no el contenido';
    console.log(`[BOOT] DIAG YT_COOKIES: presente — ${norm.length} chars, ${lines.length} líneas, ${ytLines} de youtube.com → ${verdict}`);
    const keys = ['SID', 'HSID', 'SSID', 'APISID', 'SAPISID', '__Secure-1PSID'].filter((k) => lines.some((l) => l.includes(`\t${k}`)));
    console.log(`[BOOT] DIAG YT_COOKIES claves clave: ${keys.length ? keys.join(', ') : 'NINGUNA detectada'}`);
  }
  console.log(`[BOOT] DIAG YT_PROXY: ${process.env.YT_PROXY ? `seteado (${process.env.YT_PROXY.length} chars)` : 'no seteado'}`);
}

// IP pública de salida: para ver si el hosting la rotea entre reinicios.
async function logPublicIp() {
  for (const url of ['https://api.ipify.org', 'https://ifconfig.me/ip']) {
    try {
      const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
      if (r.ok) {
        console.log(`[BOOT] DIAG IP pública de salida: ${(await r.text()).trim()} (${new URL(url).host})`);
        return;
      }
    } catch (_) {}
  }
  console.log('[BOOT] DIAG IP pública: no se pudo consultar');
}

// Codificador Opus: @discordjs/voice prefiere el nativo (@discordjs/opus, C++) sobre
// opusscript (JS puro, ~10x más CPU). En hosts con límite de CPU marca la diferencia.
function diagOpus() {
  try {
    const v = require('@discordjs/opus/package.json').version;
    console.log(`[BOOT] DIAG Opus: NATIVO (@discordjs/opus ${v}) — CPU de música reducida`);
  } catch (_) {
    console.log('[BOOT] DIAG Opus: opusscript (JS, más CPU) — si el host limita CPU, instalar @discordjs/opus');
  }
}

function run() {
  diagEnv();
  diagOpus();
  setTimeout(() => { logPublicIp().catch(() => {}); }, 2000).unref();
  const missing = missingNow();
  if (!missing.length) {
    console.log(`[BOOT] Dependencias OK (${REQUIRED.length}/${REQUIRED.length})`);
  } else {
    console.log(`[BOOT] Faltan dependencias: ${missing.join(', ')}`);
    console.log('[BOOT] Instalando con npm ci --omit=dev (puede tardar 1-2 min)...');
    let r = runInstall(['ci', '--omit=dev', '--no-audit', '--no-fund']);
    if (r.status !== 0) {
      console.log('[BOOT] npm ci falló; probando npm install --omit=dev...');
      r = runInstall(['install', '--omit=dev', '--no-audit', '--no-fund']);
      if (r.status !== 0) {
        console.error('[BOOT] ERROR: no se pudieron instalar las dependencias.');
        process.exit(1);
      }
    }

    const still = missingNow();
    if (still.length) {
      console.error(`[BOOT] ERROR: siguen faltando tras instalar: ${still.join(', ')}`);
      process.exit(1);
    }
    console.log('[BOOT] Dependencias instaladas correctamente.');
  }

  // Retraso: dejar pasar el pico de memoria del arranque antes de descargar.
  setTimeout(() => {
    ensureYtDlpRuntime()
      .then(() => ensurePotProviderRuntime())
      .then(() => ensureWarpBinaries())
      .catch((e) => {
        console.error(`[BOOT] AVISO: runtime de música incompleto: ${e.message}`);
      });
  }, 8000).unref();
}

if (require.main === module) run();
module.exports = { run, esElf };

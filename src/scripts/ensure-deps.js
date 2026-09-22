// Bootstrap de arranque: verifica dependencias críticas y las instala si faltan.
// Cubre plataformas que extraen el código SIN reconstruir node_modules (p. ej. subir
// un zip a justrunmy/HeavenCloud y que quede el node_modules de una versión anterior),
// y paneles que bloquean los install scripts de npm (warn allow-scripts).
//
// HISTÓRICO: aquí vivían la descarga del binario standalone de yt-dlp, la compilación
// del POT provider (bgutil) y el diag del codificador Opus. Todo eso era del pipeline
// yt-dlp→ffmpeg→@discordjs/voice, que se sustituyó por completo por Lavalink/Riffy
// (la extracción la hace el nodo): se eliminó el 21/09/2026 porque no intervenía en la
// música y solo gastaba arranque, CPU y RAM (además de un modo de fallo por cada pieza).
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');

const REQUIRED = [
  'discord.js',
  'express',
  'express-session',
  'connect-mongo',
  'mongoose',
  'helmet',
  'express-rate-limit',
  'dotenv',
  'riffy'
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
    cwd: ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
}

// Diagnóstico de disco: los contenedores pequeños se llenan con node_modules/logs y el
// síntoma es un fallo críptico al escribir; imprimir df -h al arrancar lo hace evidente.
function diagDisk() {
  try {
    const { execFileSync } = require('child_process');
    const tmp = require('os').tmpdir();
    for (const [tag, d] of [['tmp', tmp], ['app', ROOT]]) {
      let line = '';
      try {
        line = execFileSync('df', ['-h', d], { timeout: 5000, encoding: 'utf8' }).split('\n')[1] || '';
      } catch (_) {}
      console.log(`[BOOT] DIAG disco (${tag}): ${line.trim() || '(comando df no disponible)'}`);
    }
  } catch (_) {}
}

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

function run() {
  // La música NO se codifica aquí: la extrae y sirve el nodo Lavalink (riffy).
  console.log('[BOOT] audio: delegado a Lavalink/Riffy (sin yt-dlp, ffmpeg ni Opus local)');
  setTimeout(() => { diagDisk(); }, 3000).unref();
  setTimeout(() => { logPublicIp().catch(() => {}); }, 2000).unref();

  const missing = missingNow();
  if (!missing.length) {
    console.log(`[BOOT] Dependencias OK (${REQUIRED.length}/${REQUIRED.length})`);
    return;
  }

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

if (require.main === module) run();
module.exports = { run };

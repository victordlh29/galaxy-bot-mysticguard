// PO Token provider (bgutil v1.3.2): mitiga el bot-check de YouTube en IPs de datacenter
// ("Sign in to confirm you're not a bot") sin proxy residencial.
// Arranca vendor/pot-provider (HTTP :4416) e instala el plugin de yt-dlp en su directorio
// estándar. Degradación limpia: si falta algo, la música sigue con la cadena de reintentos.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.join(__dirname, '..', '..');
const PLUGIN_SRC = path.join(ROOT, 'vendor', 'yt-dlp-plugins', 'bgutil-pot');
const SERVER_DIR = path.join(ROOT, 'vendor', 'pot-provider');
const SERVER_ENTRY = path.join(SERVER_DIR, 'build', 'main.js');
const PROVIDER_VERSION = '1.3.2';

function defaultPluginDir() {
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'yt-dlp', 'plugins');
  }
  return path.join(process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config'), 'yt-dlp', 'plugins');
}

// El flag --plugin-dirs está roto en yt-dlp 2026.08 (debug muestra "none"), así que el
// plugin se materializa en el directorio por defecto del binario (local y hosting).
function ensurePluginInstalled() {
  if (!fs.existsSync(path.join(PLUGIN_SRC, 'yt_dlp_plugins'))) return false;
  const dest = path.join(defaultPluginDir(), 'bgutil-pot');
  const marker = path.join(dest, `.version-${PROVIDER_VERSION}`);
  try {
    if (fs.existsSync(marker)) return true;
    fs.rmSync(dest, { recursive: true, force: true });
    fs.cpSync(PLUGIN_SRC, dest, { recursive: true });
    fs.writeFileSync(marker, PROVIDER_VERSION);
    console.log(`[POT] plugin de yt-dlp instalado en ${dest}`);
    return true;
  } catch (err) {
    console.warn(`[POT] AVISO: no se pudo instalar el plugin de yt-dlp: ${err.message}`);
    return false;
  }
}

let activeChild = null;

function start() {
  if (activeChild) return activeChild;
  if (/^1$|^true$/i.test(String(process.env.POT_PROVIDER_DISABLE || '').trim())) {
    console.log('[POT] deshabilitado por POT_PROVIDER_DISABLE; se omite');
    return null;
  }
  if (!fs.existsSync(SERVER_ENTRY)) {
    console.log('[POT] servidor no compilado (falta vendor/pot-provider/build/main.js); se omite');
    return null;
  }
  // El zip trae build/main.js pero NO node_modules: si aún no compiló el bootstrap,
  // arrancar ahora solo produce un exit 1 por MODULE_NOT_FOUND. Esperar el reintento.
  if (!fs.existsSync(path.join(SERVER_DIR, 'node_modules'))) {
    console.log('[POT] node_modules del servidor ausentes; esperando compilación del bootstrap...');
    return null;
  }
  // El provider declara Node >=22, pero justrunmy corre v20: se intenta igual (>=18)
  // y si el proceso muere la música sigue con la cadena de reintentos habitual.
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    console.warn(`[POT] requiere Node >= 18 (este host tiene ${major}); se omite`);
    return null;
  }
  if (major < 22) console.warn(`[POT] Node ${major} no soportado oficialmente por el provider (>=22); se intenta igual`);
  ensurePluginInstalled();

  const port = String(process.env.POT_PROVIDER_PORT || '4416');
  process.env.YT_DLP_POT_PROVIDER_URL = process.env.YT_DLP_POT_PROVIDER_URL || `http://127.0.0.1:${port}`;
  const base = process.env.YT_DLP_POT_PROVIDER_URL;

  // Saneado: el hijo no necesita secretos del bot.
  const childEnv = { ...process.env };
  for (const k of ['DISCORD_TOKEN', 'MONGODB_URI', 'SESSION_SECRET', 'YT_COOKIES', 'OWNER_ID']) delete childEnv[k];

  // Capturar stderr Y stdout (bgutil loguea por stdout) para diagnóstico real.
  let errTail = '';
  let outTail = '';
  let child;
  try {
    const args = [SERVER_ENTRY];
    if (port !== '4416') args.push('--port', port);
    child = spawn(process.execPath, args, {
      cwd: SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: childEnv
    });
  } catch (err) {
    console.warn(`[POT] AVISO: no se pudo arrancar el servidor: ${err.message}`);
    return null;
  }
  activeChild = child;
  child.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-500); });
  child.stdout.on('data', (d) => { outTail = (outTail + d.toString()).slice(-500); });
  child.on('error', (err) => console.warn(`[POT] AVISO: servidor caído: ${err.message}`));
  let childDead = false;
  child.on('exit', (code) => {
    activeChild = null;
    childDead = true;
    if (code && code !== 0) {
      const last = errTail.trim().split('\n').filter(Boolean).pop();
      console.warn(`[POT] servidor terminó con código ${code}: ${last ? last.slice(0, 250) : 'sin stderr'}`);
    }
  });

  // Healthcheck paciente: en arranque frío (página cache vacía)
  // el provider puede tardar >20s. Aviso a los 20s pero se sigue intentando hasta 120s.
  const inicio = Date.now();
  let avisado20 = false;
  let announced = false;
  const ping = setInterval(() => {
    if (announced || childDead) { clearInterval(ping); return; }
    fetch(`${base}/ping`, { signal: AbortSignal.timeout(1500) })
      .then((r) => {
        if (r.ok && !announced) {
          announced = true;
          clearInterval(ping);
          const seg = Math.round((Date.now() - inicio) / 1000);
          console.log(`[POT] servidor listo en ${base} (${seg}s al ping) — bot-check mitigado sin proxy`);
        }
      })
      .catch(() => {});
    const seg = Math.round((Date.now() - inicio) / 1000);
    if (seg >= 20 && !avisado20 && !announced) {
      avisado20 = true;
      console.warn('[POT] el servidor tarda >20s en responder /ping; siguiendo intentando hasta 120s...');
    }
    if (seg >= 120 && !announced) {
      clearInterval(ping);
      const tails = [outTail, errTail].map((t) => t.trim().split('\n').filter(Boolean).pop()).filter(Boolean);
      console.warn(`[POT] el servidor NO respondió /ping en 120s; streams sin PO tokens${tails.length ? ` — último log del hijo: ${tails[tails.length - 1].slice(0, 200)}` : ' (sin logs del hijo)'}`);
    }
  }, 2000);
  ping.unref();

  return child;
}

module.exports = { start };

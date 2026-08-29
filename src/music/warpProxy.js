// Opción 3 del plan anti bot-check: Cloudflare WARP como SOCKS5 local vía wireproxy
// (WireGuard userspace, sin root/TUN). Si el handshake sale, YT_PROXY se setea solo
// para que PlayerManager enrute yt-dlp por IPs de Cloudflare (no quemadas por YouTube).
// Best-effort: si UDP saliente está bloqueado, se sigue con la cadena normal.
const { spawn, spawnSync } = require('child_process');
const net = require('net');
const fs = require('fs');
const path = require('path');
const { esElf } = require('../scripts/ensure-deps');

const ROOT = path.join(__dirname, '..', '..');
const BIN_DIR = path.join(ROOT, 'vendor', 'warp', 'bin');
const WGCF = path.join(BIN_DIR, 'wgcf');
const WIREPROXY = path.join(BIN_DIR, 'wireproxy');
const ACCOUNT = path.join(ROOT, 'vendor', 'warp', 'wgcf-account.toml');
const PROFILE = path.join(ROOT, 'vendor', 'warp', 'wgcf-profile.conf');
const INI = path.join(ROOT, 'vendor', 'warp', 'wireproxy.ini');

let activeChild = null;

function runWgcf(args) {
  const r = spawnSync(WGCF, args, { cwd: path.dirname(ACCOUNT), timeout: 60000 });
  if (r.status !== 0) {
    const out = ((r.stdout || '').toString() + (r.stderr || '').toString()).trim();
    throw new Error(out.split('\n').pop()?.slice(0, 200) || `wgcf ${args[0]} exit ${r.status}`);
  }
}

function start() {
  if (activeChild) return activeChild;
  if (process.platform === 'win32') {
    console.log('[WARP] omitido en desarrollo Windows (solo hosting Linux)');
    return null;
  }
  if (/^1$|^true$/i.test(String(process.env.WARP_DISABLE || '').trim())) {
    console.log('[WARP] deshabilitado por WARP_DISABLE; se omite');
    return null;
  }
  if (process.env.YT_PROXY && process.env.YT_PROXY.trim()) {
    console.log('[WARP] YT_PROXY ya definido en el panel; se respeta y WARP queda en standby');
    return null;
  }
  if (!fs.existsSync(WIREPROXY)) {
    console.log('[WARP] binarios ausentes; esperando descarga del bootstrap...');
    return null;
  }
  // index.js llama a start() antes de que el bootstrap borre/re-descargue un binario
  // corrupto: no intentar ejecutar basura (era la causa del spawn con "código 2" en el log).
  if (!esElf(WIREPROXY)) {
    console.log('[WARP] wireproxy en disco corrupto; esperando re-descarga del bootstrap...');
    return null;
  }

  const port = String(process.env.WARP_SOCKS_PORT || '25344');
  try {
    fs.mkdirSync(BIN_DIR, { recursive: true });
    if (!fs.existsSync(PROFILE)) {
      if (!esElf(WGCF)) throw new Error('wgcf corrupto en disco; el bootstrap lo re-descargará en el próximo arranque');
      console.log('[WARP] registrando cuenta WARP gratuita (solo primer arranque)...');
      if (!fs.existsSync(ACCOUNT)) runWgcf(['register', '--accept-tos']);
      runWgcf(['generate']);
    }
    if (!fs.existsSync(PROFILE)) throw new Error('perfil no generado');
    fs.writeFileSync(INI, [
      'WGConfig = ' + PROFILE,
      'Socks5Address = 127.0.0.1:' + port,
      'LogLevels = off'
    ].join('\n'), 'utf8');
  } catch (err) {
    console.warn(`[WARP] AVISO: registro/perfil falló: ${err.message}`);
    return null;
  }

  let errTail = '';
  try {
    activeChild = spawn(WIREPROXY, ['-c', INI], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  } catch (err) {
    console.warn(`[WARP] AVISO: no se pudo arrancar wireproxy: ${err.message}`);
    return null;
  }
  activeChild.stderr.on('data', (d) => { errTail = (errTail + d.toString()).slice(-500); });
  activeChild.on('error', (err) => console.warn(`[WARP] AVISO: fallo del proceso wireproxy: ${err.message}`));
  activeChild.on('exit', (code, signal) => {
    activeChild = null;
    const last = errTail.trim().split('\n').filter(Boolean).pop();
    console.warn(`[WARP] wireproxy terminó (${signal ? `señal ${signal}` : `código ${code}`})${last ? `: ${last.slice(0, 200)}` : ''}`);
  });

  // Handshake SOCKS5 real + petición HTTP de control antes de confiar el tráfico de música.
  socksSelfTest(port).then((motivo) => {
    if (!motivo) {
      process.env.YT_PROXY = `socks5://127.0.0.1:${port}`;
      console.log(`[WARP] proxy activo: YT_PROXY=socks5://127.0.0.1:${port} — salida por Cloudflare WARP`);
      return;
    }
    console.warn(`[WARP] handshake SOCKS5 falló: ${motivo}; sin proxy, cadena normal`);
  }).catch(() => {});

  return activeChild;
}

// CONNECT a api.ipify.org:80 a través del SOCKS5 y comprobar respuesta HTTP.
// Devuelve null si todo OK, o el motivo del fallo. Reintenta la conexión durante toda
// la ventana de 15s: un solo intento daba falso "proceso muerto" cuando wireproxy aún
// no había abierto el puerto (arranque frío, visto en justrunmy el 23/08 22:27 UTC).
function socksSelfTest(port) {
  return new Promise((resolve) => {
    const DEADLINE = Date.now() + 15000;
    let settled = false;
    let connectedOnce = false;
    let s = null;
    let timer = null;
    let retry = null;
    const finish = (motivo) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      clearTimeout(retry);
      try { if (s) s.destroy(); } catch (_) {}
      resolve(motivo);
    };
    const timeoutMsg = () => (connectedOnce
      ? 'conectó al SOCKS5 pero el túnel no respondió en 15s (¿UDP saliente bloqueado por el host?)'
      : `nada escuchando en 127.0.0.1:${port} en 15s (¿el proceso murió?)`);
    timer = setTimeout(() => finish(timeoutMsg()), 15000);

    const connect = () => {
      if (settled) return;
      if (Date.now() >= DEADLINE) return finish(timeoutMsg());
      s = net.connect({ host: '127.0.0.1', port: Number(port) });
      let stage = 0;
      let buf = Buffer.alloc(0);
      s.on('error', () => {
        try { s.destroy(); } catch (_) {}
        if (!settled) retry = setTimeout(connect, 500);
      });
      s.on('connect', () => {
        connectedOnce = true;
        s.write(Buffer.from([5, 1, 0]));
      });
      s.on('data', (d) => {
        buf = Buffer.concat([buf, d]);
        if (stage === 0 && buf.length >= 2) {
          if (buf[0] !== 5 || buf[1] !== 0) return finish('respuesta SOCKS5 inválida en negociación');
          buf = buf.slice(2);
          stage = 1;
          const host = Buffer.from('api.ipify.org');
          s.write(Buffer.concat([Buffer.from([5, 1, 0, 3, host.length]), host, Buffer.from([0, 80])]));
        } else if (stage === 1 && buf.length >= 4) {
          if (buf[1] !== 0) return finish(`SOCKS5 rechazó el CONNECT (código ${buf[1]})`);
          buf = buf.slice(buf[3] === 1 ? 10 : buf[3] === 3 ? 7 + buf[4] : 22);
          stage = 2;
          s.write('GET / HTTP/1.1\r\nHost: api.ipify.org\r\nConnection: close\r\n\r\n');
        } else if (stage === 2 && buf.toString('latin1').includes('HTTP/1.')) {
          finish(null);
        }
      });
    };

    connect();
  });
}

module.exports = { start, socksSelfTest };

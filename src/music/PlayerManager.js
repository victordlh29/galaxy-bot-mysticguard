const {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  StreamType
} = require('@discordjs/voice');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpegStatic = require('ffmpeg-static');
const { YOUTUBE_DL_PATH } = require('youtube-dl-exec').constants;

const EQ_FREQS = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000];
const MAX_VOLUME = 100;
const DEFAULT_VOLUME = 40;
const COOKIES_FILE = path.join(__dirname, '..', '..', 'cookies.txt');
const PIPELINE_TIMEOUT_MS = Number(process.env.MUSIC_PIPELINE_TIMEOUT_MS) || 60000;
let browsersUsable = null;

// YT_COOKIES puede ser una RUTA o el CONTENIDO del cookies.txt (paneles como justrunmy).
// Si es contenido multilínea se materializa en un archivo temporal para pasarle --cookies a yt-dlp.
function resolveCookieFile() {
  const env = process.env.YT_COOKIES;
  if (env && env.trim()) {
    let content = env.replace(/\r\n/g, '\n').replace(/\\n/g, '\n');
    if (/^\s*#/.test(content) || content.includes('\n')) {
      try {
        const tmp = path.join(os.tmpdir(), `yt_cookies_${process.pid}.txt`);
        fs.writeFileSync(tmp, content.endsWith('\n') ? content : content + '\n', 'utf8');
        return tmp;
      } catch (_) {}
    }
    return env;
  }
  return fs.existsSync(COOKIES_FILE) ? COOKIES_FILE : null;
}

function isRetryableYtError(err) {
  const m = err && err.message ? err.message : '';
  return /Sign in to confirm|Sign in to continue|not a bot|Login required|HTTP Error 4(01|03)/i.test(m)
    || /Requested format is not available/i.test(m)
    || /cook|decrypt|database|profile/i.test(m)
    || /Timeout: sin datos de audio/i.test(m);
}

const BOT_CHECK_RE = /Sign in to confirm|Sign in to continue|not a bot|Login required|HTTP Error 4(01|03)/i;

function killProcs(procs) {
  for (const p of procs || []) {
    try {
      if (p && !p.killed) p.kill('SIGTERM');
    } catch (_) {}
  }
}

class PlayerManager {
  constructor() {
    this.queues = new Map();
    this.warnings = [];
  }

  addWarning(msg) {
    const w = { time: new Date().toISOString(), message: msg };
    this.warnings.push(w);
    if (this.warnings.length > 20) this.warnings.splice(0, this.warnings.length - 20);
    return w;
  }

  getWarnings() {
    return this.warnings;
  }

  getQueue(guildId, volume, savedEq = null) {
    if (!this.queues.has(guildId)) {
      const vol = Number.isFinite(volume) ? Math.max(0, Math.min(MAX_VOLUME, volume)) : DEFAULT_VOLUME;
      this.queues.set(guildId, {
        tracks: [],
        current: null,
        loop: false,
        autoplay: false,
        volume: vol,
        filter: 'off',
        eq: savedEq && savedEq.length === 10 ? [...savedEq] : Array(10).fill(0),
        player: createAudioPlayer({ behaviors: { noSubscriber: NoSubscriberBehavior.Pause } }),
        textChannel: null,
        connection: null,
        procs: [],
        retriedUrl: null
      });
      const q = this.queues.get(guildId);
      q.player.on('stateChange', (oldState, newState) => {
        if (newState.status === AudioPlayerStatus.Idle && oldState.status !== AudioPlayerStatus.Idle) {
          const cur = q.current;
          const played = q.player.state.playbackDuration || 0;
          const expected = cur && cur.duration ? cur.duration * 1000 : 0;
          const cutShort = !!cur && expected > 30000 && played > 0 && played < expected - 30000;
          if (cutShort && q.retriedUrl !== cur.url) {
            q.retriedUrl = cur.url;
            if (q.textChannel && q.textChannel.isSendable && q.textChannel.isSendable()) {
              q.textChannel.send(`🔄 Descarga interrumpida en **${cur.title}**, reintentando...`).catch(() => {});
            }
            q.tracks.unshift(cur);
            q.current = null;
            return this.playNext(guildId);
          }
          this.playNext(guildId);
        }
      });
      q.player.on('error', (err) => {
        console.error(`[MUSIC] error del player en ${guildId}:`, err.message);
        this.playNext(guildId);
      });
    } else if (Number.isFinite(volume)) {
      const q = this.queues.get(guildId);
      if (q.volume !== Math.max(0, Math.min(MAX_VOLUME, volume))) this.applyVolume(q, volume);
    }
    return this.queues.get(guildId);
  }

  applyVolume(q, volume) {
    q.volume = Math.max(0, Math.min(MAX_VOLUME, volume));
    if (q.player.state.resource && q.player.state.resource.volume) {
      q.player.state.resource.volume.setVolume(this.linearVolume(q));
    }
    return q.volume;
  }

  linearVolume(q) {
    return Math.pow(q.volume / 100, 1.660964) * this.volumeScale(q);
  }

  setVolume(guildId, volume) {
    return this.applyVolume(this.getQueue(guildId), volume);
  }

  setFilter(guildId, filter) {
    const q = this.getQueue(guildId);
    q.filter = filter;
    if (q.current) this.replayCurrent(guildId);
    return q.filter;
  }

  setEq(guildId, band, gain) {
    const q = this.getQueue(guildId);
    if (band < 0 || band > 9) return q.eq;
    q.eq[band] = Math.max(-10, Math.min(10, gain));
    if (q.current) this.replayCurrent(guildId);
    return q.eq;
  }

  toggleAutoplay(guildId) {
    const q = this.getQueue(guildId);
    q.autoplay = !q.autoplay;
    return q.autoplay;
  }

  buildFilterArgs(q) {
    const args = [];
    if (q.filter === 'bassboost') args.push('bass=g=10');
    else if (q.filter === 'bassboost-lite') args.push('bass=g=6');
    else if (q.filter === '8d') args.push('apulsator=hz=0.08');
    else if (q.filter === 'nightcore') args.push('asetrate=44100*1.25,aresample=44100,atempo=1.06');
    else if (q.filter === 'vaporwave') args.push('asetrate=44100*0.8,aresample=44100,atempo=1.1');
    else if (q.filter === 'karaoke') args.push('stereotools=mlev=0.03');
    q.eq.forEach((gain, i) => {
      if (gain) args.push(`equalizer=f=${EQ_FREQS[i]}:width_type=o:width=1:g=${gain}`);
    });
    return args;
  }

  getEqBoostDb(q) {
    const bandDb = q.eq.filter((g) => g > 0);
    const fromBands = bandDb.length ? Math.max(...bandDb) : 0;
    const fromFilter = q.filter === 'bassboost' ? 10 : q.filter === 'bassboost-lite' ? 6 : 0;
    return Math.max(fromBands, fromFilter);
  }

  volumeScale(q) {
    const boost = Math.min(12, this.getEqBoostDb(q));
    return boost > 0 ? Math.pow(10, -boost / 20) : 1;
  }

  async replayCurrent(guildId) {
    const q = this.queues.get(guildId);
    if (!q || !q.current) return;
    q.tracks.unshift(q.current);
    q.current = null;
    q.player.stop(true);
  }

  isPlaylistUrl(u) {
    return /youtube\.com\/playlist\//i.test(u) || (/list=/i.test(u) && !/[?&]v=/i.test(u));
  }

  trackFromInfo(v, fallbackUrl) {
    const thumbs = Array.isArray(v.thumbnails) ? v.thumbnails.filter((t) => t && t.url) : [];
    return {
      type: 'youtube',
      url: v.webpage_url || fallbackUrl,
      title: v.title || fallbackUrl,
      author: v.uploader || null,
      duration: typeof v.duration === 'number' ? Math.round(v.duration) : null,
      thumbnail: thumbs.length ? thumbs[thumbs.length - 1].url : null
    };
  }

  // Metadatos vía yt-dlp (misma herramienta que el stream, sin dependencias frágiles tipo play-dl)
  runYtDlpJson(fullArgs) {
    return new Promise((resolve, reject) => {
      let p;
      try {
        p = spawn(YOUTUBE_DL_PATH, fullArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (err) {
        return reject(err);
      }
      let out = '';
      let err = '';
      const timer = setTimeout(() => {
        try { if (!p.killed) p.kill('SIGTERM'); } catch (_) {}
        reject(new Error('Timeout: yt-dlp no devolvió metadatos'));
      }, 30000);
      p.stdout.on('data', (d) => { out += d.toString(); });
      p.stderr.on('data', (d) => { err = (err + d.toString()).slice(-1000); });
      p.on('error', (e) => { clearTimeout(timer); reject(e); });
      p.on('exit', (code) => {
        clearTimeout(timer);
        const trimmedOut = out.trim();
        if (code !== 0 || !trimmedOut) {
          return reject(new Error(`yt-dlp (metadatos) salió con código ${code}: ${(err || trimmedOut).slice(0, 200)}`));
        }
        try {
          resolve(JSON.parse(trimmedOut));
        } catch (_) {
          reject(new Error('yt-dlp devolvió JSON inválido'));
        }
      });
    });
  }

  // Variantes de autenticación compartidas por audio y metadatos:
  // limpio-primero → cookies → cookies-de-navegador, cada una × clientes.
  buildAuthVariants() {
    const variants = [];
    const clients = [null, 'android', 'tv', 'ios', 'web_embedded', 'tv_embedded', 'android_vr'];
    const cookieFile = resolveCookieFile();
    const pushClient = (label, flags) => {
      for (const client of clients) {
        const extra = client ? ['--extractor-args', `youtube:player_client=${client}`] : [];
        variants.push({ label: client ? `${label} client=${client}` : label, flags: [...flags, ...extra] });
      }
    };
    pushClient('sin cookies', []);
    if (cookieFile) pushClient(`cookies:${cookieFile}`, ['--cookies', cookieFile]);
    if (browsersUsable !== false) {
      for (const browser of this.detectBrowsers()) {
        pushClient(`cookies-from-browser:${browser}`, ['--cookies-from-browser', browser]);
      }
    }
    return variants;
  }

  // Igual que createStream pero para metadatos JSON: itera variantes de auth
  // (cap 10 ≈ 30s peor caso; los bot-check fallan en ~1-3s).
  async runYtDlpJsonRetry(extraArgs) {
    const base = ['-J', '--no-warnings', '--quiet', '--socket-timeout', '20', '--js-runtimes', 'node'];
    if (process.env.YT_PROXY) base.push('--proxy', process.env.YT_PROXY);
    const variants = this.buildAuthVariants().slice(0, 10);
    let lastErr;
    let botCheck;
    for (const v of variants) {
      try {
        return await this.runYtDlpJson([...base, ...v.flags, ...extraArgs]);
      } catch (err) {
        lastErr = err;
        if (!isRetryableYtError(err)) throw err;
        if (BOT_CHECK_RE.test(err.message)) botCheck = err;
        console.warn(`[MUSIC] metadatos fallo con ${v.label}: ${String(err.message).slice(0, 100)}`);
      }
    }
    throw botCheck || lastErr;
  }

  async resolveQuery(query) {
    const trimmed = query.trim();
    try {
      if (/^https?:\/\//i.test(trimmed)) {
        if (this.isPlaylistUrl(trimmed)) {
          const data = await this.runYtDlpJsonRetry(['--flat-playlist', trimmed]);
          const entries = data && Array.isArray(data.entries) ? data.entries : [];
          const tracks = [];
          for (const e of entries) {
            if (!e) continue;
            const url = e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
            if (!url) continue;
            tracks.push({
              type: 'youtube',
              url,
              title: e.title || url,
              author: e.uploader || null,
              duration: typeof e.duration === 'number' ? Math.round(e.duration) : null,
              thumbnail: Array.isArray(e.thumbnails) && e.thumbnails.length && e.thumbnails[e.thumbnails.length - 1].url ? e.thumbnails[e.thumbnails.length - 1].url : null
            });
          }
          return tracks;
        }
        try {
          const info = await this.runYtDlpJsonRetry(['--no-playlist', trimmed]);
          return [this.trackFromInfo(info, trimmed)];
        } catch (_) {
          return [{ type: 'youtube', url: trimmed, title: trimmed, duration: null, thumbnail: null }];
        }
      }
      const results = await this.runYtDlpJsonRetry([`ytsearch1:${trimmed}`]);
      const entry = results && Array.isArray(results.entries) ? results.entries[0] : results;
      if (!entry) return [];
      return [this.trackFromInfo(entry, null)];
    } catch (err) {
      console.error('[MUSIC] error resolviendo query:', err.message);
      return [];
    }
  }

  async play(guildId, voiceChannel, track) {
    const q = this.getQueue(guildId);
    if (!q.connection) {
      q.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator
      });
      q.connection.subscribe(q.player);
    }
    q.tracks.push(track);
    q.retriedUrl = null;
    if (q.player.state.status !== AudioPlayerStatus.Playing && q.player.state.status !== AudioPlayerStatus.Buffering) {
      await this.playNext(guildId);
    }
    return q;
  }

  async playNext(guildId) {
    const q = this.getQueue(guildId);
    let track;
    if (!q.tracks.length) {
      if (q.loop && q.current) {
        q.tracks.push(q.current);
        } else if (q.autoplay && q.current && q.current.url) {
          try {
            const related = await this.getRelated(q.current);
          if (related) q.tracks.push(related);
        } catch (_) {}
        if (!q.tracks.length) return this.finishQueue(guildId);
      } else {
        return this.finishQueue(guildId);
      }
    }
    track = q.tracks.shift();
    q.current = track;
    killProcs(q.procs);
    q.procs = [];
    try {
      const stream = await this.createStream(track.url, q);
      const resource = createAudioResource(stream, {
        inputType: StreamType.Raw,
        inlineVolume: true,
        volume: this.linearVolume(q),
        metadata: { title: track.title, url: track.url }
      });
      q.player.play(resource);
      if (q.textChannel && q.textChannel.isSendable && q.textChannel.isSendable()) {
        q.textChannel.send(`▶️ Reproduciendo: **${track.title}**`).catch(() => {});
      }
      return track;
    } catch (err) {
      console.error(`[MUSIC] error reproduciendo "${track.title}":`, err.message);
      if (q.textChannel && q.textChannel.isSendable && q.textChannel.isSendable()) {
        q.textChannel.send(`❌ No pude reproducir **${track.title}**: ${err.message}`).catch(() => {});
      }
      return this.playNext(guildId);
    }
  }

  finishQueue(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return null;
    q.current = null;
    killProcs(q.procs);
    q.procs = [];
    setTimeout(() => {
      const qq = this.queues.get(guildId);
      if (qq && !qq.tracks.length && qq.player.state.status !== AudioPlayerStatus.Playing) {
        qq.player.stop(true);
        killProcs(qq.procs);
        qq.procs = [];
        if (qq.connection) qq.connection.destroy();
        this.queues.delete(guildId);
      }
    }, 30000);
    return null;
  }

  async getRelated(track) {
    try {
      const qy = [track && track.author, track && track.title].filter(Boolean).join(' ').trim();
      if (!qy) return null;
      const data = await this.runYtDlpJsonRetry(['--flat-playlist', `ytsearch3:${qy}`]);
      const entries = data && Array.isArray(data.entries) ? data.entries : [];
      for (const e of entries) {
        if (!e) continue;
        const url = e.url || (e.id ? `https://www.youtube.com/watch?v=${e.id}` : null);
        if (!url || (track.url && url === track.url)) continue;
        return {
          type: 'youtube',
          url,
          title: e.title || 'Video',
          author: e.uploader || null,
          duration: typeof e.duration === 'number' ? Math.round(e.duration) : null,
          thumbnail: null
        };
      }
      return null;
    } catch (_) {
      return null;
    }
  }

  async createStream(url, q) {
    const filterArgs = this.buildFilterArgs(q);
    const attempts = this.buildYtDlpAttempts(url);
    let lastErr;
    let botCheckErr;
    let cookiesFailed = false;
    for (const attempt of attempts) {
      try {
        return await this.pipeOnce(url, filterArgs, attempt.args, q);
      } catch (err) {
        lastErr = err;
        if (!isRetryableYtError(err)) throw err;
        if (attempt.label.startsWith('cookies:')) cookiesFailed = true;
        if (BOT_CHECK_RE.test(err.message)) botCheckErr = err;
        if (/decrypt|database|cook/i.test(err.message) && browsersUsable === null) {
          browsersUsable = false;
          console.warn('[MUSIC] cookies del navegador no accesibles (DPAPI/ABE); se omitirán en este reinicio');
        }
        console.warn(`[MUSIC] fallo con ${attempt.label}: ${err.message.slice(0, 120)}`);
      }
    }
    const final = botCheckErr || lastErr;
    if (cookiesFailed) {
      this.addWarning('⚠️ cookies.txt vencida o inválida — falló la autenticación. Re-exporta cookies.txt desde tu navegador (Get cookies.txt LOCALLY) o renueva YT_COOKIES.');
    }
    throw final;
  }

  buildYtDlpAttempts(url) {
    const base = [
      '-f', '140/bestaudio/best', '-o', '-', '--no-playlist', '--quiet', '--no-warnings',
      '--retries', '5', '--retry-sleep', '3', '--fragment-retries', '5',
      '--socket-timeout', '20', '--http-chunk-size', '64K',
      '--js-runtimes', 'node'
    ];
    if (process.env.YT_PROXY) base.push('--proxy', process.env.YT_PROXY);
    // Orden limpio-primero (estilo STAN_PLAYA): el intento sin auth va primero;
    // cookies y cookies-de-navegador quedan como escalones de respaldo.
    return this.buildAuthVariants().map((v) => ({ label: v.label, args: [...base, ...v.flags, url] }));
  }

  detectBrowsers() {
    const found = [];
    const local = process.env.LOCALAPPDATA || '';
    const appdata = process.env.APPDATA || '';
    const checks = [
      ['edge', path.join(local, 'Microsoft', 'Edge', 'User Data', 'Default', 'Network', 'Cookies')],
      ['chrome', path.join(local, 'Google', 'Chrome', 'User Data', 'Default', 'Network', 'Cookies')],
      ['brave', path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data', 'Default', 'Network', 'Cookies')],
      ['firefox', path.join(appdata, 'Mozilla', 'Firefox', 'Profiles')]
    ];
    for (const [name, p] of checks) {
      try {
        if (name === 'firefox' ? fs.existsSync(p) : fs.statSync(p).isFile()) found.push(name);
      } catch (_) {}
    }
    return found;
  }

  pipeOnce(url, filterArgs, dlArgs, q) {
    return new Promise((resolve, reject) => {
      let dl;
      let ff;
      let settled = false;
      let dataReceived = false;
      let ffStderr = '';
      let dlStderr = '';

      const timer = setTimeout(() => {
        if (!dataReceived) {
          const dlTail = dlStderr.trim().slice(-600) || 'sin stderr de yt-dlp';
          const ffTail = ffStderr.trim().slice(-300) || 'sin stderr de ffmpeg';
          finish(new Error(`Timeout: sin datos de audio en ${PIPELINE_TIMEOUT_MS / 1000}s (yt-dlp: ${dlTail} | ffmpeg: ${ffTail})`));
        }
      }, PIPELINE_TIMEOUT_MS);

      const finish = (err) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        killProcs([dl, ff]);
        reject(err);
      };

      try {
        dl = spawn(YOUTUBE_DL_PATH, dlArgs, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
      } catch (err) {
        return reject(err);
      }
      dl.on('error', (err) => finish(err));
      dl.stderr.on('data', (d) => {
        dlStderr = (dlStderr + d.toString()).slice(-2000);
        if (process.env.DEBUG_MUSIC) console.log('[MUSIC] yt-dlp:', d.toString().slice(0, 200));
      });

      try {
        ff = spawn(
          ffmpegStatic,
          [
            '-fflags', 'nobuffer',
            '-analyzeduration', '0',
            '-probesize', '32',
            '-i', '-',
            ...(filterArgs.length ? ['-af', filterArgs.join(',')] : []),
            '-vn',
            '-f', 's16le',
            '-ar', '48000',
            '-ac', '2',
            '-loglevel', 'error',
            '-'
          ],
          { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }
        );
      } catch (err) {
        return finish(err);
      }
      ff.on('error', (err) => finish(err));
      ff.stderr.on('data', (d) => {
        ffStderr = (ffStderr + d.toString()).slice(-2000);
        if (process.env.DEBUG_MUSIC) console.log('[MUSIC] ffmpeg:', d.toString().slice(0, 200));
      });
      dl.stdout.pipe(ff.stdin);
      dl.stdout.on('error', (err) => {
        if (err.code !== 'EPIPE') console.error('[MUSIC] yt-dlp stdout:', err.message);
      });
      ff.stdin.on('error', () => {});

      ff.stdout.once('data', () => {
        dataReceived = true;
        clearTimeout(timer);
        if (!settled) {
          settled = true;
          resolve(ff.stdout);
        }
      });
      ff.stdout.on('error', (err) => finish(err));
      ff.on('exit', (code) => {
        if (!dataReceived && code !== null && code !== 0 && dl.exitCode === 0) {
          finish(new Error(`FFmpeg salió con código ${code}: ${ffStderr.slice(-200) || 'sin stderr'}`));
        }
      });
      dl.on('exit', (code) => {
        if (!dataReceived && code !== null && code !== 0) {
          const errLine = dlStderr.split('\n').find((l) => /^ERROR|ERROR:/i.test(l)) || dlStderr.slice(0, 200);
          finish(new Error(`yt-dlp salió con código ${code}: ${errLine.slice(0, 300) || 'sin stderr'}`));
        }
      });

      q.procs = [dl, ff];
    });
  }

  skip(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return null;
    const skipped = q.current;
    if (skipped && skipped.url) q.retriedUrl = skipped.url;
    q.player.stop(true);
    return skipped;
  }

  stop(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return;
    q.tracks = [];
    q.current = null;
    q.player.stop(true);
    killProcs(q.procs);
    q.procs = [];
    if (q.connection) q.connection.destroy();
    this.queues.delete(guildId);
  }

  pause(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return false;
    q.player.pause();
    return true;
  }

  resume(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return false;
    q.player.unpause();
    return true;
  }

  toggleLoop(guildId) {
    const q = this.getQueue(guildId);
    q.loop = !q.loop;
    return q.loop;
  }

  isPlaying(guildId) {
    const q = this.queues.get(guildId);
    return q && (q.player.state.status === AudioPlayerStatus.Playing || q.player.state.status === AudioPlayerStatus.Buffering);
  }

  nowPlaying(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.current : null;
  }

  queueList(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.tracks : [];
  }

  getVolume(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.volume : null;
  }

  getState(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return null;
    return {
      filter: q.filter,
      eq: [...q.eq],
      loop: q.loop,
      autoplay: q.autoplay
    };
  }
}

module.exports = new PlayerManager();

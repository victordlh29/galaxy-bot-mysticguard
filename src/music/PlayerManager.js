// Fachada de reproducción vía Lavalink (cliente Riffy) sobre NODOS PÚBLICOS.
// Sustituye al pipeline local yt-dlp→ffmpeg→@discordjs/voice: la extracción de audio
// la hace el nodo desde su propia IP, evitando el bot-check de YouTube que quema las
// IPs de datacenter (hosting). La cola, autoplay, loop, filtros/EQ y el volumen siguen
// viviendo AQUÍ (en memoria) con la misma API pública que consumen commands.js y api.js.
//
// Modelo de avance: se reproducen UN track a la vez VÍA la cola nativa de Riffy
// (queue.add + player.play()). Es OBLIGATORIO: Riffy lee `player.current` (que solo
// se setea en play()) para manejar TrackEnd/TrackException/TrackStuck; si lanzas el
// tema con REST updatePlayer directo `current` queda null y sus handlers crashean
// (Cannot read properties of null reading 'info') antes de emitirnos el evento.
// El avance lo deciden los EVENTOS:
//   - queueEnd        → termina el tema y la cola de Riffy quedó vacía (normal)
//   - trackEnd        → cualquier razón EXCEPTO 'replaced' (p. ej. loadfailed)
//   - trackError      → excepción de audio (Riffy hace stop(): llega después un queueEnd)
//   - trackStuck      → tema colgado (idem)
// Todos desembocan en onTrackEnded → advance(), con guard q._advancing (serializa
// disparos concurrentes) + debounce de 300ms (absorbe las ráfagas de 'stopped' →
// trackEnd + queueEnd, y error → queueEnd, que generarían doble avance).
const { Riffy } = require('riffy');

const MAX_VOLUME = 100;
const DEFAULT_VOLUME = 40;

// Nodos públicos (mismo stack que TitanBot). Los 3 verificados en vivo: loadtracks
// devuelve search/playlist sin salir por proxy. Los passwords de Serenetia y MilloHost
// son links de invitación a su Discord (rotan y exigen pertenecer).
// Override completo vía LAVALINK_NODES (JSON array) si el usuario quiere nodos propios.
const DEFAULT_NODES = [
  { name: 'serenetia', host: 'lavalinkv4.serenetia.com', port: 443, password: 'https://seretia.link/discord', secure: true },
  { name: 'millohost', host: 'lava-v4.millohost.my.id', port: 443, password: 'https://discord.gg/mjS5J2K3ep', secure: true },
  { name: 'jirayu', host: 'lavalink.jirayu.net', port: 443, password: 'youshallnotpass', secure: true },
  { name: 'trinium', host: 'lavalink-v4.triniumhost.com', port: 443, password: 'free', secure: true }
];

// Lavalink propio en ESTE PC (`lavalink-local/start.ps1`, IP residencial → YouTube directo
// sin bot-check). Se añade SOLO en Windows, que es donde corre el bot de casa: en el
// hosting Linux (HeavenCloud/justrunmy) 127.0.0.1 no existe y el nodo solo generaba un
// bucle de reconexión (ECONNREFUSED) y el falso "nodos conectados: NINGUNO" en cada boot.
// Para llevar el nodo local al hosting: abrir el puerto 2333 TCP en el router (WAN→PC) y
// poner LAVALINK_NODES con la IP PÚBLICA de casa (una IP de loopback allí no sirve).
const LOCAL_NODE = { name: 'home', host: '127.0.0.1', port: 2333, password: 'youshallnotpass', secure: false };

const LOOPBACK_RE = /^(?:::1|0\.0\.0\.0|localhost|127\.\d{1,3}\.\d{1,3}\.\d{1,3})$/i;
function isLoopbackNode(n) {
  return !!(n && LOOPBACK_RE.test(String(n.host || '').trim()));
}

function lavalinkNodes() {
  let nodes = null;
  try {
    const raw = process.env.LAVALINK_NODES;
    if (raw && raw.trim()) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length) nodes = parsed;
    }
  } catch (_) {}
  if (!nodes) {
    nodes = [...DEFAULT_NODES];
    if (process.platform === 'win32') nodes.unshift(LOCAL_NODE);
  }
  // En Linux un nodo loopback (127.0.0.1/localhost) es siempre una IP muerta: el único
  // Lavalink local posible vive en el propio host y, si lo hubiera, se declara con su IP
  // pública o con LAVALINK_ALLOW_LOCAL=1. Descartarlo evita el bucle de reconexión.
  const allowLocal = process.env.LAVALINK_ALLOW_LOCAL === '1' || process.platform === 'win32';
  const out = [];
  let skipped = 0;
  for (const n of nodes) {
    if (isLoopbackNode(n) && !allowLocal) { skipped++; continue; }
    out.push(n);
  }
  if (skipped) console.log(`[MUSIC] ${skipped} nodo(s) de loopback omitido(s) en este host (LAVALINK_ALLOW_LOCAL=1 para forzarlos).`);
  if (!out.length) console.warn('[MUSIC] sin nodos Lavalink utilizables: la música no arrancará (revisa LAVALINK_NODES).');
  return out;
}

// Convierte un Track de Riffy (v4: ya trae .track encoded + info completa) a nuestro
// shape de siempre. `_lv` (no enumerable) cachea la instancia para reproducirla sin
// re-resolver en el nodo al llegarle el turno.
function fromLavalinkTrack(lv) {
  const info = (lv && lv.info) || {};
  const t = {
    type: info.sourceName || 'youtube',
    url: info.uri,
    title: info.title || 'Tema sin título',
    author: info.author || null,
    duration: Number.isFinite(info.length) && info.length > 0 ? Math.round(info.length / 1000) : null,
    thumbnail: info.thumbnail || info.artworkUrl || null
  };
  Object.defineProperty(t, '_lv', { value: lv, enumerable: false, writable: false });
  return t;
}

class PlayerManager {
  constructor() {
    this.queues = new Map();
    this.warnings = [];
    this.client = null;
    this.riffy = null;
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

  connectedNodes() {
    if (!this.riffy) return [];
    return [...this.riffy.nodeMap.values()].filter((n) => n.connected && n.sessionId);
  }

  // Crea Riffy, reenvía los paquetes de voz del gateway y registra los eventos.
  // Espera (hasta 12s) a que conecte al menos un nodo; si ninguno conecta no es fatal:
  // los nodos de Riffy siguen reintentando y los comandos fallarán con un mensaje claro.
  async initLavalink(client) {
    if (this.riffy) return true;
    this.client = client;
    this.riffy = new Riffy(client, lavalinkNodes(), {
      send: this.makeSendFn(client),
      defaultSearchPlatform: process.env.LAVALINK_SEARCH_PLATFORM || 'ytmsearch',
      restVersion: 'v4',
      bypassChecks: { nodeFetchInfo: true },
      migrateOnDisconnect: true,
      migrateOnFailure: true
    });

    client.on('raw', (packet) => {
      try {
        this.riffy.updateVoiceState(packet);
      } catch (_) {}
    });

    this.riffy.on('debug', (...args) => {
      if (process.env.DEBUG_MUSIC) console.log('[MUSIC] riffy:', ...args);
    });

    this.riffy.on('nodeConnect', (node) => {
      this.consoleNodeState();
    });
    this.riffy.on('nodeReconnect', (node) => {
      console.warn(`[MUSIC] reconectando nodo lavalink ${node.name} (${node.host})...`);
    });
    this.riffy.on('nodeDisconnect', (node) => {
      console.warn(`[MUSIC] nodo lavalink desconectado: ${node.name}`);
      this.addWarning(`⚠️ Nodo Lavalink ${node.name} se desconectó. La música usa otro nodo o reintenta.`);
      this.consoleNodeState();
    });
    this.riffy.on('nodeError', (node, err) => {
      if (err && /Unable to connect|not authorized/i.test(String(err.message || ''))) return;
      console.warn(`[MUSIC] error en nodo lavalink ${node.name}: ${err && err.message}`);
      this.consoleNodeState();
    });

    this.riffy.on('queueEnd', (player) => this.onTrackEnded(player.guildId));
    this.riffy.on('trackEnd', (player, track, payload) => {
      const reason = String((payload && payload.reason) || '').toLowerCase();
      if (reason === 'replaced') return;
      this.onTrackEnded(player.guildId);
    });
    this.riffy.on('trackError', (player, track, payload) => {
      const exception = payload && payload.exception;
      console.warn(`[MUSIC] error de audio en ${player.guildId}: ${exception ? JSON.stringify(exception).slice(0, 200) : 'desconocido'}`);
      this.onTrackEnded(player.guildId);
    });
    this.riffy.on('trackStuck', (player) => {
      console.warn(`[MUSIC] tema estancado en ${player.guildId}, saltándolo`);
      this.onTrackEnded(player.guildId);
    });

    this.riffy.on('playerDestroy', (player) => {
      const q = this.queues.get(player.guildId);
      if (!q) return;
      q.pl = null;
      q._playing = false;
      q.paused = false;
      q.connection = null;
    });

    this.riffy.init(client.user.id);
    return this.waitForNode(12000);
  }

  consoleNodeState() {
    const list = this.connectedNodes().map((n) => `${n.name}@${n.host}:${n.port}`);
    console.log(`[MUSIC] nodos lavalink conectados: ${list.length ? list.join(', ') : 'NINGUNO'}`);
  }

  async waitForNode(ms) {
    const deadline = Date.now() + ms;
    while (Date.now() < deadline) {
      if (this.connectedNodes().length) {
        this.consoleNodeState();
        return true;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
    const total = this.riffy.nodes.length;
    console.warn(`[MUSIC] tras ${ms / 1000}s ningún nodo lavalink conectó (${total} configurados). La música fallará hasta que conecte.`);
    this.addWarning(`⚠️ Sin nodos Lavalink conectados (${total} configurados). La música está temporalmente caída.`);
    return false;
  }

  makeSendFn(client) {
    return (payload) => {
      try {
        if (!payload || !payload.d) return;
        const guild = client.guilds.cache.get(payload.d.guild_id);
        if (!guild || !guild.shard) return;
        guild.shard.send(payload);
      } catch (_) {}
    };
  }

  clampVolume(v) {
    return Math.max(0, Math.min(MAX_VOLUME, Number.isFinite(v) ? v : DEFAULT_VOLUME));
  }

  getQueue(guildId, volume, savedEq = null) {
    if (!this.queues.has(guildId)) {
      const vol = this.clampVolume(volume);
      const q = {
        tracks: [],
        current: null,
        loop: false,
        autoplay: false,
        autoplayFailures: 0,
        volume: vol,
        paused: false,
        _playing: false,
        _advancing: false,
        _lastEndAt: 0,
        filter: 'off',
        eq: savedEq && savedEq.length === 10 ? [...savedEq] : Array(10).fill(0),
        pl: null,
        textChannel: null,
        connection: null,
        finishTimer: null,
        _radioFilled: false,
        player: null
      };
      q.connection = {
        get joinConfig() {
          return { channelId: q.pl ? q.pl.voiceChannel || null : null };
        }
      };
      q.player = {
        get state() {
          return q.paused ? { status: 'paused' } : q._playing ? { status: 'playing' } : { status: 'idle' };
        }
      };
      this.queues.set(guildId, q);
    } else if (Number.isFinite(volume)) {
      const q = this.queues.get(guildId);
      const v2 = this.clampVolume(volume);
      if (q.volume !== v2) this.applyVolume(q, v2);
    }
    return this.queues.get(guildId);
  }

  applyVolume(q, volume) {
    q.volume = this.clampVolume(volume);
    if (q.pl) {
      try { q.pl.setVolume(q.volume); } catch (_) {}
    }
    return q.volume;
  }

  setVolume(guildId, volume) {
    return this.applyVolume(this.getQueue(guildId), volume);
  }

  getVolume(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.volume : null;
  }

  // Mapas de filtros/EQ a la API de Lavalink (aplican en vivo, sin reiniciar el tema).
  buildEqualizer(q) {
    const bands = [];
    const filterBoost = q.filter === 'bassboost' ? 10 : q.filter === 'bassboost-lite' ? 6 : 0;
    for (let i = 0; i < 10; i++) {
      const db = (q.eq[i] || 0) + (filterBoost && i < 4 ? filterBoost : 0);
      if (!db) continue;
      const gain = Math.max(-0.25, Math.min(1, db / 40));
      if (!gain) continue;
      bands.push({ band: Math.round((i * 14) / 9), gain });
    }
    return bands;
  }

  async applyFilters(q) {
    if (!q.pl) return;
    const f = q.pl.filters;
    try {
      f.timescale = q.filter === 'nightcore'
        ? { speed: 1.5, pitch: 1.5, rate: 1 }
        : q.filter === 'vaporwave'
          ? { speed: 0.8, pitch: 0.85, rate: 1 }
          : null;
      f.rotation = q.filter === '8d' ? { rotationHz: 0.08 } : null;
      f.karaoke = q.filter === 'karaoke'
        ? { level: 1, monoLevel: 1, filterBand: 220, filterWidth: 100 }
        : null;
      f.equalizer = this.buildEqualizer(q);
      f.volume = 1;
      await f.updateFilters();
    } catch (err) {
      console.warn(`[MUSIC] aplicar filtros lavalink: ${err && err.message}`);
    }
  }

  setFilter(guildId, filter) {
    const q = this.getQueue(guildId);
    q.filter = filter;
    this.applyFilters(q);
    return q.filter;
  }

  setEq(guildId, band, gain) {
    const q = this.getQueue(guildId);
    if (band < 0 || band > 9) return q.eq;
    q.eq[band] = Math.max(-10, Math.min(10, gain));
    this.applyFilters(q);
    return q.eq;
  }

  toggleAutoplay(guildId) {
    const q = this.getQueue(guildId);
    q.autoplay = !q.autoplay;
    return q.autoplay;
  }

  toggleLoop(guildId) {
    const q = this.getQueue(guildId);
    q.loop = !q.loop;
    return q.loop;
  }

  ensurePlayer(guildId, voiceChannel, q) {
    if (this.riffy && !this.connectedNodes().length) {
      throw new Error('Sin nodos Lavalink conectados. La música está temporalmente caída; reinténtalo en unos segundos.');
    }
    let pl = this.riffy.players.get(guildId);
    if (!pl) {
      const textId = q.textChannel && q.textChannel.id ? q.textChannel.id : voiceChannel.id;
      pl = this.riffy.createConnection({
        guildId,
        voiceChannel: voiceChannel.id,
        textChannel: textId,
        deaf: true,
        loop: 'none',
        defaultVolume: q.volume
      });
    } else if (voiceChannel.id !== pl.voiceChannel) {
      try { pl.setVoiceChannel(voiceChannel.id, { deaf: true }); } catch (_) {}
    }
    if (pl.volume !== q.volume) {
      try { pl.setVolume(q.volume); } catch (_) {}
    }
    this.applyFilters(q);
    return pl;
  }

  // Convierte nuestro track a un Track de Riffy reproducible. Si llegó de resolveQuery
  // ya lleva `_lv` cacheado (con .track encoded); si no, se re-resuelve en el nodo.
  async toLavalinkTrack(track) {
    if (track && track._lv !== undefined) return track._lv;
    if (!this.riffy || !this.connectedNodes().length) return null;
    const qy = track && track.url ? track.url : track && track.title;
    if (!qy) return null;
    const res = await this.searchTracks(qy).catch(() => null);
    if (res && this.extractTracks(res).length && (this.extractTracks(res)[0].encoded || this.extractTracks(res)[0].track)) return this.extractTracks(res)[0];
    return null;
  }

  // Recrea un player limpio cuando el que tenemos quedó obsoleto (riffy lo destruyó al
  // caerse la sesión de voz o migrar de nodo y `connected` ya no está). devuelve el
  // nuevo player o null si no hay canal de voz registrado.
  recreatePlayer(guildId, q) {
    const vcId = q.pl && q.pl.voiceChannel
      ? q.pl.voiceChannel
      : (q.connection && q.connection.joinConfig && q.connection.joinConfig.channelId);
    if (!vcId) return null;
    try { q.pl.destroy(); } catch (_) {}
    try {
      const textId = q.textChannel && q.textChannel.id ? q.textChannel.id : vcId;
      const pl = this.riffy.createConnection({
        guildId,
        voiceChannel: vcId,
        textChannel: textId,
        deaf: true,
        loop: 'none',
        defaultVolume: q.volume
      });
      if (pl.volume !== q.volume) {
        try { pl.setVolume(q.volume); } catch (_) {}
      }
      this.applyFilters(q);
      return pl;
    } catch (err) {
      console.warn(`[MUSIC] recrear jugador lavalink: ${err && err.message}`);
      return null;
    }
  }

  // Encola el track y llama a play() de Riffy. Si el player está obsoleto
  // ('Player connection is not initiated'), recrea la conexión y reintenta una vez.
  async playNative(guildId, q, riffyTrack) {
    try {
      q.pl.queue.clear();
      q.pl.queue.add(riffyTrack);
      await q.pl.play();
    } catch (err) {
      if (/connection is not initiated/i.test(String(err && err.message || ''))) {
        const pl2 = this.recreatePlayer(guildId, q);
        if (!pl2) throw err;
        q.pl = pl2;
        q.pl.queue.clear();
        q.pl.queue.add(riffyTrack);
        await q.pl.play();
        return;
      }
      throw err;
    }
  }

  // Espera a que el nodo tenga credenciales de voz (sessionId + endpoint + token) antes
  // de mandar el tema. resolve() ya aborta solo a los 10s.
  async waitVoice(pl) {
    if (pl.connection.isReady) return;
    try { await pl.connection.resolve(); } catch (_) {}
    if (!pl.connection.isReady) {
      throw new Error('Lavalink no confirmó la conexión de voz (10s). Revisa permisos Connect/Speak en el canal y el estado del nodo.');
    }
  }

  async play(guildId, voiceChannel, track) {
    const q = this.getQueue(guildId);
    if (!track || !voiceChannel) return q;
    const pl = this.ensurePlayer(guildId, voiceChannel, q);
    q.pl = pl;
    q._radioFilled = false;
    if (q.finishTimer) {
      clearTimeout(q.finishTimer);
      q.finishTimer = null;
    }
    q.tracks.push(track);
    if (!q._playing || q.paused) await this.advance(guildId);
    return q;
  }

  // Con discreción: un único disparo por tema gracias a q._advancing.
  async advance(guildId) {
    const q = this.queues.get(guildId);
    if (!q || !q.pl) return null;
    if (q._advancing) return null;
    q._advancing = true;
    try {
      for (let attempt = 0; attempt < 8; attempt++) {
        let track = q.tracks.shift();
        if (!track) {
          if (q.loop && q.current) {
            track = q.current;
          } else if (q.autoplay && q.current && q.current.url) {
            try {
              const rel = await this.getRelated(q.current);
              if (rel) {
                track = rel;
                q.autoplayFailures = 0;
              } else {
                q.autoplayFailures += 1;
              }
            } catch (_) {
              q.autoplayFailures += 1;
            }
            if (!track && q.autoplayFailures >= 3) {
              console.warn('[MUSIC] autoplay: 3 fallas seguidas sin relacionado válido; autoplay desactivado');
              q.autoplay = false;
            }
          }
          if (!track) {
            this.finishQueue(guildId);
            return null;
          }
        }
        q.current = track;
        q.paused = false;
        const lv = await this.toLavalinkTrack(track);
        if (!lv) {
          this.notifyText(q, `❌ No pude cargar **${track.title}** en Lavalink; saltándola...`);
          continue;
        }
        try {
          await this.waitVoice(q.pl);
          const lvInfo = lv.info || {};
          const riffyTrack = {
            track: lv.track || lv.encoded,
            encoded: lv.track || lv.encoded,
            info: {
              identifier: lvInfo.identifier,
              seekable: lvInfo.isSeekable,
              author: lvInfo.author,
              length: lvInfo.length,
              stream: lvInfo.isStream,
              position: 0,
              title: lvInfo.title,
              uri: lvInfo.uri,
              requester: null,
              sourceName: lvInfo.sourceName,
              isrc: lvInfo.isrc || null,
              thumbnail: lvInfo.thumbnail || lvInfo.artworkUrl || null
            }
          };
          q.pl.queue.clear();
          q.pl.queue.add(riffyTrack);
          await this.playNative(guildId, q, riffyTrack);
          q._playing = true;
          this.notifyText(q, `▶️ Reproduciendo: **${track.title}**`);
          if (track.radioUrl && !q._radioFilled) {
            q._radioFilled = true;
            this.fillRadioRelated(guildId, track);
          }
          return track;
        } catch (err) {
          q._playing = false;
          const msg = String(err && err.message || err).slice(0, 200);
          console.error(`[MUSIC] error reproduciendo "${track.title}":`, msg);
          this.notifyText(q, `❌ No pude reproducir **${track.title}**: ${msg}`);
          if (!q.tracks.length) {
            this.finishQueue(guildId);
            return null;
          }
        }
      }
      this.finishQueue(guildId);
      return null;
    } finally {
      q._advancing = false;
    }
  }

  notifyText(q, text) {
    if (q.textChannel && q.textChannel.isSendable && q.textChannel.isSendable()) {
      q.textChannel.send(text).catch(() => {});
    }
  }

  onTrackEnded(guildId) {
    const q = this.queues.get(guildId);
    if (!q || !q.pl) return;
    if (q._advancing) return;
    const now = Date.now();
    if (now - (q._lastEndAt || 0) < 300) return;
    q._lastEndAt = now;
    setImmediate(() => {
      this.advance(guildId).catch((err) => {
        console.error(`[MUSIC] error en advance(${guildId}):`, err && err.message);
      });
    });
  }

  finishQueue(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return null;
    q.current = null;
    q._playing = false;
    q.paused = false;
    if (q.finishTimer) clearTimeout(q.finishTimer);
    q.finishTimer = setTimeout(() => {
      const qq = this.queues.get(guildId);
      if (qq && !qq.tracks.length && !qq._playing && qq.pl && !qq.pl.playing) {
        try { qq.pl.destroy(); } catch (_) {}
        qq.pl = null;
        qq.connection = null;
        this.queues.delete(guildId);
      }
    }, 30000);
    return null;
  }

  // Autoplay: búsqueda relacionada en el nodo (IP del nodo, sin bot-check), como hace
  // el autoplay nativo de Riffy. Se salta el candidato que coincida con el tema actual.
  async getRelated(track) {
    const qy = [track && track.author, track && track.title].filter(Boolean).join(' ').trim();
    if (!qy || !this.riffy || !this.connectedNodes().length) return null;
    const res = await this.textSearch(qy).catch(() => null);
    if (!res || !this.extractTracks(res).length) {
      console.warn(`[MUSIC] autoplay: sin relacionado para "${(track.title || '').slice(0, 50)}"`);
      return null;
    }
    for (const lv of this.extractTracks(res)) {
      if (!lv || !(lv.encoded || lv.track) || !lv.info) continue;
      if (track.url && lv.info.uri === track.url) continue;
      return fromLavalinkTrack(lv);
    }
    return null;
  }

  // Normaliza la respuesta de loadtracks: los nodos v4 devuelven {loadType, data}
  // (['search'] → data es array; 'track' → data es el track; 'playlist' → data.tracks).
  extractTracks(r) {
    if (!r) return [];
    const lt = r.loadType;
    if (lt === 'playlist') return (r.data && Array.isArray(r.data.tracks)) ? r.data.tracks : (Array.isArray(r.tracks) ? r.tracks : []);
    if (lt === 'track') return r.data ? [r.data] : (Array.isArray(r.tracks) ? r.tracks : []);
    if (lt === 'search') return Array.isArray(r.data) ? r.data : (Array.isArray(r.tracks) ? r.tracks : []);
    if (Array.isArray(r.tracks)) return r.tracks;
    if (Array.isArray(r.data)) return r.data;
    if (Array.isArray(r.data && r.data.tracks)) return r.data.tracks;
    return [];
  }

  // loadtracks de un nodo con timeout propio: si el nodo se cuelga (p. ej. YouTube sin
  // PO tokens tarda ~60s), volvemos ya y probamos el siguiente. La petición original
  // queda viva en segundo plano pero sin unhandledRejection.
  async tryLoad(node, identifier, timeoutMs) {
    if (!node || !node.connected || !node.sessionId) return null;
    const p = node.rest.makeRequest('GET', `/${node.rest.version}/loadtracks?identifier=${encodeURIComponent(identifier)}`)
      .then((r) => r)
      .catch(() => null);
    const guard = new Promise((res) => setTimeout(() => res(null), timeoutMs || 10000));
    return Promise.race([p, guard]);
  }

  // Busca en los primeros nodos conectados (hasta 3) hasta que uno devuelva resultados.
  searchTracks(identifier) {
    const nodes = this.connectedNodes();
    if (!nodes.length) return Promise.resolve(null);
    const cycle = async (i) => {
      if (i >= nodes.length || i >= 3) return null;
      const r = await this.tryLoad(nodes[i], identifier, 10000);
      if (r && typeof r.loadType === 'string' && !/empty|no.?matches/i.test(r.loadType) && this.extractTracks(r).length) return r;
      if (r) console.warn(`[MUSIC] ${nodes[i].name} sin resultados (${r.loadType}) para "${String(identifier).slice(0, 50)}"; pruebo otro nodo`);
      return cycle(i + 1);
    };
    return cycle(0);
  }

  textSearch(query) {
    const plat = (this.riffy && this.riffy.defaultSearchPlatform) || 'ytmsearch';
    const tokens = [query].filter(Boolean);
    const searchers = [
      (q) => this.searchTracks(`${plat}:${q}`),
      (q) => this.searchTracks(`scsearch:${q}`)
    ];
    return searchers
      .reduce((chain, fn) => chain.then((res) => res || fn(tokens[0])), Promise.resolve(null));
  }

  // Búsqueda / carga de URL contra el nodo. El loadtracks del nodo reemplaza toda la
  // maquinaria yt-dlp (bot-check, cookies). Excepción: list=RD<id> (radios). Lavalink
  // sin PO tokens tarda ~60s y vuelve vacío en esos endpoints, así que la radio se
  // responde YA con el video suelto (carga rápida 'track') marcado con t.radioUrl, y
  // la continuación de la radio se rellena por búsqueda relacionada en segundo plano.
  async resolveQuery(query) {
    const trimmed = String(query || '').trim();
    if (!this.riffy) {
      console.warn('[MUSIC] Riffy no inicializado todavía');
      return [];
    }
    if (!this.connectedNodes().length) {
      console.warn('[MUSIC] sin nodos lavalink conectados para resolver la búsqueda');
      return [];
    }
    const isUrl = /^https?:\/\//i.test(trimmed);
    let radioUrl = null;
    let effective = trimmed;
    if (isUrl && /[?&]list=RD[\w-]*/i.test(trimmed)) {
      const vMatch = trimmed.match(/[?&]v=([\w-]{6,})/);
      effective = vMatch ? `https://www.youtube.com/watch?v=${vMatch[1]}` : (trimmed.split(/[?&]/)[0] || trimmed);
      radioUrl = trimmed;
    }
    try {
      const res = isUrl ? await this.searchTracks(effective) : await this.textSearch(effective);
      const tracks = res ? this.extractTracks(res) : [];
      const loadType = res && res.loadType;
      const out = [];
      for (const lv of tracks) {
        if (!lv || !(lv.encoded || lv.track) || !lv.info || !lv.info.uri) continue;
        out.push(fromLavalinkTrack(lv));
      }
      if (!out.length) {
        console.warn(`[MUSIC] lavalink: loadType=${loadType} sin tracks válidos para "${trimmed.slice(0, 60)}"`);
        return [];
      }
      if (radioUrl) out[0].radioUrl = radioUrl;
      const isPlaylist = loadType === 'playlist' || loadType === 'PLAYLIST_LOADED';
      console.log(`[MUSIC] ${isUrl ? 'carga' : 'búsqueda'} resuelta por lavalink (${loadType}, ${out.length} temas) para "${trimmed.slice(0, 60)}"`);
      return isPlaylist ? out : out.slice(0, 1);
    } catch (err) {
      console.error('[MUSIC] error resolviendo query:', err && err.message);
      this.addWarning(`⚠️ Lavalink falló al resolver "${trimmed.slice(0, 50)}": ${String(err && err.message).slice(0, 120)}`);
      return [];
    }
  }

  // Sustituto del viejo fillRadio (flat-playlist de yt-dlp): rellena la cola con hasta
  // 5 relacionados por TEXT SEARCH del tema actual (el nodo no hanga como con list=RD).
  async fillRadioRelated(guildId, track) {
    const q = this.queues.get(guildId);
    if (!q) return;
    const qy = [track && track.author, track && track.title].filter(Boolean).join(' ').trim();
    if (!qy) return;
    const res = await this.textSearch(qy).catch(() => null);
    if (!res) return;
    // `added` DEBE declararse aquí: sin declaración, `added++` creaba un global NaN y el
    // tope de 5 nunca se cumplía (la radio volcaba TODOS los resultados a la cola).
    let added = 0;
    for (const lv of this.extractTracks(res)) {
      if (!lv || !(lv.encoded || lv.track) || !lv.info || !lv.info.uri) continue;
      const u = lv.info.uri;
      const q2 = this.queues.get(guildId);
      if (!q2) return;
      if (track.url && u === track.url) continue;
      if (q2.current && q2.current.url === u) continue;
      if (q2.tracks.some((t) => t.url === u)) continue;
      q2.tracks.push(fromLavalinkTrack(lv));
      added++;
      if (added >= 5) break;
    }
    console.log(`[MUSIC] radio: rellenadas ${added} canciones relacionadas en la cola`);
  }

  skip(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return null;
    const cur = q.current;
    if (!cur) return null;
    if (q.pl) {
      try { q.pl.stop(); } catch (_) {}
    }
    this.onTrackEnded(guildId);
    return cur;
  }

  stop(guildId) {
    const q = this.queues.get(guildId);
    if (!q) return;
    if (q.finishTimer) clearTimeout(q.finishTimer);
    const pl = q.pl;
    q.tracks = [];
    q.current = null;
    q._playing = false;
    q.paused = false;
    if (pl) {
      try { pl.destroy(); } catch (_) {}
    }
    q.pl = null;
    q.connection = null;
    this.queues.delete(guildId);
  }

  pause(guildId) {
    const q = this.queues.get(guildId);
    if (!q || !q.pl || q.paused || !q._playing) return false;
    q.paused = true;
    try { q.pl.pause(true); } catch (_) {}
    return true;
  }

  resume(guildId) {
    const q = this.queues.get(guildId);
    if (!q || !q.pl || !q.paused) return false;
    q.paused = false;
    try { q.pl.pause(false); } catch (_) {}
    return true;
  }

  isPlaying(guildId) {
    const q = this.queues.get(guildId);
    return !!(q && q.pl && q._playing && !q.paused);
  }

  nowPlaying(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.current : null;
  }

  queueList(guildId) {
    const q = this.queues.get(guildId);
    return q ? q.tracks : [];
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

const manager = new PlayerManager();
// Expuesto SOLO para diagnóstico/tests (los consumidores usan la instancia normal).
manager.lavalinkNodes = lavalinkNodes;
manager.isLoopbackNode = isLoopbackNode;
module.exports = manager;
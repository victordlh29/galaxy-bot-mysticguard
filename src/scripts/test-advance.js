// Verificación offline del avance de cola del PlayerManager (fachada Lavalink/Riffy).
//
// ¿Por qué offline? El bot real solo puede correr en UNA instancia (token compartido), así
// que no se puede levantar un segundo proceso para provocar fallos de track contra Discord
// y un nodo Lavalink. Aquí se reproducen los CAMINOS DE FALLO con dobles: la cola, `advance()`,
// `playNative()`, `recreatePlayer()`, `onTrackEnded()` y `finishQueue()` son el código REAL;
// solo se falsifican el player, la conexión de voz y la respuesta del nodo.
//
// Los casos cubren exactamente el congelamiento que arregló el hotfix v17 (el nodo emite
// TrackEndEvent loadfailed y la cola NO avanzaba) y su continuación v17-b (player zombi
// "Player connection is not initiated").
//
// Uso: npm run test:advance   (no toca red, ni Mongo, ni Discord, ni el bot)
const path = require('path');
const pm = require(path.join(__dirname, '..', 'music', 'PlayerManager'));

let pass = 0;
let fail = 0;
const orig = { log: console.log, warn: console.warn, error: console.error };
const logs = [];

function quiet() {
  console.log = (...a) => logs.push(['log', a.join(' ')]);
  console.warn = (...a) => logs.push(['warn', a.join(' ')]);
  console.error = (...a) => logs.push(['error', a.join(' ')]);
}
function loud() {
  console.log = orig.log;
  console.warn = orig.warn;
  console.error = orig.error;
}
function check(name, cond, extra) {
  if (cond) { pass++; orig.log(`  PASS  ${name}`); }
  else { fail++; orig.log(`  FAIL  ${name}${extra ? ` — ${extra}` : ''}`); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- simulación
function fakePlayer(tag) {
  const pl = {
    tag,
    played: [],
    voiceChannel: 'vc1',
    volume: 40,
    playing: false,
    destroyed: false,
    filters: { updateFilters: async () => {} },
    connection: { isReady: true, resolve: async () => {} },
    queue: {
      items: [],
      clear() { pl.queue.items = []; },
      add(t) { pl.queue.items.push(t); }
    },
    async play() {
      pl.played.push(pl.queue.items[pl.queue.items.length - 1]);
      pl.playing = true;
      return true;
    },
    setVolume(v) { pl.volume = v; return v; },
    setVoiceChannel() {},
    pause() {},
    stop() { pl.playing = false; },
    destroy() { pl.destroyed = true; }
  };
  return pl;
}

// `broken: true` = el nodo no entrega carga para ese tema (equivale a loadtracks vacío).
function track(id, opts = {}) {
  const t = {
    type: 'youtube',
    url: `https://youtu.be/${id}`,
    title: `Tema ${id}`,
    author: 'Autor',
    duration: 100,
    thumbnail: null
  };
  const lv = opts.broken ? null : {
    track: `enc-${id}`,
    encoded: `enc-${id}`,
    info: {
      identifier: id,
      title: t.title,
      author: t.author,
      length: 100000,
      uri: t.url,
      sourceName: 'youtube',
      isSeekable: true,
      isStream: false,
      thumbnail: null
    }
  };
  Object.defineProperty(t, '_lv', { value: lv, enumerable: false, writable: false });
  return t;
}

function setup(gid, { tracks = [], pl = fakePlayer('p1'), current = null } = {}) {
  const q = pm.getQueue(gid, 40);
  q.tracks = [...tracks];
  q.current = current;
  q.pl = pl;
  q._playing = !!current;
  q.textChannel = {
    isSendable: () => true,
    sent: [],
    send(msg) { this.sent.push(msg); return Promise.resolve(); }
  };
  return q;
}
function cleanup(gid) {
  const q = pm.queues.get(gid);
  if (q && q.finishTimer) clearTimeout(q.finishTimer);
  pm.queues.delete(gid);
}

// Stub de Riffy: solo lo que tocan connectedNodes() y recreatePlayer().
pm.riffy = {
  nodeMap: new Map([['sim', { name: 'sim', host: 'sim', port: 443, connected: true, sessionId: 'sim' }]]),
  createConnection: (opts) => {
    const pl = fakePlayer('p-recreado');
    if (opts && opts.voiceChannel) pl.voiceChannel = opts.voiceChannel;
    return pl;
  }
};

(async () => {
  orig.log('Test de avance de cola (PlayerManager, dobles offline)\n');

  // A) El nodo no puede cargar el tema → se salta al siguiente y suena.
  quiet();
  const qA = setup('gA', { tracks: [track('roto', { broken: true }), track('bueno')] });
  const rA = await pm.advance('gA');
  loud();
  check('A1  fallo de carga: avanza al siguiente tema', qA.current && qA.current.title === 'Tema bueno', `current=${qA.current && qA.current.title}`);
  check('A2  el tema bueno llegó al nodo', qA.pl.played.length === 1 && qA.pl.played[0].track === 'enc-bueno', `played=${qA.pl.played.length}`);
  check('A3  avisó en el canal (no se quedó mudo)', qA.textChannel.sent.some((m) => /No pude cargar/.test(m)));
  check('A4  advance() devolvió el tema reproducido', !!rA && rA.title === 'Tema bueno');
  cleanup('gA');

  // B) REPRODUCCIÓN DEL BUG v17: el nodo emite trackEnd(loadfailed) sobre el tema actual
  //    → nuestro handler llama onTrackEnded → la cola DEBE avanzar (antes se congelaba).
  let advanceCalls = 0;
  const realAdvance = pm.advance.bind(pm);
  pm.advance = async (g) => { advanceCalls++; return realAdvance(g); };
  const qB = setup('gB', { tracks: [track('siguiente')], current: track('muerto', { broken: true }) });
  quiet();
  pm.onTrackEnded('gB');            // = trackEnd con razón loadfailed
  await sleep(80);
  loud();
  check('B1  trackEnd(loadfailed) dispara exactamente UN avance', advanceCalls === 1, `calls=${advanceCalls}`);
  check('B2  la cola avanza (no se congela)', qB.current && qB.current.title === 'Tema siguiente', `current=${qB.current && qB.current.title}`);
  check('B3  el tema siguiente suena', qB.pl.played.length === 1 && qB.pl.played[0].track === 'enc-siguiente');
  cleanup('gB');

  // C) Ráfaga trackEnd + queueEnd del MISMO tema (lo que emitía Riffy tras un loadfailed)
  //    → el debounce debe colapsarla en un único avance (sin saltarse una canción de más).
  advanceCalls = 0;
  const qC = setup('gC', { tracks: [track('c1'), track('c2')], current: track('actual') });
  quiet();
  pm.onTrackEnded('gC');
  pm.onTrackEnded('gC');
  await sleep(80);
  loud();
  check('C1  ráfaga (trackEnd+queueEnd) = un solo avance', advanceCalls === 1, `calls=${advanceCalls}`);
  check('C2  no se saltó un tema de más', qC.current && qC.current.title === 'Tema c1' && qC.tracks.length === 1, `current=${qC.current && qC.current.title} restantes=${qC.tracks.length}`);
  cleanup('gC');

  // D) El nodo rechaza el stream del primer tema ("All clients failed to load the item")
  //    → se salta al siguiente en vez de quedarse mudo.
  const plD = fakePlayer('pD');
  let dCalls = 0;
  plD.play = async () => {
    dCalls++;
    if (dCalls === 1) throw new Error('All clients failed to load the item');
    plD.played.push(plD.queue.items[plD.queue.items.length - 1]);
    return true;
  };
  const qD = setup('gD', { tracks: [track('d1'), track('d2')], pl: plD });
  quiet();
  const rD = await pm.advance('gD');
  loud();
  check('D1  error de audio del nodo: suena el siguiente', qD.current && qD.current.title === 'Tema d2', `current=${qD.current && qD.current.title}`);
  check('D2  se avisó del fallo en el canal', qD.textChannel.sent.some((m) => /No pude reproducir/.test(m)));
  check('D3  advance() no devolvió null', !!rD);
  cleanup('gD');

  // E) Player zombi (v17-b): "Player connection is not initiated" → recrea y reintenta
  //    el MISMO tema, sin perderlo ni dejar la reproducción muerta.
  const plE = fakePlayer('pE');
  let eCalls = 0;
  plE.play = async () => {
    eCalls++;
    if (eCalls === 1) throw new Error('Player connection is not initiated');
    plE.played.push(plE.queue.items[plE.queue.items.length - 1]);
    return true;
  };
  const qE = setup('gE', { tracks: [track('e1')], pl: plE });
  quiet();
  const rE = await pm.advance('gE');
  loud();
  check('E1  recrea el player y reintenta el MISMO tema', !!rE && rE.title === 'Tema e1' && qE.pl !== plE && qE.pl.played.length === 1, `pl=${qE.pl && qE.pl.tag} played=${qE.pl && qE.pl.played.length}`);
  check('E2  el player obsoleto se destruyó', plE.destroyed === true);
  cleanup('gE');

  // F) Último tema roto → la cola termina limpia (no se congela ni revienta).
  const plF = fakePlayer('pF');
  plF.play = async () => { throw new Error('The page needs to be reloaded.'); };
  const qF = setup('gF', { tracks: [track('f1')], pl: plF });
  quiet();
  const rF = await pm.advance('gF');
  loud();
  check('F1  último tema roto: cola terminada, sin excepción', rF === null && qF.current === null && qF._playing === false, `ret=${rF} current=${qF.current}`);
  check('F2  se programó el cierre del player', !!qF.finishTimer);
  cleanup('gF');

  // G) Tope de intentos: muchos temas rotos no deben provocar un bucle infinito.
  const qG = setup('gG', { tracks: Array.from({ length: 10 }, (_, i) => track(`g${i}`, { broken: true })), pl: fakePlayer('pG') });
  quiet();
  const rG = await pm.advance('gG');
  loud();
  check('G1  tope de 8 intentos (no bucle infinito)', rG === null && qG.tracks.length === 2, `restantes=${qG.tracks.length}`);
  cleanup('gG');

  pm.advance = realAdvance;

  orig.log(`\n${pass} PASS / ${fail} FAIL`);
  if (fail) orig.log('Fallos:\n' + logs.map(([k, m]) => `  [${k}] ${m}`).join('\n'));
  process.exitCode = fail ? 1 : 0;
})();

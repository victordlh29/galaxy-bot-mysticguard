// Guarda anti-duplicado para eventos del gateway.
//
// Discord REENVÍA eventos (guildMemberAdd / guildMemberRemove...) cuando el bot retoma la
// sesión (RESUME) tras un corte de red, y con el egress intermitente del hosting esos
// cortes son frecuentes: cada copia disparaba su propio mensaje (bienvenida/despedida
// duplicadas "a veces").
//
// La deduplicación es por PROCESO: si el bot corre en dos instancias a la vez (local +
// hosting) cada una manda la suya y esto no lo puede evitar el código — la regla de UNA
// sola instancia activa sigue siendo la única solución para ese caso.
function createDedupe(ttlMs, label) {
  const seen = new Map();

  return function alreadyHandled(key) {
    // Sin discriminador fiable (p. ej. miembro no cacheado) NO se deduplica: es preferible
    // un aviso de más que quedarse sin él.
    if (!key) return false;
    const now = Date.now();
    for (const [k, t] of seen) {
      if (now - t > ttlMs) seen.delete(k);
    }
    const prev = seen.get(key);
    if (prev && now - prev < ttlMs) {
      if (label) console.log(`[${label}] evento repetido ignorado (${key}) — reconexión del gateway`);
      return true;
    }
    seen.set(key, now);
    return false;
  };
}

module.exports = { createDedupe };

# PROMPT DE MEJORAS FUTURAS — GALAXY BOT (Mystic Guard)

Proyecto: bot de Discord con música, XP, roles automáticos, anti-spam y dashboard.
Estado: código funcional local (Mongo conectado, bot online, 16 comandos registrados, dashboard en localhost:3000) y **desplegado en justrunmy.app** (hosting gratis: 1 vCPU / 2 GB RAM / 4 GB disco / 5 apps). Changelog de todo lo hecho: `PENDIENTES.md`.
IMPORTANTE: NO tocar el archivo `.env`. NO tocar `galaxy-dashboard.html` (es solo referencia de diseño). `cookies.txt` (raíz) es un archivo SENSIBLE de sesión de Google: NO subirlo a git ni a un host público. Verificar cada cambio con `node --check` (backend y JS del dashboard). Tras cada cambio hay que reiniciar el bot (Node no recarga).

## Propósito de este prompt

Lista de mejoras futuras analizadas sobre el proyecto completo. Se analizan una a una antes de implementar. Estado: **SOLO PROPUESTAS, NADA IMPLEMENTADO TODAVÍA** (fecha: 14/08/2026).

## 🔴 PRIORIDAD ALTA — Seguridad y robustez (claves antes de exponer en internet)

1. **Rate-limit en Express** (`express-rate-limit`): protección del login del mega admin y de la API pública contra fuerza bruta (scrypt ya es lento, pero un límite de intentos por IP no está de más).
   - Toques: `src/server/app.js` (aplicar a `/api/auth/*` y al resto de la API), dependencia nueva.
   - Riesgo: rate-limit muy bajo rompería el dashboard en Activity (mismo IP para todos los usuarios).

2. **CSRF**: el dashboard publica POSTs con sesión por cookie; al estar en justrunmy (público) un token CSRF evita que una página maliciosa ejecute acciones con la sesión.
   - Toques: middleware en `src/server/api.js` + token en `public/index.html` (meta o header por fetch).

3. **Helmet + cookies seguras** (`secure`, `sameSite=lax`): cabeceras de seguridad HTTP y revisar flags de la cookie de sesión (`src/server/app.js`, `src/server/auth.js`).
   - Ojo: `secure` solo funciona sobre HTTPS (justrunmy lo da).

4. **Healthcheck + uptime**: endpoint `GET /healthz` para que justrunmy sepa que el proceso vive, y alerta si la música se queda en Idle por más de X min.
   - Toques: `src/server/app.js` (ruta), `ready.js`/tick (alerta), dashboard Dev.

5. **Cola de música persistente**: hoy la cola vive en memoria — si justrunmy redeployea, se pierde. Guardarla en BD (con `songId` para re-descargar) y restaurarla al arrancar.
   - Toques: nuevo modelo o campo en GuildConfig, `PlayerManager.js`, `ready.js`. Ojo: hubo una `musicqueues` ELIMINADA por huérfana; esta sería con implementación real.

## 🟠 MÚSICA

6. **Shuffle** de la cola (botón en dashboard + `/shuffle`).
   - Toques: `PlayerManager.js`, `api.js`, `commands.js`, reproductor del dashboard.

7. **Eliminar/mover canciones de la cola** desde el dashboard (botones ✕ o arrastrar).
   - Toques: `api.js`, `public/index.html` cola.

8. **Favoritos por usuario** (`/save`, `/favorites`) con guardado en BD (ya existe el modelo Member).
   - Toques: modelo Member (campo favorites), `commands.js`, endpoints API.

9. **Radio 24/7** (streams lofi/etc. vía yt-dlp) para que el bot nunca se quede en silencio.
   - Toques: `PlayerManager.js` (modo radio), comandos/dashboard.

10. **Historial de reproducción** (últimas N canciones → "reproducir de nuevo").
    - Toques: memoria o BD, API, dashboard.

11. **Letras** (`/lyrics`) — barato y muy apreciado.
    - Toques: dependencia (lyrics APIs), `commands.js`.

12. **Filtros por usuario** en vez de globales (hoy el EQ/bassboost afecta a todos los oyentes).
    - Toques: `PlayerManager.js` (audio filters por listener — complejo), dashboard.

## 🟠 XP, ROLES Y COMUNIDAD

13. **Rol "Nuevo" con mute automático** (ya anotado como pendiente 3 en PENDIENTES.md) — la mejor defensa anti-bots de entrada.
    - Ideas: `autorole.newcomerRoleId` + retiro por tiempo / reacción a reglas ✅ / nivel XP; logs `member-newcomer`.

14. **Rachas (streaks)**: días consecutivos de actividad con bonus de XP.
    - Toques: modelo Member (campos streak/lastActiveDay), `messageCreate.js`, `voiceXp.js`.

15. **Decaimiento opcional de XP** por inactividad (o reset mensual configurable).
    - Toques: util XP + dashboard.

16. **Prestigio**: resetear XP a cambio de un badge/rol especial.
    - Toques: util XP, comandos, dashboard.

17. **Moderación por comandos**: `/warn /mute /kick /ban` del propio bot + panel de moderación en el dashboard (warn manual ya cuenta infracciones en BD — solo falta la interfaz).
    - Toques: `commands.js` (nuevos comandos → 20 totales), `api.js`, dashboard vista Mod.

18. **Canal de sugerencias**: embed + reacciones ✅/❌ con conteo, configurable desde el dashboard.
    - Toques: `GuildConfig` (suggestions), `commands.js` (/suggest), `messageReactionAdd.js`.

19. **`/report`** de usuarios → mensaje privado al equipo de moderación.
    - Toques: `commands.js`, logger.

20. **Welcome con imagen de banner** (canvas) — embeds ya están, un fondo bonito lo remata.
    - Toques: dependencia canvas, `guildMemberAdd.js`, dashboard (fondo configurable).

## 🟡 DASHBOARD Y ACTIVIDAD

21. **Actividad de Discord embebida más completa**: controles de música dentro de la Activity (ya funciona, pero podría incluir cola + EQ).
    - Toques: `public/index.html` (modo activity), SDK.

22. **Backup/restaurar config**: exportar el JSON de configuración y restaurarlo (copias de seguridad de un clic).
    - Toques: `api.js` (GET/POST backup), dashboard.

23. **Multi-idioma** del dashboard (es/en).
    - Toques: `public/index.html` (i18n) — archivo grande, cuidado.

24. **Buscador de canciones en el dashboard** (input con resultados de play-dl antes de poner play).
    - Toques: `api.js` (endpoint search), `public/index.html`.

25. **Panel Dev con métricas**: RAM, eventos/seg, reintentos de YouTube, tiempo de descarga — ya existen los logs, solo falta mostrarlos.
    - Toques: `api.js` (/api/dev), dashboard Dev.

## 🟡 INGENIERÍA (deuda técnica)

26. **ESLint + pre-commit**: hoy solo hay `node --check` manual; un linter evitaría regresiones silenciosas.
    - Toques: eslint config + package.json scripts.

27. **Tests unitarios mínimos**: normalización de `config.js`, `permissions.js`, `logger.js`, anti-spam (la lógica de infracciones/decaimiento ya es testeable).
    - Toques: framework de test (node:test, sin dependencias), `src/utils/*.test.js`.

28. **Actualizar dependencias** (play-dl, discord.js, mongoose) con control de cambios en el pipeline de audio (la parte más frágil).
    - Ojo: probar MUCHO la música tras actualizar.

29. **Script de deploy** (`npm run deploy`): zip + subida a justrunmy vía su API, para que el despliegue deje de ser manual.
    - Toques: `scripts/`, package.json.

30. **Manejo de errores de Mongo**: reconexión con backoff y cola de reintentos para `logCommand` (no perder registros si Atlas parpadea).
    - Toques: `src/server/app.js` o util de mongo, `logger.js`.

## Orden de implementación sugerido

1-4 (seguridad, una tarde) → 13 (rol Nuevo, anti-bots) → 7-8 (calidad de vida música) → 17 (moderación) → luego lo que más use la comunidad.
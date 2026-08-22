# AGENTS.md — Galaxy Bot (Mystic Guard)

Proyecto: bot de Discord con música, XP, roles automáticos, anti-spam y dashboard web.
El usuario se comunica en **español** — responder siempre en español.

## REGLAS CRÍTICAS
- **NO tocar ni imprimir `.env`** (contiene secretos reales: `DISCORD_TOKEN`, `MONGODB_URI`, `SESSION_SECRET`, `YT_COOKIES`...). Solo lectura.
- **NO tocar `galaxy-dashboard.html`** (raíz, solo es referencia de diseño).
- **`cookies.txt`** (raíz) = sesión de Google SENSIBLE: nunca subirlo a git ni a hostings públicos.
- **NO correr dos instancias del bot a la vez** (justrunmy + local): comparten token y BD pero cada una tiene su cola de música en memoria → causa raíz del bug de volumen "44 fantasma".
- Tras cada cambio en código hay que **reiniciar el bot** (Node no recarga). Verificar con `npm run check` (node --check de backend y dashboard).
- Actualizar **`PENDIENTES.md`** (changelog) tras cada cambio hecho.
- **MongoDB**: Mongoose con `strict:true` IGNORA en silencio `$unset`/`$set` de campos fuera del esquema → para limpiar campos muertos usar el driver directo (`mongoose.connection.db.collection(...)`).
- Los scripts temporales (fuera del proyecto) necesitan `$env:NODE_PATH = "C:\Users\Matrix\Desktop\Nueva carpeta\node_modules"` para resolver dependencias.

## Arquitectura
- `index.js` — entrada; registra `unhandledRejection`/`uncaughtException` con stack (los crash en silencio causaban 404 en rutas nuevas).
- `src/bot/` — `client.js`, `commands.js` (16 comandos), `events/` (messageCreate, guildMemberAdd/Remove, ready, guildCreate...), `deploy-commands.js`.
- `src/music/PlayerManager.js` — cola en memoria por servidor, pipeline `yt-dlp.exe` → `ffmpeg-static` → PCM s16le 48 kHz (`StreamType.Raw`, `inlineVolume:true`), filtros `-af`, autoplay, loop.
- `src/server/` — `app.js` (Express + session), `api.js` (endpoints REST), `auth.js` (OAuth Discord + mega admin).
- `src/models/` — `GuildConfig`, `Member`, `BotSettings` (defaultGuildId), `MegaAdmin`, `CommandLog`.
- `src/utils/` — `config.js` (`DEFAULT_CONFIG` + `getConfig`, normaliza configs viejas), `permissions.js` (`isAdmin`), `defaultGuild.js`, `voiceXp.js` (tick de XP por voz + reconciliación cada 60s en ready.js), `password.js` (scrypt).
- `public/index.html` — dashboard completo en un solo archivo.

## Permisos y acceso (dashboard)
- **Mega admin** = super admin (`.env OWNER_ID`): ve TODO (Inicio, Canales, Servidores, Actividad de Discord, Desarrollador, edita XP). Login por usuario+contraseña (`npm run megaadmin -- <user> <pass> [nombre]`) o Discord.
- **Dueño/admins** (`adminRoles` configurables, detectados automáticamente): configuran Roles, Bienvenida, Reglas, Anti-spam, Música, Registros; Usuarios y XP en solo lectura.
- **Miembros normales**: solo lectura, solo vista Música + reproductor funcional **solo si tienen el rol de control** (`music.controlRoleId`, ej. "sonidistas") o si está vacío (default: cualquier miembro). Sin el rol ven la música en solo lectura (sin controles) y `/play`/`/skip`/`/volume`… devuelven denegado. Flag de sesión `canMusic` (resuelto por petición en `resolveGuildAccess` y en el login por `auth.js`; `requireMusicControl` protege `POST /api/music/:action`).
- **"Mis servidores"** (`isMultiAdmin`): visible SOLO si el usuario es admin en un servidor Y dueño de otro con el bot. Endpoint `GET /api/guilds/mine`. El flag se calcula en el login (si cambia el acceso, re-login).
- Selector de servidor (mega admin) + `POST /api/guilds/select`; `botsettings.defaultGuildId` = servidor gestionado (sello GESTIONADO).

## Música y volumen
- **La BD es la fuente de verdad** del volumen (`guildconfigs.music.volume`). `/api/music/status` devuelve el de BD y resincroniza la cola con `setVolume`.
- Escala: `linearVolume(q) = (q.volume/100)^1.660964 × volumeScale` — usada en AMBAS rutas (`playNext` y `setVolume`) porque el slider aplica `setVolumeLogarithmic` (percepción). EQ/bassboost no se suman encima del volumen (`volumeScale`).
- `getQueue(guildId, volume)` resincroniza volumen si difiere del guardado; `DEFAULT_VOLUME=40`, `MAX_VOLUME=100`. Volumen 0 válido (usar `Number.isFinite`, nunca `|| 40`).
- EQ de 10 bandas persistente (`music.eq`), `replayCurrent` al cambiar filtro/EQ, tolerancia `cutShort` de 30s (el final natural de YouTube parece corte), cadena de reintentos por bot-check (cookies → sin cookies → cookies-navegador × clientes `android/tv/ios/web_embedded/tv_embedded/android_vr` = 35 intentos; formato `140/bestaudio/best`; `resolveCookieFile` materializa YT_COOKIES en temp), `YT_PROXY` (--proxy residencial para datacenters), `--js-runtimes node`, `--retries 5`.

## Sesiones
- express-session + connect-mongo, cookie `maxAge` **7 días**, sin `rolling` → expira 7 días tras el login aunque haya actividad. El doc de `sessions` usa el `cookie.expires` (fallback 14 días de connect-mongo) con TTL index.

## MongoDB (Atlas, BD `mysticguard`) — estado actual
- Colecciones en uso: `guildconfigs` (2), `members` (26), `commandlogs` (155), `botsettings` (1), `megaadmins` (1), `sessions` (2). `musicqueues` ELIMINADA (la cola vive en memoria).
- Servidores del bot: **Secta StancitoPlay** `506202449527308288` (default, vol 100) y **2.0** `1527843024862707764` (vol 40). Solo esos 2 configs existen.
- Ya NO existen los 17 campos muertos (guildName, levelRoles, xpSettings, spamFilter, musicSettings, autoMod, isActive, etc.) ni configs huerfanos. `getConfig` recrea defaults si el bot entra a un servidor nuevo.
- Campos vacíos reales = funciones opcionales sin elegir (ej. `music.commandChannelId` = comandos en cualquier canal), NO son errores.

## Hosting
- justrunmy.app (24/7, HTTPS para Activity de Discord). **PENDIENTE**: redesplegar con `deploy-justrunmy-v4.zip` (versión yt-dlp restaurada tras abandonar Lavalink). Checklist en `PENDIENTES.md` pendiente 1b.

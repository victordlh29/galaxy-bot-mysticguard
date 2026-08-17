# PROMPT DE PENDIENTES — GALAXY BOT (Mystic Guard)

Proyecto: bot de Discord con música, XP, roles automáticos, anti-spam y dashboard.
Estado: código funcional local (Mongo conectado, bot online, 16 comandos registrados, dashboard en localhost:3000) y **desplegado en justrunmy.app** (hosting gratis de contenedores: 1 vCPU / 2 GB RAM / 4 GB disco / 5 apps).
IMPORTANTE: NO tocar el archivo `.env`. NO tocar `galaxy-dashboard.html` (es solo referencia de diseño). `cookies.txt` (raíz del proyecto) es un archivo SENSIBLE de sesión de Google: NO subirlo a git ni a un host público.

## PENDIENTES

1. **HOSTING: justrunmy.app — configuración final y pruebas (12/08/2026)** — hosting elegido (se descartaron Render, GitHub Actions y demás opciones gratuitas). Plan gratis verificado: **1 vCPU / 2 GB RAM / 4 GB disco / 5 apps / 10 puertos** — sobra para este bot (~300-500 MB RAM). 24/7 real: música continua, dashboard público con HTTPS (imprescindible para la Activity de Discord).
   - [ ] **Redesplegar el código ACTUAL** en justrunmy (lo desplegado hoy es anterior a los cambios de la sesión 12/08: EQ persistente, fix XP por voz, vista Usuarios y XP, compensación de loudness, tope de volumen, fix del loop fantasma).
   - [ ] En el panel de justrunmy: exponer el puerto de Express (`PORT=3000`) y setear `PUBLIC_URL=https://TU-URL.justrunmy.app`, `DASHBOARD_URL` igual, `DISCORD_REDIRECT_URI=https://TU-URL.justrunmy.app/api/auth/callback` (el `.env` no se sube; todo va como env vars del panel).
   - [ ] Developer Portal: **Activity URL** = `https://TU-URL.justrunmy.app/activity` y **OAuth2 Redirect** = `https://TU-URL.justrunmy.app/api/auth/callback`.
   - [ ] Probar la **Activity completa**: canal de voz → 🎮 Actividades → GALAXY BOT → debe cargar el dashboard embebido (SDK local → authorize → OAuth → dashboard).
   - [ ] Probar **/play** desde la IP de datacenter de justrunmy: puede pegar el bot-check de YouTube ("Sign in to confirm..."); la cadena de reintentos ya está en `PlayerManager.js` (cookies → sin cookies → cookies-de-navegador + clientes android/tv/ios, timeout retryable 60s). Si se cuelga, usar `DEBUG_MUSIC=true` en el panel y revisar los logs.
   - [ ] Re-exportar `cookies.txt` local completo con "Get cookies.txt LOCALLY" (falta SID/HSID/APISID/SAPISID/__Secure-1PSID). **Nunca** subirlo a un host público ni a git.

2. **DEFINIDO: rango de acceso independiente tras aceptar reglas (14/08/2026)** — definido como **"acceso base obligatorio"**: aceptar reglas (✅) es la *puerta de entrada*. El rol de reglas (Hoobits) es la llave de los canales: los canales se restringen en Discord (quitar "Ver canal" a @everyone) y el bot asigna la llave al reaccionar. Los rangos de XP se suman encima, independientes. Implementado: ver changelog 14/08/2026.

3. **MEJORA FUTURA: rol "Nuevo" con mute automático (14/08/2026)** — rol que se asigna al entrar al servidor y que **quita el permiso de escribir/hablar** (configurado en Discord con "Enviar mensajes: NO" / "Hablar: NO") hasta que el miembro "madure". Ideas de implementación:
   - Nuevo campo `autorole.newcomerRoleId` + `autorole.newcomerTimeoutMin` (o evento) en GuildConfig/dashboard; el bot asigna el rol al entrar (`guildMemberAdd.js`) y lo retira al cumplirse una de estas condiciones:
     - Por **tiempo**: tras N minutos en el servidor (tick en `voiceXp.js` o un `setTimeout` persistente).
     - Por **reacción a reglas**: al dar ✅ se retira el rol Nuevo y se asigna el rol de acceso (fusionarlo con el flujo actual de `messageReactionAdd.js`).
     - Por **nivel XP**: al subir a nivel 2+.
   - Logs: evento `member-newcomer` (asignado/retirado) en el canal de logs.
   - Beneficio: los bots de spam no pueden escribir nada al entrar (ni free nitro, ni invitaciones, ni links); complementa la "verificación media" de Discord hecha a medida.
   - Config de Discord recomendada (manual): verificación media + escaneo de explícitos + anti-raid (10/10) + slowmode en canales generales + "Bloquear invitaciones" por canal (nativo).

## Cambios hechos hasta ahora

### Responsive completo: navegación móvil y adaptación total (16/08/2026)
- **Navegación móvil (`#mnav`)**: barra inferior fija dentro de `.screen` (visible solo ≤900px y con sesión) con los mismos 13 destinos del rail (icono + etiqueta, scroll horizontal). Antes, ocultar el rail dejaba sin navegación en móvil.
- **JS**: `showView` marca `active` también en el mnav; clics del mnav navegan igual que el rail; `applyAccess` espeja la visibilidad rail→mnav; `setRailVisible` muestra/oculta el mnav junto al rail.
- **Media queries** (900/700/520px):
  - ≤900: sin escena decorativa, monitor compacto, `.screen` ocupa el viewport, header compacto (título corto, sin versión), contenido con padding inferior para no tapar el mnav, grillas a 1 col.
  - ≤700: se oculta el nombre/badge del usuario (queda avatar), select de guild compacto, buscador de logs a ancho completo.
  - ≤520: padding de página mínimo, cards compactas, botones de acción a 2 columnas (`.addrow` con wrap), filas `.frow` con wrap, stats a 1 col, EQ con scroll horizontal.
- **Tabla de miembros**: envuelta en `.table-scroll` (scroll horizontal sin romper el layout).
- Verificado con puppeteer (400/500/700/940/1280px): sin overflow horizontal en ningún caso; mnav funcional (click → vista correcta); login card a 346px full-width en móvil (antes 266px).

### Responsive: grid, hueco del rail y login móvil (16/08/2026)
- **`public/index.html`**:
  - `setRailVisible` ahora respeta la media query ≤900px: solo fuerza `72px 1fr` con ventana >900px; a ≤900px deja el grid al CSS y añadí listener de `resize`.
  - Media query ≤900px: `.main{grid-column:1}` — el `grid-column:2` fijo no existía con 1 sola columna y creaba una columna implícita que rompía el ancho (medido: `166px 440px` → `606px`).
  - Media query ≤520px: card del login a ancho completo con paddings/logo/tipografía/botón reducidos (sin overflow horizontal).
- Verificado con puppeteer: 400/700/940/1280px, login y logueado — sin overflow horizontal en ningún caso.

### Toast de bienvenida al iniciar sesión (16/08/2026)
- **`public/index.html`**: al iniciar sesión salta el toast "✅ Sesión iniciada — bienvenido, <nombre>."
  - **Mega admin**: directo en `megaLogin` tras el POST exitoso.
  - **Discord**: flag `sessionStorage.freshLogin` antes del redirect OAuth; al volver, `loadSession` detecta el flag, lo limpia y muestra el toast (no se repite al recargar con sesión activa).
- Verificado con puppeteer (flujo real de mega admin): PASS.

### Toast de sesión expirada (16/08/2026)
- **`public/index.html`**: al expirar la sesión (401 estando dentro) ahora salta la **notificación toast** ("Tu sesión expiró…", estilo error, 5s) además del banner persistente del login. `toast()` acepta duración personalizada y limpia el timeout anterior para toasts solapados.

### Sin 401 en consola al abrir el login (16/08/2026)
- **`src/server/auth.js`**: `/api/auth/me` ya NO devuelve 401 sin sesión — ahora responde `200 {user:null, csrf:null}`. El navegador solo pinta errores de red en consola ante códigos 4xx/5xx, así que la petición "esperada" al abrir la página dejó de ensuciar la consola.
- **`public/index.html`**: `loadSession` maneja `user:null` → muestra el login con el aviso "No has iniciado sesión…". El 401 queda reservado para lo que SÍ es necesario: sesión expirada estando dentro del dashboard (ahí aparece el aviso "Tu sesión expiró").
- **Favicon**: link inline (data URI SVG con ✦) para eliminar el 404 de `/favicon.ico`.
- Verificado con puppeteer: cero errores en consola al cargar sin sesión. Reiniciado el bot (cambio en backend).

### Fix: card de login aplastada a la izquierda (16/08/2026)
- **Bug**: `.screen` usaba `grid-template-columns:72px 1fr` y el rail tenía `display:none` (no era grid item) → `.main` se auto-colocaba en la track 1 (72px) en vez de la track 2 (1fr) → card de login aplastada, texto y botones cortados.
- **Fix** (`public/index.html`): `.main` ahora tiene `grid-column:2` (siempre en la track 2). Nueva función `setRailVisible(show)` que alterna `display` del rail Y cambia el template del grid a `0 1fr` (rail oculto) o `72px 1fr` (rail visible) — sin gap cuando el rail se oculta.

### Aviso de sesión en el login (16/08/2026)
- **`public/index.html`**: banner en la tarjeta de login que distingue los casos: "**No has iniciado sesión** — entra con Discord o como mega admin" (estilo info, al abrir sin sesión) y "**Tu sesión expiró** — inicia sesión de nuevo" (estilo error, si un 401 pilla al usuario dentro del dashboard). Se limpia solo al iniciar sesión.

### Sin spam de 401 en consola sin sesión (16/08/2026)
- **`public/index.html`**: `loadMusicStatus` ahora retorna si no hay sesión (`state.user`) — el poll de 15s ya no pega a `/api/music/status` estando deslogueado. El único 401 esperado queda: `/api/auth/me` al abrir la página (así sabe que no hay sesión y muestra el login).

### Nav oculto hasta el login (16/08/2026)
- **`public/index.html`**: el rail lateral (`#railNav`) arranca con `display:none` y solo se muestra al entrar (Discord o mega admin) en `loadSession`/`megaLogin`; se oculta solo en un 401 de sesión. La pantalla de login queda limpia, sin barra lateral.

### Fix definitivo: 401 tras el login de mega admin (16/08/2026)
- **Causa real**: express-session **no acepta una función** en `cookie.secure` — el intento anterior (`(req) => req.secure`) quedaba como valor truthy → la cookie se trataba siempre como `secure` → nunca se enviaba por HTTP local → login OK pero 401 en todo.
- **Fix** (`src/server/app.js`): `cookie.secure: 'auto'` — el modo nativo de express-session 1.19 que calcula `isSecure` por petición (`req.connection.encrypted` / `req.secure` con trust proxy). HTTPS en justrunmy → Secure; HTTP local → normal.
- **Verificado con flujo real**: mega admin temporal (creado y borrado tras el test) → POST login devuelve `Set-Cookie: connect.sid=…; HttpOnly; SameSite=Lax` (sin Secure en HTTP) → GET `/api/auth/me` con esa cookie → **200 con el usuario**. También se confirma el round-trip del token CSRF.

### Fix: 401 en todo el dashboard tras el login de mega admin (16/08/2026)
- **Bug**: la cookie de sesión se marcaba `secure:true` si existía `PUBLIC_URL` o `DASHBOARD_URL` en el entorno — y el `.env` local tiene `DASHBOARD_URL`, así que en local (HTTP) el navegador nunca guardaba la cookie → login OK pero 401 en todas las peticiones siguientes.
- **Fix** (`src/server/app.js`): `cookie.secure` ahora es una función `(req) => req.secure` — decide por la conexión real (con `trust proxy:1`, justrunmy/HTTPS → true; local/HTTP → false). Sin dependencia de variables de entorno.
- Verificado: `node --check` OK. Requiere reiniciar el bot.

### Nuevo comando /avatar (16/08/2026)
- **`src/bot/commands.js`**: comando `/avatar` (17º) con dos opciones:
  - `/avatar` → embed con tu avatar (PNG 1024px).
  - `/avatar usuario:@fulano` → el avatar del usuario indicado.
  - `/avatar aleatorio:true` → genera un avatar aleatorio vía **DiceBear** (estilo y semilla aleatorios, PNG embebido en el embed; sin API key).
- Abierto a todos los miembros (no requiere rol de control de música). Se registra solo al reiniciar el bot (`deploy()` del arranque).
- Verificado: `node --check` + definición del comando cargada con sus opciones.

### Login: formulario del mega admin plegable + botón en inglés (16/08/2026)
- **`public/index.html`**: el separador "Acceso de desarrollador" ahora es clicable (con chevron ▸ que rota) y despliega/pliega el formulario del mega admin con transición suave de altura. Al abrirse enfoca el campo de usuario. Si el login falla, el panel se auto-expande para mostrar el error (shake incluido).
- Botón del formulario renombrado a **"Login"**.
- Verificado: JS del dashboard OK y página sirviendo 200.

### Login rediseñado visualmente (16/08/2026)
- **`public/index.html`**: tarjeta de login modernizada — fondo con gradientes radiales, borde superior con gradiente de marca, sombra profunda, logo más grande con glow, subtítulo nuevo, botón de Discord con el **logo oficial SVG** (full-width, hover con elevación), separador "Acceso de desarrollador" con líneas, sección del mega admin en sub-tarjeta oscura con inputs con foco resaltado, y error del login con animación shake.
- Sin cambios de lógica: `megaLogin` y `#megaErr` intactos (solo el `display` pasa al CSS).
- Verificado: JS del dashboard OK y página sirviendo 200.

### Seguridad: CSRF, rate-limit, helmet, cookies seguras y SESSION_SECRET obligatorio (16/08/2026)
- **CSRF**: token por sesión (`crypto.randomBytes`, guardado en `req.session.csrf` al loguearse). Middleware en `api.js` exige cabecera `x-csrf-token` en todo POST/PUT/DELETE de `/api` (403 si falta o no coincide). `/api/auth/*` queda excluido (el login no tiene sesión previa). Frontend: `api()` inyecta la cabecera desde `state.csrf`, que se recibe en `/api/auth/me` y en el login del mega admin.
- **Rate-limit** (`express-rate-limit`): login del mega admin → máx. 10 intentos / 15 min por IP; resto de `/api` → 300 peticiones / min por IP.
- **Helmet**: cabeceras de seguridad con CSP desactivada (inline scripts del dashboard), frameguard desactivado (la Activity de Discord embebe en iframe) y COEP desactivado.
- **Cookies de sesión**: `httpOnly:true` + `sameSite:'lax'` + `secure:true` cuando hay `PUBLIC_URL`/`DASHBOARD_URL` (producción; local sigue funcionando en http). `trust proxy: 1` para que justrunmy (HTTPS tras proxy) marque la cookie como segura.
- **SESSION_SECRET obligatorio**: `index.js` se niega a arrancar si falta (eliminado el fallback público `'galaxy_session_secret'` que permitía forjar sesiones). El `.env` local ya lo tiene; en justrunmy hay que setearlo en el panel.
- **Body limit**: `express.json` y `urlencoded` con límite de 1 MB (evita DoS de memoria en el POST de config).
- **Error handler**: el 500 ya no filtra `err.message` (solo internals en logs).
- Dependencias nuevas: `helmet`, `express-rate-limit`.
- Verificado en vivo: POST sin CSRF → 403, /me sin sesión → 401, login con credenciales malas → 401, cabeceras HSTS/nosniff presentes, sin X-Powered-By. `node --check` OK.

### Vista Usuarios y XP: edición de nivel + XP para el mega admin (16/08/2026)
- **`src/server/api.js`** `POST /api/members/xp`: acepta `mode: 'level'` — al fijar un nivel, el XP se ajusta exacto al mínimo de ese nivel (`xpForLevel`); sin `mode`, el XP se fija y el nivel se recalcula (comportamiento anterior). Validación de nivel 0-100000. El log `manual-xp` distingue "Nivel establecido (XP …)" de "XP establecido (nivel …)".
- **`public/index.html`** vista Usuarios y XP: dos columnas editables por fila (**Nuevo nivel** + **Nuevo XP**, solo mega admin; dueño/admins siguen en solo lectura). Al cambiar el nivel, manda `mode:'level'`; al cambiar solo el XP, recalcula nivel. Tabla ampliada a 10 columnas (colspans ajustados), texto de ayuda actualizado.
- Verificado: `node --check` backend y JS del dashboard OK.

### Mejora: bloqueo de archivos peligrosos reforzado (16/08/2026)
- **Extensiones intermedias**: ya no se mira solo la última extensión — se divide el nombre por puntos y se bloquea si CUALQUIER parte es peligrosa (`virus.exe.txt`, `setup.exe.mp3` ya caen). Nuevo helper `isDangerousFileName` en `messageCreate.js`.
- **Links a archivos en el texto**: se escanean las URLs del contenido (`https://.../virus.exe`) con las mismas extensiones (`findDangerousUrl`, ignora protocolo/query y solo mira el segmento de archivo para no confundir dominios .com).
- **Toggle propio**: nuevo campo `antispam.blockDangerousFiles` (default `true`) independiente del anti-spam maestro — funciona aunque `antispam.enabled` esté apagado, y **borra siempre** (ya no depende de `deleteMessage`). Toggle en la tarjeta Anti-spam del dashboard.
- **Extensiones configurables**: nuevo campo `antispam.dangerousExtensions` (lista extra por servidor, input en el dashboard separado por comas) sumado a la lista fija.
- **Límite de adjuntos**: nuevo campo `antispam.maxAttachments` (0 = sin límite) — si un mensaje supera el máximo, se borra y cuenta infracción.
- **Backend**: `GuildConfig.js` (3 campos nuevos en el esquema), `config.js` (DEFAULT_CONFIG + normalización de configs viejas), `messageCreate.js` (helpers + reorden del gate anti-spam; `handleViolation` acepta `forceDelete`).
- Verificado: `node --check` backend y JS del dashboard OK.
- **Config aplicada en BD (ambos servidores)**: `antispam.dangerousExtensions` = `.zip .rar .7z .iso .dll .sys .bin .py .pif .wsh .cpl .msc .docm .xlsm .pptm` (script temporal con el driver directo).

### Revertido: agrupación de logs en Registros (15/08/2026)
- **`public/index.html`**: se elimina la agrupación ×N; la lista vuelve a mostrar **cada registro individual** con su propia fecha/hora (los registros tienen horas distintas, agruparlos confundía). Se mantienen los filtros (Tipo, Tipo de log, búsqueda) y el mapa completo de etiquetas del dropdown.

### Fix: agrupación de logs dividida por logs intermedios (15/08/2026)
- **`public/index.html`**: `groupLogs` agrupaba solo logs **consecutivos**; si entre dos "Roles añadidos" había otros logs, salían grupos separados (×3, ×2, ×1). Ahora agrupa por tipo + usuario sin importar si hay logs en medio (×N total), mostrando la fecha del más reciente.

### Fix: filtros de eventos con etiqueta genérica "Evento" repetida (15/08/2026)
- **`public/index.html`**: `logStyle` no tenía entrada para `member-role-add`, `member-role-remove`, `reaction-add`, `message-delete/edit`, etc. → todos caían en el fallback "✦ Evento", por eso el dropdown "Tipo de log" mostraba varios filtros llamados igual y no se sabía cuál traía qué. Ahora el mapa cubre los 20 tipos con nombre único ("Roles añadidos", "Roles quitados", "Reacción añadida", "Mensaje borrado", "XP ajustado"...). Cada filtro del dropdown tiene etiqueta única.

### Nuevo: agrupación de eventos repetidos en Registros (15/08/2026)
- **`public/index.html`**: la lista de Registros ahora agrupa los eventos repetidos consecutivos (mismo tipo + mismo usuario) en una sola entrada con badge `×N` (ej. 50 voice-join seguidos → 1 entrada "Entró a voz ×50"). Cada tipo de evento se muestra 1 sola vez y se ven todos.

### Fix: selector "Tipo de log" duplicado y sin filtrar por tipo (15/08/2026)
- **`src/server/api.js`**: `/api/logs` ahora devuelve `commands` como lista única `{command, type}` (aggregate `$group` en vez de `distinct`), para que el selector sepa qué es evento y qué comando.
- **`public/index.html`**: el selector "Tipo de log" se filtra según el tipo elegido (Todos/Comandos/Eventos → solo lista los de esa categoría), sin duplicados, y mantiene la selección si sigue existiendo. Ahora al elegir "Eventos" se listan todos los eventos una sola vez cada uno.

### Nuevo: filtros de búsqueda en Registros del dashboard (15/08/2026)
- **`src/server/api.js`** `GET /api/logs`: acepta `type` (command/event), `command` (tipo específico) y `q` (texto en usuario o detalle, regex escapada). Devuelve además `commands` (lista distinct de tipos existentes del servidor) para poblar el selector.
- **`public/index.html`** vista Registros: barra de filtros con selector de tipo (Todos/Comandos/Eventos), selector de tipo de log (poblado con los tipos reales del servidor), campo de búsqueda libre (Enter = filtrar) y botones Filtrar/Limpiar. `resetLogFilters()` limpia todo y recarga.

### Nuevo: títulos legibles en el canal de logs (15/08/2026)
- **`src/utils/logger.js`**: `buildLogEmbed` traduce el título del embed según el tipo de evento (mapa `EVENT_LABELS`): `rules-accept` → "Reglas aceptadas", `message-delete` → "Mensaje borrado", `voice-join` → "Entrada a canal de voz", etc. (20 tipos). Los comandos `/...` se muestran tal cual. Ahora el canal de logs se ve como antes: "📌 Reglas aceptadas — geraldine_2606 · Aceptó las reglas y obtuvo el rol de acceso · fecha".

### Nuevo: logs de reacciones en cualquier mensaje (15/08/2026)
- **`src/bot/events/messageReactionAdd.js`**: ahora registra `reaction-add` (usuario, emoji, canal y link al mensaje) para **toda** reacción en cualquier mensaje; el `rules-accept` (mensaje de reglas + emoji configurado) sigue funcionando igual.

### Nuevo: logs de mensajes borrados y editados (15/08/2026)
- **`src/bot/events/messageDelete.js`** (nuevo): registra `message-delete` con autor, canal y contenido (recupera partials con `fetch`; si no hay contenido disponible lo indica).
- **`src/bot/events/messageUpdate.js`** (nuevo): registra `message-edit` con canal y contenido antes → después; ignora cambios que no sean de contenido (embeds/reacciones) y mensajes de bots.
- Se cargan solos con el registro automático de `events/index.js` (no requieren tocar `client.js`; los intents `GuildMessages` y partials ya estaban). Requiere reiniciar el bot.

### Fix: reproductor seguía usable tras quitar el rol sonidistas (15/08/2026)
- **Bug**: al quitar el rol de control de música, el dashboard seguía permitiendo usar el reproductor. Causa: `canControlMusic()` del frontend (`public/index.html`) tenía un fallback a `state.user.memberRoles`, y `memberRoles` se congelaba en el **login** (auth.js) — el servidor refrescaba `canMusic` por petición, pero el frontend volvía a "dar control" con los roles viejos de la sesión.
- **Fix**:
  - `canControlMusic()` del frontend ahora depende **solo** del flag `state.user.canMusic` (fuente de verdad del servidor, refrescada por petición en `resolveGuildAccess`); eliminado el fallback a `memberRoles` congelado.
  - `resolveGuildAccess` (`src/server/api.js`) ahora refresca también `u.memberRoles` en cada petición (antes solo `canMusic`).
  - `/api/music/status` devuelve `memberRoles` actualizado y el frontend lo sincroniza junto a `canMusic` (re-render si cambia cualquiera de los dos).
- Resultado esperado: quitar el rol sonidistas → aviso rojo + controles deshabilitados en ≤5 s (sincronización de `loadMusicStatus`); el servidor ya denegaba por `requireMusicControl`, ahora la UI coincide.

### Fix: crash invisible con `npm run dev` — los errores se pierden al reiniciar (15/08/2026)
- **Bug**: con `node --watch` (npm run dev), cuando el proceso muere el watcher reinicia y **borra la consola** → el error se perdía y parecía "restarting directo" sin motivo.
- **Fix** (`index.js`): los handlers de `unhandledRejection`/`uncaughtException` ahora escriben el stack **de forma síncrona** en `crash.log` (raíz del proyecto) además de `console.error` — el error ya no se puede perder aunque la consola se limpie. `uncaughtException` ahora termina el proceso con `process.exit(1)` (estado indefinido tras un crash) y `exit` con código != 0 también se anota en `crash.log` (los crashes nativos/OOM quedan registrados).
- **Para ver el último crash**: `Get-Content crash.log -Tail 30`.

### Fix: miembros con rol sonidistas no podían usar el reproductor (15/08/2026)
- **Bug**: `disableEdits` (public/index.html) deshabilitaba los controles `ro-keep` con `el.disabled = disabled || !musicControl` — como para un miembro normal `disabled = !editable()` es siempre `true`, el `||` dejaba TODO deshabilitado (volumen, EQ, reproductor, botones) aunque tuviera el rol de control.
- **Fix**: los controles `ro-keep` ahora se deshabilitan SOLO con `!musicControl` (public/index.html:927). Además `renderEq` aplica `inp.disabled = !canControlMusic()` a los sliders del EQ regenerados (antes se recreaban sin estado disabled).
- Resultado esperado: miembro con rol sonidistas = reproductor completo (volumen, EQ, filtros, botones); sin rol = todo deshabilitado (solo lectura); admins/mega siempre controlan.

### Anti-scam: archivos peligrosos, invitaciones y estafas (14/08/2026)
- **Archivos peligrosos**: se borran siempre + aviso, y cuentan como infracción (3 → mute 10 min). Extensiones bloqueadas: .exe .scr .bat .cmd .vbs .ps1 .lnk .jar .msi .com .hta .reg .sh .apk .js (constante en messageCreate.js).
- **Invitaciones bloqueadas**: `discord.gg/...` y `discord.com/invite/...` → borrar + aviso, 3 infracciones → mute 10 min. Toggle "Bloquear invitaciones" en dashboard + multi-select "Canales donde SÍ se permiten invitaciones" (`antispam.blockInvites`, `antispam.inviteAllowedChannels`).
- **Palabras de estafa añadidas** (acción Eliminar, 10 más → 26 totales): free nitro, nitro gratis, nitro giveaway, steam card, giveaway, código/codigo gratis, free robux, robux gratis, free v-bucks.
- `messageCreate.js` refactorizado: `handleViolation()` común (borra, cuenta infracciones con decaimiento, avisa/mutea y registra en logs). Una acción por mensaje (primera violación gana).
- **Límite real**: las imágenes no se pueden analizar por contenido (el bot no "ve"); el QR de un falso nitro solo se caza si el texto del mensaje incluye palabras/links de estafa.

### Palabras prohibidas configuradas (14/08/2026)
- 16 palabras con acción **Advertir** en Secta y 2.0: puta, mierda, pendejo, cabrón/cabron, hijo de puta, imbécil/imbecil, idiota, tarado, estúpido/estupido, perra, gilipollas, subnormal, mamón. Sin borrar mensajes (solo aviso autoborrable a los 6 s). Incluye variantes sin tilde para cabrón/imbécil/estúpido.

### Anti-spam mejorado: anti-flood, canales ignorados y reset de infracciones (14/08/2026)
- **Anti-flood nuevo**: detecta mensajes rápidos (6 mensajes en 6 s por defecto) → aviso o mute. Configurable en dashboard (tarjeta "Anti-flood"): mensajes máximos, ventana en segundos, acción (Advertir/Silenciar), minutos de silencio y mensaje de aviso. Evento `antispam-flood` en logs. Estado en memoria (Map), sin persistencia.
- **Canales ignorados**: `antispam.ignoreChannels` (multi-select en dashboard) — anti-spam NO aplica en esos canales.
- **Reset de infracciones**: `antispam.resetMinutes` (30 min por defecto) — si no hay violación en ese lapso, las infracciones vuelven a 1 (antes acumulaban para siempre → mute permanente). Nuevo campo `Member.lastInfractionAt`.
- Aplicado a los 2 configs en BD (Secta y 2.0): `resetMinutes:30`, `ignoreChannels:[]`, `flood` por defecto. Normalización en `getConfig` (config.js) para configs viejos.

### Logs del canal como tarjetas embed MysticGuard (14/08/2026)
- **`src/utils/logger.js`**: `logCommand` y `logToChannel` ahora envían **embeds** al canal de logs con el mismo branding que la tarjeta de reglas (`buildRulesEmbed`): color `#5B21B6`, autor "MysticGuard · <servidor>" con avatar, título `🛠️ <comando>` (o `📌 <evento>` / `🔔 Registro`), descripción con el detalle, campo "Usuario" en línea y pie "MysticGuard · Registro de Comandos/Eventos • fecha y hora".
- Exportada `buildLogEmbed` para reuso.

### Canal de logs recibe TODO (comandos + eventos nuevos) (14/08/2026)
- **Reenvío central**: `logCommand` (`src/utils/logger.js`) ahora, además de guardar en `commandlogs` (Registros del dashboard), **envía al canal de logs** (`logs.channelId` si está habilitado) con formato `🛠️ **/comando** — usuario · detalle` (comandos) y `📌 **evento** · detalle` (eventos). Todos los puntos que ya usaban `logCommand` se reenvían automáticamente: comandos slash, voice join/leave/switch, rules-accept, member join/leave, anti-spam, manual-xp.
- **Nuevos eventos** (archivos en `src/bot/events/`, auto-registrados):
  - `guildMemberUpdate.js`: cambio de **apodo** (`member-nickname`), **roles añadidos/quitados** (`member-role-add`/`member-role-remove`) y **boost** iniciado/quitado (`server-boost`/`server-unboost`).
  - `guildRoleCreate.js` / `guildRoleUpdate.js` (nombre, color, posición, permisos, hoist, mencionable) / `guildRoleDelete.js`.
  - `guildUpdate.js`: servidor renombrado, icono, banner y nivel de boost (`server-update`).
- **Duplicados eliminados**: `logToChannel` manuales que repetían lo que ya reenvía `logCommand` (rules-accept, setup, anti-spam, join). Queda `logToChannel` solo para anuncios que NO están en Registros (subida de rango XP, aviso de rol de acceso en ready).
- **Fix bug preexistente**: la bienvenida se enviaba **dos veces** (`guildMemberAdd.js` tenía el bloque duplicado) — ahora se envía una sola vez y el log `member-join` incluye si recibió rol.
- Ambos servidores tienen `logs.enabled=true` con canal configurado (Secta: 1536593588853543032, 2.0: 1527843025399709758).

### Control de música restringido al rol sonidistas (14/08/2026)
- **Nuevo campo `music.controlRoleId`** (GuildConfig + `DEFAULT_CONFIG` + normalización en `getConfig`): rol con permiso para controlar la música. Vacío = cualquier miembro puede (comportamiento anterior).
- **`src/utils/permissions.js`**: nueva util `canControlMusic(member, config)` = `isAdmin` **o** tiene el rol `music.controlRoleId`.
- **API**: sesión con flag `canMusic` (calculado en `resolveGuildAccess` por petición y guardado en el login por `auth.js`; de paso `memberRoles` ahora guarda IDs reales en vez del RoleManager). Nuevo middleware `requireMusicControl` → `POST /api/music/:action` (play/pause/resume/skip/stop/volume/filter/eq/loop/autoplay) exige control. `/api/music/status` sigue en `requireMember` (ver estado = libre).
- **Comandos slash**: `/play /skip /stop /pause /resume /volume /loop /autoplay /filter /queue /nowplaying` denegados si el usuario no controla música; `/level /leaderboard /activity` siguen abiertos.
- **Dashboard/Activity**: nuevo selector **"Rol con control de música (sonidistas)"** en tarjeta propia de la vista Música. Los miembros normales **no ven** la config de admin (clase `admonly`: tarjeta del rol, "Canal de comandos" y "Guardar música" ocultos) — solo reproductor, volumen, filtros/EQ y estado. `disableEdits` desactiva también los controles `ro-keep` del reproductor si el miembro no controla música; banner "🔒 El control de la música está limitado al rol sonidistas…" para esos miembros. Admins y mega admin siempre controlan.
- Verificado: `node --check` backend y JS del dashboard OK.

### Acceso base obligatorio — puerta de entrada tras aceptar reglas (14/08/2026) — pendiente 2 resuelto
- **Definición**: aceptar reglas (✅) = **puerta de entrada**. El rol de reglas (Hoobits) es la *llave* de los canales del servidor; los canales se restringen en Discord (quitar "Ver canal" a @everyone) y el bot asigna la llave al reaccionar (ya lo hacía). Los rangos de XP se suman encima, **independientes** del rol de acceso.
- **Nuevo endpoint `GET /api/guild/rules-access`** (`requireAdmin`): analiza el servidor y reporta si el acceso está reforzado — rol de acceso configurado y existente (aviso si es @everyone o no existe), nº de canales de texto **protegidos** (ViewChannel denegado a @everyone) vs **abiertos** (lista), y cuántos protegidos dan acceso explícito ("Ver canal = ✔") al rol de reglas. `warnings` con pasos concretos si falta algo.
- **Nuevo endpoint `POST /api/guild/rules-access/create-role`** (`requireOwner`): crea el rol exclusivo **Hoobits** si no existe (o si el configurado es @everyone) y lo guarda en `rules.roleId`. Permisos de Discord requeridos: gestionar roles.
- **Dashboard (vista Reglas)**: nueva tarjeta **"Acceso base obligatorio (puerta de entrada)"** con botones **Verificar acceso** (reporte en vivo: canales protegidos/abiertos + avisos) y **Crear rol de acceso (Hoobits)**. Estado con sts reforzado/revisar. Estilos nuevos `.notice.g`, `.notice.r`, `.sts.gn`, `.sts.rd`.
- **Aviso automático**: `ready.js` avisa al canal de logs al arrancar si las reglas están activas pero no hay rol de acceso configurado/existente ("⚠️ Reglas activas pero sin rol de acceso…").
- **`/setup`**: el mensaje de éxito ahora explica la puerta de entrada y remite al botón "Crear rol de acceso" del dashboard.
- Verificado: `node --check` backend (api.js, ready.js, commands.js) y JS del dashboard OK.

### Limpieza de guildconfigs + datos de prueba (13/08/2026)
- **Por qué había campos en blanco**: cada documento de `guildconfigs` tenía **17 campos muertos** de una versión vieja del bot (`guildName`, `ownerId`, `superAdminIds`, `adminRoleIds`, `welcomeChannelId`, `rulesChannelId`, `rulesMessageId`, `musicChannelId`, `logChannelId`, `autoRoleId`, `hoobitsRoleId`, `levelRoles`, `xpSettings`, `spamFilter`, `musicSettings`, `autoMod`, `isActive`) — el código actual **nunca los lee ni escribe** (verificado con grep). Se eliminaron de los 4 documentos con el driver de Mongo directo (Mongoose con `strict:true` ignora `$unset` de campos fuera del esquema — por eso el primer intento con el modelo no funcionó).
- **Campos vacíos reales** (en Secta StancitoPlay) = funciones opcionales sin canal/rol elegido, NO son errores: `music.commandChannelId` (sin canal de música dedicado → los comandos funcionan en cualquier canal), `xp.gainRole` (sin rol de ganancia), `autorole.roleId` (sin rol de bienvenida), `xp.roles` (sin recompensas por nivel), `music.eq` (todo 0 = sin ecualización).
- **Datos de prueba**: los configs de `836452606443651073` y `803806595783065610` (servidores donde el bot YA NO está, quedaron de las pruebas del 08/08) se llenaron con datos de ejemplo (volumen 55/70, EQ con bandas, roles de XP por nivel, palabras de anti-spam, welcome/goodbye/rules/logs con IDs ficticios). Solo de inspección.
- **Limpieza final**: ambos configs huerfanos **ELIMINADOS** (si el bot vuelve a esos servidores, `getConfig` recrea los defaults solos). Quedan solo los configs de los 2 servidores reales: **Secta StancitoPlay** (506202449527308288, vol 100) y **2.0** (1527843024862707764, vol 40). `members` y `commandlogs` solo tienen datos de esos 2 servidores; `botsettings.defaultGuildId` = Secta (correcto).

### Fix volumen que "subía" al cambiar de canción + auditoría de Mongo (13/08/2026)
- **Bug encontrado (el volumen cambiaba entre canciones)**: el slider del dashboard aplicaba `setVolumeLogarithmic` (escala de percepción: 25% → ganancia 0.099) pero cada canción nueva se creaba con volumen **lineal** (`q.volume/100` → 0.25). Resultado: la canción sonaba más fuerte al empezar y bajaba al tocar la barra. **Fix**: `PlayerManager` ahora tiene `linearVolume(q)` = `(q.volume/100)^1.660964 × volumeScale` y se usa en las DOS rutas (`playNext` y `setVolume` vía `setVolume` del transformer) — misma escala siempre, con la compensación de EQ incluida.
- **BD como fuente de verdad**: `getQueue(guildId, volume)` ahora **resincroniza el volumen de la cola** si difiere del guardado (cada play/status corrige la cola; con una sola instancia ya no puede divergir). Default de cola nueva: 40 (antes 100 si se creaba por filtro/EQ antes del play).
- **Volumen 0 ya se puede guardar**: eliminados los `|| 40` que quedaban en `commands.js` (play) y el manejo de NaN/0 en `api.js` y frontend (sliders y `saveSection('music')` validan `Number.isFinite`; guardar 0% = silencio real).
- **Tabla de usuarios**: nueva columna **#** con la enumeración de cada usuario (fila 1, 2, 3…; sigue el orden de la búsqueda). Colspan ajustado.
- **Auditoría MongoDB (Atlas, BD `mysticguard`)**: 7 colecciones encontradas → `members` (26), `botsettings` (1), `guildconfigs` (4), `commandlogs` (155), `megaadmins` (1), `sessions` (2, usada por connect-mongo) → **todas en uso**. `musicqueues` (0 docs, sin modelo, nada la escribe — la cola vive en memoria en PlayerManager) → **ELIMINADA**.
- Verificación: `node --check` de backend y JS del dashboard OK.

### Fix volumen fantasma "25 → 44" (13/08/2026) — la BD manda, no la cola
- **Dónde se guarda el volumen**: MongoDB Atlas (colección `guildconfigs`, campo `music.volume`, uno por `guildId`). Lo escriben el slider del dashboard (`POST /api/music/volume`), el botón "Guardar música" (`PUT /api/guild/config`) y el comando `/volume`.
- **Diagnóstico del bug**: el usuario puso `/volume 25` (04:06 UTC) pero la config quedó en **44** (04:08 UTC) sin ningún `/volume 44` en los registros → lo escribió el dashboard porque mostraba 44. Causa: `/api/music/status` devolvía `player.getVolume(guildId)` (volumen de la **cola en memoria**), no el guardado en BD; con dos instancias del bot activas (justrunmy con código viejo + local) cada una tiene su cola con su volumen y una contamina a la otra.
- **Fixes**:
  - `api.js /music/status`: ahora devuelve `config.music.volume` (BD) y **resincroniza la cola** con `player.setVolume` si difiere del guardado.
  - Eliminados los `|| 40` que impedían guardar 0% y podían inyectar el valor por defecto: `config.music.volume` ahora se lee con `typeof number` guard (`api.js`, `commands.js`), `PlayerManager.getQueue` rechaza NaN, y el slider/save del dashboard valida `Number.isFinite`.
  - `saveSection('music')` ya no usa `state.config` (stale): trae la config **fresca** del servidor antes de guardar (también evita revertir el EQ con valores viejos). Tras guardar volumen desde el slider, `loadGuild()` refresca `state.config`.
  - `getConfig` (`src/utils/config.js`) normaliza configs viejas sin `music` (volumen/EQ faltantes) en vez de crashear.
- **BD corregida**: `music.volume` de `506202449527308288` restaurado de 44 → **25**.
- **IMPORTANTE**: no correr dos instancias del bot a la vez (justrunmy + local) — comparten token y BD pero cada una tiene su cola en memoria; es la causa raíz más probable del 44.

### Nuevo apartado "Mis servidores" (13/08/2026) — acceso multi-servidor para admin+dueño
- **Visibilidad condicional**: el apartado **Mis servidores** (rail + vista `myservers`) se muestra **si y solo si** el usuario de Discord es **admin (no dueño) en un servidor** Y **dueño de otro servidor** donde esté el bot. Si no cumple ambas condiciones, el icono no aparece y `showView('myservers')` queda bloqueado en el frontend y por API (`/api/guilds/mine` devuelve 403).
- **Sesión**: `auth.js` calcula el flag `isMultiAdmin` en el callback de OAuth (recorre todos los servidores del bot y clasifica: `ownedGuilds` vs `adminGuilds`); se guarda en la sesión igual que los demás flags.
- **Backend**: nuevo endpoint `GET /api/guilds/mine` (requireAuth + flag): lista solo los servidores donde el usuario es dueño o admin (con `role: 'owner'|'admin'`, sello GESTIONADO si es el default, estado de música/config). El cambio de servidor reutiliza `POST /api/guilds/select` (que ya valida acceso admin).
- **Frontend**: `loadMyServers()`/`renderMyServers()` con tarjetas clicables (mismo estilo que la vista Servidores del mega admin), botón "Gestionar", refresco automático cada 5 s con la vista abierta, y `renderUser()` tras cambiar de servidor para refrescar el badge (DUEÑO/ADMIN) y permisos de edición según el servidor gestionado.
- **Importante**: el flag se calcula al iniciar sesión (como los demás flags); si el usuario gana/pierde acceso a un servidor a mitad de sesión, debe volver a entrar.

### Decisión de hosting (12/08/2026) — Render y GitHub Actions descartados
- **Render**: ya no es gratis y su IP de datacenter pegaba el bot-check de YouTube. Sus fixes quedaron en el código local (`PlayerManager.js`): timeout retryable de 60s (`MUSIC_PIPELINE_TIMEOUT_MS`), cadena de reintentos cookies → sin cookies → cookies-de-navegador con clientes android/tv/ios como fallback, stderr real en el error de timeout, `--js-runtimes node` para firma/desafío "n".
- **GitHub Actions**: analizado y descartado (corte ~1 min cada 5 min, dashboard/Activity inaccesibles sin URL pública, música inútil, zona gris del ToS). El proyecto sigue **sin** `.github/workflows/` ni `.gitignore` — no subir el repo tal cual a un hosting público (se filtrarían `.env` y `cookies.txt`).
- **Elegido: justrunmy.app** (ver pendiente 1). Otras opciones gratuitas (bot-hosting.net, wispbyte, quaxly) quedan como alternativas de respaldo si justrunmy falla.
- **Reproducción de música** (10/08/2026, resuelto): historial de bugs 1-6 del antiguo pendiente 8 (pipeline yt-dlp→ffmpeg→PCM, voice gateway v8 con @discordjs/voice 0.19.2, reinientos por bot-check, firma "n", descarga resiliente con reintento automático) — resumido en el bloque Música de abajo; detalles en `src/music/PlayerManager.js`.
- **OWNER_ID**: ya configurado en `.env` (super admin funcional).

### Sesión 12/08/2026 — música, EQ, XP por voz, vista Usuarios y hosting
- **Volumen**: tope restaurado a 100 (`MAX_VOLUME`, api.js, esquema Mongo). **Bug "se pone solo en 40" arreglado**: el play del dashboard creaba la cola con el volumen por defecto ANTES de leer el configurado (api.js:406 ahora crea la cola con `config.music.volume` primero). **Compensación de loudness**: el boost de las bandas del EQ y de bassboost ya no se suma encima del volumen configurado (`volumeScale`, PlayerManager.js) — la salida queda clavada a lo que fija el usuario.
- **EQ persistente**: se guarda en MongoDB (`music.eq`, esqema GuildConfig) al mover cada banda (api.js), se carga al crear la cola (dashboard play, `/play`, status) y el dashboard muestra el **valor en dB de cada banda en vivo** y se sincroniza desde el servidor (index.html `renderEq`).
- **Fix "la canción se repite sin bucle"**: es el sistema de reintento anti-corte (`cutShort`) con tolerancia de solo 10s: la duración de YouTube viene redondeada y el final natural parecía un corte → se re-encolaba la misma canción. Tolerancia ampliada a **30s** (PlayerManager.js) — las interrupciones reales cortan mucho antes.
- **XP por voz arreglado ("a mí no me da, a los demás sí")**: la causa es que el tick de XP solo arrancaba con el evento de ENTRAR al canal; si el bot se reiniciaba mientras el usuario ya estaba en voz (justrunmy redeployes, crash), no había evento → cero XP hasta salir y volver a entrar. **Fix**: nueva utilidad `src/utils/voiceXp.js` (`startVoiceTick`/`stopVoiceTick`/`isTickActive`) + barrido de reconciliación en `ready.js` que cada 60s arranca el tick para cualquiera en un canal de voz sin tick activo.
- **Caracteres corruptos corregidos**: `src/server/api.js` (dueño, inválido, búsqueda, está, Únete, Acción + emoji ✅) — el archivo tenía mojibake latin-1.
- **Nueva vista "Usuarios y XP"** en el dashboard: lista todos los usuarios registrados/interactuados (usuario, ID, nivel, XP, min en voz, infracciones) con búsqueda por nombre/ID. Endpoints nuevos: `GET /api/members` y `POST /api/members/xp` (ambos `requireAdmin`). **Permisos**: solo el **mega admin** ve el campo "Nuevo XP" y el botón Guardar (flag `canEdit` del servidor + columnas ocultas en el frontend); el **dueño y los admins configurados** ven la lista en **solo lectura** (el POST está protegido igualmente). El cambio de XP recalcula nivel, actualiza roles automáticos de XP y queda auditado en Registros (comando `manual-xp`).
- **Logs de crash**: `index.js` ahora registra `unhandledRejection`/`uncaughtException` con stack completo (antes moría en silencio — síntoma: 404 en rutas nuevas hasta reiniciar el proceso viejo).
- **Local**: reiniciar el bot tras cada cambio (Node no recarga). OJO: NO arrancar dos instancias a la vez (carrera al crear GuildConfig → crash `guildId required`). Logs del arranque local en `bot.log` (creado por el comando de lanzamiento con redirección; es un archivo local temporal).
- **PENDIENTE**: redesplegar todo esto en justrunmy (el desplegado hoy es anterior a estos cambios).

### Modo solo lectura para miembros normales (sin rol admin)
- **Miembros normales** (sin rol admin configurado): entran con Discord en **modo solo lectura**. Ven el banner *"Estás en modo solo lectura: solo el dueño del servidor o el mega admin pueden guardar cambios"*, solo ven la **vista de Música** (rail con un solo icono) y pueden **usar el reproductor** (play, pausa, saltar, volumen, filtros, EQ) pero no guardar config.
- **Admins** (dueño del servidor, rol admin configurado, mega admin): sin restricción de solo lectura — pueden guardar cambios (`requireOwner` ahora incluye `isAdmin`).
- `src/server/auth.js`: el callback de OAuth ahora deja entrar a un usuario aunque no tenga rol admin — busca primero un servidor donde tenga acceso admin y, si no, el primer servidor donde sea miembro (solo lectura). Si no es miembro de ningún servidor → `/denied`.
- `src/server/api.js`: nuevo middleware `requireMember` (cualquier miembro del servidor). `/api/guild`, `/api/guild/channels`, `/api/music/status` y `/api/music/:action` pasan a `requireMember`; el resto (roles, logs, config) sigue restringido a admin/mega.
- Frontend: `isPlainMember()`, `MEMBER_VIEWS = ['music']`, `applyAccess()` oculta todos los rails salvo Música, `showView()` bloquea vistas restringidas, y `disableEdits()` deja activos los controles con clase `ro-keep` (todo el reproductor de música). Badge **MIEMBRO** para usuarios sin rol admin.


### GUILD_ID eliminado: servidor por defecto auto-detectado y guardado en DB
- Se eliminó la dependencia de `GUILD_ID` del `.env` (comentado en `.env`, eliminado de `render.yaml`).
- Nuevo modelo `BotSettings` (`defaultGuildId`) en MongoDB y util `src/utils/defaultGuild.js`.
- Al arrancar el bot, si no hay servidor por defecto guardado, se auto-detecta el primero donde está el bot y se guarda en la DB. Si el guardado ya no existe (bot expulsado), se re-detecta.
- El sello GESTIONADO y la estrella ★ del selector ahora marcan el **servidor por defecto de la DB**, no el de la sesión.
- Las tarjetas de la vista Servidores ahora son **clicables**: entran a ese servidor. Botón **"Hacer default"** en cada servidor para cambiar cuál es el gestionado (se guarda en la DB).
- Nuevo endpoint `POST /api/guilds/default` (mega admin) para fijar el servidor por defecto.
- `auth.js`: el login de Discord y el super admin resuelven el servidor inicial desde la DB, no del `.env`.

### Login de Discord multi-servidor para roles (dueño/admin de cualquier servidor)
- El callback de OAuth (`src/server/auth.js`) ya no valida solo contra el `GUILD_ID` del `.env`: busca **en todos los servidores donde está el bot** y deja entrar al usuario al **primero donde tenga acceso admin** (dueño, permiso Administrator o rol admin configurado). Prefiere el servidor por defecto si tiene acceso ahí.
- Resultado: un admin/dueño del segundo servidor puede iniciar sesión y gestionar **solo su propio servidor** (su sesión queda fijada ahí, sin selector). El **mega admin** sigue gestionando todos con el selector de la barra superior.


### Multi-servidor: selector de servidor en el dashboard (mega admin)
- **Cambio de servidor gestionado**: el mega admin ahora puede configurar CUALQUIER servidor donde esté el bot desde el dashboard. Selector de servidor en la barra superior (solo visible para mega admin y si hay 2+ servidores). El actual se marca con ★.
- **Sesión por servidor**: cada sesión guarda `guildId`; todos los endpoints (`/api/guild*`, `/api/logs`, `/api/stats*`, `/api/music/*`) usan `req.session.user.guildId` (fallback al servidor por defecto guardado en la DB). Al cambiar, todo el dashboard recarga (config, canales, roles, registros, música, stats).
- **Middleware `resolveGuildAccess`** (`src/server/api.js`): refresca en cada petición `isOwner`/`isAdmin`/`guildName` según el servidor seleccionado (cache de miembros primero, REST si falta). El mega admin siempre `isAdmin=true`.
- **`POST /api/guilds/select`**: valida acceso — mega admin/super admin entran a cualquier servidor; un usuario de Discord solo a servidores donde tenga acceso admin (`isAdmin`).
- **`GET /api/guilds`** ahora devuelve `currentId` (servidor seleccionado). El sello GESTIONADO de la vista Servidores marca el servidor en uso.
- El dueño de Discord sigue gestionando solo su servidor (el servidor por defecto de la DB).


### Vista "Servidores del bot" (solo mega admin)
- Nuevo apartado **Servidores** en el dashboard (solo mega admin): lista TODOS los servidores donde está el bot (el bot está actualmente en 2), con icono, nombre, miembros, en línea, dueño, canal de voz donde está el bot, estado de música, y estado de configuración (bienvenida ON / reglas ON / nº de roles admin).
- El servidor por defecto (guardado en la DB, ya no del `.env`) se marca con sello **GESTIONADO**; los demás como **BOT INVITADO**. Ordenados: gestionado primero, luego alfabético.
- Endpoint nuevo `GET /api/guilds` (requiere `requireMega`). Se refresca solo cada 5 s con la vista abierta.
- El panel Desarrollador · Mega Admin ahora muestra "Servidores del bot: N" con botón para ir a la vista.


### Mejora de "Registros recientes" en el panel Desarrollador · Mega Admin
- Ahora carga los **últimos 50 registros** (antes 10) en una lista con scroll propio (máx. 340 px) y indicador pulsante **● EN VIVO**.
- **Filtros por tipo**: Todos / Comandos / Eventos (botones con estado activo).
- **Buscador** en vivo por usuario, comando o detalle (el filtro y la búsqueda se conservan al refrescarse solo cada 5 s).
- **Fila enriquecida**: ícono + etiqueta con etiqueta mono del comando (o `EVENTO`), usuario + detalle, y hora relativa a la derecha con fecha/hora exacta en tooltip.
- **Resumen**: "N/total registros · X comandos · Y eventos · último hace …". Escapado HTML de campos de usuario (`esc`) para filas seguras.


### Mega Admin: login con usuario y contraseña (registrado en BD)
- **Nuevo modelo `MegaAdmin`** (`src/models/MegaAdmin.js`): username único + password hasheada con `crypto.scrypt` (salt aleatorio, `timingSafeEqual`). La contraseña nunca se guarda en claro (`src/utils/password.js`).
- **Registro manual**: `npm run megaadmin -- <usuario> <contraseña> [nombre]` (`src/scripts/create-mega-admin.js`) crea o actualiza el usuario directamente en la BD. Varios mega admins posibles.
- **Login**: `POST /api/auth/mega-admin/login` (usuario + contraseña) crea la sesión con `isMegaAdmin: true` → `requireAdmin`, `requireOwner` y `requireMega` lo aceptan. El login de Discord sigue igual para dueño/admins.
- **El mega admin ve TODO**: Inicio (stats, top, gráfica), Canales, Registros, Actividad de Discord y Desarrollador. Badge **MEGA ADMIN**.
- **El dueño del servidor y los admins por rol ven SOLO configuración**: Roles, Bienvenida, Reglas, Anti-spam, Música y Registros. No ven Inicio, Canales, Actividad ni Desarrollador (items ocultos + bloqueo en `showView` + `applyAccess`).
- **Refuerzo en backend**: `/api/stats` y `/api/stats/activity` requieren `requireMega` (el dueño no puede consultarlos ni por API). `/api/guild` devuelve `top` vacío para no-mega. `/api/guild/channels` queda accesible (el dueño lo necesita para configurar canales).
- Dashboard: formulario "Entrar como Mega Admin" en el login (`megaLogin`), `editable()` incluye al mega admin.


### Vista de canales + Panel del desarrollador (Mega Admin)
- **Nueva vista "Canales"** en el dashboard (todas las vistas): lista todos los canales de texto/voz del servidor agrupados por categoría, con conteo de miembros por canal de voz y el canal donde el bot está conectado marcado con sello **BOT**. Se refresca solo cada 5 s mientras está abierta. Backend: `/api/guild/channels` ahora devuelve `voiceMembers` por canal y `botVoiceChannelId` (canal del `connection` de música).
- **Nuevo panel "Desarrollador · Mega Admin"**: vista completa en una sola pantalla con estadísticas (miembros, en línea, mensajes, hoy, uptime), estado del bot (música actual, canal de voz del bot, personas en voz, total de canales), registros recientes (10) y la info de la actividad de Discord (URL + pasos).
- **Permisos**: el **mega admin = el desarrollador** (super admin del `.env OWNER_ID`). Solo él ve el apartado **"Actividad de Discord"** y el **panel del desarrollador** (los items del rail se ocultan y `showView` bloquea el acceso directo). El **dueño del servidor NO ve** esos dos apartados; ve todo lo demás. Badge del super admin en el dashboard: **MEGA ADMIN**.
- El título de las vistas ahora es legible (Inicio, Roles y XP, Canales, Actividad de Discord, Desarrollador · Mega Admin, etc.) vía `VIEW_TITLES`.


### Roles administradores configurables por servidor (multi-servidor)
- Nuevo campo `adminRoles` en `GuildConfig` (`src/models/GuildConfig.js` + `DEFAULT_CONFIG` en `src/utils/config.js`): lista de **IDs de roles** que cuentan como administrador. Pueden ser varios y con cualquier nombre, porque cada servidor usa los suyos.
- Nueva utilidad `src/utils/permissions.js`: `isAdmin(member, config)` = super admin (`.env OWNER_ID`) **o** dueño del servidor (`guild.ownerId`) **o** permiso `Administrator` de Discord **o** cualquiera de los roles de `adminRoles`. También `detectAdminRoles(guild)` (roles con permiso Administrador + nombres con keywords admin/staff/owner/fundador/ceo…) y `ensureAdminRoles(guild)`.
- **Auto-detección**: al entrar a un servidor (`guildCreate.js`) y al arrancar (`ready.js`) se detectan y guardan los roles admin si la lista está vacía. El dueño del servidor se detecta siempre solo.
- Comando `/admin` (solo dueño del servidor/super admin/Administrator): subcomandos `add` (rol → admin), `remove`, `list` (muestra dueño + roles admin) y `detect` (re-detecta automáticamente).
- `/setup` ahora usa `isAdmin` (`src/bot/commands.js`): vale el dueño, permisos Administrator o cualquier rol admin configurado.
- Anti-spam exento también para roles admin configurados (`src/bot/events/messageCreate.js`).
- Dashboard: auth del panel usa `isAdmin` (`src/server/auth.js`) y la vista Roles tiene la tarjeta "Roles administradores" (añadir/quitar roles, guardar).
- Nota: en el arranque `deploy()` registra `/admin` y borra comandos viejos en cada servidor automáticamente.

### Música (PlayerManager + comandos + dashboard)
- **Volumen corregido**: el slider del dashboard ahora aplica el volumen real (antes quedaba en 50). `setVolumeLogarithmic` (`src/music/PlayerManager.js`).
- **Filtros de audio**: `/filter` y dashboard con: bassboost, bassboost-lite, 8d, nightcore, vaporwave, karaoke (ffmpeg, PCM s16le 48 kHz, `StreamType.Raw`).
- **EQ de 10 bandas** (32 Hz–16 kHz, −10 a +10 dB) desde el dashboard (`/api/music/eq`), filtro `equalizer` de ffmpeg.
- **Re-split al cambiar filtro/EQ**: `replayCurrent` re-encola la canción actual (`src/music/PlayerManager.js`).
- **Pipeline definitivo**: spawn directo de `yt-dlp.exe` (sin shell) → `ffmpeg-static` → PCM s16le 48 kHz, `StreamType.Raw` + `inlineVolume: true`; filtros como `-af`; `killProcs` en stop/cambio/Idle; `--js-runtimes node` para firma/desafío "n"; estrategias de reintento con `cookies.txt` (raíz) / `YT_COOKIES` / cookies-from-browser; caché de sesión para navegadores DPAPI; `warnings` del dashboard.
- **Búsqueda con play-dl** (`resolveQuery`, playlists, `getRelated` para autoplay); descarga con el binario yt-dlp.
- **Autoplay y loop** en cola por servidor.
- Endpoints del dashboard: `/api/music/{volume|filter|eq|play|pause|resume|skip|stop|loop|autoplay}` y `/api/music/status` (ahora con `warnings`) (`src/server/api.js`).
- **Dependencia actualizada**: `@discordjs/voice` 0.18.0 → **0.19.2** (voice gateway v8 + DAVE). `ffmpeg-static` instalado.
- **Resiliencia de descarga + reintento automático**: yt-dlp con `--retries 5`, `--retry-sleep 3`, `--fragment-retries 5`, `--socket-timeout 20`, `--http-chunk-size 64K`; si la descarga se corta a mitad (archivo truncado → player en Idle antes del final), la canción se reintenta sola una vez con aviso `🔄 Descarga interrumpida...` (guardas para `/skip`, `replayCurrent`, `/stop`).
- **Fix "Ahora reproduciendo" del dashboard**: al haber miniatura mostraba `[object Object]` (se interpolaba el objeto `nowPlaying` completo en vez de `now.title`, `public/index.html`). Ahora muestra el título real + cola + estado.
- **Despedida (goodbye) agregada**: modelo `GuildConfig` + `DEFAULT_CONFIG` (`goodbye: { enabled: false, channelId, message: 'Adiós {user}...' }`), evento `guildMemberRemove.js` envía el mensaje (`{user}` = nombre, `{server}` = servidor), y el dashboard tiene la tarjeta "Despedida" en la misma sección que "Bienvenida" (toggle + canal + mensaje; el botón guarda ambas). Compatible con configs viejas (normalización en `renderConfig`).
- **Fix toggles del dashboard**: los switches (autorole/XP/welcome/goodbye/rules/antispam/music) se "apagaban solos" porque `saveSection` no incluía `enabled` en el `patch` → la DB guardaba el valor viejo y el re-render revertía el switch. Ahora cada sección se guarda completa (`{ ...c.seccion, ... }`), incluido `enabled`.
- **Fix bienvenida dependía de autorole**: `guildMemberAdd.js` hacía `return` temprano si `autorole.enabled=false`, saltándose también el mensaje de bienvenida. Ahora la bienvenida se envía antes del check de autorole (independientes).
- **Fix "Guardar roles" no guardaba**: el botón llamaba a `saveSection('roles')` pero el `switch` solo tenía `case 'autorole'` → patch vacío → no se guardaba nada (no se podía poner "Sin rol"). Ahora `case 'roles'` cae en el mismo caso que `'autorole'` (rol de bienvenida + rol XP + enabled).
- Warning benigno restante: `TimeoutNegativeWarning` de `prepareNextAudioFrame` (temporizador interno de @discordjs/voice por el buffer adelantado); se autocorrige. `DEP0190` ya no aparece.

## Recordatorios del sistema

- Al entrar un usuario nuevo → rol automático (Mago Blanco).
- Al escribir en chat → rol Mago Blanco + XP de texto.
- En canal de voz → XP cada 60 s (botón por usuario; se recupera solo tras reinicios del bot).
- Rangos por XP: 🟣 Mago Oscuro, 🟢 Mago Mítico, 🔴 Mago Divino, 🔵 Seres Míticos, 🛡️ Semi Dioses (umbrales configurables en dashboard).
- Reacción ✅ al mensaje de reglas → rol Hoobits (llave de acceso: puerta de entrada; los canales se restringen quitando "Ver canal" a @everyone).
- Dashboard: dueño/admin por rol configuran y guardan; miembros normales solo lectura (solo vista de música); vista "Usuarios y XP" en solo lectura para dueño/admins (solo mega admin edita XP).
- Comandos: /play /skip /stop /pause /resume /volume /queue /nowplaying /loop /level /leaderboard /setup /activity.
- Hosting: justrunmy.app (24/7, HTTPS para la Activity — ver pendiente 1).

# PROMPT DE PENDIENTES — GALAXY BOT (Mystic Guard)

Proyecto: bot de Discord con música, XP, roles automáticos, anti-spam y dashboard.
Estado: código funcional local (Mongo conectado, bot online, 16 comandos registrados, dashboard en localhost:3000) y **desplegado en justrunmy.app** (hosting gratis de contenedores: 1 vCPU / 2 GB RAM / 4 GB disco / 5 apps).
IMPORTANTE: NO tocar el archivo `.env`. NO tocar `galaxy-dashboard.html` (es solo referencia de diseño). `cookies.txt` (raíz del proyecto) es un archivo SENSIBLE de sesión de Google: NO subirlo a git ni a un host público.

## PENDIENTES

0. ~~**MÚSICA LAVALINK: fallos con mixes/canciones largas (20/08/2026)**~~ **OBSOLETO (21/08)**: se abandonó Lavalink por completo (ver changelog "Revert de Lavalink"). El nodo kasawa y sus throttles ya no intervienen.

1. **HOSTING: justrunmy.app — configuración final y pruebas (12/08/2026)** — hosting elegido (se descartaron Render, GitHub Actions y demás opciones gratuitas). Plan gratis verificado: **1 vCPU / 2 GB RAM / 4 GB disco / 5 apps / 10 puertos** — sobra para este bot (~300-500 MB RAM). 24/7 real: música continua, dashboard público con HTTPS (imprescindible para la Activity de Discord).
   - [ ] **Redesplegar el código ACTUAL** en justrunmy (lo desplegado hoy es anterior a los cambios de la sesión 12/08: EQ persistente, fix XP por voz, vista Usuarios y XP, compensación de loudness, tope de volumen, fix del loop fantasma).
   - [ ] En el panel de justrunmy: exponer el puerto de Express (`PORT=3000`) y setear `PUBLIC_URL=https://TU-URL.justrunmy.app`, `DASHBOARD_URL` igual, `DISCORD_REDIRECT_URI=https://TU-URL.justrunmy.app/api/auth/callback` (el `.env` no se sube; todo va como env vars del panel).
   - [ ] Developer Portal: **Activity URL** = `https://TU-URL.justrunmy.app/activity` y **OAuth2 Redirect** = `https://TU-URL.justrunmy.app/api/auth/callback`.
   - [ ] Probar la **Activity completa**: canal de voz → 🎮 Actividades → GALAXY BOT → debe cargar el dashboard embebido (SDK local → authorize → OAuth → dashboard).
   - [ ] Probar **/play** desde la IP de datacenter de justrunmy: puede pegar el bot-check de YouTube ("Sign in to confirm..."); la cadena de reintentos ya está en `PlayerManager.js` (cookies → sin cookies → cookies-de-navegador + clientes android/tv/ios, timeout retryable 60s). Si se cuelga, usar `DEBUG_MUSIC=true` en el panel y revisar los logs.
   - [ ] Re-exportar `cookies.txt` local completo con "Get cookies.txt LOCALLY" (falta SID/HSID/APISID/SAPISID/__Secure-1PSID). **Nunca** subirlo a un host público ni a git.

1c. ~~**NUEVO (20/08/2026): nodo Lavalink propio en Render.com**~~ **OBSOLETO (21/08)**: abandonado junto con Lavalink (changelog "Revert de Lavalink"). Los directorios `lavalink/` y `lavalink-deploy/` se borraron del proyecto; el repo de GitHub `victordlh29/lavalink-deploy` sigue existiendo por si algún día se quiere retomar.

1b. **Redesplegar justrunmy con la versión yt-dlp restaurada (21/08)** — reemplaza el pendiente Lavalink:
   - [x] **Crash loop "Cannot find module '@discordjs/voice'" (22/08 02:40 UTC)**: el primer intento de despliegue arrancó con **Node v20.20.2** (nuestro Dockerfile usa node:22-slim) → justrunmy NO construyó la imagen: extrajo los archivos sobre un runtime con el node_modules viejo (era Lavalink). **Fix**: `src/scripts/ensure-deps.js` — bootstrap que verifica 11 dependencias críticas al arrancar y ejecuta `npm ci --omit=dev` (fallback `npm install --omit=dev`) si falta alguna; `npm start` ahora pasa por él. Zip regenerado (224 entradas).
   - [x] **2º intento también crasheó (22/08 02:47 UTC)**: los logs muestran `cmd: 'node index.js'` → **el panel lanza su propio comando y IGNORA el npm start del package.json**, así que el bootstrap nunca corría. **Fix definitivo**: `index.js` ahora llama a `require('./src/scripts/ensure-deps').run()` como PRIMERA línea — funciona con cualquier comando de arranque. Zip regenerado (224 entradas, index.js verificado dentro).
   - [x] **3er intento OK (22/08 02:52 UTC)**: el bootstrap instaló las dependencias que faltaban en caliente (`[BOOT] Faltan dependencias: @discordjs/voice, ffmpeg-static, youtube-dl-exec` → npm install → 2º arranque `[BOOT] Dependencias OK (11/11)`). Bot conectado como `2.0#4420`, dashboard en `https://a56665-6eed.n.jrnm.app`, Activity lista, 17 comandos en ambos servidores.
   - [x] **Mitigación python3 automática (22/08)**: el runtime de justrunmy probablemente no trae python3 (necesario para el zipapp de yt-dlp). `ensure-deps.js` ahora, en Linux y solo si falta python3, descarga el binario standalone `yt-dlp_linux` (~30 MB) y lo pone en `node_modules/youtube-dl-exec/bin/yt-dlp` (la ruta exacta que usa youtube-dl-exec), con marker `.standalone-ok` para no repetirlo. Sin cambios en PlayerManager. Zip regenerado.
   - [x] **/play en dashboard dio 400 "Sin resultados" + log `spawn .../bin/yt-dlp ENOENT`**: el postinstall de youtube-dl-exec NO dejó binario en el hosting. Lógica corregida: si falta el archivo O no hay python3 → descarga standalone (antes solo miraba python3). Zip regenerado.
   - [x] **OOM kill 137 al descargar el standalone (22/08 03:09 UTC)**: "Killed" tras conectar = SIGKILL del OOM killer; el contenedor tiene poca RAM y la descarga bufferizaba los ~30 MB (`arrayBuffer()`) en pleno pico de arranque. **Fix**: descarga en streaming a disco (`pipeline(Readable.fromWeb(res.body), createWriteStream)`, memoria plana) + retraso de 8s (`.unref()`) para dejar pasar el pico. Zip regenerado.
   - [x] **Standalone instalado OK (22/08 03:14 UTC)**: arranque limpio — deps OK, DB, dashboard, Activity, bot conectado como `2.0#4420`, 17 comandos en ambos servidores, y `[BOOT] yt-dlp standalone instalado` tras los ~8s de retardo, SIN "Killed". El runtime NO tiene python3 (confirmado por el propio log).
   - [x] **Bot-check de YouTube en metadatos (22/08 03:2x UTC) — BUG REAL ENCONTRADO**: `runYtDlpJson` (búsquedas/metadatos: ytsearch, URLs, related) hacía **UN solo intento SIN cookies** — toda la cadena de reintentos (cookies × clientes) solo existía en la ruta de AUDIO. En el hosting moría siempre antes de probar cookies. **Fix**: `buildAuthVariants()` compartida (sin cookies → YT_COOKIES → navegador, cada una × 7 clientes); `runYtDlpJsonRetry()` la itera con cap de 10 variantes (~30s peor caso) y loguea cada intento (`metadatos fallo con <label>`); `buildYtDlpAttempts` refactorizada para usar la misma matriz. Probado local: búsqueda texto OK, URL OK (213s), related OK. Zip regenerado.
   - [x] **Subir el zip y repetir /play (22-23/08)**: HECHO — resultado negativo esperado. La cadena de reintentos funcionó completa (`metadatos fallo con sin cookies` ×7 clientes → `cookies:/tmp/yt_cookies_13.txt` ×clientes) y TODOS los intentos devolvieron `Sign in to confirm you're not a bot`. Con las cookies válidas y completas, esto confirma definitivamente: **la IP de salida de justrunmy (152.53.157.177, Netcup/datacenter) está quemada para YouTube**. Siguiente paso: `YT_PROXY` residencial o correr en casa.
   - [x] **DIAG YT_COOKIES verificado en el hosting**: presente, 3669 chars, 29 líneas (26 youtube.com), Netscape OK, con SID/HSID/SSID/APISID/SAPISID/__Secure-1PSID. El bootstrap también OK: deps 11/11, standalone ya instalado, IP de salida logueada. La infraestructura del deploy v4 está PERFECTA — el único problema es la IP.
   - [x] **Diagnóstico de entorno en el arranque (22/08)**: usuario reporta "creo que no está leyendo las cookies". Añadido `diagEnv()` al bootstrap: imprime en cada boot `[BOOT] DIAG YT_COOKIES` (presente/no, nº chars y líneas, líneas de youtube.com, formato Netscape OK o no, claves SID/HSID/SAPISID/__Secure-1PSID detectadas) y `[BOOT] DIAG YT_PROXY`. NUNCA imprime el contenido de las cookies. dotenv se carga antes del bootstrap para que el diag vea también el .env local. Zip regenerado.
   - [ ] Riesgo residual **Node v20 vs @discordjs/voice 0.19.2** (requiere >=22.12): si /play resuelve pero no da audio o crashea al entrar al canal de voz → fijar `@discordjs/voice` en `^0.17.0` (soporta Node 16+) y redesplegar.
   - [ ] Subir **`deploy-justrunmy-v4.zip`** (raíz del proyecto; rutas con `/`, sin `.env`/`cookies.txt`/`galaxy-dashboard.html`/node_modules/.git, entradas sin vacíos, incluye package.json+lock+Dockerfile+PlayerManager nuevo). Generado con la API .NET (`ZipArchive` + `ZipFileExtensions::CreateEntryFromFile`) — NO usar Compress-Archive ni tar (rompen rutas en Linux, crash loop documentado). Los zips viejos `deploy-justrunmy.zip` y `justrunmy-v3.zip` son de la era Lavalink: NO usarlos.
   - [ ] Panel de justrunmy: **QUITAR** `LAVALINK_HOST`/`LAVALINK_PORT`/`LAVALINK_PASSWORD`/`LAVALINK_SECURE` y **PONER** `YT_COOKIES` = contenido completo de cookies.txt.
   - [ ] Si da bot-check desde la IP del datacenter ("Sign in to confirm..." / "Requested format is not available"): setear `YT_PROXY` con un proxy residencial (~3-10€/mes). Las cookies solas NO salvan una IP ya bloqueada (documentado 17/08); desde casa funciona sin proxy.
   - [ ] **OJO python3**: si el runtime de justrunmy no construye nuestro Dockerfile, puede faltar python3 → yt-dlp (zipapp de Python) fallará al reproducir aunque el bot arranque. Síntoma en logs: error al hacer spawn de yt-dlp / "python3: not found" solo al usar /play. Plan B: binario standalone `yt-dlp_linux` vendido o descargado en el arranque.
   - [ ] **Solo UNA instancia activa**: al activar justrunmy, parar el bot local (mismo token → conflicto de gateway + bug del "44 fantasma").
   - [ ] Verificar tras desplegar: `/play` en Discord, dashboard (reproductor + EQ), Activity embebida.

2. **DEFINIDO: rango de acceso independiente tras aceptar reglas (14/08/2026)** — definido como **"acceso base obligatorio"**: aceptar reglas (✅) es la *puerta de entrada*. El rol de reglas (Hoobits) es la llave de los canales: los canales se restringen en Discord (quitar "Ver canal" a @everyone) y el bot asigna la llave al reaccionar. Los rangos de XP se suman encima, independientes. Implementado: ver changelog 14/08/2026.

3. **MEJORA FUTURA: rol "Nuevo" con mute automático (14/08/2026)** — rol que se asigna al entrar al servidor y que **quita el permiso de escribir/hablar** (configurado en Discord con "Enviar mensajes: NO" / "Hablar: NO") hasta que el miembro "madure". Ideas de implementación:
   - Nuevo campo `autorole.newcomerRoleId` + `autorole.newcomerTimeoutMin` (o evento) en GuildConfig/dashboard; el bot asigna el rol al entrar (`guildMemberAdd.js`) y lo retira al cumplirse una de estas condiciones:
     - Por **tiempo**: tras N minutos en el servidor (tick en `voiceXp.js` o un `setTimeout` persistente).
     - Por **reacción a reglas**: al dar ✅ se retira el rol Nuevo y se asigna el rol de acceso (fusionarlo con el flujo actual de `messageReactionAdd.js`).
     - Por **nivel XP**: al subir a nivel 2+.
   - Logs: evento `member-newcomer` (asignado/retirado) en el canal de logs.
   - Beneficio: los bots de spam no pueden escribir nada al entrar (ni free nitro, ni invitaciones, ni links); complementa la "verificación media" de Discord hecha a medida.
   - Config de Discord recomendada (manual): verificación media + escaneo de explícitos + anti-raid (10/10) + slowmode en canales generales + "Bloquear invitaciones" por canal (nativo).

### "This video requires login" en Lavalink + config del plugin ignorada (21/08/2026) — **OBSOLETO: sección histórica, Lavalink abandonado el 21/08 (ver changelog "Revert de Lavalink")**
- **Síntoma**: al reproducir, el nodo Lavalink devuelve `All clients failed to load the item` con `This video requires login` (ANDROID_VR/WEB) y `Video player configuration error` (WEB_EMBEDDED_PLAYER). Es el `LOGIN_REQUIRED` de YouTube: la IP del nodo (datacenter) queda sujeta a bot-check. NO es código del bot — pasa dentro del nodo.
- **Bug encontrado**: en `lavalink-deploy/application.yml` la config del plugin estaba anidada bajo `lavalink.youtube` → **se ignora silenciosamente**; el nodo corría con los clientes por defecto. La config de plugins va en el **nivel raíz** (`plugins.youtube:`); las dependencias sí van en `lavalink.plugins`.
- **Fix**: yml reescrito — clientes en orden `TVHTML5_SIMPLY, ANDROID_VR, MUSIC, WEB` (los que menos bloquea YouTube desde datacenter) + `oauth.enabled: true`. Al arrancar, Render loguea un código para https://www.google.com/device: autorizar con cuenta BURNER, pegar el `refreshToken` e poner `skipInitialization: true`. Redesplegar SOLO el servicio de Render del nodo (el bot no cambia).
- **Estado (21/08/2026)**: Render ya corre la config nueva (el error ahora muestra `TVHTML5_SIMPLY` → "Sign in to confirm you're not a bot") — falta el OAuth. **El refreshToken NO va en el yml** (GitHub push protection lo bloquea con razón, repo público): va como env var `YT_REFRESH_TOKEN` en el panel de Render y el yml usa `refreshToken: "${YT_REFRESH_TOKEN:}"`. Si el token llegó a subirse, revocar en myaccount.google.com/permissions con la burner. OJO: dos deploys de Render fallaron con exit 1 por **indentación YAML** (espacio antes de la variable al editar en GitHub web) — el yml es sensible a espacios, respetar la indentación exacta del bloque `oauth:`.
- **OAuth activo pero sin efecto (21/08/2026)**: logs de Render confirmaron `YouTube access token refreshed successfully` (token OK) PERO warn `OAuth has been enabled without registering any OAuth-compatible clients` — según la tabla oficial del plugin, el único cliente OAuth-compatible es **`TV`** (requiere login para reproducir; sin búsqueda/metadatos). Fix: añadir `- TV` al final de `clients:` → cuando los clientes libres reciben "sign in to confirm", el playback cae a TV autenticado con la burner.
- **PENDIENTE — TV conecta pero YouTube cuelga la conexión (21/08/2026)**: con `- TV` añadido, el cliente ya se intenta (progreso) pero falla con `Read timed out` de forma sistemática (2 canciones distintas) — tarpitting típico de YouTube contra IPs de datacenter: no responde en vez de devolver error. Plan de acción:
  - [ ] Confirmar en logs de Render que el WARN `OAuth-compatible clients` desapareció (TV registrado con OAuth).
  - [ ] Subir timeouts HTTP en `application.yml` (nivel raíz): `httpConfig: { httpConnectionTimeout: 10000, httpReadTimeout: 45000 }` y reintentar.
  - [ ] Plan B si persiste: **poToken** para WEB/WEBEMBEDDED — generar gratis con youtube-trusted-session-generator (Python/Docker) y añadir bajo `plugins.youtube`: `pot: { token: "...", visitorData: "..." }`. Ojo: PENDIENTES 17/08 ya documentó que poToken no salva IPs ya bloqueadas; probar igualmente porque la IP de Render puede estar menos quemada que la de justrunmy.
  - [ ] Plan C (solución duradera): nodo Lavalink propio en IP residencial (PC de casa — verificado que YouTube funciona desde ahí) o VPS. El bot solo necesita cambiar `LAVALINK_HOST`/`LAVALINK_PORT`/`LAVALINK_PASSWORD` en el panel de justrunmy.
  - [ ] Nota: se vio `volume: 2` en el payload PATCH del player — verificar tras resolver el playback que el volumen se percibe bien (escala lineal del bot vs rango de Lavalink v4).
- **Fix decode "mismatching version or missing source manager" (21/08/2026)**: al reconectar/redesplegar el nodo, la cola en memoria conserva tracks codificados (`encoded`) por la versión anterior del source → el nodo nuevo no los decodifica y saltaba toda la cola. `playNext()` ahora detecta ese error y **re-resuelve la canción por URL/título** para obtener encoding fresco antes de rendirse. `npm run check` OK. Zip regenerado — redesplegar el bot en justrunmy.
- **Contexto**: si la petición la resolvió kasawa (nodo público de terceros), no hay nada configurable ahí — la solución duradera es que el nodo propio (Render) tenga OAuth/POT al día, o nodo propio en VPS/IP residencial.
- **Fix adicional en el bot (21/08/2026)**: el error repetido mostraba los clientes DEFAULT (`ANDROID_VR, WEB, WEB_EMBEDDED_PLAYER`) = la petición la resolvía un nodo sin la config nueva. `PlayerManager.init()` ahora usa un `nodeResolver` custom que **prefiere el nodo `primary`** (el propio, cuya config controlamos) y solo cae a kasawa si primary no está conectado (antes shoukaku repartía por penalties y podía mandar todo a kasawa). Verificado: primary→primary, sin primary→mejor por penalties, nada→undefined. Zip regenerado — redesplegar el bot.

### Fix "Requested format is not available" (17/08/2026)
- YouTube dejó de ofrecer el formato 140 (m4a legado) para algunos vídeos/clientes → el `-f 140/bestaudio` fallaba y, al no ser error reintentable, cortaba toda la cadena.
- Cambios en `PlayerManager.js`: `-f 140/bestaudio/best` (cae al mejor formato aunque sea combinado), `-vn` en ffmpeg (ignora vídeo si el fallback trae stream combinado) y `/Requested format is not available/` agregado a `isRetryableYtError` para que pruebe los clientes android/tv/ios en vez de abortar. Zip regenerado.

- **Diagnóstico formatos vacíos (17/08/2026)**: prueba local con las mismas cookies confirmó que el vídeo y la sesión están OK (formatos 139/140/251/18 disponibles desde IP residencial; yt-dlp cayó al cliente `android_vr`). En la IP de datacenter YouTube devuelve **cero formatos** (requisito po_token/nsig). Se amplió la cadena de clientes a `web_embedded`, `tv_embedded` y `android_vr` (el que resolvió localmente). Zip regenerado.
- **CAUSA RAÍZ ENCONTRADA: cookies incompletas (17/08/2026)** — el `cookies.txt`/`YT_COOKIES` solo tenía 17 cookies y **faltaban las críticas** (`SID`, `HSID`, `SSID`, `APISID`, `SAPISID`, `__Secure-1PSID`, `LOGIN_INFO` — son HttpOnly y faltaban). Sin ellas YouTube trata la sesión como anónima: 403 en el streaming desde IP residencial y bot-check desde datacenter. Re-exportado completo con "Get cookies.txt LOCALLY" (botón Download, sesión iniciada, sin incógnito): ahora trae SID/1PSID/HSID/SSID/APISID/SAPISID/LOGIN_INFO/SIDCC... Verificado localmente: descarga OK (4,6 MB) con runtime **node** (el que usa el bot, no hace falta deno en Docker) y con deno. `cookies.txt` local actualizado; **pegar el contenido completo en YT_COOKIES del panel de justrunmy y reiniciar**. Los clientes nuevos (web_embedded/tv_embedded/android_vr) se quedan como refuerzo.

- **IP DE JUSTRUNMY BLOQUEADA POR YOUTUBE (17/08/2026)** — confirmado con el issue de yt-dlp #16773: con IP de datacenter TODOS los clientes devuelven "Requested format is not available" incluso con cookies válidas y po_token. La respuesta del mantenedor: *"PO tokens are not a solution if your IP is already blocked."* La IP de justrunmy está marcada; no hay arreglo de config. **Soluciones**: (a) `YT_PROXY` (nuevo soporte añadido: `--proxy` en yt-dlp) con proxy residencial/móvil (~$3-10/mes), o (b) correr el bot en casa (IP residencial — verificado: descarga OK). Zip regenerado con el soporte de proxy.

## Cambios hechos hasta ahora

### Optimización CPU para hostings con límite: opus nativo (23/08/2026)
- **Problema**: wispbyte (free) suspende el bot de STAN_PLAYA por uso de CPU. El gran consumidor en reproducción es `opusscript` (codifica Opus en JS puro, ~un núcleo entero); `@discordjs/opus` nativo (C++) usa ~10x menos.
- **`@discordjs/opus ^0.10.0` añadido como `optionalDependencies`** (NO en dependencies): si el hosting tiene prebuild o compilador → se usa nativo; si falla la instalación → npm sigue y `opusscript` actúa de fallback sin romper el arranque. `@discordjs/voice` lo elige automáticamente si está presente.
- **Prebuilds verificados**: Linux x64 glibc existe para Node 18/20/22 (ABI 108/115/127, glibc 2.31 y 2.35). El Dockerfile (node:22-slim) lo instala sin compilar. En Node >=24 NO hay prebuild aún (404 para ABI 137): local Windows con Node 24 lo salta silenciosamente — comportamiento esperado, no es error.
- OJO: `^0.10.1` NO existe (la última es 0.10.0); npm con un rango inexistente llegó a resolver un alias a `npm:null` — usar siempre `^0.10.0`.
- **`ensure-deps.js`**: nuevo `[BOOT] DIAG Opus` que loguea qué codificador está activo (nativo vs opusscript).
- **`deploy-justrunmy-v5.zip`** regenerado (224 entradas, rutas `/`, sin vacíos, incluye package.json+lock nuevos) — sirve para justrunmy Y para probar wispbyte con este bot más ligero que STAN_PLAYA (que arrastra Prisma+TS+Redis y por eso revienta RAM/CPU).
- **Wispbyte (23/08)**: panel Pterodactyl, despliegue por ZIP, arranque `node index.js` directo (nuestro bootstrap en index.js cubre deps/yt-dlp/diag). `index.js` ahora acepta `SERVER_PORT` como fallback de `PORT` (`86dc6c7`) porque estos paneles inyectan el puerto así. Pendiente: subir zip v5 + env vars y probar si su IP reproduce YouTube.
- **Wispbyte 2º intento (23/08)**: cookies OK en el hosting (29 líneas, todas las claves) pero `/play` crashea con **Traceback de Python 3.9** al ejecutar el zipapp de yt-dlp (`runpy.py`) — NO es bot-check ni cookies. Causa: wispbyte SÍ tiene python3, así que el bootstrap dejaba pasar el zipapp del postinstall, y ese zipapp explota. **Fix**: `ensureYtDlpRuntime()` ahora instala SIEMPRE el standalone en Linux (eliminado el atajo `hasPython3()`) — sin dependencia de Python en ningún host. Zip v5 regenerado; re-subirlo a wispbyte.
- **Wispbyte 3º intento (23/08 noche)**: con standalone la música SONÓ ✅ (la IP de wispbyte reproduce YouTube), pero al añadir 2ª canción fallaba la extracción PyInstaller (`Failed to extract _rust.abi3.so: decompression -1`). Fixes añadidos: limpieza de residuos `_MEI` de /tmp en boot, detección de binario corrupto por tamaño y verificación SHA256 contra los SUMS oficiales (`118f67f`, `5db3d25`).
- **Wispbyte SUSPENDIDO POR CPU (23/08)**: aviso de la plataforma por uso medio de **19.33% CPU** — los hosts gratis comunitarios castigan cualquier carga sostenida; un bot de música (decode ffmpeg + encode Opus continuos) nunca cabrá ahí. **CONCLUSIÓN FINAL DE LA GIRA DE HOSTING GRATIS**: justrunmy=IP quemada, Actions=IP quemada+6h, wispbyte=suspende por CPU. Solo quedan: (a) correr en CASA (IP residencial OK, recursos reales), o (b) `YT_PROXY` residencial de pago sobre justrunmy.

### Experimento GitHub Actions como hosting (23/08/2026) — funciona el bot, BLOQUEADO por YouTube
- Repo `galaxy-bot-mysticguard` hecho **público** (minutos ilimitados), secrets 8/8 seteados cifrados vía API (DISCORD_TOKEN, MONGODB_URI, SESSION_SECRET, CLIENT_ID/SECRET, OWNER_ID, YT_COOKIES desde cookies.txt, HEARTBEAT_SECRET).
- `.github/workflows/discord-bot.yml`: job único ~6h (`timeout-minutes: 350`) + cron cada 6h + concurrency group (mejor que el patrón cron-cada-5-min de las guías: cortes 1 vez/hora y media en vez de cada 5 min, la música no muere a mitad de canción por diseño).
- Resultado: bot ONLINE perfecto (Mongo, 17 comandos, gateway OK) pero **YouTube bloquea la IP de salida del runner (172.184.210.214, Akamai/datacenter)**: "Sign in to confirm you're not a bot" en TODOS los clientes, con y sin cookies. Mismo resultado que justrunmy (152.53.157.177 Netcup).
- **CONCLUSIÓN PROBADA EN 2 PROVEEDORES**: todo hosting gratuito de datacenter está bloqueado por YouTube para música. Las únicas vías reales quedan: (a) `YT_PROXY` residencial en cualquier host, (b) correr el bot desde una IP residencial (casa) con túnel HTTPS si se quiere dashboard/Activity.
- Hallazgo adicional: `cookies.txt` raíz local es una exportación vieja incompleta (1666 chars, solo `__Secure-1PSID`; la buena de justrunmy tenía 3669 chars con SID/HSID/SAPISID...) → RE-EXPORTAR con "Get cookies.txt LOCALLY" y actualizar el secret `YT_COOKIES` y/o el panel.
- Estado actual: justrunmy PARADO (decisión del usuario), experimento Actions activo como prueba. Para música real: decidir proxy residencial vs casa+Cloudflare Tunnel.
- **CIERRE DEL EXPERIMENTO (23/08)**: workflow eliminado (`7e7dbe9`) y repo devuelto a PRIVADO — queda como backup puro. El run en curso muere solo al acabar; sin cron ya no se relanza. Los secrets quedan guardados pero sin uso. Siguiente frente: probar el Galaxy Bot (v5, con opus nativo) en wispbyte si su IP no está quemada.
- **RE-TEST Actions (23/08 noche)**: repo re-público + workflow restaurado + secret YT_COOKIES actualizado con el export completo (29 líneas). Run #3 con TODO en orden: IP nueva `64.236.176.148`, `[BOOT] DIAG Opus: NATIVO` (prebuild Node22 Linux OK), standalone SHA256 verificado… y **el mismo bot-check de YouTube en TODOS los clientes, con y sin cookies**. Marcador de lotería de IPs de runners: **0/2** — los rangos de salida están quemados masivamente. Actions queda descartado PARA MÚSICA definitivamente; solo útil como bot de comandos/XP intermitente.
- Backup sincronizado en GitHub: commits `55aeeb4` (revert Lavalink completo), `2ac91ce`, `a60d355`, `9f073ea` (workflow).

### Backup en GitHub: repo privado→público `galaxy-bot-mysticguard` (22-23/08/2026)
- **Repo privado creado y sincronizado**: https://github.com/victordlh29/galaxy-bot-mysticguard — respaldo de código (NO es hosting: GitHub Actions/serverless tipo Netlify descartados para el bot — procesos 24/7 imposibles, IPs de datacenter igual de quemadas para YouTube).
- Commit `55aeeb4`: todo el revert de Lavalink + fixes pendientes (PlayerManager yt-dlp/ffmpeg, `ensure-deps.js`, cadena de reintentos de metadatos con cookies, diag de entorno, responsive, seguridad). Rama `master` trackeando `origin/master`.
- **Seguridad verificada antes del push**: historial sin `.env` ni `cookies.txt`; `.env.example` solo placeholders; escaneo del diff sin secretos; `.gitignore` ahora también excluye `*.zip` (los deploy zips no van al backup).
- git config email local: `victordlh29@users.noreply.github.com` (noreply, privacidad).

### Revert de Lavalink: reproductor yt-dlp→ffmpeg restaurado + fixes 17/08 (21/08/2026, noche)
- **Decisión**: Lavalink abandonado definitivamente — los nodos públicos (kasawa) y el propio (Render) sufren throttles/bloqueos intermitentes de YouTube y no son configurables. Se vuelve al pipeline propio `yt-dlp.exe → ffmpeg-static → PCM s16le 48 kHz` con `@discordjs/voice`, que funciona verificado desde IP residencial. Referencia usada: `C:\Users\Matrix\Desktop\mia\STAN_PLAYA_SEGUNDO` (mismo pipeline, sin cookies/EQ; su único aporte real era pre-buffer+flags que NUESTRO player ya tenía).
- **`src/music/PlayerManager.js` restaurado desde git HEAD (16/08)** — conserva EQ de 10 bandas por `-af`, filtros, volumen BD como fuente de verdad (`linearVolume`), autoplay, loop, cola en memoria, tolerancia cutShort 30s, warnings para el dashboard.
- **Fixes del 17/08 portados encima** (la versión HEAD era anterior):
  - `resolveCookieFile()`: `YT_COOKIES` puede ser ruta O contenido multilínea → se materializa en temp file (`os.tmpdir()/yt_cookies_<pid>.txt`), normaliza CRLF→LF y `\n` literales.
  - **`YT_PROXY`**: nuevo soporte de proxy residencial (`--proxy` en yt-dlp) — la solución documentada para IPs de datacenter bloqueadas.
  - `-f 140/bestaudio/best` + `-vn` en ffmpeg: si YouTube quita el formato 140 o el fallback trae stream combinado, sigue funcionando.
  - Cadena de clientes ampliada: `null, android, tv, ios, web_embedded, tv_embedded, android_vr` (android_vr fue el que resolvió localmente el 17/08) × fuentes cookies/sin-cookies/navegador = 35 intentos.
  - `isRetryableYtError`: "Requested format is not available" ahora es reintento (antes abortaba toda la cadena).
- **Orden limpio-primero en la cadena de intentos**: `sin cookies` pasa a intentarse PRIMERO (estilo STAN_PLAYA — YouTube aplica bot-checks sobre todo a IPs sospechosas; desde IP residencial el intento limpio basta). Cookies de `YT_COOKIES`/`cookies.txt` quedan como segundo escalón (vídeos +18, IP parcialmente marcada, proxy en justrunmy) y cookies-de-navegador como último. Beneficio: canciones normales arrancan al primer intento y una cookies.txt vencida ya no penaliza cada reproducción (antes quemaba 7 intentos fallidos antes del limpio).
- **Adiós a play-dl (inspirado en el reproductor STAN_PLAYA)**: los metadatos ya NO usan `play-dl` (librería frágil que se rompe por su cuenta) sino **yt-dlp mismo**, la misma herramienta del stream:
  - Búsqueda de texto: `yt-dlp -J "ytsearch1:<texto>"` (metadatos completos).
  - URL de vídeo: `-J --no-playlist`.
  - Playlist: `--flat-playlist -J` (enumeración rápida; probado con playlist de 183 tracks).
  - Autoplay (`getRelated`): ahora busca `ytsearch3:"<autor> <título>"` excluyendo la URL actual (antes `related_videos` de play-dl). Los tracks resueltos llevan campo nuevo `author` (uploader) para alimentar esa búsqueda.
  - Helper nuevo `runYtDlpJson()` (timeout 30s, respeta `YT_PROXY`). `resolveQuery` mantiene fallback tolerante (URL no resoluble → track "a ciegas" con la URL cruda).
  - Dependencia eliminada de `package.json` y `node_modules`.
- **Resto del revert**:
  - `package.json` restaurado desde HEAD y ajustado: vuelven `@discordjs/voice 0.19.2`, `ffmpeg-static`, `youtube-dl-exec`, `opusscript 0.1.1` (+override), `libsodium-wrappers`; fuera `shoukaku` y `play-dl`. `npm install` OK (binarios yt-dlp.exe y ffmpeg.exe verificados).
  - `index.js` y `src/bot/events/ready.js`: quitadas las llamadas `player.init(client)` (solo existían para shoukaku; el módulo viejo inicializa perezoso).
  - `Dockerfile`: vuelta la línea `python3` (el zipapp de yt-dlp lo necesita en runtime Linux).
  - Borrados: `lavalink/`, `lavalink-deploy/`, `src/scripts/check-youtube.js`.
- **Sin tocar** (features independientes del motor): canales ignorados de música (`music.ignoreChannels`), dashboard, API, comandos — la interfaz pública del PlayerManager es idéntica (18/18 métodos verificados: resolveQuery, play, skip, stop, pause, resume, setVolume, setFilter, setEq, toggleLoop, toggleAutoplay, isPlaying, nowPlaying, queueList, getState, getQueue, addWarning, getWarnings).
- **Verificado**: `npm run check` OK; carga del módulo OK; prueba real de pipeline (Big Buck Bunny 60s): 47 MB de PCM en ~14 s vía cookies locales. Resolución yt-dlp: búsqueda texto OK (live → duración null, correcto), URL directa OK (dur 635s + thumbnail), playlist 183 tracks OK, autoplay devuelve URL distinta OK, stream post-cambios OK (46 MB PCM).
- **PENDIENTE**: reiniciar el bot local (una sola instancia); redesplegar justrunmy con `deploy-justrunmy-v4.zip` (checklist completa en pendiente 1b).

### Chequeo de bloqueo YT (`src/scripts/check-youtube.js`) + re-resolución del track al migrar (21/08/2026, noche 2)
- **Nueva herramienta**: `node src/scripts/check-youtube.js` (o con args `host port password secure`). Por nodo prueba: 1) búsqueda REST, 2) carga REAL del stream vía WS+PATCH con player fake (sin Discord) de 2 vídeos (control + el que falló). El bloqueo aparece al cargar el stream, NO en la búsqueda.
- **Hallazgo en vivo (21/08 ~23h)**: kasawa → búsqueda OK, Rick Astley OK, pero la Lavoe que 20 min antes sonó dio `All clients failed` otra vez → **el bloqueo de YouTube sobre nodos públicos/compartidos es INTERMITENTE** (estrangulamiento progresivo por IP compartida), ni permanente ni por-vídeo. Un chequeo verde no garantiza nada a futuro; el auto-skip + migración son la mitigación correcta.
- **Fix migración**: el replay reutilizaba el `encoded` generado por el nodo viejo (Render plugin 1.18.2) contra el destino (kasawa snapshot `c46ab888`) — builds distintas pueden ser incompatibles aunque el vídeo esté sano. Ahora `migrateFromBlockedNode` **re-resuelve la pista en el nodo destino** (`resolveQuery`, que ya evita nodos castigados) antes de `playTrack`; si falla usa el encoded original. Tests H/I añadidos (8/8 OK).
- **Render caído desde fuera**: `lavalink-deploy.onrender.com` no respondió `/version` en 60 s (spin-down o password distinta a la default). Revisar panel de Render (estado del servicio, logs de arranque, cron de ping).
- **Realidad**: con dos nodos públicamente throttles ocasionales seguirán habiendo saltos puntuales. Solución de fondo = nodo propio (Wispbyte 6€/año o VPS Java 17) con IP dedicada.

### Fix migración de nodo: onClosed durante move() rompía el replay (21/08/2026, noche)
- **Síntoma en justrunmy tras desplegar lo anterior**: la migración arrancaba (`🔁 ... moviendo el reproductor a kasawa...`) pero moría con `replay tras migración falló: Cannot read properties of null (reading 'playTrack')` y un warning falso `Conexión de voz cerrada en ... (desconocido)` con `WebSocketClosedEvent code 1000, byRemote: false`.
- **Causa**: `player.move()` destruye el player del nodo viejo → Lavalink emite `WebSocketClosedEvent` (1000) → `onClosed` lo tomaba como desconexión real y ponía `q.lavalinkPlayer = null` ANTES del `playTrack` de reposición.
- **Fix** (`PlayerManager.js`): flag `q.migrating` activo durante `move()` → `onClosed` ignora cierres en ese lapso; el replay usa una referencia local (`lp`) capturada al inicio; si `move()` devuelve false se restaura la referencia del player. Test nuevo caso G reproduce exactamente el cierre 1000 a mitad de migración → OK.
- **Dato adicional del log**: la 2ª excepción traía build de plugin distinta (`c46ab888…`, lista de clientes por defecto) = venía de **kasawa**: el nodo público también falla puntualmente (saturación compartida o el directo en concreto — respuestas tipo "This content isn't available, try again later"). El auto-skip existente cubre esos casos; si se vuelve crónico, nodo propio (Wispbyte/VPS Java 17).

### Migración automática de nodo cuando YouTube bloquea el STREAM (21/08/2026, tarde)
- **Síntoma en justrunmy**: la búsqueda funcionaba (Render encontró "juanito alimaña") pero al reproducir saltaba `All clients failed to load the item` con `Sign in to confirm you're not a bot` (TVHTML5_SIMPLY) y `This video requires login` (ANDROID_VR/WEB). Además warning `Nodo primary cerrado (1006)` (Render free se reinicia/spin-down; shoukaku reconecta solo, no es crítico).
- **Diagnóstico**: la IP de datacenter de Render está **quemada para reproducir** (YouTube sirve metadatos/búsqueda pero bloquea los streams). Kasawa reproduce bien. El fix anterior cubría fallos de *búsqueda*; este fallo ocurre *después*, al cargar el stream, vía evento TrackException.
- **Fix** (`src/music/PlayerManager.js`):
  - `isStreamBlockMessage()`: detecta "all clients failed" / "sign in to confirm" / "requires login".
  - `migrateFromBlockedNode()`: si el track explota con ese mensaje, castiga el nodo 10 min y **mueve el reproductor** con `player.move()` (shoukaku) al siguiente nodo sano SIN salir del canal de voz, y repone la misma canción desde 0 (move no conserva el track). Aviso en el canal: `🔁 ... se reinicia en el nodo X`.
  - Guardia anti-bucle: máx. 1 migración cada 30s por servidor; si no hay nodo alternativo o move falla → comportamiento anterior (saltar).
  - Los mensajes de excepción al canal y al panel de warnings ahora van **recortados a la primera línea** (antes volcaban el stack trace entero de Java).
- **Verificado**: `node --check` OK + tests simulados (A migración+reposición OK, B guardia OK, C error ajeno sin migrar OK, D sin alternativas salta OK, E detección de variantes OK).
- **Nota de fondo**: mientras Render tenga la IP quemada, el OAuth del plugin NO garantiza reproducción (TV/TVHTML5 recibe tarpitting "The page needs to be reloaded"/timeouts). Con este fix kasawa lleva el peso automáticamente; Render queda como respaldo de búsquedas. Opción simple mientras tanto: quitar `LAVALINK_HOST` en justrunmy para usar solo kasawa.

### Fallback entre nodos Lavalink + causa del "No encontré resultados" (21/08/2026)
- **Síntoma**: `/play` respondía "No encontré resultados para esa búsqueda" y el dashboard no reproducía nada.
- **Causa raíz (nodo Render)**: en el repo `github.com/victordlh29/lavalink-deploy` el bloque `plugins:` (dependencia del plugin de YouTube) quedó **anidado dentro de `httpConfig:`** al editarlo en GitHub web → el nodo arranca SIN plugin de YouTube y con `sources.youtube: false` → sin YouTube. El archivo local `lavalink-deploy/application.yml` está BIEN; el roto es el de GitHub.
- **Por qué cascaba todo**: `nodeResolver` prefería siempre `primary` (Render) y el fallback a kasawa solo operaba si el nodo se **desconectaba** — no cuando la búsqueda fallaba con el nodo conectado. Toda búsqueda iba a Render, devolvía vacío (`loadType` ERROR/EMPTY) → "No encontré resultados" en comandos y error en el dashboard, aunque kasawa estuviera sano (verificado por REST+WS desde local).
- **Fix bot** (`src/music/PlayerManager.js`):
  - `resolveQuery`/`getRelated` ahora prueban **todos los nodos conectados** en orden (primary primero) hasta que uno devuelva tracks (`extractTracks` extraído como helper común).
  - **Castigo temporal**: un nodo que devuelve vacío o lanza error **donde otro sí resolvió** queda 10 min fuera de la rotación (5 min si lanza excepción REST). `nodeResolver` también evita a los castigados al crear players → el `joinVoiceChannel` aterriza en el nodo sano, no solo las búsquedas.
  - Si TODOS fallan o están castigados, se intentan igualmente (mejor que rendirse).
- **Verificado**: `node --check` OK + 8 tests con nodos simulados (fallback por respuesta vacía, por excepción, castigo/expiración, playlist, getRelated, sin nodos). Kasawa real responde búsquedas OK.
- **PENDIENTE del usuario**: (a) corregir `application.yml` en GitHub subiendo el archivo local correcto vía "Upload files" (NO editar a mano en web: ahí se rompió) → Render redesplega solo; (b) reiniciar el bot local; (c) redesplegar justrunmy con este código (el desplegado no tiene el fallback).

### Auto-skip al fallar una canción por excepción del nodo (20/08/2026)
- **Síntoma**: "Excepción en **...**: Something broke when playing the track." y la música se **quedaba en silencio** sin pasar a la siguiente.
- **Diagnóstico**: el error es del **nodo público** (Lavaplayer no obtiene el stream de YouTube de ese vídeo — verificado: la búsqueda y `decodetrack` del mismo vídeo funcionan, falla solo el stream; común en mixes largos de DJ / vídeos populares). No es bug del bot.
- **Fix** (`src/music/PlayerManager.js` `onTrackException`): antes solo avisaba; ahora además **salta a la siguiente** de la cola con `❌ No se pudo reproducir **...** (mensaje). Saltando...` (mismo comportamiento que el `LOAD_FAILED` de `onTrackEnd`). Si es el último track, se acaba la cola con normalidad.
- Verificado: `node --check` OK + bot reiniciado.

### Migración de música a Lavalink + Shoukaku (19-20/08/2026) — FUNCIONAL
- **`src/music/PlayerManager.js` reescrito**: el pipeline local `yt-dlp.exe → ffmpeg → PCM` se sustituye por un cliente **Lavalink v4** (`shoukaku` 4.3). Adiós al bot-check de YouTube, cookies.txt y toda la cadena de reintentos — la descarga/decodificación ahora la hace el nodo Lavalink.
- **Misma interfaz pública** (commands.js y api.js NO cambiaron): `resolveQuery`, `play`, `skip`, `stop`, `pause`, `resume`, `setVolume`, `setFilter`, `setEq`, `toggleLoop`, `toggleAutoplay`, `isPlaying`, `nowPlaying`, `queueList`, `getState`, `getQueue` (con facades `connection.joinConfig.channelId` y `player.state.status` para el dashboard). `addWarning`/`getWarnings` se mantienen para el dashboard.
- **Nodo público en uso**: `lava2.kasawa.pro:2334` — Lavalink **v4.2.2**, 13 plugins (YouTube OK), password `youshallnotpass`, **sin SSL**. Configurable por env vars `LAVALINK_HOST/PORT/PASSWORD/SECURE` (ganan al default). `LAVALINK_SECURE` se interpreta como `=== 'true'` (antes `!== 'false'` hacía que un default sin variable fuera `secure:true`).
- **Volumen**: misma escala perceptual `linearVolume(q) = (q.volume/100)^1.660964 × volumeScale` mapeada a Lavalink (0-1000): `setGlobalVolume(round(linearVolume×100))`. La BD sigue siendo la fuente de verdad (`music.volume`).
- **Filtros/EQ en vivo** (sin reiniciar la canción): EQ de 10 bandas (32 Hz-16 kHz) mapeado a las 15 bandas de Lavalink (`dbToLavalinkGain`: 10^(dB/20)-1, clamp -0.25..1.0), bassboost/bassboost-lite vía equalizer, nightcore/vaporwave vía timescale, 8D vía rotation, karaoke vía karaoke. En Lavalink v4 el objeto `filters` reemplaza todo → cambiar de filtro resetea los anteriores.
- **Autoplay**: búsqueda `ytsearch:<autor> - <título>` en el nodo al terminar la canción (evita repetir la actual).
- **Bugs encontrados y corregidos en la migración**:
  1. **Nodos nunca conectaban** (síntoma: `/play` decía "Sin nodo Lavalink"). El connector de shoukaku se registra a `client.once('clientReady')`, pero `player.init(client)` se llamaba DENTRO del handler de ese evento (ready.js) → listener tarde → `init` movido a `index.js` ANTES de `client.login()`. (En discord.js 14.16 el evento `ready` se renombró a `clientReady`; el proyecto ya usaba `clientReady`.)
  2. **"No se encontró resultados" / nada en el dashboard**: Lavalink v4 responde `{loadType, data}`, pero `resolveQuery` y `getRelated` leían `result.tracks` (siempre undefined) → devolvían vacío. Ahora leen `result.data` según `loadType` (playlist → `data.tracks`, track/search → array, empty/error → []).
  3. **"Excepción … desconocida" y sin audio**: los handlers de eventos del player de shoukaku 4.3 emiten **un solo argumento** (`json`), pero se leían `(_p, data)` → `data` = undefined → warning genérico y el mensaje real se perdía. Ahora `(json)` y `onTrackException` lee `json.exception.message`. Esto destapó la causa del fallo (el nodo devolvía excepción al cargar el stream); tras corregir la lectura, la reproducción funciona.
- **package.json**: se quitaron `@discordjs/voice`, `play-dl`, `ffmpeg-static`, `youtube-dl-exec`, `opusscript`, `libsodium-wrappers`; se añadió `shoukaku ^4.3.0`.
- **⚠️ RIESGOS**: nodo público de terceros — puede caerse o saturar (kasawa; alternativas probadas caídas el 20/08: albinhakanson v4.0.8 sin plugin de YouTube, clxud v3, triniumhost, jirayu, g3v, minecuta, east112, nexcloud, vexanode, nyxbot, lunarnodes, techbyte, heavencloud, stackryze, viungo, serenetia). **Ideal a medio plazo**: Wispbyte (6€/año) o un VPS con Java 17 para nodo propio.
- Verificado: `node --check` de todo el backend + carga del módulo + reproducción real en vivo OK (20/08).

### Fix YT_COOKIES como contenido en justrunmy (17/08/2026)
- **Bug**: `PlayerManager.js` usaba `process.env.YT_COOKIES` directamente como **ruta** de archivo con `--cookies`. En justrunmy no existe `cookies.txt` → yt-dlp recibía el contenido entero como "ruta" → código 1 con el contenido en stderr ("This file is generated by yt-dlp..."). Localmente no se notaba: el fallback "sin cookies" resolvía; en IP de datacenter YouTube bloquea todos los intentos.
- **Fix**: `resolveCookieFile()` materializa el contenido de `YT_COOKIES` en un archivo temporal (`os.tmpdir()/yt_cookies_<pid>.txt`) si es multilínea o empieza con `#`, normaliza CRLF → LF y secuencias `\n` literales (paneles que rompen saltos de línea). Si `YT_COOKIES` es una ruta real, se usa tal cual.
- Verificado con prueba local (contenido → 3 líneas correctas en el temp). Zip regenerado con tar (sin backslashes).

### Canales ignorados para comandos de música (17/08/2026)
- Nuevo campo `music.ignoreChannels` (array de IDs): en el dashboard, apartado Música → "Canales ignorados (comandos de música no responden aquí)" (multi-select de canales de texto).
- `commands.js`: si el comando es de música (`play`, `skip`, `stop`, `pause`, `resume`, `volume`, `loop`, `autoplay`, `filter`, `queue`, `nowplaying`) y se ejecuta en un canal ignorado, responde "Los comandos de música están desactivados en este canal." para todos (admins incluidos).
- Esquema (`GuildConfig.js`), `DEFAULT_CONFIG` y normalización de configs viejas (`config.js`) actualizados.
- **OJO**: los comandos de música de la **Activity de Discord / dashboard** (endpoints `/api/music/*`) NO pasan por esta comprobación (solo los slash commands en Discord).
- **Mensaje con redirección y autoborrado (17/08/2026)**: cuando un comando de música se usa en un canal ignorado, el bot responde mencionando el canal de música configurado (si existe, ej. Nekomúsica) **o** el chat del canal de voz en el que esté el usuario, y el mensaje se **borra solo a los 5 segundos** (`fetchReply` + `delete()` con timeout).

### Fix doble barra en PUBLIC_URL y despliegue activo (16/08/2026)
- **Fix `//activity`**: si `PUBLIC_URL` se guardaba con `/` final, el enlace salía como `...//activity` y el callback OAuth derivado `...//api/auth/discord/callback` (Discord lo rechaza). Ahora `index.js` normaliza `PUBLIC_URL` y `DASHBOARD_URL` al arrancar (quita barras finales), así funciona con o sin slash.
- **Despliegue real en justrunmy**: repo git + Dockerfile (node:22-slim + python3 para el binario de yt-dlp) + `.dockerignore`; build OK (`jrnm_app:f176090`), bot conectado como `2.0#4420`, 17 comandos en ambos servidores, dashboard en `https://gitr_o9h7k-bcb.a.jrnm.app/`.
- **⚠️ Detectar doble instancia en justrunmy**: el log mostró DOS arranques `npm start` (mismo token+BD, colas de música separadas en memoria → bug "44 fantasma"). Pendiente de confirmar: si el panel tiene un campo de start command, debe quedarse vacío o usar solo `npm start` (el Dockerfile ya trae CMD) para que corra UNA sola instancia.

### Despliegue por git en justrunmy: Dockerfile y repo (16/08/2026)
- **Repo git inicializado** en el proyecto y **push a justrunmy** (`git push ... HEAD:deploy`) — justrunmy exige **Dockerfile** en la raíz para construir la imagen (sin él: "No Dockerfile found").
- **`Dockerfile` creado**: `node:20-slim` + `python3` (el binario de yt-dlp descargado por `youtube-dl-exec` en su postinstall es un zipapp de Python y necesita python3 en runtime), `npm ci --omit=dev`, `EXPOSE 3000`, `CMD node index.js`. ffmpeg-static instala su binario Linux solo.
- **`.dockerignore`** creado: excluye `node_modules`, `.env`, `cookies.txt`, `galaxy-dashboard.html`, `.git`, logs y zips del contexto de build.
- Verificado que el código es case-sensitive-correcto (225 archivos y todos los `require`): el `MODULE_NOT_FOUND './src/bot/client'` del primer despliegue fue por un zip mal empaquetado (carpeta anidada), no por el código.
- Recordatorio para el panel: `YT_COOKIES` (contenido de cookies.txt local) es el campo "YouTube Cookies" del panel — el bot ya lee `process.env.YT_COOKIES` (PlayerManager.js:355) antes que el archivo local, que no se sube.

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

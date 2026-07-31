# Implementación: F31 — Vista TV + rutas por hash + sesión persistente
Fecha: 2026-07-30
Status: completado

## Archivos creados

### Frontend
- `frontend/src/lib/route.js`: enrutado por hash sin dependencias. Exporta `PAGES`,
  `parseHash(hash)` → `{ page, sessionId }`, `buildHash({page,sessionId})`, `navigate(route)`
  (acepta string u objeto), `routeUrl(route)` (URL absoluta para abrir la TV en otra pestaña)
  y el hook `useHashRoute()` (suscripción a `hashchange`, con identidad estable si la ruta no
  cambia). Soporta las 10 páginas del sidebar + `#/session/:id` + `#/tv/:id`; hash vacío,
  `#`, `#/`, barras extra o ruta/id inválidos caen a `{ page: 'dashboard', sessionId: null }`.
- `frontend/src/lib/storage.js`: acceso encapsulado a `localStorage` (`rolapp.user`,
  `rolapp.sessionId`) con try/catch en cada operación (incógnito / storage bloqueado no
  rompe la app). `saveStoredUser` guarda SOLO `{id, username, role}` — **nunca el PIN**.
- `frontend/src/lib/vitals.js`: helper PURO `pickVitals(character, attrDefs)` + `barWidthClass(pct)`
  + `MAX_DOTS`. Regla idéntica a `StatusTab`: vitales = `is_core || has_max`, puntos si
  `max <= 20`, barra si mayor, `plain` si core sin máximo. `is_core`/`has_max` se coercionan
  con `Boolean()` (footgun F30) y `max`/`pct` son `null` (nunca 0) cuando no hay máximo.
- `frontend/src/components/Session/PartyVitals.jsx`: presentación de los vitales (puntos /
  barra / cifra), `size="sm"|"lg"`, sin controles. Devuelve `null` si el personaje no tiene
  atributos. Vitales <= 25% en rojo (clases literales, lección F14).
- `frontend/src/pages/TvView.jsx`: vista de televisor. Default export = contenedor (fetch +
  socket); exports nombrados `TvScreen` (presentación pura, testeable con SSR),
  `formatElapsed(seconds)` y `toTvEvent(event)`.
- `frontend/src/lib/route.test.js`, `frontend/src/lib/vitals.test.js`,
  `frontend/src/pages/tvView.test.jsx`.

### Backend
- `backend/src/sockets/session.test.js`: tests del handler espectador con el `io`/`socket`
  falsos del patrón de `canvas.test.js` (extendidos con `join`/`leave`).

## Archivos modificados
- `backend/src/sockets/session.js`: nuevos `session:spectate` / `session:unspectate`. Valida
  `sessionId` entero > 0 y sesión con `status='active'`; hace solo `socket.join`/`socket.leave`
  del room y guarda `socket.data.spectatingSessionId`. **No** toca `session_members`, **no**
  llama a `logEvent`, **no** toca el mapa de presencia y **no** asigna `socket.data.userId`
  (F33 se apoya en esa ausencia). El `disconnect` suelta el room del espectador y sigue
  llamando al `leave` de siempre, que corta por su guard `!userId`.
- `frontend/src/App.jsx`: la página deriva del hash (`useHashRoute`), `onNavigate` escribe el
  hash (misma firma `onNavigate(page)` para todas las páginas). Usuario y sesión persistidos:
  al arrancar se restaura el usuario sin PIN y, si la URL es `#/session/:id` (o se abrió la
  URL "pelada" con una sesión guardada), se re-entra solo si `status === 'active'`; si no,
  limpia y cae a `#/dashboard`. Logout borra ambas claves. `#/tv/:id` se resuelve ANTES del
  gate de `Login`. Gating `dmOnly` y `PrepPage` full-bleed intactos.
- `frontend/src/components/Session/SessionToolbar.jsx`: botón "Modo TV" (solo DM) que abre
  `routeUrl({page:'tv',sessionId})` con `window.open(url, '_blank', 'noopener')`. Firma del
  componente y orden de los botones existentes sin tocar (lección F17).
- `frontend/src/components/Session/SessionCharactersPanel.jsx`: cada tarjeta de personaje
  monta `<PartyVitals character={c} />` (sin fetch extra: `listSessionCharacters` ya trae
  `templateAttrs`), para que el DM vea PV/estado sin abrir la ficha.

## Tests escritos
- `frontend/src/lib/route.test.js` (9): páginas del sidebar, `#/session/7`, `#/tv/12`, hash
  vacío/`#`/`#/`/barras extra, ruta desconocida, ids no numéricos/ausentes/<=0, `buildHash`
  (incluida la caída a dashboard sin id), ida y vuelta `buildHash(parseHash(x))` y un guard
  que cruza `getNavGroups('dm'|'player')` con las rutas válidas.
- `frontend/src/lib/vitals.test.js` (9): selección `is_core || has_max`, puntos (máx 8),
  barra (máx 60, pct 50), core sin máximo (`max`/`pct` null, nunca 0), personaje sin
  atributos, defs derivadas del propio personaje, valor no numérico → 0, máximo vacío → plano,
  y `barWidthClass` acotado.
- `frontend/src/pages/tvView.test.jsx` (14): SSR de `TvScreen` con datos stub — nombre de
  sesión, `campaña · sistema`, reloj (`02:14`), party con chip conectado/desconectado cruzando
  `session:users`, franja de eventos con etiquetas de categoría, fallback a tarjeta del último
  evento sin imagen, imagen con `object-contain`, **cero `<button>/<input>/<form>`**, pie con
  la URL de invitación, estado final al cerrarse, sesión vacía sin campaña/personajes/eventos;
  regresión F30 (`is_core=0`/`has_max=0` no pintan un `0` espurio) **asertada sobre el texto
  visible** (`html.replace(/<[^>]*>/g,'')`); `formatElapsed` y `toTvEvent` (payload no parseable).
- `backend/src/sockets/session.test.js` (5): `session:spectate` une al room y **no** inserta en
  `session_members`, **no** escribe en `session_events` y **no** emite `session:users`; rechazo
  de sesión inexistente / cerrada / id no numérico / payload vacío; `session:unspectate` suelta
  el room y limpia `socket.data`; `disconnect` de espectador sin `session_leave` ni presencia;
  y un test de CONTRASTE con `session:join` real (sí registra miembro, log y presencia).

## Resultado de verificación (todo ejecutado en Docker)

**Backend**
- `docker compose build backend` → `Image rolapp-v1-backend Built` (exit 0).
- Vigencia de la imagen por HASH (lección F22, criterio de rechazo):
  - host `backend/src/sockets/session.js` → `758104f1e34362b59bb941becbf262652ade95f4bfdead4f8ed24b149c8755b4`
  - imagen `src/sockets/session.js` → `758104f1e34362b59bb941becbf262652ade95f4bfdead4f8ed24b149c8755b4` ✅ coinciden
  - host `backend/src/sockets/session.test.js` → `d6569a8ae2179c0aa73c8348b721d4eb161419a9789a0ebcee7cab24d124e87f`
  - imagen `src/sockets/session.test.js` → `d6569a8ae2179c0aa73c8348b721d4eb161419a9789a0ebcee7cab24d124e87f` ✅ coinciden
- `docker compose run --rm --no-deps backend npm run lint` → sin salida, exit 0 ✅
- `docker compose run --rm --no-deps backend npm test` → `# tests 165 / # pass 164 / # fail 0 /
  # skipped 1` ✅ (el skip es el preexistente de `hybridSearch` con vec/FTS activos, ajeno a F31;
  los 5 tests nuevos son los ok 161-165).

**Frontend**
- `docker compose build frontend` → exit 0 (fuerza `npm run lint` + `npm run build`) ✅
- Lint en el contenedor: **0 errores**, 6 warnings PREEXISTENTES y ajenos a F31
  (`DMMaster/PrepWorkspace.jsx` x5 `exhaustive-deps`, `DashboardPage.jsx` directiva sin usar).
  Ningún warning en los archivos nuevos/modificados de F31.
- Tests (patrón F20): `docker build --target build -t tmp-f31 ./frontend` +
  `docker run --rm tmp-f31 npm test` → **12 archivos, 140 tests, todos en verde** ✅, seguido de
  `docker rmi tmp-f31`. Host sin `frontend/node_modules` (ni `backend/node_modules`) antes y
  después — comprobado con `ls -d` (no existe) ✅. Imagen temporal eliminada (0 coincidencias).

Resumen: lint ✅ · build ✅ · test ✅ (backend 164 pasando + 1 skip preexistente; frontend 140 pasando).

## Lecciones aplicadas
- **F30 (`is_core`/`has_max` son enteros de SQLite):** `pickVitals` coerciona con `Boolean()` y
  devuelve `max`/`pct` como `null`; en JSX nunca uso `{flag && …}` con banderas numéricas
  (`{vital.max === null ? null : …}`). El test de regresión asserta sobre el TEXTO visible.
- **F20 (vitest SSR sin jsdom):** toda la lógica load-bearing está en helpers puros
  (`parseHash`, `buildHash`, `pickVitals`, `formatElapsed`, `toTvEvent`) y la vista se testea
  con `renderToStaticMarkup` sobre `TvScreen`; cero dependencias nuevas.
- **F20 (tests de frontend en Docker):** `docker build --target build` + `docker run` + `docker rmi`,
  sin `npm install` en el directorio montado; host verificado limpio.
- **F22 (vigencia por hash):** hashes host↔imagen comparados antes de dar los tests por válidos.
- **F17 (extender ≠ romper):** `SessionToolbar` conserva firma y orden de botones; `PartyVitals`
  es un componente nuevo con props opcionales; ninguna página cambió su contrato `onNavigate`.
- **F14 (colores/anchos dinámicos):** listas de clases Tailwind literales para los anchos de
  barra y los tintes de categoría; cero interpolación y cero `style={{}}` (no hizo falta ni
  para geometría).
- **F5 (nada de componentes huérfanos):** `TvView` está cableado en `App.jsx` (ruta `#/tv/:id`),
  `PartyVitals` en `TvView` y en `SessionCharactersPanel`, y hay un botón que lleva a la TV.

## Decisiones tomadas
1. **Entrar a una sesión = navegar; el estado lo pone el efecto.** `onEnterSession` ya no hace
   `setSession(s)` sino `navigate('#/session/:id')`. Motivo: `window.location.hash = …` dispara
   `hashchange` en OTRA tarea, así que un `setSession` previo se re-renderizaba con la ruta
   todavía en `dashboard` y el efecto de sincronización lo borraba (parpadeo + limpieza de la
   clave persistida). Con la ruta como fuente única el flujo es determinista y, de regalo, la
   sesión llega enriquecida (`campaign_name`, `campaign_game_system_id`) incluso al crearla,
   donde el POST devuelve la fila pelada.
2. **Auto-rejoin solo con la URL "pelada"** (`''`, `#`, `#/`). Cualquier hash explícito manda:
   así `#/tv/12` en el navegador del televisor (mismo perfil que el DM) no se secuestra hacia
   la sesión guardada, y teclear `#/dashboard` no te devuelve a la mesa.
3. **`pickVitals` solo pinta vitales que el personaje TIENE en su ficha** (hay entrada en
   `templateAttrs`). Sin esto, un personaje recién creado mostraría "HEALTH 0 / DEFLECT 0"
   inventados en el televisor; con la regla, no renderiza nada (requisito del alcance).
4. **`attrDefs` opcional.** En la TV vienen del sistema de la campaña (`getGameSystem`); en el
   panel de la sesión se derivan de `templateAttrs` del propio personaje (que ya traen
   `attr_name`/`is_core`/`has_max`), evitando un fetch por tarjeta.
5. **Sin chat en la TV** (adenda del líder): no hay suscripción a `chat:message` ni emisión de
   `chat:history`; queda anotado como comentario en el archivo para que no se "arregle" luego.
6. **`barWidthClass` duplicado** (10 líneas) en `lib/vitals.js` en vez de exportarlo desde
   `CharacterSheet.jsx`, porque ese archivo es de F30 (cerrada) y estaba fuera de mi alcance.
7. **Icono del botón:** `dashboard` (rejilla), el más parecido a una pantalla en el set actual;
   no inventé nombres nuevos ni añadí iconos.
8. **Reloj con `setInterval` de 1 s** en el contenedor (no en la presentación), para que
   `TvScreen` siga siendo pura y testeable.
- **Dependencias nuevas: NINGUNA.** Endpoints REST nuevos: NINGUNO. Cambios de esquema: NINGUNO.

## Candidatos para LEARNINGS.md
- **Frontend — “Con enrutado por hash, la ruta es la fuente única: navega, no hagas `setState` +
  `navigate`”.** `location.hash = …` dispara `hashchange` en otra tarea; React ya habrá
  re-renderizado con la ruta VIEJA. Si un efecto sincroniza estado↔ruta, el `setState` previo
  se deshace solo (parpadeo y, si el efecto limpia persistencia, borrado espurio). Patrón:
  el handler solo navega y el efecto de sincronización deriva el estado de la ruta.
- **Frontend — “Un derivador de datos para pantalla no debe inventar ceros”.** Al derivar
  vitales de las definiciones del sistema, filtra también por “el personaje TIENE ese
  atributo”: si no, una ficha vacía pinta `0` en todos los vitales en una pantalla que se lee a
  3 metros. Corolario del footgun F30, pero por la vía de los datos, no del guard JSX.
- **Testing — “Separa contenedor (fetch+socket) de presentación pura para poder testear una
  vista con SSR”.** `TvView` (efectos) + `TvScreen` (props) permite 11 aserciones reales sobre
  lo que se ve —incluida “cero `<button>/<input>/<form>`”, que es la garantía de que la vista
  es de solo lectura— sin jsdom ni dependencias nuevas.
- **Backend/Socket.io — “Un rol de solo-escucha se implementa por AUSENCIA de `socket.data`”.**
  El espectador no recibe `userId`, así que el `leave` del `disconnect` corta por su propio
  guard: cero presencia, cero `session_leave`, cero `session_members`. Testeable con el `io`
  falso de `canvas.test.js` añadiendo `join`/`leave` al socket falso, y con un test de
  CONTRASTE (`session:join` real) que demuestra que el camino normal sí registra.

## Bloqueantes
Ninguno.

## Notas para el reviewer
- El working tree tiene también cambios de **F32** (otro implementer en paralelo):
  `CanvasBoard.jsx`, `ChatPanel.jsx`, `chatPanel.test.jsx`, borrado de `DMMaster/*Panel.jsx` y
  su propio reporte. **No son míos.** Mis archivos son exactamente los listados arriba.
- Comprobación manual pendiente del líder/founder (no verificable desde el harness):
  abrir `http://<ip>:3000/#/tv/<id>` en el televisor con una sesión activa y confirmar que el
  espectador NO aparece en la lista de conectados de la mesa.

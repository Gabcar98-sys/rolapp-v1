# Revisión: F31 — Vista TV + rutas por hash + sesión persistente
Fecha: 2026-07-30
Revisor: reviewer (independiente)
Veredicto: **APROBADO**

> Revisión hecha en paralelo con F32. Los alcances NO se mezclan: aquí solo se juzgan los
> 9 archivos nuevos y 4 modificados declarados por F31. Los cambios de ChatPanel.jsx,
> CanvasBoard.jsx, chatPanel.test.jsx y los 4 borrados de DMMaster/ son de F32 y se
> juzgan en review_F32-ui-debt-cleanup.md.

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint backend EN EL CONTENEDOR: `docker compose run --rm --no-deps backend npm run lint` -> exit 0, sin salida.
- [x] Lint + build frontend vía `docker compose build frontend` -> exit 0 (fuerza `RUN npm run lint` + `RUN npm run build`).
- [x] No se declaró ningún checkpoint sin ejecutarlo en Docker.
- [x] No hay código comentado sin explicación. Los comentarios de los archivos nuevos son justificaciones de diseño (privacidad de la TV, ausencia de userId, F14/F30), no código muerto.
- [x] Cero console.log/console.debug en los 13 archivos del alcance (grep).

### Código y patrones del proyecto
- [x] better-sqlite3 síncrono: session.js usa db.prepare(...).get() directo. Grep de await sobre db, .then sobre db y async sobre db -> CERO.
- [x] Prepared statements: las 2 queries nuevas de session:spectate son db.prepare("SELECT id FROM sessions WHERE id = ? AND status = ...").get(id). Cero concatenación de SQL.
- [x] session_events append-only: grep de (UPDATE|DELETE).*session_events en session.js -> CERO. El espectador ni siquiera hace INSERT.
- [x] Estilos: cero style inline, cero "const s = {", cero window.innerWidth en los 13 archivos (grep). Solo clases Tailwind + tokens del handoff.
- [x] Tokens verificados contra tailwind.config.js: rail/nav/surface-2/hover/title/sub/faint/muted/line-hover/accent-text/danger-text/cat-explore-bar,bg,text/rounded-card,btn,pill existen todos. La clase "num" es la utilidad tabular real de styles/index.css:15.
- [x] Responsive con breakpoints (lg: en TvScreen, md:/lg: en el resto).
- [x] Nombres descriptivos en inglés; una responsabilidad por módulo (route.js enrutado, storage.js persistencia, vitals.js derivación pura, PartyVitals presentación, TvScreen presentación, TvView contenedor).
- [x] Sin dependencias circulares: lib/route.js y lib/vitals.js no importan componentes; PartyVitals importa solo lib/vitals.js.

### Tests
- [x] **Vigencia de la imagen por HASH (criterio de rechazo, lección F22)** - re-ejecutado por el revisor tras docker compose build backend:
  - host backend/src/sockets/session.js -> 758104f1e34362b59bb941becbf262652ade95f4bfdead4f8ed24b149c8755b4
  - imagen src/sockets/session.js -> 758104f1e34362b59bb941becbf262652ade95f4bfdead4f8ed24b149c8755b4 -> **COINCIDEN**
  - host backend/src/sockets/session.test.js -> d6569a8ae2179c0aa73c8348b721d4eb161419a9789a0ebcee7cab24d124e87f
  - imagen src/sockets/session.test.js -> d6569a8ae2179c0aa73c8348b721d4eb161419a9789a0ebcee7cab24d124e87f -> **COINCIDEN**
- [x] Test por módulo público nuevo no trivial: route.js (9), vitals.js (9), TvView/TvScreen/formatElapsed/toTvEvent + PartyVitals (14), handler de socket (5). storage.js sin test propio -> ver Observaciones (no bloqueante).
- [x] Todos los tests pasan.
- [x] Caso feliz **y** caso de error cubiertos: parseHash con hash vacío / almohadilla suelta / ruta desconocida / id no numérico; formatElapsed con negativo, undefined y 'abc'; toTvEvent con payload no parseable; session:spectate con sesión inexistente, cerrada, id no numérico y payload vacío.
- [x] Los tests ejercitan el CÓDIGO REAL (importan ./route.js, ./vitals.js, ./TvView.jsx, ./session.js), no copias.

### Arquitectura
- [x] Respeta la estructura de architecture.md: helpers en frontend/src/lib/, página en frontend/src/pages/, componente en frontend/src/components/Session/, handler en backend/src/sockets/.
- [x] **Cero dependencias nuevas** - verificado por el revisor: git diff HEAD sobre frontend/package.json y backend/package.json está VACÍO (el repo no versiona lockfiles).
- [x] **Cero endpoints REST nuevos** - la TV compone GET /sessions/:id, GET /characters/session/:id, GET /sessions/:id/events, GET /canvas/:id, GET /game-systems/:id.
- [x] **Cero cambios de esquema / migraciones.**

### Learnings
- [x] 4 candidatos propuestos en el reporte del implementer (ver abajo, + 1 del revisor).

### Reporte
- [x] .claude/progress/impl_F31-tv-session-view.md existe y lista los archivos tocados.
- [x] .claude/progress/review_F31-tv-session-view.md (este archivo).

---

## Verificación específica pedida por el líder (re-ejecutada por el revisor)

### 1. El espectador es invisible para la mesa - CONFIRMADO

backend/src/sockets/session.js:77-94 (session:spectate) hace exactamente 2 cosas tras validar:
socket.join('session:<id>') y socket.data.spectatingSessionId = id.

- **NO** inserta en session_members (cero INSERT en el handler).
- **NO** llama a logEvent (únicas llamadas del archivo: session:join en :63, leave() en :24, fire_event en :108).
- **NO** toca connectedUsers (el mapa de presencia solo se muta en session:join :55-61 y en leave() :18-22).
- **NO** asigna socket.data.userId - confirmado línea a línea.
- disconnect (:113-121): suelta el room del espectador y llama a leave(io, socket, socket.data.sessionId, socket.data.userId); para un espectador ambos son undefined, así que el guard `if (!sessionId || !userId) return` (:15) corta ANTES del logEvent('session_leave') y del emit('session:users'). **Cero session_leave, cero republicación de presencia.**
- Cubierto por 3 tests que asertan contra la DB real (COUNT(*) de session_members y de session_events) y contra io.emits.length === 0, más un **test de contraste** con session:join que demuestra que el camino normal SÍ registra (1 miembro, 1 session_join, 1 session:users).

### 2. La TV es de SOLO LECTURA - CONFIRMADO

- Grep de `<button|<input|<form|onClick|onChange|onSubmit` en pages/TvView.jsx y components/Session/PartyVitals.jsx -> **CERO coincidencias**. Aserción equivalente en el test (tvView.test.jsx:105-107).
- Las 5 llamadas api. de TvView son GET puros, verificado en lib/api.js: getSession (:37), listSessionCharacters (:248), listEvents (:49), getCanvas (:54), getGameSystem (:162) - ninguna lleva `method:`. Cero escrituras.
- **Cero chat**: grep de "chat" en TvView.jsx -> solo 3 comentarios que documentan la prohibición (:10-12, :282). No hay socket.on('chat:message') ni socket.emit('chat:history'). Se respeta la restricción explícita del líder por el bug abierto F33.
- Lo único que emite el socket de la TV: session:spectate y session:unspectate.

### 3. Regresión F30 - CONFIRMADO

- Grep del patrón de guard sobre los 13 archivos del alcance: **CERO coincidencias en los archivos NUEVOS** (route.js, storage.js, vitals.js, PartyVitals.jsx, TvView.jsx) y en App.jsx. Los 7 matches restantes son PREEXISTENTES en SessionToolbar.jsx (:247, :298, :300, :338) y SessionCharactersPanel.jsx (:94, :97, :100), y todos son strings o comparaciones booleanas (error, === 'specific', .length === 0, !isDM, .length > 0), no banderas enteras.
- pickVitals (lib/vitals.js:47,56) coerciona con Boolean(d.is_core) || Boolean(d.has_max) y Boolean(def.has_max) && ...
- max y pct son null (nunca 0) cuando no hay máximo (:61,:63). PartyVitals.jsx:76 usa un ternario `vital.max === null ? null : ...`, no un guard.
- El test de regresión (tvView.test.jsx:134-145) asserta sobre el **texto sin tags**, evitando los falsos positivos de las clases Tailwind con dígitos.

### 4. Retrocompatibilidad - CONFIRMADO (diff leído entero)

- Firma onNavigate(page) **sin cambios**: `const go = (page) => navigate(buildHash({ page }))` sustituye a setPage, misma aridad y semántica. AppShell, PrepPage y AttributesPage reciben go en el mismo prop.
- DashboardPage conserva onEnterSession(session); solo cambia la implementación (navigate en vez de setSession).
- **SessionToolbar**: la firma del componente NO se tocó (0 líneas de props en el diff). El botón "Modo TV" se **añade** tras "Evento NPC" y antes del grupo ml-auto; el orden relativo de los 6 botones existentes (Cambiar mapa, Nuevo Evento, Evento NPC | Reiniciar, Finalizar, Salir) es idéntico. Está dentro del `isDM ?` (:189), así que es solo-DM como pedía el diseño.
- PrepPage sigue full-bleed fuera del AppShell (App.jsx:151-153); SessionView sigue full-bleed (:109-117).
- Gating dmOnly **vivo** con el mismo Set de 7 páginas (App.jsx:130-133).
- Icon name="dashboard" existe en ui/Icon.jsx:6.
- PartyVitals en SessionCharactersPanel no añade fetch: listSessionCharacters -> getCharacterFull ya devuelve templateAttrs con attr_name/is_core/has_max (backend/src/routes/characters.js:20-28,51) y user_id/username (:12).

### 5. PIN nunca persistido - CONFIRMADO

- saveStoredUser (storage.js:58-64) serializa exclusivamente { id, username, role }. Grep de "pin" en storage.js y App.jsx -> solo 3 comentarios que documentan la prohibición; cero código.
- Grep de localStorage/sessionStorage en todo frontend/src -> **solo lib/storage.js**. Cero accesos sueltos.
- 5 bloques try/catch cubren store(), getItem, setItem, removeItem y el JSON.parse de loadStoredUser. Modo incógnito / storage bloqueado degradan sin romper la app.

### 6. Cero dependencias / endpoints / esquema - CONFIRMADO (ver checklist de Arquitectura).

---

## Comandos ejecutados y salida resumida

```
# Host limpio ANTES
ls -d frontend/node_modules backend/node_modules   -> No such file or directory (ambos)

# Backend
docker compose build backend                       -> Image rolapp-v1-backend Built (exit 0)
sha256sum backend/src/sockets/session.js           -> 758104f1...8755b4
docker compose run --rm --no-deps backend \
  sha256sum src/sockets/session.js                 -> 758104f1...8755b4   COINCIDEN
  (idem session.test.js -> d6569a8a...4e87f        COINCIDEN)
docker compose run --rm --no-deps backend npm run lint  -> exit 0, sin salida
docker compose run --rm --no-deps backend npm test      -> # tests 165 / # pass 164
                                                           # fail 0 / # skipped 1
   ok 161-165 = los 5 tests nuevos de session.test.js
   (el skip es el preexistente de hybridSearch con vec/FTS, ajeno a F31)

# Frontend
docker compose build frontend                      -> Image rolapp-v1-frontend Built, exit 0
                                                      (RUN npm run lint + RUN npm run build)
docker build --target build -t tmp-rev3132 ./frontend   -> exit 0
docker run --rm tmp-rev3132 npm test               -> Test Files  12 passed (12)
                                                      Tests  140 passed (140)
   src/lib/route.test.js (9) | src/lib/vitals.test.js (9) | src/pages/tvView.test.jsx (14)
docker rmi tmp-rev3132                             -> Untagged / Deleted

# Host limpio DESPUÉS
ls -d frontend/node_modules backend/node_modules   -> No such file or directory (ambos)
docker images | grep tmp-                          -> cero imágenes temporales
git status --short                                 -> cero archivos de código fuera de los
                                                      alcances declarados de F31 y F32
```

- lint backend: OK
- lint + build frontend: OK
- test backend: OK - 164 pasando / 0 fallando / 1 skip preexistente y ajeno
- test frontend: OK - 140/140

---

## Lecciones aplicadas correctamente

| Lección | Aplicada | Verificación del revisor |
|---|---|---|
| **F30** - entero 0/1 en un guard && | SÍ | Grep del patrón sobre los 13 archivos: cero en los nuevos. Boolean() en pickVitals; max/pct null; ternario en PartyVitals. El test asserta sobre texto sin tags. |
| **F20** - vitest sin jsdom, helpers puros | SÍ | Toda la lógica load-bearing es pura y exportada; la vista se testea con renderToStaticMarkup sobre TvScreen. Cero deps nuevas. |
| **F20** - tests de frontend en Docker | SÍ | --target build + docker run + docker rmi; host sin node_modules antes y después (re-comprobado por el revisor). |
| **F22** - vigencia por HASH | SÍ | Re-ejecutada por el revisor; los 2 hashes coinciden exactamente. |
| **F17** - extender != romper | SÍ | SessionToolbar sin cambio de firma ni de orden; PartyVitals con props opcionales; onNavigate(page) intacto en todas las páginas. |
| **F14** - clases literales | SÍ | BAR_WIDTHS es una lista literal; fillClasses devuelve pares literales. Cero clases interpoladas. |
| **F5** - nada de componentes huérfanos | SÍ | TvView cableado en App.jsx:92-94; PartyVitals montado en TvView y en SessionCharactersPanel; hay botón que lleva a la ruta. |
| **F21/F22** - reconstruir backend antes de testear | SÍ | docker compose build backend antes del npm test. |
| **Proceso F4** - no declarar checkpoint sin ejecutarlo | SÍ | Todas las cifras del reporte del implementer se reprodujeron exactamente. |

---

## Puntos a corregir

Ninguno. No hay bloqueantes.

---

## Observaciones (no bloqueantes)

1. **lib/storage.js no tiene test propio.** Es el único módulo público nuevo sin cobertura directa. Su lógica no es trivial (validación de la forma del usuario guardado, Number.isInteger(id) && id > 0, degradación silenciosa sin storage). Es testeable como función pura con un localStorage falso. No bloquea, pero es la pieza que decide si un jugador vuelve o no a su mesa tras un F5.
2. **backend/src/sockets/session.test.js no resetea el mapa de presencia en memoria.** connectedUsers es módulo-level y el beforeEach solo limpia la DB. El test de contraste (session:join) deja dmId dentro del mapa de sessionId. Hoy es inocuo porque corre el último, pero si se reordenan los tests o se añade uno de espectador después, una aserción io.emits.length === 0 podría pasar con estado colgado. Sugerencia: exportar un reset de presencia, o assertar sobre socket.joined en vez de sobre el contador de emits.
3. **Icono del botón "Modo TV".** dashboard (rejilla) es la aproximación menos mala del set actual, pero no lee como "televisor". Cuando se amplíe ICON_NAMES, un monitor/screen sería el natural. Decisión correcta del implementer: no inventar nombres de icono.
4. **session:spectate sobre una sesión cerrada emite session:error, que la TV no escucha.** No rompe nada (el fetch REST ya puso status='closed' y la pantalla muestra el estado final), pero el error queda sin consumir. Anotarlo por si algún día se quiere distinguir "sesión cerrada" de "enlace mal tecleado".
5. **Comprobación manual pendiente** (no verificable desde el harness, ya anotada por el implementer): abrir http://IP:3000/#/tv/ID en el televisor con una sesión activa y confirmar de visu que el espectador NO aparece en la lista de conectados de la mesa. El código y los tests dicen que no aparecerá.
6. **Compromiso de seguridad ya documentado y aceptado** en tv_view_and_online.md seccion 2.3: cualquiera en la LAN que sepa el id puede VER la sesión sin PIN. Está en el diseño aprobado por el líder; queda constatado, no es un hallazgo nuevo.

---

## Candidatos para LEARNINGS.md (el líder decide)

1. **Backend/Socket.io - "Un rol de solo-escucha se implementa por AUSENCIA de socket.data, y se prueba con un test de CONTRASTE".**
   El espectador no recibe userId, así que el leave del disconnect corta por su propio guard: cero presencia, cero session_leave, cero session_members, sin escribir una sola rama nueva en el camino de salida. El test que lo prueba no puede limitarse a asertar "no pasó nada": hay que añadir el test del camino NORMAL (session:join sí registra miembro + log + presencia) para demostrar que la ausencia es deliberada y no un handler roto. Testeable con el io falso de canvas.test.js añadiendo join/leave al socket falso. (Endorsada por el revisor: la re-verificación por grep y por conteo en DB confirma el patrón.)

2. **Frontend - "Con enrutado por hash, la ruta es la fuente única: navega, no hagas setState + navigate".**
   Asignar location.hash dispara hashchange en OTRA tarea; React ya habrá re-renderizado con la ruta VIEJA, y si un efecto sincroniza estado contra ruta, el setState previo se deshace solo (parpadeo y, si el efecto limpia persistencia, borrado espurio de la clave). Patrón: el handler solo navega; el efecto de sincronización deriva el estado de la ruta. (Endorsada.)

3. **Frontend - "Un derivador de datos para pantalla no debe inventar ceros".**
   Al derivar vitales de las definiciones del SISTEMA, filtra además por "el personaje TIENE ese atributo en su ficha": si no, un personaje recién creado pinta 0 en todos sus vitales en una pantalla que se lee a 3 metros. Corolario de F30 por la vía de los DATOS, no del guard JSX. (Endorsada: este bug existió de verdad y lo cazó el runner de F32 antes de que F31 cerrara.)

4. **Testing - "Separa contenedor (fetch+socket) de presentación pura para poder testear una vista con SSR".**
   TvView (efectos) + TvScreen (props) permite asertar sobre lo que se VE sin jsdom ni deps nuevas, incluida la garantía estructural "cero button/input/form", que es la forma barata y objetiva de probar que una vista es de solo lectura. (Endorsada; añado que el revisor puede re-ejecutar esa misma garantía como grep, lo que la hace verificable dos veces por caminos independientes.)

5. **NUEVA (propuesta del revisor) - Frontend/Seguridad: "Una vista de solo lectura se prueba con TRES greps, no con una promesa".**
   Para aceptar cualquier pantalla de solo lectura (TV, kiosco, proyección): (a) grep de `<button|<input|<form|onClick|onChange|onSubmit` en el archivo -> cero; (b) cruzar cada api.metodo() que usa contra lib/api.js y confirmar que ninguno lleva `method:` (es decir, todos GET); (c) grep del dominio prohibido (aquí "chat") para confirmar que no hay ni suscripción ni emisión. Los tres son objetivos, baratos y re-ejecutables por el revisor; "es de solo lectura" en el reporte del implementer no es evidencia.

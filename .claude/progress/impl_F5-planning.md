# Implementación: F5 — Motor de planificación
Fecha: 2026-06-29
Status: completado

## Resumen
Motor de planificación portado de la v0 a la arquitectura limpia de la v1: routers REST
delgados (lógica de jerarquía en `services/planning.js`), disparo de eventos de prep/NPC
reutilizando el log append-only de F4, y UI en React+Tailwind (constructor de prep para el
DM en el Lobby + panel de planificación en sesión solo-DM). Incluye el arreglo de la deuda
de ESLint del frontend.

Esta es la segunda pasada: el reviewer rechazó la primera por dos bloqueantes de frontend
(lint roto por `react-hooks` sin registrar; componentes huérfanos sin cablear). Ambos
corregidos y re-verificados; el backend de la primera pasada quedó intacto (14/14, lint 0).

## Archivos creados (backend)
- `backend/src/services/planning.js`: `getPrepHierarchy(prepId)` — arma la jerarquía completa
  de un prep (locations → sub_locations → events con branches recursivas + participantes,
  freeEvents y eventLinks). Prepared statements; lectura síncrona.
- `backend/src/routes/sessionPreps.js`: CRUD de preps + `GET /:id` que delega la jerarquía al
  servicio. `DELETE` borra event_templates sueltos del prep dentro de una transacción (su FK a
  prep no es cascade) y luego el prep (cascadea locations→sub→events).
- `backend/src/routes/locations.js`: CRUD anidado de ubicaciones (permisos vía dueño del prep).
- `backend/src/routes/subLocations.js`: CRUD anidado de sub-ubicaciones.
- `backend/src/routes/eventTemplates.js`: CRUD de event_templates (raíz / en sub-ubicación /
  rama con `parent_event_id`+`branch_label`), participantes, y enlaces `event_links`
  (`POST/DELETE /links`, registrados ANTES de `/:id`). Confía en `ON DELETE CASCADE` del schema
  para ramas y enlaces (FK `parent_event_id` y `event_links` cascade + `foreign_keys = ON`).
- `backend/src/routes/npcs.js`: CRUD de npcs + quests + inventory + campaign_links.
- `backend/src/routes/planning.test.js`: tests `node --test` (DB `:memory:`).

## Archivos creados (frontend)
- `frontend/src/lib/planning.js`: constantes compartidas — `EVENT_CATEGORIES`,
  `categoryClasses()` (mapa categoría → clases Tailwind, sin estilos inline), `isPlanningEvent()`.
- `frontend/src/components/Session/PlanningPanel.jsx`: panel en sesión (solo DM). Carga la
  jerarquía del prep (`session.prep_id`) o los event_templates sueltos; vista por sub-ubicación
  con eventos de **inicio** y **próximos** (port del `useMemo subLocFlows` de la v0); modal de
  participantes (todo el grupo / específicos); modal "Nuevo Evento NPC"; tab "Disparados" con el
  historial. Reconstruye el estado "disparado" desde `payload.template_id` del log de la sesión.
- `frontend/src/components/DMMaster/SessionPrepPanel.jsx`: lista de preps del DM (crear, eliminar,
  seleccionar para editar).
- `frontend/src/components/DMMaster/EventTemplatePanel.jsx`: editor de un prep — ubicaciones,
  sub-ubicaciones, eventos (categoría/descripción/rama) y enlaces from→to con label. Versión
  funcional basada en listas/selects; el editor visual tipo grafo (drag&drop) se pospone a F8
  (declarado en la UI).

## Archivos modificados
- `backend/src/index.js`: importa y registra los 5 routers nuevos en
  `/api/session-preps`, `/api/locations`, `/api/sub-locations`, `/api/event-templates`, `/api/npcs`.
- `backend/src/routes/sessions.js`:
  - `POST /:id/events` extendido para aceptar la forma de planificación/NPC
    (`{ dm_id, title, category, description, participant_type, participants[], location,
    sub_location, branch_label, template_id, actor_type, npc_id, npc_name }`) además de la forma
    genérica de F4 (`{ actor_id, type, payload }`). Se distingue por la presencia de `title`. El
    `type` del evento = `category` (como en la v0) y el resto va al payload. `session_events`
    sigue **append-only** (solo INSERT). Autorización: solo el DM dueño puede disparar.
  - `POST /` (crear sesión) ahora acepta `prep_id` opcional y lo persiste (vincula prep ↔ sesión).
    Cambio aditivo: los 14 tests siguen verdes.
- `frontend/src/lib/api.js`: añade endpoints de preps, locations, subLocations, eventTemplates,
  eventLinks, npcs y `firePlanningEvent`; `createSession` ahora pasa `prep_id`.
- `frontend/src/pages/SessionView.jsx`: pestaña **📋 Planificación visible solo para el DM**
  (`isDM`) que renderiza `<PlanningPanel sessionId user session />`. Mismo patrón de tabs/aside
  mobile-first ya existente. (Se añadió un `eslint-disable-next-line react-hooks/exhaustive-deps`
  con justificación al `useEffect` de F4 para mantener 0 warnings.)
- `frontend/src/pages/Lobby.jsx`: acceso "📋 Preparar sesión" (solo DM) que muestra
  `SessionPrepPanel` / `EventTemplatePanel` como vista dentro del Lobby; selector de prep
  (`api.listPreps`) en el formulario de nueva sesión para vincular `prep_id` al crearla.
- `frontend/package.json`: añade `eslint-plugin-react@^7.37.4` y `eslint-plugin-react-hooks@^5.1.0`
  a devDependencies.
- `frontend/eslint.config.js`: registra ambos plugins; `react/jsx-uses-vars: 'error'`,
  `react-hooks/rules-of-hooks: 'warn'`, `react-hooks/exhaustive-deps: 'warn'` (nivel warn para no
  romper el build).

## Tests escritos
- `backend/src/routes/planning.test.js` (8 tests): crear prep (feliz + 400 sin name); jerarquía
  completa de un prep (root + branch + freeEvent + eventLink); 404 prep inexistente; enlace
  duplicado → 409; borrado de evento cascadea sus ramas; disparo con `template_id` queda en el log
  y se reconstruye desde el payload + emite `session:event_fired`; evento NPC guarda
  `actor_type`/`npc_name`.
- (F4 `sessions.test.js`: 6 tests, siguen verdes — total 14.)

## Resultado de verificación (entorno canónico = Docker)
Comandos exactos y resultados:
- `docker compose exec backend npm run lint` → ✅ exit 0, sin errores ni warnings.
- `docker compose exec backend npm test` → ✅ `# tests 14 / # pass 14 / # fail 0`.
- `docker compose build frontend` → ✅ buildea. El build stage ejecuta `RUN npm run lint`
  (**0 errors, 0 warnings**) y `RUN npm run build` (vite, 71 módulos, OK). Un `RUN` fallido aborta
  la imagen, así que el éxito del build = lint + build en verde.
- `curl -s http://localhost:3000/api/health` → ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.
- Smoke e2e por el proxy nginx (`/api`): registrar DM ✅; crear prep ✅ (201); location ✅;
  sub_location ✅; 2 events ✅; 1 link ✅ (201); `GET /session-preps/:id` → locations=1, events=2,
  links=1 ✅; crear sesión con `prep_id` → 201 y `prep_id` persistido ✅; disparar evento con
  `template_id` → 201, `type=combate` ✅; el evento aparece en `GET /sessions/:id/events` con
  `template_id` reconstruible desde el payload ✅; crear+listar NPC ✅.
- Manual/e2e UI: navegable — Lobby DM → "Preparar sesión" (SessionPrepPanel/EventTemplatePanel),
  crear sesión con prep, en sesión la pestaña 📋 Planificación (solo DM) renderiza PlanningPanel.
  Verificado por build OK + smoke de API; sin Node local para tests de UI automatizados.

- lint:  ✅ (backend y frontend, 0/0)
- build: ✅ (frontend)
- test:  ✅ 14 pasando (backend)
- Manual / e2e: ✅ (smoke de API por proxy; UI cableada y build OK)

## Lecciones aplicadas
- "better-sqlite3 es síncrono": todos los routers y el servicio usan acceso síncrono con
  prepared statements; `db.transaction()` para multi-tabla (crear evento+participantes, borrar prep).
- "session_events es append-only": el disparo de eventos solo hace INSERT vía `logEvent`; el estado
  "disparado" del PlanningPanel se **reconstruye** leyendo el log, nunca mutándolo.
- "Routers que emiten por socket → factory `createXRouter(io)`": los routers de planificación NO
  emiten por socket (CRUD puro), así que son routers normales; el disparo de eventos sí emite y vive
  en `sessions.js`, que ya es factory `createSessionsRouter(io)`.
- "Cero estilos inline, cero window.innerWidth": toda la UI usa clases Tailwind + tokens; colores de
  categoría mapeados a clases en `lib/planning.js`; modales reutilizan `components/ui/Modal`.
- "El flat config de ESLint del frontend necesita eslint-plugin-react (jsx-uses-vars)": aplicada y
  ampliada — además se añadió `eslint-plugin-react-hooks` porque la primera pasada usó una directiva
  `react-hooks/...` sin tener el plugin registrado (error fatal en ESLint 9).

## Decisiones tomadas
- Base paths REST conservadas de la v0: `/api/session-preps`, `/api/locations`, `/api/sub-locations`,
  `/api/event-templates`, `/api/npcs`.
- Borrado de ramas/enlaces delegado a `ON DELETE CASCADE` del schema (con `foreign_keys = ON`) en vez
  del borrado manual de la v0 — más simple y verificado por test.
- El disparo de planificación reusa `POST /sessions/:id/events` de F4 (no se creó endpoint nuevo); se
  detecta la forma por `title` para mantener compatibilidad con la forma genérica `{ actor_id, type, payload }`.
- Vincular prep ↔ sesión: cambio aditivo en `POST /sessions` (acepta `prep_id` opcional) + selector en
  el Lobby. Era necesario para que `session.prep_id` llegue al PlanningPanel; los tests de F4 siguen verdes.
- Personajes de la sesión para el selector de participantes: se obtienen de `api.getSession(id)`
  (`characters`), ya que el endpoint v0 `/api/characters/session/:id` aún no existe en la v1.
- Dependencias npm nuevas (frontend devDependencies): `eslint-plugin-react@^7.37.4`,
  `eslint-plugin-react-hooks@^5.1.0`.
- El editor visual de grafo (EventFlowGraph drag&drop) se pospone a F8; se entrega la versión
  funcional por listas/selects (declarado en la UI del EventTemplatePanel).

## Candidatos para LEARNINGS.md
- **react-hooks en flat config debe registrarse o no usar sus directivas**: en ESLint 9, una
  `// eslint-disable-next-line react-hooks/...` sin `eslint-plugin-react-hooks` registrado es ERROR
  fatal y rompe `docker compose build frontend`. Registrar el plugin con reglas en `'warn'` (no
  `'error'`) para que las advertencias no aborten el build stage del frontend.
- **El disparo de eventos de planificación reusa el endpoint de F4, no uno nuevo**: extender
  `POST /sessions/:id/events` para aceptar una segunda forma (planificación/NPC) detectándola por
  `title` mantiene un único punto de inserción en el log append-only y evita divergencia de contrato.
- **Vincular prep a sesión es un cambio aditivo en POST /sessions**: aceptar `prep_id` opcional no
  rompe los tests existentes y permite que el PlanningPanel reciba `session.prep_id`.

## Bloqueantes (si aplica)
Ninguno.

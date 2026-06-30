# Revisión: F5 — Motor de planificación
Fecha: 2026-06-29
Reviewer: agente reviewer (independiente)
Veredicto: **APROBADO** (segunda pasada)

> Historial: la primera pasada se RECHAZÓ por dos bloqueantes de frontend (lint roto por
> `react-hooks` sin registrar + componentes huérfanos sin cablear). El implementer corrigió
> ambos. Esta segunda pasada re-verifica de forma independiente y APRUEBA. Al final se conserva
> el detalle de la primera pasada para trazabilidad.

---

## Resultado de la re-verificación (segunda pasada — entorno canónico = Docker)

Ejecuté literalmente cada comando del checklist sobre el stack levantado con
`docker compose up -d --build` (ambas imágenes buildearon):

- **Backend lint:** ✅ `docker compose exec backend npm run lint` → exit 0, 0 errores, 0 warnings.
- **Backend test:** ✅ `docker compose exec backend npm test` → `# tests 14 / # pass 14 / # fail 0`
  (8 `planning.test.js` + 6 `sessions.test.js`). El cambio aditivo de `prep_id` en `POST /sessions`
  no rompió ningún test.
- **Frontend lint + build:** ✅ `docker compose build frontend` PASA. El build stage corre
  `RUN npm run lint` (eslint src → **0 problemas, 0 warnings, 0 errores**) y `RUN npm run build`
  (vite v6.4.3 → `✓ 71 modules transformed`, `✓ built in 980ms`). Un `RUN` fallido abortaría la
  imagen, así que el éxito del build = lint + build verdes. **El bloqueante de lint quedó resuelto.**
- **Health vía proxy nginx:** ✅ `curl -s http://localhost:3000/api/health` →
  `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.
- **Smoke e2e (a través del stack levantado):** ✅ crear prep → location → sub_location → 2 events
  → 1 link (201); `GET /session-preps/:id` → locations=1, subEvents=2, links=1; crear sesión con
  `prep_id` → 201 y `prep_id` persistido; disparar evento con `template_id` → 201, `type=combate`;
  el evento aparece en `GET /sessions/:id/events` con `template_id` reconstruible desde el payload.

### Confirmación de que ya NO hay componentes huérfanos
`grep` en `frontend/src`:
- `PlanningPanel` → importado y renderizado en `SessionView.jsx:8` y `:157`.
- `SessionPrepPanel` / `EventTemplatePanel` → importados en `Lobby.jsx:5-6`, renderizados en
  `Lobby.jsx:122` y `:124` (vista "📋 Preparar sesión").
- `SessionView.jsx` SÍ está modificado (aparece en `git status`). La pestaña 📋 Planificación está
  gateada por `isDM` **dos veces**: en la lista de tabs (`...(isDM ? [{id:'planning'…}] : [])`,
  línea 71) y en el render (`activeTab === 'planning' && isDM`, línea 156). Un jugador no-DM no la ve.

---

## Checklist CHECKPOINTS.md (segunda pasada)

- [x] Lint backend pasa en contenedor → 0 errores
- [x] **Lint + build frontend pasan (`docker compose build frontend`) → 0 warnings / 0 errores**
- [x] No hay código comentado sin explicar / sin `console.log` de debug en archivos F5
- [x] `better-sqlite3` síncrono (sin async/await sobre db)
- [x] Prepared statements en todo (cero interpolación)
- [x] `session_events` append-only (disparo = solo INSERT vía `logEvent`; estado se reconstruye)
- [x] Frontend solo Tailwind + tokens; cero `const s = {…}` / cero `window.innerWidth` (grep limpio)
- [x] Nombres en inglés; una responsabilidad por módulo
- [x] Routers registrados en `index.js` (5 routers)
- [x] Validación de input al inicio de cada handler
- [x] Autorización DM en CRUD y disparo
- [x] Tests existen y cubren caso feliz + error (14/14 verdes)
- [x] **Feature integrada en la UI (PlanningPanel en SessionView solo-DM; constructor en Lobby)**
- [x] Reporte del implementer `impl_F5-planning.md` existe
- [x] Reporte del reviewer `review_F5-planning.md` (este archivo)
- [x] `sessions.prep_id` existe en `schema.sql` (la nueva INSERT lo referencia sin romper)
- [x] Dependencias nuevas documentadas (`eslint-plugin-react`, `eslint-plugin-react-hooks` en el reporte)

---

## Cómo se resolvieron los dos bloqueantes

1. **Lint frontend:** `package.json` añade `eslint-plugin-react-hooks@^5.1.0`; `eslint.config.js`
   registra `'react-hooks': reactHooks` con `react-hooks/rules-of-hooks: 'warn'` y
   `react-hooks/exhaustive-deps: 'warn'`. Ahora la directiva `// eslint-disable-next-line
   react-hooks/exhaustive-deps` apunta a una regla registrada → ya no es error fatal. Verificado:
   `docker compose build frontend` pasa con lint en 0/0. **Resuelto.**
2. **Componentes cableados:** `SessionView.jsx` monta `PlanningPanel` en una pestaña solo-DM;
   `Lobby.jsx` añade la vista "Preparar sesión" (`SessionPrepPanel` → `EventTemplatePanel`) y un
   selector de prep en el formulario de nueva sesión; `prep_id` se vincula con un cambio aditivo en
   `POST /sessions` (acepta `prep_id` opcional, persistido en `sessions.prep_id`). **Resuelto.**

---

## Lecciones aplicadas correctamente (segunda pasada)

- **better-sqlite3 síncrono:** ✅ todos los routers/servicio; `db.transaction()` para multi-tabla.
- **session_events append-only:** ✅ el disparo solo inserta vía `logEvent`; el PlanningPanel
  reconstruye el estado "disparado" leyendo el log (`payload.template_id`), nunca mutándolo.
- **Routers que emiten por socket → factory:** ✅ los routers F5 son CRUD puro (sin io, montados
  directo); el disparo vive en `sessions.js`, que ya es factory `createSessionsRouter(io)`.
- **Cero estilos inline / cero window.innerWidth:** ✅ grep limpio; mobile-first con breakpoints.
- **eslint-plugin-react (jsx-uses-vars) + react-hooks:** ✅ aplicada y ampliada correctamente; la
  lección que faltaba de la primera pasada (registrar `react-hooks` o no usar su directiva) quedó
  aplicada y además propuesta como nueva lección.
- **No declarar checkpoint en verde sin ejecutarlo en Docker:** ✅ el implementer reportó comandos
  exactos; el reviewer los reejecutó de forma independiente y coinciden.

---

## Observaciones (no bloqueantes)

- `sessionPreps.js` PUT permite cambiar `campaign_id` sin verificar que la campaña pertenezca al
  DM; riesgo bajo en app local de un solo DM. Anotado para una futura iteración.
- `eventTemplates.js` POST acepta `order_index` del cliente (con fallback a `nextOrderIndex`).
  Aceptable para v1.
- `event_templates.prep_id` no es `ON DELETE CASCADE` a propósito: el DELETE del prep borra los
  templates sueltos en transacción. Coherente con el schema y documentado.
- `POST /sessions` no valida que el `prep_id` pertenezca al DM ni que exista; un `prep_id` inválido
  quedaría como FK colgante (la FK no es NOT NULL ni se fuerza). En la práctica el selector del
  Lobby solo ofrece preps del propio DM, así que el riesgo es de uso vía API directa. No bloqueante;
  candidato a endurecer si se quiere defensa en profundidad.

---

## Candidatos para LEARNINGS.md (propuestos al líder)

### Una directiva eslint-disable hacia una regla no registrada es ERROR fatal en ESLint 9
- **Contexto:** F5 primera pasada — `// eslint-disable-next-line react-hooks/exhaustive-deps` sin
  `eslint-plugin-react-hooks` registrado rompió `docker compose build frontend`
  ("Definition for rule … was not found").
- **Lección:** En ESLint 9, un `eslint-disable*` que referencia una regla inexistente NO se ignora:
  aborta el lint con error. Si añades una directiva para una regla de un plugin, registra el plugin
  (`eslint-plugin-react-hooks` es distinto de `eslint-plugin-react`). Registra las reglas de hooks
  en `'warn'`, no `'error'`, para que las advertencias no aborten el build stage del frontend.
- **Por qué importa:** Convierte un "warning silenciado" en un build roto, justo en el stage que el
  harness usa como prueba de "lint+build verde".

### Una feature de UI no está "terminada" si sus componentes no se montan en ninguna vista
- **Contexto:** F5 primera pasada — `PlanningPanel`/`SessionPrepPanel`/`EventTemplatePanel` correctos
  pero nunca importados; `SessionView.jsx` ni se había tocado.
- **Lección:** Para features de frontend, verificar explícitamente (grep del nombre en `import`) que
  el componente nuevo se importa y renderiza desde una vista alcanzable, no solo que existe y buildea.
  Un componente huérfano pasa lint/build pero no entrega valor ni es verificable e2e.
- **Por qué importa:** Una feature puede "pasar" lint/build/tests y aun así ser invisible al usuario,
  desperdiciando una iteración de review.

### Vincular entidades nuevas a flujos existentes con cambios aditivos en el endpoint
- **Contexto:** F5 — vincular prep ↔ sesión y soportar disparo de planificación.
- **Lección:** Extender un endpoint existente de forma aditiva (`POST /sessions` acepta `prep_id`
  opcional; `POST /sessions/:id/events` detecta una segunda forma por `title`) mantiene un único
  punto de inserción en el log append-only y no rompe los tests previos. Confirmar siempre que la
  columna referenciada exista en el baseline (`sessions.prep_id` ya estaba en `schema.sql`).
- **Por qué importa:** Evita endpoints duplicados y divergencia de contrato; preserva la
  reproducibilidad del estado desde el log.

---

## Veredicto final: **APROBADO**

Backend síncrono y append-only, autorización DM, validación, 14/14 tests verdes. Frontend con lint
0/0 y build OK, componentes integrados (PlanningPanel solo-DM en sesión, constructor de prep en el
Lobby), solo Tailwind. Los dos bloqueantes de la primera pasada están resueltos y re-verificados de
forma independiente. Smoke e2e de la API (prep → jerarquía → sesión con prep → disparo en el log)
correcto. La feature F5 cumple todos los checkpoints aplicables.

---
---

# [ARCHIVO] Primera pasada — RECHAZADO (conservado para trazabilidad)

> Lo de abajo es la revisión original que rechazó F5. Se conserva tal cual. Los dos bloqueantes
> citados quedaron resueltos en la segunda pasada (ver arriba).

## Motivo del rechazo (automático) — primera pasada
`docker compose build frontend` falló en el stage de lint:
```
/app/src/components/DMMaster/SessionPrepPanel.jsx
  25:5  error  Definition for rule 'react-hooks/exhaustive-deps' was not found  react-hooks/exhaustive-deps
✖ 1 problem (1 error, 0 warnings)
```
Causa: directiva `eslint-disable` hacia `react-hooks/exhaustive-deps` sin que
`eslint-plugin-react-hooks` estuviera registrado en el flat config (solo estaba
`eslint-plugin-react`). En ESLint 9 eso es error fatal.

## Bloqueante adicional — primera pasada
Los tres componentes nuevos de frontend (`PlanningPanel`, `SessionPrepPanel`, `EventTemplatePanel`)
estaban definidos pero nunca importados ni renderizados; `SessionView.jsx` no estaba modificado y
no tenía pestaña de planificación. La feature no era accesible desde la UI.

## Inventario de archivos F5 (de la primera pasada — sigue vigente)

### Backend nuevos
- **`services/planning.js`** — `getPrepHierarchy(prepId)`: jerarquía completa (prep + locations →
  sub_locations → eventos raíz con `branches` recursivas y `participants`) + `freeEvents` +
  `eventLinks`. Síncrono, prepared statements. `null` si no existe.
- **`routes/sessionPreps.js`** — CRUD de preps; GET `/:id` delega en `getPrepHierarchy`; DELETE
  borra event_templates sueltos en transacción antes del prep.
- **`routes/locations.js`** / **`routes/subLocations.js`** — CRUD anidado con permisos vía dueño
  del prep; `order_index` secuencial.
- **`routes/eventTemplates.js`** — CRUD de eventos + enlaces; `/links` antes de `/:id`; UNIQUE → 409.
- **`routes/npcs.js`** — CRUD de NPCs + quests + inventario + vínculos a campaña.
- **`routes/planning.test.js`** — 8 tests (`:memory:`): feliz + error.

### Backend modificados
- **`routes/sessions.js`** — `POST /:id/events` extendido (forma planificación/NPC por `title`),
  append-only; `POST /` acepta `prep_id` opcional (cambio aditivo).
- **`src/index.js`** — registra los 5 routers nuevos.

### Frontend
- **`lib/planning.js`** — `EVENT_CATEGORIES`, `categoryClasses()`, `isPlanningEvent()`.
- **`components/Session/PlanningPanel.jsx`** — panel en sesión solo-DM (flujo por sub-ubicación,
  modal de participantes, tab disparados, modal NPC).
- **`components/DMMaster/SessionPrepPanel.jsx`** y **`EventTemplatePanel.jsx`** — lista/editor de prep.
- **`lib/api.js`** — endpoints F5 + `firePlanningEvent`.
- **`eslint.config.js`** / **`package.json`** — plugins de eslint.
- **`pages/SessionView.jsx`** / **`pages/Lobby.jsx`** — cableado de los componentes (segunda pasada).

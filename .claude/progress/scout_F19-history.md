# Scout F19 — Historial: detalle de sesión finalizada

> Inventario de solo-lectura. Objetivo: mapear qué existe (F14/F18/F7) para F19 y qué falta.
> Nota de contexto: F18 (ya en disco, sin commitear) aportó `NotesPanel` y `AIPanel` v2 (modos Sesión/Sistema, presets). F19 los reutiliza.

## Resumen ejecutivo

F19 es **~85% composición** de piezas ya existentes. **El backend está 100% completo** — no hace falta ningún endpoint nuevo. El trabajo real es una **página/modal de detalle** con 4 tabs que reusa componentes de F18/F7 y añade **una** pieza nueva de UI (lista de Eventos). Esfuerzo estimado: **BAJO–MEDIO**.

---

## (a) Tabla: tab/pieza → estado → evidencia

| Tab / pieza | Estado | Evidencia (archivo:línea o endpoint) |
|---|---|---|
| **Origen "Ver resumen→"** | Existe pero es un **toggle inline**, no navega a detalle | `frontend/src/pages/HistoryPage.jsx:199-217` (hoy expande resumen + `SessionStatsPanel` en la misma tarjeta). Hay que cambiarlo para abrir el detalle. |
| **Búsqueda + filtro por campaña** | Existe, reutilizable tal cual | `HistoryPage.jsx:87-113`, helper `filterClosedSessions` en `frontend/src/lib/metrics.js` |
| **Timeline + tarjetas (estilo handoff)** | Existe, tokens del handoff ya aplicados | `HistoryPage.jsx:161-222`; handoff = `.claude/design_handoff_rolapp/SesionesFinalizadas.dc.html` (NO hay mockup separado del detalle) |
| **Tab NOTAS** | **Reutilizable de F18** (con adaptación menor: modo lectura) | Componente `frontend/src/components/Session/NotesPanel.jsx`. Filtra por rol vía REST (jugador solo públicas). Para F19 basta ocultar el form de creación cuando la sesión está cerrada, o pasar un flag `readOnly`. |
| — filtrado público/privado + badge de tipo | Existe (badge de categoría + pill "Privada") | `NotesPanel.jsx:161-201`; backend filtra por rol sin importar status → `GET /api/notes?session_id=&user_id=` (`backend/src/routes/notes.js:35-53`) |
| **Tab EVENTOS** | **FALTA la UI** (backend listo). Hay un render **muy** parecido reutilizable como base | Datos: `GET /api/sessions/:id/events` (`backend/src/routes/sessions.js:206-211`) → `api.listEvents` (`frontend/src/lib/api.js:49`). Render de referencia (copiar/adaptar): PlanningPanel pestaña "Disparados" `frontend/src/components/Session/PlanningPanel.jsx:454-498` (badge NPC, badge categoría, actor, participantes). |
| — tipo/actor/ubicación/participantes/badge NPC | Datos disponibles en el payload del evento | Evento trae `type`, `actor_username`, y payload JSON con `title/description/location/sub_location/participants/actor_type/npc_name` (shape en `sessions.js:229-266`; `services/events.js:28-38`) |
| **Tab RESUMEN** | **Reutilizable** (dato + patrón de pintado) | `GET /api/sessions/:id/summary` (`backend/src/routes/rag.js:169-172`) → `api.getSessionSummary` (`api.js:352`). Pintado de referencia: bloque "Resumen de sesión" en `AIPanel.jsx:457-475` y en `SessionStatsPanel.jsx:63-68`. Trivial de replicar como tarjeta. |
| **Tab IA (modo consulta sobre sesión finalizada)** | **Reutilizable de F18** con adaptación (ver §b y §c) | `frontend/src/components/AI/AIPanel.jsx` (modos Sesión/Sistema, presets, streaming). Backend NO gatea por status: `streamSessionPreset` y `getSessionState` usan `WHERE s.id=?` sin `status='active'` → `backend/src/services/ai.js:807-808, 405-408`. Socket AI emite al socket solicitante, NO al room → no requiere `session:join` (`backend/src/sockets/ai.js:8-9`). |
| — stats de F7 dentro del tab IA | **Reutilizable** | `SessionStatsPanel` (`frontend/src/components/Stats/SessionStatsPanel.jsx`) ya consume `GET /api/sessions/:id/stats` (snapshot al cerrar, `backend/src/routes/stats.js:17-27`). Standalone, solo necesita `sessionId`. |
| **Tabs / Card / badges / Icon (primitivas UI)** | Existen | `frontend/src/components/ui/Tabs.jsx`, `Card.jsx`, `Icon.jsx`; badges de categoría vía `eventCategoryClasses` en `frontend/src/lib/planning.js` |

---

## (b) Backend: qué ya sirve y qué falta

**Todo lo que F19 necesita ya existe. No hace falta ningún GET nuevo.**

| Necesidad F19 | Endpoint | ¿Sirve para sesión cerrada? |
|---|---|---|
| Notas de la sesión (rol-filtradas) | `GET /api/notes?session_id=&user_id=` | Sí — filtra por rol, sin gate de status (`notes.js:35-53`) |
| Eventos disparados | `GET /api/sessions/:id/events` | Sí — append-only, sin gate de status (`sessions.js:206-211`, `events.js:36-38`) |
| Resumen de cierre | `GET /api/sessions/:id/summary` | Sí (`rag.js:169-172`, `ai.js:693-694`) |
| Stats por sesión (F7) | `GET /api/sessions/:id/stats` | Sí — devuelve el snapshot persistido al cerrar (`stats.js:17-27`) |
| IA consulta/presets sobre la sesión | socket `ai:ask` / `ai:session_preset`; REST fallback `/ai/ask` | Sí — sin gate de status (`ai.js:807, 405`; `sockets/ai.js`) |
| Listado de cerradas (ya enriquecido con summary/duration) | `GET /api/sessions?status=closed` | Sí (`sessions.js:15-37`) — ya lo usa F14 |

**Único matiz de integración (no es backend):** `HistoryPage` hoy **no conecta el socket** (`socket.connect()`) ni hace `session:join`. Como el streaming de IA se emite al socket solicitante (no al room), el tab IA del detalle solo necesita que el socket esté **conectado** (no unido a sala). Opciones: conectar el socket al montar el detalle, o usar el fallback REST `api.aiAsk`/no-streaming. Adaptación pequeña, sin tocar backend.

---

## (c) Composición vs. construcción nueva

**Composición (reutilizar casi tal cual):**
- Tab Notas → `NotesPanel` (+ flag `readOnly` para ocultar el form en sesión cerrada).
- Tab IA → `AIPanel` (ya acepta `sessionId`, `user`, `campaignId`). Adaptaciones: (1) asegurar socket conectado; (2) opcional: por defecto arrancar en preset "Resumen" o modo consulta; (3) embeber `SessionStatsPanel` dentro del tab (o como sub-bloque).
- Tab Resumen → tarjeta simple con `api.getSessionSummary` (patrón ya escrito en AIPanel/SessionStatsPanel).
- Stats F7 → `SessionStatsPanel` standalone.
- Búsqueda/filtro/timeline de entrada → `HistoryPage` tal cual; solo cambia la acción de "Ver resumen→".
- Shell del detalle → `Tabs` + `Card` + `Page`/`PageHeader` existentes.

**Construcción nueva (poco):**
1. **Tab Eventos**: componente `SessionEventsPanel` (o similar). El render está casi hecho en `PlanningPanel.jsx:454-498` (badge NPC, categoría, actor, participantes) — se puede extraer/adaptar. Añadir ubicación/sub-ubicación (ya vienen en el payload) y orden cronológico (el endpoint ya ordena ASC). Bajo esfuerzo.
2. **Contenedor de detalle**: página o vista `SessionDetail` que reciba la sesión seleccionada, monte los 4 tabs y un botón "volver" al timeline. Cablear la navegación desde `HistoryPage` (estado local `selectedSession`, igual patrón que `App.jsx` usa para `SessionView`).

**Deudas de estilo a vigilar (no bloqueantes):**
- `SessionStatsPanel.jsx` aún usa clases del tema viejo (`text-gray-400`, `bg-danger/20`) y **emojis** en `StatTile` (`📜 ⏱️ ⚔️`) — `SessionStatsPanel.jsx:33-49`. Contradice el rediseño (tokens handoff + iconos de línea, sin emojis). F19 puede restilarlo o dejarlo como deuda explícita.

---

## (d) Estimación de esfuerzo: BAJO–MEDIO

Desglose:
- **Backend: 0** (todo existe; verificar con smoke, no implementar).
- **Contenedor `SessionDetail` + navegación desde HistoryPage:** bajo (patrón de `selectedSession` ya usado para sesiones activas).
- **Tab Eventos (nuevo componente):** bajo (adaptar el render de "Disparados" de PlanningPanel; datos ya llegan del endpoint).
- **Tab Notas:** muy bajo (reusar `NotesPanel` + flag readOnly).
- **Tab Resumen:** muy bajo (tarjeta + `getSessionSummary`).
- **Tab IA + stats:** medio (reusar `AIPanel` y `SessionStatsPanel`; el único punto delicado es garantizar socket conectado fuera de `SessionView`, o caer al fallback REST no-streaming).
- **Restyle opcional de `SessionStatsPanel` a tokens handoff:** bajo (si se decide saldar la deuda).

Riesgo principal: la **conexión de socket para el tab IA** fuera de la sesión en vivo. Todo lo demás es composición directa.

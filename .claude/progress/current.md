# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.

---

## Sesión actual (2026-07-20) — autónoma

Petición del founder: (1) completar las features que faltan para poder **llevar una
sesión de rol completa** (F15→F19) y (2) **mejorar y dejar funcionando la IA para todo**.
Instrucción: trabajar solo; el founder revisa después.

El líder orquesta; no escribe código. Ciclo por feature: implementer → reviewer → cierre.

## Hallazgo de arranque

- **F15-catalog-pages** quedó `in_progress`. Su código se commiteó en `d894c3b`
  ("bulk skills import…") **fuera del flujo del harness**: sin `impl_F15` ni `review_F15`,
  sin aprobación del reviewer. El commit incluye TODO el alcance de F15
  (5 páginas de catálogo + bulk import + backend), +4140 líneas.
- Backend de **Mecánicas SÍ existe** (`gameSystems.js` GET/POST `/:id/mechanics` + tablas
  `game_mechanics`/`game_mechanic_params`). El frontend `AttributesPage` (+1047) debe cablearse a eso.
- **`npcs.js` ya existe** en backend → F16 podría estar parcialmente hecho (verificar al llegar).

## Feature en progreso

**Ninguna aún** — F15, F16, F17 y F18 cerradas (APROBADAS). Siguiente y ÚLTIMA: **F19-history-detail**.
Ciclo por feature: implementer (flip pending→in_progress) → reviewer → aprobación → líder commitea `feat(Fxx)` + history.md.
F19 ya scouteada (`scout_F19-history.md`): **~85% composición, backend 100% listo (cero endpoints nuevos)**. Reutiliza `NotesPanel` (+flag `readOnly`), `AIPanel` v2 (acepta `sessionId`), `HistoryPage` (búsqueda/filtro/timeline), `SessionStatsPanel`. Nuevo: contenedor `SessionDetail` con 4 tabs (Notas/Eventos/Resumen/IA) + tab Eventos (render casi hecho en PlanningPanel) + navegación desde "Ver resumen→". Riesgo menor: conectar socket para el tab IA (o fallback REST `api.aiAsk`).

## En paralelo (no bloquea features)

- `consultor` → **auditoría de IA end-to-end** (`ai_audit.md`): qué funciona, dónde está
  cableada la IA y dónde falta, dependencias de runtime (Ollama + reindex), y spec/quick-wins
  para F18. Informa el "que la IA funcione para todo".

## Orden del backlog restante

F15 (cerrar) → F16 (NPCs completos; backend parcialmente presente) → F17 (Preparar Sesión
rediseñada) → F18 (sesión en vivo completa: notas, tabs por personaje, toolbar, **presets IA**) →
F19 (detalle de historial).

## Cerradas esta sesión (2026-07-20)
- **F15-catalog-pages** — APROBADA. 5 páginas de catálogo + bulk import. Saneado el commit
  `d894c3b` fuera-de-flujo (verificado+revisado en Docker). Cierre commiteado como `feat(F15)`.
- **F16-npcs** — APROBADA. Gestor de NPCs maestro-detalle + columna `disposition` (migración
  idempotente) + `npcs.test.js`. Backend ya estaba ~90%. Commiteado como `feat(F16)`.
- **F17-prep-redesign** — APROBADA. "Preparar Sesión" full-bleed (rail 62px + panel 266px +
  vistas Lista/Grafo con Bézier/zoom/enlaces). `EventFlowGraph` extendido sin romper `compact`.
  3 lecciones nuevas en LEARNINGS. Backend ya estaba completo.
- **F18-session-live** — APROBADA (la más grande). Notas (privacidad verificada en vivo) +
  IA backend (presets/topics/summaries) + AIPanel v2 (envuelto, streaming intacto) + toolbar DM +
  StatusTab editable + restyle. Backend 141 pass, frontend 68. Migración M002.

## Cerradas en sesiones previas
- **F13-design-foundation** — commit `476a07d`. AppShell + tokens + iconos.
- **F14-pages-core** — commit `6b9c2c3`. Dashboard/Campañas/Historial rediseñadas.

## IA — auditoría (`ai_audit.md`) + acción REQUERIDA del founder
Veredicto: la IA **no funciona para todo hoy**. Motor backend excelente (F6/F9/F11/F12), pero
(1) runtime apagado de fábrica y (2) solo cableada en el AIPanel de sesión (presets/historial = F18/F19).
El código lo completo yo. Lo que **SOLO el founder puede cerrar** (runtime en su máquina, descarga
de modelos ~GB que ya llenó disco en F9, juicio de calidad del LLM):
1. `docker compose --profile ai up -d --build`
2. `docker compose --profile ai run --rm ai-bootstrap`  (baja `nomic-embed-text` + `qwen2.5:3b`)
3. `curl localhost:3001/api/ai/status`  → esperar `ready:true`
4. **REINDEXAR cada doc** (hoy solo FTS, cero vectores): botón en tab Documentos o
   `POST /api/game-systems/:id/docs/:docId/reindex` (no hay reindex-all).
5. Si `qwen2.5:3b` flojea, subir a 7b vía `AI_MODEL` (sin tocar código).
Riesgo: la IA real nunca corrió en vivo (todo con stubs). La calidad LLM + reindex real están sin verificar.

## Spec F18 (de la auditoría, componer sobre F9–F12; SIN arquitectura nueva)
- Presets Sesión = helper `streamSessionPreset` reusando `callLlmStream`+`packWithinBudget`+`toSources`.
- Topics Sistema = `streamRulesQuestion` con filtro `sectionType` (ya en `hybridSearch`).
- "Incluir sesiones anteriores" = inyectar `session_summaries` previos (sugerido `GET /api/campaigns/:id/summaries`).
- Único backend nuevo: **router de `session_notes`** (tabla existe, faltan rutas) → `createNotesRouter(io)`.
- Con Ollama, correr por **inyección de contexto** (tool-use OFF en local, solo `AI_PROVIDER=api`).
- Quick-win: `ai:ask` no propaga `sectionType` (una línea en `sockets/ai.js` + `streamRulesQuestion`).
- Deuda visual: `AIPanel`/`SessionView` aún con tokens viejos + emojis (`App.jsx:17`) → re-tematizar en F18.

## Deuda menor
- **Deuda de estilo v0 (importante antes de eliminar alias v0 de Tailwind):** quedan con tokens v0
  (`gold/ink/gray`) + emojis: `ChatPanel`, `CanvasBoard`, `SessionStatsPanel` (📜⏱️⚔️ en `StatTile`).
  F19 puede rematar `SessionStatsPanel` (está en su superficie); ChatPanel/CanvasBoard necesitan una
  pasada de limpieza. Si se eliminan los alias v0 sin restilar estos, rompen visualmente.
- **Exports muertos (F18):** `listCampaignSummaries` y `categoryClasses` — limpiar en una pasada futura.
- El auto-commiteador del entorno sella el working tree con mensajes genéricos y a veces gana la
  carrera a mis commits `feat(Fxx)`. El trabajo se persiste igual; no reescribir historia.
- Commit `d894c3b` no sigue la convención `feat(F15): …` (cosmético; no re-escribir historia).

## F16 pre-scouted (`scout_F16-npcs.md`)
Backend ~90% listo (CRUD + quests/inventory/campaigns + montado + 4 tablas). Frontend es
placeholder. Trabajo de F16 = frontend (maestro-detalle real) + 7 métodos en `api.js` +
`npcs.test.js` + columna `disposition`. NO tocar router/sub-recursos/PlanningPanel (ya integran).

## F17 pre-scouted (`scout_F17-prep.md`)
Backend COMPLETO (preps/ubicaciones/sub/eventos/enlaces con etiqueta). Página `PrepPage.jsx`
existe pero provisional. Grafo objetivo ~55-60% ya en `EventFlowGraph.jsx` (drag, aristas,
enlaces con etiqueta, CRUD). Trabajo de F17 = frontend: rail 62px + panel ubicaciones 266px +
toggle Lista/Grafo; al grafo faltan Bézier, zoom, fondo de puntos, aristas por tipo, nodo 186px
con barra de categoría, leyenda. Migrar tokens v0→handoff + emojis→`Icon.jsx`. Mapear 8 categorías
v1 → 4 colores `cat.*` (ya en tailwind). Cuidar la firma `compact` de EventFlowGraph (la usa PlanningPanel/F8b).
Decisiones del líder (en diseño documentado + principios): (1) `PrepPage` **full-bleed con rail 62px
propio** (como SessionView), no colapsar el sidebar; (2) **reorder por swap de `order_index` con el PUT
existente**, sin endpoint nuevo; añadir `updateLocation`/`updateSubLocation` a `api.js` (PUT ya existe).

## Preguntas abiertas
- ~~Disposición de NPCs~~ **RESUELTA por scout**: NO existe en schema y el mockup `NPCs.dc.html`
  la necesita (badge Aliado/Neutral/Hostil). Decisión del líder: se agrega en F16 como columna
  `disposition` nullable (aditiva, backward-compatible) = implementar el diseño documentado, no
  inventar arquitectura. Reflejar en POST/PUT.
- **Eliminar campaña (F14, para el founder):** no existe `DELETE /api/campaigns/:id` ni
  política de borrado (FK sessions→campaigns sin ON DELETE). Opciones: (a) archivado,
  (b) DELETE bloqueado si tiene sesiones, (c) cascade. Pendiente de decisión del founder.

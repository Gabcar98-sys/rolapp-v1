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

## Sesión actual (2026-07-22) — feedback del founder post-backlog

El founder reportó 3 asuntos tras revisar la app (con un diagrama del modelo de sistema de
juego). Diagnóstico hecho por el líder con lectura directa (los subagentes murieron por
límite de sesión, no por el repo). Consolidado:

1. **Modelo de sistema de juego** — falta que la sesión resuelva su sistema vía campaña de
   forma consistente (la IA lo saca de los personajes, AIPanel.jsx:94) + campo legacy
   `campaigns.game_system` muerto. **Decisión del founder: sistema SIEMPRE vía campaña**
   (no se agrega game_system_id a sessions). Modelo canónico → `.claude/docs/game_system_model.md`.
2. **Disparar eventos** — backend ya soporta ad-hoc (POST /events sin template_id); falta el
   modal de "evento rápido" en la toolbar (hoy 'Nuevo Evento' solo abre Planificación).
3. **IA robótica ('no hay documento')** — cláusula NO_HALLUCINATION única y agresiva (ai.js:315)
   pegada a todos los prompts + modelo 3b que sobre-obedece + retrieval flaco (docs solo FTS).

Backlog nuevo (aprobado por el founder, hacer los 4): **F20** evento rápido → **F21** tono IA →
**F22** coherencia del modelo. **F23 (doc del modelo) ya hecho por el líder** (game_system_model.md).

## Sesión actual (2026-07-23) — retomar F28 (tras cambio de cuenta)

El founder retoma la sesión ("seguir con lo que tenías"). Estado consolidado por el líder:
**F0–F27 done y commiteadas** (el lote "haz todo" F23+F24+F25 + F26 + F27, todo cerrado).
Único hilo abierto = **F28-dragonbane-catalog** (`in_progress` en el backlog pero SIN trabajo
iniciado: no había `impl_F28` ni `review_F28`; la única línea sin commitear era el marcado
`in_progress` en feature_list.json). Es la continuación directa de "cargar información".

- **F28-dragonbane-catalog — DONE + APROBADA** (reviewer independiente, ejecutado en Docker).
  Dragonbane: 6 skills/2 items → **35 habilidades + 61 items**. game-packs/dragonbane.json como
  fuente de verdad (fields attribute/category/type/notes + fields de arma/equipo, aditivos; legacy
  Espada/Antorcha y 6 skills preservadas; mapeo FUE→Fuerza/AGI→Destreza/INT→Inteligencia/CAR→Carisma).
  Seed dedicado idempotente `backend/scripts/seed-dragonbane-catalog.js` (por NOMBRE de sistema →
  systems 4 y 6, todos los DMs, SIN Ollama) + test 6 casos. lint 0 + 158 tests (157/1 skip/0 fail),
  vigencia por hash. Lección nueva en LEARNINGS (Arquitectura: enriquecer catálogo existente ≠ importar pack).
  Commit pendiente en este cierre. **PENDIENTE solo del founder (runtime, no código):** correr
  `docker compose exec backend node scripts/seed-dragonbane-catalog.js` contra la DB real (no requiere
  Ollama) y ver las páginas Habilidades/Items de Dragonbane pobladas.
- **F29-dragonbane-magic — EN CURSO.** El founder pidió (2026-07-23) que quede COMPLETA la info de los
  MDs en el catálogo. Dos huecos: (1) magia sin estructurar, (2) items parciales (F28 metió 61 de muchos).
  Scout del líder: NO hay concepto 'spell' en el schema → representar la magia como NUEVO `skill_format`
  'Magia' con campos dinámicos (escuela/rango/prerequisito/requisito/tiempo/alcance/duracion; efecto en
  description) y ~50 hechizos (4 escuelas + trucos) desde `DRAGONBANE_MAGIA_DETALLADA.md`; + completar los
  items restantes del MD de equipo. Patrón F28 (dragonbane.json fuente de verdad + seed idempotente por
  NOMBRE de sistema, sin Ollama). FUERA: bestiario (ya en RAG; NPCs son otro concepto).
  **DONE + APROBADA** (reviewer independiente en Docker): skill_format 'Magia' con **56 hechizos**
  (filtrable por escuela) + items **61→136**; seed reutilizado (genérico por formato) + 2 tests.
  lint 0 + 160 tests (159/1 skip/0 fail), vigencia por hash. Lección nueva en LEARNINGS (Arquitectura:
  seed genérico-por-formato absorbe formatos nuevos data-only). Sembrado en DB real (líder). Commit en
  este cierre. Follow-on documentado: escuelas como skills en 'Habilidades' (no hecho, opcional).

- **F30-charsheet-iscore-zero — EN 2ª ITERACIÓN.** Bug reportado en vivo por el founder (pantallazo,
  incógnito → NO caché): la ficha pinta un '0' pegado a los atributos no-core. Causa: guards `{intFlag &&
  <span/>}` con enteros 0/1 de SQLite (is_core, has_max) → React pinta el 0 literal. Fix (frontend puro,
  helper coreMarker + Boolean): is_core en 189/330 OK, pero el reviewer RECHAZÓ por un 3er caso sin barrer
  (has_max en línea 381, pestaña Estado). Implementer rematando esa línea + test has_max=0. Corre EN
  PARALELO con F29 (disjunto: F30 solo frontend). Al cerrar → rebuild frontend para el founder.

## Feature en progreso (contexto histórico del lote previo)

Directiva del founder (2026-07-22): "haz todo" → F23 (docs, DONE) → **F24 (fix eventos, SIGUIENTE)**
→ F25 (sesión demo completa) → commit + imagen actualizada corriendo. Una a la vez.

- **F23-full-docs-ingest — DONE + commit `52ff8f6`.** 14 MDs ingeridos para todos los DMs (986
  chunks con vectores). Verificado en vivo (RAG por sistema correcto).
- **F24-planning-freeevents — DONE.** Fix eventos sueltos enlazados en Prep (helper puro
  computeSubLocFlows). 91/91 tests + vigencia por hash. Reviewer cayó por límite → verificado por
  el líder. Prueba en vivo pendiente vía F25. Commit pendiente (junto con este cierre).
- **F25-demo-session-seed — DONE.** 1 sesión activa `[DEMO] Asedio de la Torre` (Honor/Stormlight):
  prep 2 ubic/4 sub/11 eventos/7 enlaces + 3 sueltos enlazados (ejercita F24), 3 NPCs (1 con
  quest+item), 9 disparos (4 plan/3 adhoc/2 npc), 6 chats, 2 notas, resumen IA 982 chars. Verificado
  en vivo (DB+API+bundle: nginx sirve F24+F22; API devuelve la sesión con campaign_game_system_name).
  Stack recreado (up -d --build) Up. Commit pendiente. Falta solo la prueba de UI logueado (founder).

- **F26-ai-concise — DONE.** IA directa (DIRECT_STYLE en positivo, rules temp 0.2, sin
  'conversacional'; citas + anti-alucinación intactos). 151 tests. Verificado EN VIVO: respuesta
  de reglas ahora es una línea con cita, sin preámbulo ni cierre de cortesía. Backend recreado.
  Commit pendiente en este cierre.

## 🏁 "haz todo" COMPLETO (F23+F24+F25) + F26 (concisión IA)
Los 3 commiteados (F23 52ff8f6, F24 23362af, F25 pendiente en este cierre). Imagen actualizada
corriendo. La IA responde con contenido real de ambos sistemas (986 chunks con vectores).
Pendiente SOLO del founder: abrir `[DEMO] Asedio de la Torre` logueado como DM1 y click-through.

## Nota de infraestructura
Docker Desktop se cayó a mitad de sesión (daemon npipe no respondía) y el líder lo reinició
(`Start-Process "Docker Desktop.exe"` + poll `docker info`); los contenedores volvieron solos
por `restart: unless-stopped`. Stack Up de nuevo (backend/frontend/ollama).

**Runtime IA YA ARRIBA:** Ollama + qwen2.5:3b + nomic-embed-text, ready:true, vectores activos.
Nota: nginx da 504 en /api/ai/ask (LLM CPU lento); el streaming por socket del AIPanel sí funciona.

## PENDIENTE (solo del founder, runtime IA — no código)
- **Runtime IA:** `docker compose --profile ai up -d --build` + `... run --rm ai-bootstrap` +
  `curl localhost:3001/api/ai/status` (esperar ready:true) + **reindexar cada doc** + subir los
  `.md` por sistema. Sin esto, F21 mejora el TONO pero el retrieval sigue vacío.

## Scout F22 (hecho por el líder, lectura pura)
- `GET /api/sessions/:id` YA devuelve `campaign_game_system_id` (sessions.js:44) y el listado
  también (sessions.js:21). El AIPanel (AIPanel.jsx:88-103) NO lo usa: deriva el sistema solo
  de `character.game_system_template_id`. Arreglo = resolver desde la campaña primero,
  personajes como fallback.
- Campo legacy `campaigns.game_system` (TEXT) MUERTO: campaigns.js solo lee/escribe
  `game_system_id` (SELECT c.* lo arrastra pero nada lo consume). Limpieza de bajo riesgo.
- Nombre del sistema: la query de sesión NO trae el nombre; opcional añadir
  `gs.name AS campaign_game_system_name` al join, o el frontend cae a `Sistema {id}`.
- Renombrar `game_system_template_id` → NO (toca demasiado, poco valor). Solo documentar.

## Cerradas esta sesión (2026-07-22)
- **F20-quick-event** — APROBADA. Modal de evento rápido en la toolbar (crea-y-dispara al
  instante), frontend puro sobre el POST /events existente. docker build frontend exit 0,
  79/79 tests. 2 lecciones nuevas (vitest sin jsdom → helpers puros; correr tests frontend
  en Docker sin ensuciar el host).
- **F21-ai-tone** — APROBADA. Prompts de IA por tarea (menos robótica). Backend puro (ai.js
  + 2 tests). lint exit 0 + 144 tests en Docker. 2 lecciones nuevas (negar una frase la prima
  en modelos chicos; el backend de compose no monta src/ → rebuild antes de testear).
  Deuda menor: la frase vieja sobrevive en un comentario histórico (ai.js:313-315), sin efecto.
- **F22-system-model-coherence** — APROBADA (reviewer independiente, pasada limpia; re-verificada
  en vivo por el líder). La IA resuelve el sistema desde la CAMPAÑA (helper resolveSessionGameSystems,
  personajes fallback); GET sessions expone campaign_game_system_name (JOIN 1:1); Dashboard avisa
  sin-campaña; legacy campaigns.game_system eliminado con migración idempotente M003; sessions SIN
  game_system_id. backend 148 tests + frontend 85. 2 lecciones nuevas (DROP COLUMN legacy con guard
  PRAGMA + schema; MIGRATIONS exportable para testear idempotencia).

## Backlog F0–F19 (contexto): COMPLETO
Todas `done`. La sesión autónoma previa cerró F15 (saneada), F16, F17, F18 y F19.

## Pendiente SOLO del founder (runtime IA, no código)
Para que la IA generativa funcione en vivo (hoy degrada limpio sin ella):
1. `docker compose --profile ai up -d --build`
2. `docker compose --profile ai run --rm ai-bootstrap`  (baja `nomic-embed-text` + `qwen2.5:3b`)
3. `curl localhost:3001/api/ai/status` → esperar `ready:true`
4. **Reindexar cada doc** (hoy solo FTS, cero vectores): tab Documentos o `POST /api/game-systems/:id/docs/:docId/reindex`.
5. Validar calidad del LLM; si flojea, subir a 7b vía `AI_MODEL`. Detalle en `ai_audit.md`.

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
- **F19-history-detail** — APROBADA (última). `SessionDetail` con 4 tabs (Notas/Eventos/Resumen/IA)
  reutilizando piezas de F18/F14/F7; tab IA conserva streaming; `FiredEventCard` DRY. frontend 77.

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

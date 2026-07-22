# Historial de sesiones — bitácora append-only

> El líder agrega una entrada al cerrar cada feature. Nunca se edita lo ya escrito.

---

## 2026-06-29 — F0-scaffold (DONE)

Bootstrap del repo v1.0 por el founder. Andamiaje funcional verificado con Docker.

- **Backend:** Express+Socket.io, SQLite (better-sqlite3) + sqlite-vec con degradación elegante, auth DM/player con PIN SHA-256, `/api/health`.
- **Frontend:** React+Vite+Tailwind con tokens (identidad oscura/dorada), login mobile-first funcional, proxy nginx.
- **Infra:** docker-compose (backend+frontend, ollama opcional con profile `ai`), Dockerfiles, .env.example.
- **Harness de agentes** portado desde la v0 y adaptado a JS.
- **Verificación:** build OK, up OK, `vecEnabled:true` (sqlite-vec v0.1.9), register/login/401/frontend OK.
- Commit inicial: f253485.
- Próxima: F1-schema (bajo el harness).

## 2026-06-29 — F1-schema (DONE)

Schema consolidado de la v1.0. Implementer → Reviewer APROBADO.

- `backend/src/db/schema.sql`: reúne en un solo archivo la estructura de la v0 (49 tablas de aplicación) organizada por bloques: identidad/sesión, game systems, personajes, planificación, post-sesión, RAG.
- Columnas de migraciones aplicadas en el baseline (is_core/has_max/formula, rank, jerarquía de event_templates, game_system_id en campaigns/npcs, max_value, skill_list).
- Excluido: seeds de juego (Stormlight/Dragonbane/Bridge Nine) y tablas legacy (campaign_attribute_definitions, character_attribute_values). `characters` sin session_id (vínculo vía session_characters).
- RAG: `game_docs` + `doc_chunks` en schema; `vec_chunks` (vec0, FLOAT[768]) creada en `db/index.js` condicional a vecEnabled, idempotente, con degradación elegante.
- Verificado en contenedor: 49 tablas + vec_chunks, health vecEnabled:true, sin errores SQL.
- Lecciones añadidas: vec0 fuera de schema.sql; verificar migraciones con PRAGMA.
- Próxima: F4-session-engine.

## 2026-06-29 — F4-session-engine (DONE)

Motor de sesión portado de la v0. Implementer → Reviewer RECHAZADO (tooling lint) → corrección → APROBADO.

- **Backend:** `routes/campaigns.js`, `routes/sessions.js` (factory con io), `routes/canvas.js`; `services/events.js`; sockets por dominio (`session.js`/`chat.js`/`canvas.js`) con presencia en memoria por room, chat (público/privado), canvas de imagen compartida, fire de eventos. Autorización DM en close/reset/canvas. session_events y messages append-only. 6/6 tests.
- **Frontend:** `components/ui/` (Button, Card, Tabs, Modal/Sheet), `pages/Lobby.jsx`, `pages/SessionView.jsx` (shell mobile-first con tabs/toggle sin innerWidth), `ConnectedUsers`, `ChatPanel`; `App.jsx` enruta Login→Lobby→Session; `lib/api.js` ampliado. 100% Tailwind, sin estilos inline.
- **Infra/verificación:** se corrigió el hueco de F0 — backend Dockerfile sin `--omit=dev` + `COPY eslint.config.js`; frontend Dockerfile fuerza `npm run lint` antes de `vite build`; `frontend/eslint.config.js` creado. Estrategia de lint/test canónica (Docker) documentada en verification.md/CHECKPOINTS.
- **Alcance:** canvas = imagen compartida con sync; dibujo libre (tldraw) postergado a F8.
- Deuda: 12 warnings falsos de eslint frontend (falta eslint-plugin-react) → arreglar en F5.
- Próxima: F5-planning.

## 2026-06-29 — F5-planning (DONE)

Motor de planificación portado. Implementer → RECHAZADO (lint + componentes huérfanos) → corrección → APROBADO. (El implementer se quedó sin sesión antes del 1er reporte; el reviewer revisó el working tree directo.)

- **Backend:** `routes/sessionPreps.js`, `locations.js`, `subLocations.js`, `eventTemplates.js` (+ event_links), `npcs.js`; `services/planning.js`; disparo de eventos extendido en `sessions.js` (template_id, branch, participantes, NPC). Autorización DM, append-only, prepared statements. 14/14 tests (8 planning + 6 sessions).
- **Frontend:** `PlanningPanel.jsx` (flujo: inicio/próximos por links disparados, modal participantes, tab disparados, evento NPC), `SessionPrepPanel.jsx` + `EventTemplatePanel.jsx` (constructor de prep en Lobby para DM), pestaña 📋 Planificación solo-DM en `SessionView`, selector de prep al crear sesión. `lib/planning.js`, `lib/api.js` ampliado.
- **Deudas resueltas:** eslint-plugin-react + eslint-plugin-react-hooks registrados; frontend lint 0/0.
- **Diferido a F8:** editor visual del grafo (EventFlowGraph drag&drop) — por ahora enlaces vía formularios/listas.
- Lecciones: componentes huérfanos = falso completado; eslint-disable a plugin no registrado = error fatal.
- Próxima: F2-game-systems.

## 2026-06-29 — F2-game-systems (DONE)

Sistemas de juego configurables ("cualquier juego"). Implementer → Reviewer APROBADO (sin rondas extra).

- **Backend:** `routes/gameSystems.js` (CRUD + atributos is_core/has_max/formula, slots, mecánicas), `routes/skills.js`, `routes/items.js`, `services/gamePack.js` (import transaccional + export round-trip), `routes/gamePacks.js`. Autorización DM, prepared statements, síncrono.
- **Packs como ARCHIVOS:** `game-packs/stormlight.json` (13 atributos, 15 skills), `game-packs/dragonbane.json`, `game-packs/README.md`. Nada sembrado en migraciones.
- **Frontend:** `GameSystemPanel`, `SkillsPanel`, `ItemsPanel` + UI import/export, cableados desde `Lobby.jsx` ("🎲 Sistemas de juego", solo DM).
- **Verificación:** 21/21 tests (round-trip, transaccionalidad, pack inválido rechazado), frontend build OK, smoke import/export vía proxy. Sin deps nuevas.
- Próxima: F3-characters.

## 2026-06-29 — F3-characters (DONE)

Personajes con ficha dinámica por game system. Implementer → Reviewer APROBADO (sin rondas extra).

- **Backend:** `routes/characters.js` (factory con io; ficha completa: atributos+skills+inventario+equipo, equipar/desequipar con rechazo de slot lleno, vínculo a sesión), `routes/baseCharacters.js` (pregens + crear-desde-pregen transaccional). Fix: borrado de personaje vinculado limpia `session_characters` en transacción (FK).
- **Frontend:** `MyCharacters.jsx` con ficha dinámica (atributos por category/is_core/has_max), paneles de ficha reutilizables, `BaseCharactersPanel`, paneles en `SessionView`, selector de personaje al unirse. Cableado en Lobby/SessionView.
- **Verificación:** 32 tests (11 de F3), frontend build OK, smoke e2e completo.
- Próxima: F6-rag-ai.

## 2026-06-29 — F6-rag-ai (DONE)

RAG/IA rehecho. Implementer → Reviewer APROBADO (sin rondas extra).

- **Backend:** `services/embeddings.js` (proveedor inyectable: Ollama nomic-embed-text / stub), `services/rag.js` (ingesta + chunking jerárquico por headings con heading_path/section_type/token_count, reindex idempotente por content_hash, retrieval híbrido sqlite-vec KNN + FTS5 fusionados con RRF, scoping por game_system_id), `services/ai.js` (LLM inyectable, ensamblado de contexto citado, resumen de sesión, asistencia de planificación), routers de docs/rag/ai/summary. FTS5 (`doc_chunks_fts`) sincronizada con doc_chunks. Degradación elegante (503/422) si Ollama/vec no disponible.
- **Frontend:** `AIPanel` (tab 🤖 en SessionView: Q&A de reglas con citas + resumen de sesión), gestión de docs en `GameSystemPanel` (añadir/listar/eliminar/reindexar .md, estado del índice). Cableado, Tailwind, lint 0.
- **Verificación:** 44 tests (pipeline ingesta→retrieval con stub determinista sin red, RRF, reindex, degradación), frontend build OK, health vecEnabled:true, degradación confirmada con Ollama apagado.
- **Nota:** la IA real requiere `docker compose --profile ai up` + `ollama pull nomic-embed-text`.
- Próxima: F7-stats.

## 2026-06-29 — F7-stats (DONE)

Estadísticas derivadas. Implementer → Reviewer APROBADO (sin rondas extra).

- **Backend:** `services/stats.js` (computeSessionStats/CampaignStats/CharacterStats derivadas de session_events append-only + personajes + notas, parseo JSON defensivo), snapshot UPSERT en `session_stats` al cerrar sesión (no rompe el cierre si falla), `routes/stats.js` (sesión/campaña/personaje, 404 correctos).
- **Frontend:** gráficos propios (barras/sparklines, sin deps), historial de sesiones cerradas + panel de stats + resumen, stats de campaña, stats de personaje en MyCharacters. Cableado desde Lobby, Tailwind, lint 0.
- **Verificación:** 52 tests, frontend build OK, smoke e2e (eventos→cerrar→snapshot→stats campaña).
- Próxima: F8-ui-polish (último). [Reorganizada en F8a/F8b/F8c por observaciones del founder.]

## 2026-06-29 — F8a-gamesystem-coherence (DONE)

Coherencia de sistema de juego campaña↔personaje. Implementer → Reviewer APROBADO.

- Campaña acepta/persiste `game_system_id` (UI selector al crear/editar; PUT con autorización DM 200/403).
- Validación al vincular personaje a sesión: si la campaña tiene game_system_id, el personaje debe coincidir → 422 si no. Aplicada en todos los endpoints de vínculo. Sin campaña/sin sistema → permite (compat. hacia atrás).
- Frontend: selector de personaje filtra por compatibilidad; maneja 422.
- 63/64 tests (1 skip RAG pre-existente). Próxima: F8b.

## 2026-06-29 — F8b-visual-planner (DONE)

Editor visual del grafo de eventos + edición del flujo desde la sesión. Implementer → Reviewer (1º se cayó por reinicio del proceso, relanzado) → RECHAZO por higiene de build → fix del líder → APROBADO.

- **Frontend:** `EventFlowGraph.jsx` (nodos=eventos por ubicación/sub, aristas=event_links con label; crear/enlazar/eliminar, SVG+Tailwind, sin deps nuevas), usado en el constructor (EventTemplatePanel) y en la sesión. `PlanningPanel.jsx` permite al DM editar el flujo en vivo (añadir evento, crear/eliminar enlace, editar evento) manteniendo disparo + inicio/próximos. `lib/planning.js` + tests.
- **Backend:** `PUT /event-templates/:id` (editar evento) con autorización DM (403/404). 66 pass, vitest 4/4.
- **Fix del líder:** node_modules residual rompía `docker compose build frontend`; añadidos `frontend/.dockerignore` y `backend/.dockerignore` + limpieza. Build OK.
- Lección: cada servicio dockerizado necesita .dockerignore.
- Próxima: F8c (última).

## 2026-06-30/07-01 — F8c, F9, F10 (DONE)

- **F8c** (mobile + tldraw): APROBADO. tldraw lazy + snapshot por socket, bottom-sheet móvil, accesibilidad. 71 tests.
- **F9** (activar/optimizar IA): APROBADO. Turnkey híbrido Ollama/API, ai-bootstrap, /api/ai/status, streaming por socket con fallback, contrato answer+sources, prompts ES, AIPanel con badge+citas, degradación elegante. (Verificación se atrasó por bloqueo de disco/Docker; recuperado podando 6.4 GB de caché y quitando el stack v0.)
- **F10** (seed): APROBADO. `backend/scripts/seed-examples.js` idempotente importa Stormlight+Dragonbane, crea 6 pregens Bridge Nine + 2 Dragonbane, ingiere STORMLIGHT_RPG_GUIDE.md (62 chunks+FTS, resiliente sin Ollama). Migraciones siguen vacías (no seeds en código). 82 tests.
- Founder pidió PARAR tras F10. Pendiente: optimización de IA a fondo.

## 2026-07-01 — F11-ai-retrieval-opt (DONE)

Optimización del RAG (retrieval + contexto). Implementer → Reviewer APROBADO.

- Chunking afinado (no parte tablas/encabezados, configurable), fusión híbrida normalizada + ponderada (envs de peso vector/keyword), MMR/dedup por heading_path, empaquetado de contexto por presupuesto de tokens, caché de embeddings de queries.
- Test de eval anti-regresión (`rag.eval.test.js`): hit-rate@3 = 100% (umbral 0.8). 93 tests totales. Degradación solo-FTS sin Ollama. Contrato {answer,sources} intacto.
- Founder pidió PARAR en F11. Pendiente: F12 (generación + tools + UX).

## 2026-07-01 — F12-ai-generation-opt (DONE)

Optimización de IA: generación + tools + UX. Implementer → Reviewer APROBADO. **Cierra la fase de optimización de IA.**

- Orquestador de tool-use (`retrieve_rules`, `get_character`, `get_session_state`, `get_event_history`, `get_stats`) con loop cuando el proveedor soporta function-calling (`AI_TOOLS_ENABLED`) y **fallback** a inyección de contexto para modelos locales.
- Prompts endurecidos (citar-o-abstenerse, cero alucinación, ES) para reglas/resumen/planeación. Config por tarea (modelo/temp/top-k/contexto por env). Follow-ups conversacionales acotados.
- UX AIPanel: fuentes con score, botón Regenerar, panel de depuración de retrieval; badge de motor + streaming intactos. `/api/ai/status` con `toolsEnabled`.
- 107 tests (tool-loop + fallback + follow-up con stubs deterministas, sin Ollama). Degradación elegante.
- Backlog vacío tras F12.

## 2026-06-29 — F8c-ui-polish (DONE)

Pulido mobile-first + tldraw. Implementer → Reviewer APROBADO. **Roadmap base F0–F8 completo.**

- **tldraw@2.4.4** integrado en el canvas de sesión con carga lazy (chunk separado), sync del snapshot por socket a la room + persistencia en `canvas_state.tldraw_snapshot`, carga al entrar, debounce, degradación si falla.
- Mobile-first: bottom-sheet del panel en móvil, targets táctiles, responsive `md:`/`lg:`, accesibilidad básica (aria-labels, foco, roles).
- 71 tests (5 nuevos del handler de snapshot), frontend build OK, sin node_modules residual.
- Backlog ampliado por el founder: F9 (activar/optimizar IA) y F10 (sembrar juegos + pregens + guías).
- Próxima: F9-ai-activation.

## 2026-07-20 — F15-catalog-pages (DONE)

Páginas de catálogo del rediseño. Sesión autónoma del líder. Implementer → Reviewer APROBADO.

- **Situación anómala saneada:** el código de F15 se había commiteado en `d894c3b` FUERA del flujo del harness (sin `impl_`/`review_`, sin aprobación). El líder lo reincorporó al carril: verificación → revisión → cierre.
- **5 páginas** sacadas del Lobby a páginas propias del AppShell: Habilidades (formatos por sistema, tabla búsqueda+chips+paginación 50, editor de campos text/number/boolean, CRUD dinámico, **bulk import JSON** con auto-creación de campos y reporte importadas/omitidas/campos-creados vía `services/skillsImport.js`), Items (equippable, campos dinámicos, punto de rareza), Bases de Atributos (tabs Atributos/Personajes base/Slots/**Mecánicas** cableada a rutas existentes de `gameSystems.js`), Personajes Base (grid con glifo/barras/chips, editor, adoptar), Personajes (vista DM vs jugador).
- Única corrección del implementer en esta pasada: 1 línea en `App.jsx` (`onNavigate={setPage}` a `AttributesPage`) que arreglaba un enlace huérfano "Gestionar en Personajes Base".
- **Verificación (reproducida por el reviewer en Docker):** backend lint exit 0, backend 116 pass/0 fail/1 skip (preexistente F14), `docker compose build frontend --no-cache` exit 0 (lint+build), frontend vitest 54/54. Scope limpio (16 archivos del commit + App.jsx), cableado end-to-end verificado, cero anti-patrones (sin inline, sin `window.innerWidth`, sin clases Tailwind interpoladas), better-sqlite3 síncrono, `session_events` append-only.
- Nota no bloqueante para el founder: no se añadió botón "adoptar" en la tarjeta de `BaseCharactersPage` (el flujo de adopción ya vive en `CharactersPage`); queda como posible atajo futuro.
- Próxima: F16-npcs (backend ~90% ya presente; trabajo cargado al frontend).

## 2026-07-20 — F16-npcs (DONE)

Gestor de NPCs completo. Sesión autónoma del líder. Implementer → Reviewer APROBADO.

- **Backend ya estaba ~90%** (scout `scout_F16-npcs.md`): CRUD `/api/npcs` + sub-recursos `/quests`, `/inventory`, `/campaigns` (`npc_campaign_links`) con ownership por dm_id, montado, 4 tablas en schema, e integración en `PlanningPanel` (selector de NPCs). El implementer NO reescribió nada de eso.
- **Añadido:** columna `disposition` (`ally`/`neutral`/`hostile`, default `neutral`) en `npcs` — migración idempotente `M001_npcs_disposition` (guard con PRAGMA + `_migrations`) + baseline en `schema.sql` + reflejada en POST/PUT. Resuelve la pregunta abierta (disposición no existía; el mockup la exige).
- **Frontend:** `NpcsPage.jsx` deja de ser placeholder → maestro-detalle real (lista con filtro por sistema + crear; detalle con tabs Información/Quests/Inventario/Campañas), tarjetas con **glifo-inicial (NO emoji)** y badge de disposición con color (clases literales). Métodos nuevos en `api.js` (updateNpc + sub-recursos + asociar/desasociar campañas). Estilo con tokens del handoff + `Icon.jsx`.
- **Tests:** `backend/src/routes/npcs.test.js` nuevo (10/10). Verificación reviewer en Docker: backend lint exit 0, 126 pass/1 skip; frontend build `--no-cache` exit 0; vitest 58/58; migración confirmada con `PRAGMA table_info(npcs)`.
- Brechas no bloqueantes: no hay edición individual de quest/objeto (backend solo crea/borra; F16 no lo pide); `avatar_icon` se conserva en el modelo (lo usa PlanningPanel) pero la UI usa la inicial.
- Próxima: F17-prep-redesign (backend completo; trabajo frontend: rail 62px + panel 266px + vistas Lista/Grafo).

## 2026-07-20 — F17-prep-redesign (DONE)

Rediseño de "Preparar Sesión". Sesión autónoma del líder. Implementer → Reviewer APROBADO.

- **Backend ya estaba completo** (scout `scout_F17-prep.md`): CRUD preps/ubicaciones/sub/eventos/enlaces con etiqueta. Sin endpoints nuevos. Solo se añadieron `updateLocation`/`updateSubLocation` a `api.js` (PUT ya existía) para rename inline; reorder de eventos por **swap de `order_index`** con el PUT existente.
- **Frontend (todo el trabajo):** `PrepPage.jsx` reconstruida full-bleed con **rail 62px propio** (decisión del líder, no colapsar sidebar) + panel de ubicaciones 266px (árbol colapsable, badges de conteo, inset terracota, "Sin ubicación" punteada, crear/rename inline) + toolbar 60px (breadcrumb, contador, **toggle Lista/Grafo**, +Evento).
- **Vista Lista**: tarjetas con barra de categoría 4px, badge pill, etiqueta de enlace, acciones hover (subir/bajar/editar/eliminar), estado vacío punteado.
- **Vista Grafo**: `EventFlowGraph` **extendido de forma retrocompatible** (preserva prop `compact` que usa PlanningPanel en la sesión): aristas **Bézier**, zoom +/-/reset (0.6–1.5), fondo de puntos, aristas por tipo (sólida gris misma-ubicación / punteada terracota con etiqueta = enlace narrativo), borde de categoría en nodo seleccionado, leyenda sticky.
- 8 categorías v1 → 4 colores `cat.*` con listas de clases literales + índice estable. Migrados tokens v0→handoff y emojis→`Icon.jsx`. Eliminados `EventTemplatePanel.jsx` y `SessionPrepPanel.jsx` (provisionales, sin importadores).
- **Juicios del reviewer (ambos ACEPTADOS):** los 3 `style={{}}` son geometría dinámica (no decorativos); el borrado de provisionales no dejó imports colgando ni rompió la sesión en vivo.
- **Verificación (reviewer, Docker):** lint exit 0, backend 126 pass/1 skip, frontend build exit 0, vitest 62/62.
- 3 lecciones nuevas en LEARNINGS (Frontend). Brechas no bloqueantes: drag de nodos efímero (como el mockup); sin botón "crear rama" en vista Lista (no está en el handoff; ramas existentes respetadas).
- Próxima: F18-session-live (sesión en vivo completa: notas, tabs por personaje, toolbar, **presets de IA**). Ya scouteada (`scout_F18-live.md`).

## 2026-07-20 — F18-session-live (DONE)

Sesión en vivo completa + presets de IA. Sesión autónoma del líder. Implementer → Reviewer APROBADO. **La feature más grande; núcleo de "la IA para todo".**

- **Mayormente reutilización** (scout): `CharacterSheet` ya tenía los 5 tabs; `AIPanel` ya tenía streaming/citas/follow-ups; el modal de evento NPC ya vivía en PlanningPanel; `characters:updated` ya se emitía. El implementer ENVOLVIÓ, no reescribió.
- **(1) Notas:** `routes/notes.js` como **factory `createNotesRouter(io)`** (CRUD sobre `session_notes`, visibilidad por rol: privadas solo DM), `NotesPanel` con sync socket. **Privacidad verificada en vivo por el reviewer:** jugador NO recibe notas privadas ni sus bodies (REST filtra por rol; `notes:updated` emite solo `{sessionId}`, sin bodies; POST/PUT no-DM → 403). 7 tests.
- **(2) IA backend (compone sobre F9–F12):** `streamSessionPreset` + `SESSION_PRESETS` sobre datos estructurados; `sectionType` propagado en `ai:ask`/`streamRulesQuestion` (habilita topics de sistema); `GET /campaigns/:id/summaries` (incluir sesiones anteriores). 9 tests con stubs deterministas; degradación elegante.
- **(3) AIPanel v2:** modos Sesión/Sistema; presets (Resumen/Cronología/Estado de personajes/Inventarios/Pregunta libre); topics de sistema; checkbox incluir-sesiones-anteriores. **Streaming/citas/follow-ups/regenerar/degradación preservados** (verificado por el reviewer con Ollama off: 503 limpio).
- **(4) Toolbar DM:** Cambiar mapa/Nuevo Evento/Evento NPC (catálogo F16)/Reset/Finalizar; jugador: Salir. Sin romper el canvas tldraw.
- **(5) Tabs personaje:** `StatusTab` editable (dot-tracker HP/voluntad, máx+actual); la ficha reacciona a `characters:updated`.
- **(6) Restyle:** SessionView + 4 paneles (Notas, AIPanel, CharacterSheet, PlanningPanel) + SessionCharactersPanel/ConnectedUsers a tokens del handoff + `Icon.jsx`. Cero emojis.
- Migración `M002` idempotente. **Verificación (reviewer, Docker):** lint exit 0, backend 141 pass/1 skip, frontend build `--no-cache` exit 0, vitest 68/68. `session_events` intacto (append-only), `EventFlowGraph` sin tocar.
- Deuda no bloqueante: `ChatPanel`/`CanvasBoard`/`SessionStatsPanel` aún con tokens v0 + emojis (terminar antes de eliminar alias v0); 2 exports muertos (`listCampaignSummaries`, `categoryClasses`).
- Próxima: F19-history-detail (última; ~85% composición según scout, backend 100% listo).

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

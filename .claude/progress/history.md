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

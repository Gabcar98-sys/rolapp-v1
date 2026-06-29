# Revisión: F1-schema (schema consolidado)
Fecha: 2026-06-29
Veredicto: APROBADO

## Checklist CHECKPOINTS.md
- [x] Build pasa (docker compose --build de backend y frontend: OK)
- [x] Arranque sin errores SQL (logs limpios)
- [x] better-sqlite3 usado de forma síncrona (`db.exec`/`db.prepare(...).get()`, sin async/await sobre métodos de db)
- [x] Prepared statements donde hay queries (`_migrations` usa `db.prepare`)
- [x] session_events tratado como append-only (sin triggers de UPDATE/DELETE, sin columnas de edición)
- [x] Nombres descriptivos en inglés; snake_case en columnas/tablas
- [x] Respeta estructura de archivos declarada (`backend/src/db/schema.sql`, `backend/src/db/index.js`)
- [x] Cambio de esquema documentado (reporte del implementer presente y detallado)
- [x] Reporte del implementer escrito (`.claude/progress/impl_F1-schema.md`)
- [x] Reporte del reviewer escrito (este archivo)
- [x] Lección técnica no trivial propuesta (vec0 fuera de schema.sql; FKs hacia adelante)
- [N/A] lint backend: no hay script de lint ejecutable sin Node local; verificación canónica vía Docker (coherente con LEARNINGS "Node local es opcional")
- [N/A] Tests: F1 es DDL puro, sin funciones/módulos JS nuevos con lógica testeable. Justificado en el reporte.
- [N/A] Frontend (estilos inline / window.innerWidth): F1 no toca frontend.

## Resultado de verificación
- Build (docker compose up -d --build backend frontend): ✅
- Health (`curl http://localhost:3000/api/health`): ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`
- Logs backend: ✅ `sqlite-vec cargado (versión v0.1.9)` + `RolApp backend escuchando en :3001` — sin errores SQL.
- Tablas aplicadas (en contenedor): ✅ 49 tablas de aplicación + `_migrations` + `sqlite_sequence` + `vec_chunks` y sus 4 tablas sombra de vec0 (`vec_chunks_info`, `vec_chunks_chunks`, `vec_chunks_rowids`, `vec_chunks_vector_chunks00`). Total 55 en sqlite_master.

### Verificaciones puntuales contra el contrato de F1
- Legacy excluidas: ✅ `campaign_attribute_definitions` y `character_attribute_values` AUSENTES en sqlite_master (solo aparecen como comentario explicativo en schema.sql).
- Sin seeds de juego: ✅ cero `INSERT INTO`; "Stormlight/Dragonbane/Bridge Nine" solo en comentario de cabecera.
- `attribute_templates`: ✅ `is_core`, `has_max`, `formula` presentes.
- `character_skill_links`: ✅ `rank` presente.
- `event_templates`: ✅ `prep_id`, `sub_location_id`, `parent_event_id`, `branch_label`, `order_index` presentes.
- `campaigns.game_system_id`: ✅ presente (FK ON DELETE SET NULL a game_system_templates).
- `npcs.game_system_id`: ✅ presente (FK ON DELETE SET NULL).
- `character_template_attr_values.max_value`: ✅ presente (TEXT DEFAULT NULL).
- `character_skills.skill_list`: ✅ presente.
- `characters` sin `session_id`: ✅ confirmado (PRAGMA table_info no lo incluye; conserva user_id, name, game_system_template_id, created_at). Desacople correcto vs v0, que sí tenía `session_id`.
- RAG: ✅ `game_docs` y `doc_chunks` en schema.sql; `vec_chunks` creada en index.js (no en schema.sql) con `CREATE VIRTUAL TABLE IF NOT EXISTS ... vec0(... FLOAT[768])`, idempotente, en try/catch que degrada `vecEnabled` a false sin romper el arranque.

### Convenciones
- snake_case: ✅ en todas las tablas/columnas.
- timestamps: ✅ `created_at`/`updated_at`/`joined_at`/`generated_at`/`ran_at` como INTEGER con DEFAULT (unixepoch()).
- FKs con ON DELETE: ✅ CASCADE donde el hijo no tiene sentido sin el padre; SET NULL en vínculos opcionales (game_system_id); ON DELETE omitido en algunas FKs "duras" (p.ej. session_events→sessions, messages→users), consistente con el patrón de la v0.
- CREATE TABLE IF NOT EXISTS: ✅ en todas.
- session_events append-only: ✅ sin triggers ni columnas de mutación.
- better-sqlite3 síncrono: ✅ index.js no usa async/await sobre db (el único `await` es `import('sqlite-vec')`, dynamic import legítimo, no una operación de db).

## Lecciones aplicadas correctamente
- "better-sqlite3 es síncrono": ✅ aplicada — `vec_chunks` vía `db.exec` síncrono.
- "El proyecto corre con Docker; Node local es opcional": ✅ aplicada — verificación íntegra vía contenedores.
- "session_events es append-only": ✅ aplicada — tabla definida como log puro.

## Observaciones (no bloqueantes)
1. El comentario de cabecera de schema.sql dice "31 migraciones", mientras que el reporte del implementer y el contexto de la feature mencionan estructura consolidada de la v0; no afecta el resultado (puramente documental), pero conviene que el conteo sea consistente con el changelog real de la v0.
2. `doc_chunks.game_system_id` es INTEGER plano sin FK (decisión documentada y solicitada en F1 para scoping rápido). Aceptable, pero deja la integridad referencial de ese campo a cargo de la capa de aplicación; vale anotarlo para F6 (RAG).
3. No existe script de lint backend ejecutable en el flujo Docker actual; el checklist asume `npm run lint`. Para features con lógica JS futura conviene exponer un target de lint dentro del contenedor.

## Candidatos para LEARNINGS.md
- **(RAG / sqlite-vec)** La tabla virtual `vec0` no puede vivir en `schema.sql`: solo existe tras `sqliteVec.load(db)`. Patrón: aplicar `schema.sql` primero y luego crear `vec_chunks` con `CREATE VIRTUAL TABLE IF NOT EXISTS` dentro de try/catch que degrade `vecEnabled` sin romper el arranque. vec0 genera 4 tablas sombra (`vec_chunks_*`) que aparecen en `sqlite_master`; no contarlas como tablas de aplicación. (Validado: 49 app + vec_chunks + 4 sombra + _migrations + sqlite_sequence = 55.)
- **(Base de datos / SQLite)** En un único `db.exec` con varios CREATE TABLE, SQLite tolera FKs hacia tablas declaradas más abajo en el mismo lote; el orden de bloques puede priorizar legibilidad sobre dependencia.
- **(Proceso)** Al consolidar un schema de N migraciones, verificar columnas migradas con `PRAGMA table_info` en el contenedor (no solo leer el .sql) es la forma fiable de confirmar que cada columna añadida por migración quedó en el baseline.

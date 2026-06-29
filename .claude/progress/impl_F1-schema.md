# Implementación: F1-schema (schema consolidado)
Fecha: 2026-06-29
Status: completado

## Archivos creados
- Ninguno (los archivos destino ya existían desde F0).

## Archivos modificados
- `backend/src/db/schema.sql`: reemplazado el schema mínimo de F0 (solo `users`) por el
  schema consolidado completo de la v1.0. Reúne en un solo archivo, organizado por
  bloques, toda la ESTRUCTURA que en la v0 estaba dispersa en `schema.sql` + 31
  migraciones. 49 tablas de aplicación con `CREATE TABLE IF NOT EXISTS`, cada bloque
  con encabezado comentado. Columnas añadidas por migraciones de la v0 ya aplicadas
  directamente en cada CREATE TABLE.
- `backend/src/db/index.js`: tras aplicar `schema.sql` y solo si `vecEnabled`, se crea
  de forma idempotente la tabla virtual `vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY,
  embedding FLOAT[768])`. Envuelto en try/catch: si falla, degrada `vecEnabled` a false
  y no rompe el arranque.

## Tests escritos
- Ninguno. F1 es solo definición de esquema (DDL); no hay funciones/módulos JS nuevos
  con lógica testeable. La verificación es de aplicación del esquema (ver abajo).

## Resultado de verificación
- Build backend (docker compose --build): ✅
- Arranque backend: ✅ — `{"status":"ok","vecEnabled":true,"version":"1.0.0"}` vía proxy :3000
- Logs sin errores SQL: ✅ — `sqlite-vec cargado (versión v0.1.9)` + `escuchando en :3001`
- Aplicación del esquema verificada en el contenedor:
  - 49 tablas de aplicación creadas (+ `_migrations`, `vec_chunks` y sus 4 tablas
    sombra internas de vec0).
  - `vec_chunks` virtual presente.
  - Tablas legacy `campaign_attribute_definitions` y `character_attribute_values`:
    ausentes (excluidas correctamente).
  - `event_templates` con jerarquía completa: `prep_id, sub_location_id,
    parent_event_id, branch_label, order_index`.
  - `characters` sin `session_id`; conserva `user_id, name,
    game_system_template_id, created_at`.

## Decisiones tomadas
- **Orden de bloques y FKs hacia adelante.** SQLite permite definir FKs a tablas que aún
  no existen dentro del mismo `db.exec`, así que el orden de bloques es por legibilidad
  (identidad/sesión → game systems → personajes → planificación → post-sesión → RAG).
  `campaigns.game_system_id` referencia `game_system_templates`, `sessions.prep_id`
  referencia `session_preps` y `session_characters.character_id` referencia `characters`,
  todas declaradas más abajo; verificado que el esquema aplica sin error.
- **`game_docs`/`doc_chunks` con columnas TEXT nullable** según la especificación de F1
  (sin `NOT NULL` salvo `doc_chunks.chunk_text`), y `doc_chunks.game_system_id` como
  INTEGER plano sin FK (tal como se pidió; permite scoping rápido sin acoplar el borrado).
- **No se portó `rag_chunks`** de la v0 (M033): era el diseño viejo de RAG (embedding en
  TEXT). La v1.0 usa `game_docs` + `doc_chunks` + `vec_chunks` (sqlite-vec). Coherente con
  §5 del plan.
- **Se incluyeron `character_templates` y `character_template_values`** (presets de
  atributos por sistema) que estaban en el `schema.sql` de la v0 y en el checklist de F1,
  aunque no aparecen explícitas en la lista resumida de §4 del plan.
- No se instalaron dependencias nuevas (`sqlite-vec` ya estaba en F0).

## Lecciones aplicadas
- "better-sqlite3 es síncrono": el bloque nuevo de `vec_chunks` usa `db.exec(...)` síncrono,
  sin async/await.
- "El proyecto corre con Docker; Node local es opcional": toda la verificación se hizo con
  `docker compose up -d --build` y `curl` al proxy del frontend (:3000), sin Node en host.
- "session_events es append-only": la tabla se definió sin disparadores ni columnas de
  edición; queda como log puro de INSERT.

## Candidatos para LEARNINGS.md
- **(RAG / sqlite-vec)** La tabla virtual `vec0` no puede vivir en `schema.sql` porque solo
  existe tras `sqliteVec.load(db)`. Patrón: aplicar `schema.sql` primero, luego crear
  `vec_chunks` con `CREATE VIRTUAL TABLE IF NOT EXISTS` dentro de un try/catch que degrade
  `vecEnabled` sin romper el arranque. Crea además 4 tablas sombra (`vec_chunks_*`) que
  aparecen en `sqlite_master`; no contarlas como tablas de aplicación.
- **(Base de datos / SQLite)** En un único `db.exec` con varios CREATE TABLE, SQLite tolera
  FKs hacia tablas declaradas más abajo en el mismo lote; el orden de bloques puede ser por
  legibilidad y no por dependencia.

## Bloqueantes
Ninguno.

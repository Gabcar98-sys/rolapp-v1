# Implementación: F6 — RAG / IA

Fecha: 2026-06-30
Status: completado

## Archivos creados

### Backend
- `backend/src/services/embeddings.js`: proveedor de embeddings INYECTABLE. Default Ollama (`nomic-embed-text`, 768 dims, `OLLAMA_BASE_URL`); opción API (`EMBED_PROVIDER=api`, formato OpenAI). Exporta `embedTexts(texts[])`, `embedText(text)`, `setEmbeddingProvider(fn)` (para stub en tests) y `EMBEDDING_DIMS`. Valida la dimensión de cada vector y normaliza fallos de red a un mensaje claro.
- `backend/src/services/rag.js`: núcleo RAG.
  - Ingesta: `ingestDoc({gameSystemId,title,content,docId?})` — chunkea Markdown respetando jerarquía de headings, embebe y persiste en `doc_chunks` + `vec_chunks` + `doc_chunks_fts` de forma atómica. Idempotente por `content_hash` (FNV-1a). `reindexDoc(docId)` re-embebe los chunks en sitio. `deleteDoc`, `listDocs`.
  - Chunking: `chunkMarkdown(md)` (exportado para test), `estimateTokens`, `contentHash`, `classifySection` (heurística regla/lore/tabla/general).
  - Retrieval híbrido: `hybridSearch({query,gameSystemId,k})` — vector KNN (sqlite-vec) + keyword (FTS5/BM25) fusionados con RRF (K=60). Filtra por `game_system_id`; devuelve chunks con `heading_path`, `doc_title`, `section_type` y `score`.
- `backend/src/services/ai.js`: cliente LLM INYECTABLE (Ollama default, API opción; `AI_PROVIDER`). `setLlmClient(fn)` para tests. Helpers tipo-tool (`retrieveRules`, `getSessionState`, `getEventHistory`) que ensamblan CONTEXTO ESTRUCTURADO (reglas citadas + estado de personajes + historial de eventos). Funciones públicas: `answerRulesQuestion`, `summarizeSession` (guarda en `session_summaries`), `getSessionSummary`, `assistPlanning`.
- `backend/src/routes/rag.js`: factory `createRagRouter(io)`. Endpoints: docs CRUD/reindex bajo `/game-systems/:id/docs`, `POST /rag/search`, `POST /ai/ask`, `POST /ai/assist-planning`, `GET/POST /sessions/:id/summary` (emite `session:summary_ready` por socket). Helper `fail()` mapea errores a 503 (proveedor caído) / 422 (validación) / 404 / 500.
- `backend/src/services/rag.test.js`: pipeline completo con stub de embeddings determinista (sin red).
- `backend/src/services/ai.test.js`: `answerRulesQuestion`/`summarizeSession`/`getSessionState` con stub de LLM + embeddings.

### Frontend
- `frontend/src/components/AI/AIPanel.jsx`: panel de IA en sesión (tab 🤖). Preguntar reglas con citas a `heading_path`/`doc_title`, generar/ver resumen (DM), aviso si la IA está caída. Deriva el `game_system_id` de los personajes vinculados a la sesión.

## Archivos modificados

- `backend/src/db/index.js`: crea la tabla virtual FTS5 `doc_chunks_fts` (idempotente, junto a `vec_chunks`) y exporta `ftsEnabled`. FTS es independiente de sqlite-vec (keyword search funciona aunque el vectorial esté off).
- `backend/src/index.js`: importa y monta `createRagRouter(io)` en `/api` (rutas absolutas porque cruzan varios dominios: game-systems, rag, ai, sessions).
- `frontend/src/lib/api.js`: endpoints `listDocs`, `ingestDoc`, `reindexDoc`, `deleteDoc`, `ragSearch`, `aiAsk`, `getSessionSummary`, `generateSessionSummary`.
- `frontend/src/pages/SessionView.jsx`: tab 🤖 cableado que renderiza `<AIPanel>`.
- `frontend/src/components/DMMaster/GameSystemPanel.jsx`: nueva tab "Documentos" con sub-componente `DocsEditor` (añadir/listar/eliminar/reindexar docs `.md`, muestra nº de chunks y si el índice vectorial está activo). Accesible desde Lobby → "Sistemas de juego".

## Tests escritos
- `rag.test.js` (8 casos): chunking respeta headings y produce `heading_path`; ingesta puebla doc_chunks/vec_chunks/FTS; `hybridSearch` (vector+FTS+RRF) devuelve el chunk esperado y cita su heading_path; filtro por game_system_id; idempotencia por content_hash (no duplica); reingesta de contenido distinto reemplaza chunks; contrato de degradación.
- `ai.test.js` (5 casos): respuesta con citas y prompt con contexto estructurado; persistencia del resumen en `session_summaries`; estado estructurado de personajes; error claro si la sesión no existe.

## Resultado de verificación (Docker, canónico)
- lint backend (`docker compose exec backend npm run lint`): ✅ 0 errores
- test backend (`docker compose exec backend npm test`): ✅ 44 pasando, 1 skip intencional (rama de degradación dura: en este entorno vec+FTS están activos)
- build + lint frontend (`docker compose build frontend`): ✅ OK
- health (`/api/health`): ✅ `vecEnabled:true`
- Manual / degradación (Ollama apagado, default): ✅ `POST /docs`, `/rag/search`, `/ai/ask` devuelven **503** con mensaje claro (no 500 opaco); ingesta fallida NO deja `game_docs` huérfano; validación → **422**.

### Qué se probó con stub vs qué requeriría Ollama
- **Con stub (sin red):** todo el pipeline RAG e IA — chunking, ingesta, vec_chunks/FTS, RRF, retrieval citado, ensamblado de contexto, persistencia del resumen.
- **Requiere Ollama (`docker compose --profile ai up` + `ollama pull nomic-embed-text`):** embeddings reales y generación LLM end-to-end. Se validó que su ausencia degrada con 503, no que la respuesta del modelo sea correcta.

## Lecciones aplicadas
- "La tabla virtual vec0 no puede vivir en schema.sql" → `doc_chunks_fts` (FTS5, también virtual) se crea en `db/index.js`, no en schema.sql, en try/catch que degrada `ftsEnabled` sin romper el arranque.
- "better-sqlite3 es síncrono" → toda la DB es síncrona; el único async es la llamada de red de embeddings/LLM.
- "Routers que emiten por socket → factory createXRouter(io)" → `createRagRouter(io)` para el `session:summary_ready`.
- "Una feature de frontend no está terminada hasta que esté cableada" → AIPanel montado en tab de SessionView; DocsEditor montado en tab de GameSystemPanel (alcanzable desde Lobby). Sin huérfanos.
- "No declarar checkpoint en verde sin ejecutarlo en Docker" → lint/test/build corridos en contenedor.
- ":memory: no siempre carga vec0" → los tests usan archivo temporal (`mkdtempSync`), no `:memory:`.

## Decisiones tomadas
- **Chunking:** parse línea a línea manteniendo una pila de headings (H1>H2>H3...); cada sección (cuerpo bajo un heading) se parte por tamaño objetivo ~400 tokens (tope 500) con solape ~60 tokens, cortando en frontera de palabra. Heurística de tokens = chars/4 (no se tokeniza de verdad; suficiente para acotar tamaño). `heading_path` = headings unidos por " > "; `section_type` por heurística simple (≥2 filas de tabla markdown → tabla; keywords regla/lore; si no, general).
- **RRF:** `score = Σ 1/(K + rank)`, K=60. Se eligió RRF sobre normalizar distancia-coseno vs BM25 porque fusiona rankings de escalas heterogéneas sin calibración. Cada fuente recupera `k*4` candidatos antes de fusionar.
- **Inyección del proveedor:** `embeddings.js` y `ai.js` exponen un provider/cliente mutable a nivel de módulo (`setEmbeddingProvider`/`setLlmClient`); por defecto resuelven Ollama o API según env. Los tests inyectan un stub determinista (hash de palabras → vector 768d normalizado) y así prueban todo el pipeline sin red.
- **vec0 exige BigInt en la PK** (ver candidato a LEARNINGS): los inserts/deletes en `vec_chunks` pasan `BigInt(chunkId)`; los ids que vec0 devuelve se normalizan a `Number` para que coincidan con las claves de la búsqueda por keyword en el mapa de RRF.
- **reindexDoc re-embebe en sitio** (no re-chunkea): el contenido original no se guarda en DB y el texto plano de los chunks no permite reconstruir la jerarquía de headings. Reindex refresca solo los vectores, preservando estructura.
- **game_system_id en el frontend:** la sesión no lo lleva directo; el AIPanel lo deriva de los personajes vinculados (cada `character` tiene `game_system_template_id`), con selector si hay más de uno.
- **Orden de ingesta:** embeddings ANTES de tocar la DB para que un Ollama caído no deje una fila `game_docs` huérfana sin chunks.
- Sin dependencias npm nuevas (sqlite-vec ya estaba; FTS5 viene en el SQLite de better-sqlite3).

## Candidatos para LEARNINGS.md
- **vec0 (sqlite-vec) exige la PK como BigInt al INSERT/DELETE.** Categoría RAG/sqlite-vec. Contexto: F6, al poblar `vec_chunks`. Pasar `lastInsertRowid` como Number lanza `"Only integers are allowed for primary key values on vec_chunks"` (mensaje engañoso). Hay que pasar `BigInt(id)` en INSERT/DELETE sobre `vec_chunks`; y normalizar a `Number` los ids que vec0 devuelve en `MATCH` para que casen con otras fuentes (FTS). Por qué importa: bloquea toda la ingesta vectorial con un error que no apunta al problema real.
- **FTS5 idempotente y sincronizado fuera de schema.sql.** Categoría RAG. `doc_chunks_fts USING fts5(..., content='doc_chunks', content_rowid='id')` se crea en `db/index.js`; las filas se mantienen con el mismo rowid que `doc_chunks.id`, y el borrado usa el comando `'delete'` de FTS5 contentless-external. Independiente de sqlite-vec, así el keyword-search sobrevive aunque el vectorial esté off.
- **Normalizar fallos de red de proveedores de IA a mensajes claros.** Categoría Backend/IA. `fetch failed`/`ECONNREFUSED` deben envolverse en el servicio para que el router responda 503 (proveedor no disponible) en lugar de un 500 opaco; y el trabajo con red debe ir antes de mutar la DB para no dejar filas huérfanas.

## Bloqueantes
Ninguno.

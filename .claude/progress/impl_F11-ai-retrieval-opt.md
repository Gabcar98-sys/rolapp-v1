# Implementación: F11 — Optimización de retrieval + contexto (RAG)
Fecha: 2026-07-01
Status: completado

## Resumen
Optimización del pipeline RAG existente (F6/F9/F10) sin romper el contrato `{answer, sources}`
ni tocar el frontend. Todo verificable con el stub determinista de embeddings (sin Ollama).
better-sqlite3 síncrono; prepared statements; queries vec/FTS parametrizadas; degradación
elegante a solo-FTS cuando no hay embeddings.

## Archivos creados
- `backend/src/services/rag.eval.test.js`: eval anti-regresión. Corpus determinista (8 secciones
  con vocabulario distintivo) + 8 queries con chunk esperado. Mide **hit-rate@3** (umbral 0.8) y
  **hit-rate@1** (umbral 0.5). Falla si el retrieval regresa por debajo del umbral.
- `backend/src/services/rag.f11.test.js`: tests de las optimizaciones — chunking (no parte tablas,
  conserva heading_path en secciones largas), fusión con pesos configurables (orden + score),
  dedup por heading_path, MMR mantiene relevancia, presupuesto de tokens (recorta y respeta límite),
  caché de queries (cuenta llamadas al provider), filtro por section_type.

## Archivos modificados
- `backend/src/services/rag.js`:
  - **Chunking afinado (§1):** tamaño objetivo/tope/solape ahora configurables por env
    (`RAG_CHUNK_TARGET_TOKENS` / `RAG_CHUNK_MAX_TOKENS` / `RAG_CHUNK_OVERLAP_TOKENS`). Nuevo
    `toBlocks()` que agrupa líneas de tabla Markdown en un bloque atómico → **nunca parte una
    tabla a la mitad**. `splitWithOverlap()` reescrito para empaquetar bloques (párrafos/tablas)
    hasta el objetivo con solape por cola; fallback `splitByWords()` solo para párrafos gigantes.
    Los headings ya se separaban antes (no se parten). Conserva `heading_path`/`section_type`.
    Reingesta idempotente por `content_hash` intacta.
  - **Fusión híbrida mejorada (§2):** normaliza distancia vectorial→similitud `1/(1+distance)` y
    BM25→[0,1] por min-max invertido; combina con **RRF ponderado + término de scores
    normalizados**. Pesos `RAG_VECTOR_WEIGHT`/`RAG_KEYWORD_WEIGHT` leídos **por llamada** (no como
    constantes de módulo) para que env/tests afecten el orden sin reimportar el singleton `db`.
  - **MMR + dedup (§3-4):** `mmrRerank()` (relevancia normalizada vs redundancia léxica Jaccard)
    con `RAG_MMR_LAMBDA` (default 0.3). Dedup por `heading_path` (colapsa varios trozos del mismo
    encabezado quedándose con el de mayor score). Se recupera un pool ancho (`max(k*4,20)`) para
    dar material a dedup/MMR.
  - **Filtros (§4):** `hybridSearch` acepta `sectionType` y `docId`; filtrado coherente en JS tras
    recuperar de vec0 (que no filtra por metadato) y en la query FTS.
  - **Caché de queries (§6):** `hybridSearch` usa `embedQueryCached` en vez de `embedText`.
- `backend/src/services/embeddings.js`:
  - **Caché LRU de embeddings de queries (§6):** `embedQueryCached()` + `clearQueryCache()`. Map en
    memoria (orden de inserción = LRU), tope `RAG_QUERY_CACHE_SIZE` (default 256). Normaliza la key
    (trim/lowercase/espacios) para que variaciones triviales compartan entrada. Un hit NO recomputa.
- `backend/src/services/ai.js`:
  - **Empaquetado por presupuesto de tokens (§5):** `packWithinBudget()` mete los mejores chunks
    (ya ordenados por relevancia) hasta `RAG_CONTEXT_TOKEN_BUDGET` (default 1500, estimación
    chars/4), garantizando ≥1 chunk. `retrieveRules` recupera `RAG_RETRIEVE_K` (default 8) y luego
    empaqueta; **solo los chunks empaquetados llegan al prompt y se reportan como `sources`**.
    Contrato `{answer, sources, citations}` sin cambios.
- `backend/src/routes/rag.js`:
  - `POST /api/rag/search` acepta opcionalmente `section_type` y `doc_id` y los pasa a `hybridSearch`.
- `.env.example`: documenta las 8 envs nuevas (sección "Retrieval / RAG tuning (F11)").

## Fórmula de fusión (documentada en rag.js)
Para cada chunk presente en alguna lista:
```
fused = W_vec * RRF(rank_vec) + W_kw * RRF(rank_kw)
      + NORM_BLEND * (W_vec * sim_vec + W_kw * bm25_norm)
```
con `RRF(rank)=1/(60+rank)`, `sim_vec=1/(1+distance)` (L2→similitud),
`bm25_norm = 1-(score-min)/(max-min)` (BM25 min-max invertido; menor=mejor→1=mejor),
`NORM_BLEND=0.25`. El RRF domina el orden (robusto a escalas heterogéneas); el término de scores
normalizados desempata con la magnitud real. `W_vec`/`W_kw` = `RAG_VECTOR_WEIGHT`/`RAG_KEYWORD_WEIGHT`.
MMR: selecciona iterativamente `argmax (1-λ)*rel_norm − λ*max_jaccard(con seleccionados)`.

## Envs nuevas (todas con default sensato)
| Env | Default | Qué controla |
|-----|---------|--------------|
| RAG_CHUNK_TARGET_TOKENS | 400 | tamaño objetivo del chunk (~chars/4) |
| RAG_CHUNK_MAX_TOKENS | 500 | tope duro por chunk |
| RAG_CHUNK_OVERLAP_TOKENS | 60 | solape entre chunks contiguos |
| RAG_VECTOR_WEIGHT | 1 | peso de la señal vectorial en la fusión |
| RAG_KEYWORD_WEIGHT | 1 | peso de la señal BM25 en la fusión |
| RAG_MMR_LAMBDA | 0.3 | anti-redundancia MMR (0=solo relevancia, 1=solo diversidad) |
| RAG_RETRIEVE_K | 8 | chunks recuperados antes de empaquetar por presupuesto |
| RAG_CONTEXT_TOKEN_BUDGET | 1500 | presupuesto de tokens del contexto al LLM |
| RAG_QUERY_CACHE_SIZE | 256 | tamaño máx. de la caché LRU de embeddings de queries |

## Resultado de verificación (Docker canónico, SIN --profile ai)
- `docker compose up -d --build backend`: ✅
- `docker compose exec backend npm run lint`: ✅ 0 errores
- `docker compose exec backend npm test`: ✅ **93 tests, 92 pass, 0 fail, 1 skip** (el skip es
  pre-existente en rag.test.js: la degradación dura vec+FTS-off no aplica con ambos activos)
- `docker compose build frontend`: ✅ (lint + build en su stage)
- `curl /api/health`: ✅ `{"status":"ok","vecEnabled":true,"ftsEnabled":true,...}`
- Sanity sin Ollama: ingesta `resilient` → `embedded=false`, y `hybridSearch` por keyword devuelve
  el chunk correcto (ruta degradada a solo-FTS funciona). No quedó `node_modules` residual en host.

## Resultados del eval (hit-rate)
- **hit-rate@3 = 100% (8/8)**, umbral 0.8 → holgado.
- **hit-rate@1 = 100% (8/8)** en el corpus del eval, umbral 0.5.
El eval falla automáticamente si una futura optimización deja el hit-rate@3 por debajo de 0.8.

## Decisiones tomadas
- **MMR/redundancia por similitud léxica (Jaccard de tokens)** en vez de leer los vectores de vec0.
  Deserializar el blob de vec0 es frágil (y no está documentado); Jaccard funciona también en la
  ruta degradada solo-FTS y es determinista. Es un "re-rank ligero" válido según la consigna.
- **Pesos leídos por llamada** (funciones `vectorWeight()`/`keywordWeight()`/`mmrLambda()`) en vez de
  constantes de módulo, para que sean testeables sin reimportar `db` (singleton). El chunking sí usa
  constantes de módulo (se fijan al arrancar; reingesta re-chunkea con la config vigente).
- **Fusión = RRF (dominante) + pequeño término de scores normalizados (NORM_BLEND=0.25)** en vez de
  RRF puro o normalización pura: RRF da robustez a escalas heterogéneas; el término normalizado
  desempata con la magnitud real de similitud/BM25. Documentado en código.
- Test de pesos: en vez de forzar un "flip" de orden (frágil con el stub, porque BM25 y el stub
  vectorial tienden a coincidir cuando un chunk casa más términos), se verifica que (a) sumar una
  señal sube el score respecto a desactivarla y (b) escalar el peso aumenta la contribución. Es una
  prueba fiel y no-flaky de que los pesos entran en la fórmula.
- Sin dependencias nuevas (`npm install` = ninguno).

## Candidatos para LEARNINGS.md
- **Retrieval híbrido: usar señal léxica (Jaccard), no vectorial, para MMR/dedup.** Leer embeddings
  de vec0 para similitud pairwise es frágil de deserializar y no funciona en la ruta degradada
  (solo-FTS, sin vectores). Jaccard sobre tokens es determinista, barato y funciona siempre.
- **Config que un test debe variar → leerla por llamada, no como constante de módulo.** Los tests de
  backend comparten el singleton `db` (DB_PATH fijado antes del primer import); reimportar un módulo
  para releer una constante de `process.env` no reinicia `db`. Exponer la config vía función
  (`vectorWeight()`) permite testear su efecto sin trucos de reimport.
- **Tests de ranking con stub determinista: evitar aserciones de "flip" de orden.** El stub de
  embeddings y BM25 suelen coincidir (ambos premian solape de términos), así que forzar que el
  top-1 cambie es frágil. Verificar el mecanismo (el score responde al peso) es fiel y estable.

## Bloqueantes
Ninguno. Nota: la consigna mencionaba `scripts/seed-examples.js` y
`game-packs/docs/stormlight/STORMLIGHT_RPG_GUIDE.md`, que aún no existen en el repo (son de una
feature posterior). La sanity del endpoint se cubrió con un script efímero en el contenedor
(ingesta resilient + búsqueda por keyword) en vez del seed; borrado tras verificar.
```

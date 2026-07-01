# Revisión: F11 — Optimización de retrieval + contexto (RAG)
Fecha: 2026-07-01
Reviewer: agente reviewer (independiente)
Veredicto: **APROBADO**

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint backend pasa en el contenedor: `docker compose exec backend npm run lint` → 0 errores.
- [x] Lint + build frontend pasan vía `docker compose build frontend` (build stage exitoso).
- [x] Sin código comentado sin explicación.
- [x] Sin `console.log` de debug (los `console.warn` en rag.js/embeddings.js son logging intencional de degradación, no debug).

### Código y patrones
- [x] `better-sqlite3` usado de forma **síncrona**. Todo el `async/await` presente es exclusivamente por la red de embeddings/LLM; ninguna llamada a `db.prepare().get/all/run` está `await`-eada. Verificado en rag.js, ai.js, embeddings.js.
- [x] **Prepared statements** en todo acceso a DB. Sin concatenación de SQL. Las queries vec (`embedding MATCH ? AND k = ?`) y FTS (`doc_chunks_fts MATCH ?`) están parametrizadas.
- [x] `session_events` tratado como append-only: `getEventHistory` solo hace SELECT.
- [x] Frontend sin cambios (no se tocó `frontend/`); no aplica el checkpoint de estilos inline / window.innerWidth.
- [x] Nombres descriptivos en inglés; funciones con responsabilidad única (`toBlocks`, `splitWithOverlap`, `mmrRerank`, `normalizeBm25`, `packWithinBudget`, `embedQueryCached`).
- [x] Sin dependencias nuevas (implementer reporta `npm install` = ninguna; confirmado: no hay cambios en package.json en el diff).

### Tests
- [x] Existen tests para cada optimización nueva (rag.f11.test.js + rag.eval.test.js).
- [x] Todos los tests pasan.
- [x] Caso feliz + casos de error/borde cubiertos (presupuesto que recorta, filtro que restringe, caché miss/hit, query nueva vs repetida).

### Arquitectura
- [x] Respeta estructura: servicios en `backend/src/services/`, router delgado en `backend/src/routes/`.
- [x] Sin dependencias nuevas → no requiere actualizar architecture.md.
- [x] Sin cambios de esquema/migración (reusa doc_chunks/vec_chunks/doc_chunks_fts existentes).
- [x] Endpoint `/api/rag/search` extendido de forma **aditiva** (params opcionales `section_type`/`doc_id`); no rompe la convención REST.

### Reporte
- [x] `impl_F11-ai-retrieval-opt.md` presente y detallado.
- [x] Este `review_F11-ai-retrieval-opt.md` escrito.

---

## Objetivo F11 — verificación ítem por ítem

- [x] **Chunking configurable:** `RAG_CHUNK_TARGET_TOKENS/MAX_TOKENS/OVERLAP_TOKENS` con defaults (400/500/60). Clamps sensatos (MAX ≥ TARGET, OVERLAP < TARGET).
- [x] **No parte tablas/encabezados:** `toBlocks()` agrupa filas de tabla Markdown en bloque atómico; headings se separan antes de trocear. Test `chunkMarkdown no parte una tabla Markdown a la mitad` verde (verifica que ninguna fila queda cortada).
- [x] **Conserva heading_path/section_type:** cada chunk lleva `headingPath`+`sectionType`. Test `mantiene el heading_path en cada pieza de una sección larga` verde.
- [x] **Reingesta idempotente por content_hash:** `ingestDoc` corta temprano si `doc.content_hash === hash`. Test pre-existente `reingerir contenido distinto reemplaza los chunks` verde.
- [x] **Fusión híbrida:** normaliza distancia L2→similitud `1/(1+d)` y BM25 vía min-max invertido; RRF ponderado + término de scores normalizados. Pesos `RAG_VECTOR_WEIGHT`/`RAG_KEYWORD_WEIGHT` leídos por llamada. Fórmula documentada en rag.js (líneas 405–417) y en .env.example. Test `los pesos configurables afectan el orden y el score` verde.
- [x] **Diversidad (MMR):** `mmrRerank` con `RAG_MMR_LAMBDA` (0.3). Test `MMR reduce redundancia frente al top-k` verde.
- [x] **Filtros + dedup:** filtra por `section_type`/`docId`; dedup por `doc_title::heading_path`. Tests `filtro por section_type restringe` y `dedup por heading_path` verdes.
- [x] **Presupuesto de tokens:** `packWithinBudget` respeta `RAG_CONTEXT_TOKEN_BUDGET` (garantiza ≥1 chunk); solo lo empaquetado va al prompt y a `sources`. Test con budget=120 verde.
- [x] **Caché de embeddings:** `embedQueryCached` (LRU, `RAG_QUERY_CACHE_SIZE`); normaliza key (trim/lowercase/espacios). Dos tests que **cuentan llamadas al stub** verdes: la repetición NO recomputa; query nueva sí.
- [x] **Eval anti-regresión:** `rag.eval.test.js` mide hit-rate@3 (umbral 0.8) y hit-rate@1 (umbral 0.5) sobre corpus determinista de 8 queries. Ambos verdes.
- [x] **Degradación:** `hybridSearch` cae a solo-FTS si el proveedor de embeddings falla (try/catch → warn). Proveedor inyectable (`setEmbeddingProvider`). Contrato `{answer, sources}` intacto (más `citations` como alias).
- [x] **Nuevas envs en `.env.example`:** las 9 documentadas en sección "Retrieval / RAG tuning (F11)".

---

## Resultado de verificación (Docker canónico, SIN --profile ai)

- `docker compose up -d --build`: ✅ ambas imágenes (backend + frontend) construidas; contenedores levantados.
- `docker compose exec backend npm run lint`: ✅ **0 errores**.
- `docker compose exec backend npm test`: ✅ **93 tests — 92 pass, 0 fail, 1 skip** (`duration_ms 494.6`).
  - El único skip es **pre-existente de F6** en `rag.test.js:170` ("vec/FTS activos: la degradación dura se valida en el código de guardia"), NO forma parte del eval de F11. Confirmado por `git log`: pertenece al commit `5e4a9d4 feat(F6)`.
- `docker compose build frontend`: ✅ (lint+build forzados en su build stage; imagen construida sin error).
- `curl http://localhost:3000/api/health`: ✅ `{"status":"ok","version":"1.0.0","vecEnabled":true,"ftsEnabled":true,"ai":{"provider":"ollama","model":"qwen2.5:3b"}}`.
- `git status --short`: ✅ **sin node_modules residual**. Scope limpio: solo se tocaron los archivos declarados (`rag.js`, `ai.js`, `embeddings.js`, `routes/rag.js`, `.env.example`) + los dos test nuevos + metadatos del harness (`feature_list.json`, `progress/current.md`, `impl_*.md`).

### Resultados exactos del eval (hit-rate)
- `hit-rate@k del retrieval supera el umbral (anti-regresión)` (ok 62): **VERDE** — hit-rate@3 sobre 8 queries ≥ 0.8.
- `hit-rate@1 (posición top) se mantiene razonable` (ok 63): **VERDE** — hit-rate@1 ≥ 0.5.
- Los porcentajes exactos no se imprimen en verde (la aserción solo emite el mensaje en fallo), pero ambos umbrales se superan. Según el reporte del implementer ambas quedan al 100%; el margen sobre el umbral es holgado.

### ¿Umbral trivial? — NO
- El eval usa un **dataset stub con etiqueta esperada por query** (8 queries → heading esperado) y mide contra el heading_path realmente recuperado. Un retrieval roto que devolviera secciones equivocadas caería por debajo de 0.8 y **fallaría** el test. El umbral 0.8@3 y 0.5@1 es exigente respecto a un baseline aleatorio (con 8 secciones, top-3 aleatorio daría ~0.375). El eval prueba algo real.

---

## Lecciones aplicadas correctamente
- **"better-sqlite3 es síncrono"** — aplicada: cero async/await sobre métodos de DB.
- **"vec0 exige BigInt como PK"** — aplicada: `insertVec.run(BigInt(chunkId), …)` y `deleteVec.run(BigInt(row.id))`.
- **"Verificación canónica en Docker"** — aplicada: todo verificable en contenedor con stub; sin depender de Node local ni de Ollama.
- **"session_events append-only"** — respetada.

---

## Puntos a corregir (si RECHAZADO)
No aplica — APROBADO.

---

## Observaciones (no bloqueantes)
1. **`RAG_RETRIEVE_K` no llega al presupuesto real de recuperación.** `retrieveRules` recibe `k = RETRIEVE_K` (8) pero luego llama `hybridSearch({ query, gameSystemId, k })` sin propagar `budget` a `hybridSearch` (que ya recupera un pool ancho internamente). El flujo funciona, pero el parámetro `budget` de `retrieveRules` solo se usa en `packWithinBudget`; es correcto, solo conviene tenerlo presente.
2. **`sim_vec` en modo degradado.** Cuando el vector se cae y solo hay FTS, la fórmula sigue siendo coherente (el término vectorial simplemente no aporta entradas al mapa `fused`). Verificado que no rompe; sin acción.
3. **La contribución `NORM_BLEND=0.25` es una constante de módulo** (no env). Es una decisión de diseño razonable y está documentada; no es un requisito de la consigna exponerla. Sin acción.
4. **El test de presupuesto reimporta ai.js con query-string** (`./ai.js?budget=…`) para releer la constante de módulo `CONTEXT_TOKEN_BUDGET`. Funciona y está justificado; contrasta con la decisión (correcta) de leer los pesos de fusión por llamada. Consistencia menor, no bloqueante.

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)
1. **Retrieval híbrido: usar señal léxica (Jaccard), no vectorial, para MMR/dedup.** (Categoría: RAG). Deserializar embeddings de vec0 para similitud pairwise es frágil y no funciona en la ruta degradada solo-FTS; Jaccard sobre tokens es determinista y siempre disponible. — Propuesto por el implementer; lo respaldo tras revisar `mmrRerank`/`jaccard`.
2. **Config que un test debe variar → leerla por llamada (`vectorWeight()`), no como constante de módulo.** (Categoría: Testing). El singleton `db` (DB_PATH fijado antes del primer import) hace que reimportar un módulo para releer `process.env` no reinicie la DB; exponer la config vía función evita trucos de reimport. — Buen aprendizaje; observo que el test de presupuesto sí recurre al truco de reimport (`?budget=…`), lo que refuerza la utilidad de la regla para futuros valores tuneables.
3. **Eval anti-regresión con dataset etiquetado + umbral por encima del baseline aleatorio.** (Categoría: Testing). Un eval de retrieval solo aporta si el umbral supera claramente lo que daría el azar; documentar el baseline (aquí ~0.375@3 aleatorio vs umbral 0.8) evita "umbrales triviales" que pasan siempre.

---

## Veredicto final: **APROBADO**
Cumple el objetivo de F11 (chunking, fusión, diversidad, filtros/dedup, presupuesto, caché, eval, degradación), pasa lint/tests/build en el entorno canónico, no rompe el contrato `{answer, sources}`, no introduce dependencias ni node_modules residual, y el eval es no-trivial. Las observaciones son mejoras opcionales, no bloqueantes.

# Revisión: F6 — RAG / IA
Fecha: 2026-06-30
Reviewer: reviewer (independiente)
Veredicto: **APROBADO**

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint backend pasa en el contenedor: `docker compose exec backend npm run lint` → **0 errores** (exit 0).
- [x] Lint + build frontend pasan vía `docker compose build frontend` → ambas imágenes (backend y frontend) construyeron OK; el build stage del frontend fuerza `npm run lint && npm run build`.
- [x] No se declaró "lint ✅" sin ejecutarlo: verificado en Docker, comando literal.
- [x] No hay código comentado sin explicación; los comentarios explican el *por qué*.
- [x] No hay `console.log` de debug en el código F6 (el logging de arranque de `db/index.js` es intencional y preexistente).

### Código y patrones
- [x] **better-sqlite3 síncrono.** Grep de `await` sobre `prepare/get/all/run` → 0 coincidencias. Los únicos `await` son las llamadas de red de embeddings/LLM, como se documenta.
- [x] **Prepared statements** en todo el acceso a datos; cero interpolación de SQL. Filtro FTS sanitizado con `toFtsQuery` (términos entre comillas, OR).
- [x] **session_events append-only.** Único uso en F6: un `SELECT ... FROM session_events` en `ai.js` (getEventHistory). Cero UPDATE/DELETE/INSERT sobre el log.
- [x] **Frontend solo Tailwind.** Grep en `AIPanel.jsx` y la nueva sección `DocsEditor` de `GameSystemPanel.jsx`: cero `const s = {…}`, cero `style={{…}}`, cero `window.innerWidth`. (`window.confirm` en DocsEditor es un diálogo del navegador, no medición de ancho; no viola la regla.)
- [x] Responsive con clases Tailwind; mobile-first.
- [x] Nombres en inglés; funciones con una sola responsabilidad (chunking, hash, clasificación, búsqueda vector/keyword, fusión RRF separadas).
- [x] Sin dependencias circulares; routers que emiten por socket usan factory `createRagRouter(io)`.

### Tests
- [x] Existen tests por módulo público nuevo: `rag.test.js` (8 casos) y `ai.test.js` (5 casos).
- [x] **Todos pasan:** `npm test` → 45 tests, **44 pass, 1 skip, 0 fail** (exit 0). El skip es intencional (rama de degradación dura, no alcanzable porque vec+FTS están activos en el entorno; el contrato se valida con la guarda de consulta vacía).
- [x] Cubren caso feliz (ingesta→retrieval citado, respuesta con citas, resumen persistido) y casos de error (consulta vacía, sesión inexistente, filtro por game_system).

### Arquitectura
- [x] Respeta la estructura: servicios en `services/`, router en `routes/`, registrado en `index.js`.
- [x] Sin dependencias npm nuevas (sqlite-vec ya estaba; FTS5 viene con better-sqlite3).
- [x] Esquema: `game_docs`, `doc_chunks` (con `heading_path`/`section_type`/`token_count`/`sort_order`), `session_summaries` (UNIQUE session_id, requerido por el upsert) ya existen en `schema.sql` desde F1; `vec_chunks`/`doc_chunks_fts` se crean en `db/index.js` (tablas virtuales, fuera de schema.sql). Correcto.
- [x] Rutas nuevas siguen convención REST (recursos anidados `/game-systems/:id/docs`, `/rag/search`, `/ai/ask`, `/sessions/:id/summary`).

### Learnings
- [x] Propuso 3 candidatos a LEARNINGS (vec0 exige BigInt en PK; FTS5 idempotente fuera de schema.sql; normalizar fallos de red de IA a mensajes claros).

### Reporte
- [x] `impl_F6-rag-ai.md` presente con archivos tocados y prueba stub vs Ollama.
- [x] Este `review_F6-rag-ai.md` escrito.

---

## Resultado de verificación (Docker — canónico)

| Paso | Resultado |
|------|-----------|
| `docker compose up -d --build` | ✅ ambas imágenes construyen y arrancan |
| `docker compose exec backend npm run lint` | ✅ 0 errores (exit 0) |
| `docker compose exec backend npm test` | ✅ 45 tests / 44 pass / 1 skip / 0 fail (exit 0) |
| `docker compose build frontend` | ✅ OK (lint+build forzados en build stage) |
| `GET /api/health` | ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}` |
| `POST /api/rag/search` (Ollama apagado) | ✅ **HTTP 503** `{"error":"Proveedor de embeddings no disponible (ollama): fetch failed"}` |
| `POST /api/ai/ask` (Ollama apagado) | ✅ **HTTP 503**, mismo mensaje claro |
| `POST /api/rag/search` `{}` (validación) | ✅ **HTTP 422** `query y game_system_id son requeridos` |
| `POST /api/ai/ask` sin query | ✅ **HTTP 422** |
| Ingesta con Ollama apagado | ✅ **HTTP 503**; `game_docs` se mantiene en 10 → **sin fila huérfana** (embeddings antes de tocar la DB) |

Ningún 500 sin manejar en la ruta de degradación. Contenedores bajados al terminar.

### Verificación de invariantes RAG
- **Embeddings/LLM inyectables:** `setEmbeddingProvider` / `setLlmClient` mutan el provider a nivel de módulo; default Ollama, opción API por env; tests inyectan stub determinista (768d normalizado). ✅
- **Chunking jerárquico:** pila de headings → `heading_path` (`Reglas Core > Combate > Iniciativa` verificado en test), `section_type` heurístico, `token_count` estimado, solape en frontera de palabra. ✅
- **Idempotencia:** `content_hash` (FNV-1a); reingesta del mismo contenido no reindexa ni duplica; contenido distinto reemplaza chunks (`purgeChunks` borra de doc_chunks + vec + fts antes de reinsertar). ✅
- **Retrieval híbrido:** vector KNN (`embedding MATCH ? AND k = ? ORDER BY distance`) + FTS5/BM25, fusionados con RRF (K=60); filtro por `game_system_id` (test confirma 0 resultados de otro sistema); devuelve citas (`heading_path`, `doc_title`, `section_type`). ✅
- **Sincronización vec/FTS:** inserción y borrado de chunks tocan las tres tablas atómicamente (`db.transaction`); `vec_chunks` usa `BigInt(chunkId)` en INSERT/DELETE y normaliza a `Number` al leer; FTS usa el comando `'delete'` de contentless-external. Sin huérfanos. ✅
- **Degradación:** con `vecEnabled && !ftsEnabled` o ambos off hay guardas; con proveedor caído → 503; validación → 422; recurso inexistente → 404. ✅

### Wiring frontend (sin componentes huérfanos)
- `AIPanel` importado y renderizado en `SessionView.jsx` bajo `activeTab === 'ai'` (tab 🤖 en la lista de tabs). ✅
- `DocsEditor` montado en `GameSystemPanel.jsx` (tab "Documentos"), y `GameSystemPanel` se renderiza desde `Lobby.jsx`. Accesible end-to-end. ✅
- `AIPanel` deriva `game_system_id` de `api.listSessionCharacters` → `/characters/session/:id`, que devuelve `c.*` (incluye `game_system_template_id`) + `game_system_name`. El contrato cuadra. ✅
- Endpoints centralizados en `lib/api.js` (`listDocs`, `ingestDoc`, `reindexDoc`, `deleteDoc`, `ragSearch`, `aiAsk`, `getSessionSummary`, `generateSessionSummary`). ✅

### Scope
- Archivos tocados = exactamente los declarados en el reporte (6 modificados + 7 nuevos, más `feature_list.json`). Sin cambios fuera de scope. ✅

---

## Lecciones aplicadas correctamente
- **vec0 fuera de schema.sql** → `doc_chunks_fts` también se crea en `db/index.js` en try/catch que degrada `ftsEnabled` sin romper el arranque. ✅
- **better-sqlite3 síncrono** → toda la DB síncrona; async solo en red. ✅
- **Factory createXRouter(io)** → `createRagRouter(io)` para `session:summary_ready`. ✅
- **Feature de frontend cableada** → AIPanel y DocsEditor montados y alcanzables; sin huérfanos. ✅
- **No declarar checkpoint en verde sin ejecutar en Docker** → todo verificado en contenedor. ✅
- **`:memory:` no carga vec0** → tests usan archivo temporal (`mkdtempSync`). ✅
- **eslint-disable a plugin no registrado = error fatal** → el `eslint-disable react-hooks/exhaustive-deps` en DocsEditor no rompió el lint, lo que confirma que `eslint-plugin-react-hooks` está registrado. ✅

---

## Puntos a corregir (si RECHAZADO)
N/A — aprobado.

---

## Observaciones (no bloqueantes)
1. **`reindexDoc` no re-chunkea, solo re-embebe.** Es una decisión consciente y documentada (el contenido original no se persiste, no se puede reconstruir el heading_path desde el texto plano). Si en el futuro se quiere reindexar tras cambiar el chunking, habría que persistir `source_path`/contenido o re-ingerir. Aceptable para F6.
2. **`source_path` se ingiere siempre como `null`** desde el router (`ingestDoc` lo soporta pero el endpoint no lo expone). No es un requisito de F6; queda como hook para ingesta desde disco.
3. **Heurística de tokens chars/4.** Suficiente para acotar tamaño de chunk; no es tokenización real. Documentado. Si la calidad del retrieval lo exigiera, se podría medir con el tokenizer del modelo.
4. **`classifySection` mezcla idiomas (es/en) en las keywords.** Razonable dado que los docs pueden venir en cualquier idioma; no bloqueante.
5. El skip de test de "degradación dura" es legítimo en este entorno (vec+FTS activos). Si se quisiera cobertura real de esa rama, se podría forzar `vecEnabled=false && ftsEnabled=false` en un test aislado mediante inyección. No bloqueante.

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)
Los 3 propuestos por el implementer son sólidos y se confirmaron en la práctica:
1. **vec0 (sqlite-vec) exige la PK como BigInt al INSERT/DELETE** y devuelve ids que conviene normalizar a `Number` para fusionar con FTS en el mapa de RRF. (Categoría: RAG/sqlite-vec.) — **Recomiendo agregar.**
2. **FTS5 idempotente y sincronizado fuera de schema.sql**, con el mismo rowid que `doc_chunks.id` y borrado vía el comando `'delete'` de contentless-external; independiente de sqlite-vec. (Categoría: RAG.) — **Recomiendo agregar.**
3. **Normalizar fallos de red de proveedores de IA a mensajes claros** y hacer el trabajo de red ANTES de mutar la DB, para responder 503 (no 500 opaco) y no dejar filas huérfanas. Verificado: ingesta con Ollama caído → 503 y `game_docs` sin huérfanos. (Categoría: Backend/IA.) — **Recomiendo agregar.**

Candidato adicional observado por el reviewer:
4. **El patrón "embeddings/red antes de la transacción de DB" es la garantía anti-huérfanos.** Generalizable a cualquier servicio que combine una llamada de red falible con escrituras multi-tabla: ejecuta la parte falible primero; abre la transacción solo cuando ya tienes todos los datos. (Categoría: Arquitectura.) — opcional.

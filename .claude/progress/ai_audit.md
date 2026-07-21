# Auditoría de IA end-to-end — RolApp v1.0

> Autor: consultor. Fecha: 2026-07-20. Encargo del líder (sesión autónoma).
> Objetivo: spec para F18 + checklist de runtime para el founder. NO se tocó código.
> Base: lectura del código real de IA (no solo reportes) + reportes F6/F9/F11/F12.

---

## TL;DR (veredicto)

La IA está **bien construida y es de alta calidad de ingeniería** (retrieval híbrido,
tool-use con fallback, streaming, degradación elegante, todo testeado con stubs). Pero
"funciona para todo" es **falso hoy** por dos razones distintas que conviene no confundir:

1. **Runtime:** con la config canónica (`docker compose up`, sin perfil `ai`) la IA está
   **apagada de fábrica**: no hay Ollama levantado ni modelos descargados. `/api/ai/status`
   devuelve `ready:false`. Para que "funcione de verdad" el founder DEBE correr el perfil
   `ai`, el bootstrap de modelos y **reindexar** los docs ya ingeridos (deuda menor conocida).
2. **Cobertura de UI:** la IA hoy vive en **una sola superficie** (el `AIPanel` dentro de la
   sesión en vivo, tab "Asistente IA"). Las superficies que el founder espera con IA
   (presets de sesión, IA en el detalle de historial) **no existen todavía** — son
   exactamente F18 y F19. Confirmado contra `feature_list.json`.

El backend está listo para soportar F18/F19 casi sin arquitectura nueva. El trabajo de F18
es de **producto/UI + un endpoint de notas**, no de motor de IA.

---

## 1. Estado end-to-end (qué funciona hoy realmente)

Pipeline completo, con nombres de archivo/función:

### Ingesta → chunking → embeddings (FUNCIONA, con stub y con Ollama)
- `backend/src/services/rag.js`:
  - `chunkMarkdown()` — chunking jerárquico por pila de headings; `toBlocks()` agrupa
    tablas Markdown como bloque atómico (no las parte); `splitWithOverlap()` empaqueta por
    tamaño con solape; `splitByWords()` como último recurso. `classifySection()` etiqueta
    `tabla|regla|lore|general`. Tamaños configurables (`RAG_CHUNK_*`).
  - `ingestDoc({..., embedMode})` — persiste atómicamente en `doc_chunks` + `vec_chunks`
    (768d) + `doc_chunks_fts`. Idempotente por `content_hash` (FNV-1a). **Detalle clave:**
    `embedMode:'strict'` (default del endpoint REST) **LANZA** si Ollama está caído y NO deja
    doc huérfano; `embedMode:'resilient'` (lo usa el seed) persiste chunks+FTS **sin vectores**
    para reindexar luego. Embeddings van ANTES de tocar la DB.
  - `reindexDoc(docId)` — re-embebe en sitio (no re-chunkea; preserva heading_path).
- `backend/src/services/embeddings.js`: proveedor inyectable (`setEmbeddingProvider`).
  Ollama `nomic-embed-text` (1 request/texto) o API estilo OpenAI. Valida 768 dims o lanza.
  `embedQueryCached()` = LRU en memoria de vectores de query (F11). `probeEmbeddings()` sondea
  sin lanzar.

### Retrieval híbrido (FUNCIONA; degrada a solo-FTS sin Ollama)
- `rag.js::hybridSearch()` — vector KNN (`vectorSearch`, sqlite-vec) + BM25/FTS5
  (`keywordSearch`) fusionados con **RRF ponderado + término de scores normalizados**
  (`RRF_K=60`, `NORM_BLEND=0.25`, pesos `RAG_VECTOR_WEIGHT/KEYWORD_WEIGHT` leídos por
  llamada). Luego **dedup por `heading_path`** y **re-rank MMR** (`mmrRerank`, redundancia por
  Jaccard léxico, `RAG_MMR_LAMBDA=0.3`). Filtros opcionales `sectionType`/`docId`.
  - **Degradación:** si `embedQueryCached` falla (Ollama caído) pero hay FTS → warn y sigue
    con solo-keyword. Si ni vec ni FTS → lanza "Retrieval no disponible" → 503.
- Eval anti-regresión: `rag.eval.test.js` (hit-rate@3 ≥ 0.8, hit-rate@1 ≥ 0.5). Verde.

### Contexto / tools → generación → streaming → citas (FUNCIONA; matices abajo)
- `backend/src/services/ai.js`:
  - Ensamblado de contexto: `retrieveRules()` → `packWithinBudget()` (presupuesto de tokens
    `RAG_CONTEXT_TOKEN_BUDGET`, garantiza ≥1 chunk). `getSessionState()` +
    `getEventHistory()` arman estado estructurado. `renderRules/renderSessionState/renderEvents`.
  - **Tool-use real** (`runToolLoop`) con las 5 tools de `aiTools.js` (`retrieve_rules`,
    `get_character`, `get_session_state`, `get_event_history`, `get_stats`) y `TOOL_SCHEMAS`
    estilo OpenAI. `executeTool` fusiona `context` (scope gameSystemId/sessionId) POR ENCIMA
    de los args del modelo (anti-fuga entre mesas). **Fallback** por inyección de contexto.
  - **Funciones públicas:** `answerRulesQuestion`/`streamRulesQuestion` (reglas),
    `assistPlanning`/`streamPlanning` (planeación), `summarizeSession`/`getSessionSummary`
    (resumen, persiste en `session_summaries`), `getAiStatus`.
  - **Contrato canónico** `{ answer, sources:[{doc_title, heading_path, section_type,
    snippet, score}] }`; `citations` = alias de `sources` (compat).
  - **Prompts endurecidos ES** (`NO_HALLUCINATION` reutilizable + `RULES_SYSTEM` /
    `SUMMARY_SYSTEM` estructurado Qué pasó/Decisiones/Hilos / `PLANNING_SYSTEM`).
  - **Config por tarea** `resolveTaskConfig('rules'|'summary'|'planning')` (modelo/temp/topK/
    budget por env). **Follow-ups** `normalizeHistory` (acota turnos/chars).
  - **Clientes LLM inyectables**: `activeLlm` (no-streaming), `activeLlmStream` (NDJSON Ollama
    / SSE OpenAI), `activeLlmTools`. Default de tools solo si `AI_PROVIDER=api`.
- Streaming por Socket.io: `backend/src/sockets/ai.js` — `ai:ask`/`ai:assist_planning` →
  `ai:token` (por fragmento) → `ai:answer_done`/`ai:planning_done` con `{answer, sources}`;
  error → `ai:error`. Emite SOLO al socket solicitante, correlado por `requestId`.
- Router REST: `backend/src/routes/rag.js` — `GET /api/ai/status` (con `?probe=0`),
  `POST /api/rag/search`, `POST /api/ai/ask`, `POST /api/ai/assist-planning`,
  `GET/POST /api/sessions/:id/summary` (emite `session:summary_ready`), CRUD de docs.
  `fail()` mapea a 503 (proveedor)/422 (validación)/404/500. `/api/health` (en `index.js`)
  expone `{vecEnabled, ftsEnabled, ai:{provider,model}}` sin sondear.

### Qué está tras un stub / qué NO se ha probado con IA real
- **Todo el pipeline se prueba SIN Ollama** con stubs deterministas (embeddings hash→768d,
  LLM stub). 107 tests verdes (F12). Lo verificado end-to-end con stub: chunking, ingesta,
  vec/FTS, fusión, MMR, presupuesto, caché, tool-loop, fallback, prompts, follow-ups,
  degradación, contrato.
- **NUNCA se ha ejecutado con un Ollama real con modelos** en este repo (los reportes lo
  dicen explícitamente: el `ollama pull` real nunca corrió — primero por disco lleno en F9,
  luego porque la verificación canónica es sin perfil `ai`). Es decir: **la calidad de la
  respuesta del modelo real y el reindex vectorial real están SIN verificar en vivo.** No es
  un defecto de código; es una prueba pendiente que solo el founder puede hacer.

### Cómo degrada sin Ollama (resumen operativo)
- `/api/health` → 200 siempre (no sondea).
- `/api/ai/status` → 200 con `ready:false` y `llm.ok:false`/`embeddings.ok:false` + error
  legible (404 "model not found" o "no disponible"). Nunca 500.
- `/api/ai/ask`, `/api/rag/search` → **503** con mensaje claro (no crash).
- Docs ingeridos con el seed en modo `resilient` → **búsqueda por keyword (BM25) SÍ funciona**
  sin Ollama; solo falta el aporte vectorial.

---

## 2. Dónde está cableada la IA en la UI — y dónde FALTA

### Cableada HOY (una sola superficie)
- `frontend/src/components/AI/AIPanel.jsx`, montado **solo** en
  `frontend/src/pages/SessionView.jsx` (tab "ai", línea 99). Capacidades reales del panel:
  pregunta libre de reglas con **streaming** (cursor ▍), **fuentes con score**, **regenerar**,
  **follow-ups** (memoria corta, "Nueva conversación"), **panel de depuración de retrieval**
  (`/rag/search`), **badge de motor** (`/ai/status`), y **generar/ver resumen** (DM).
- Plomería frontend lista: `lib/socket.js::streamAiAsk`, `lib/api.js` (`aiStatus`, `aiAsk`,
  `aiAssistPlanning`, `ragSearch`, `getSessionSummary`, `generateSessionSummary`, docs CRUD).
- **Aviso importante:** `SessionView.jsx` y `AIPanel.jsx` **usan los tokens VIEJOS**
  (`bg-ink-700`, `text-gold`, `bg-success/30`) y **emojis** (🤖📖📝). NO pasaron por el
  rediseño F13/F14. `App.jsx:17` confirma que la sesión en vivo queda **fuera del AppShell**,
  como pantalla completa; se entra desde Dashboard → "Reanudar/Unirse". Conclusión: **la IA es
  accesible hoy**, pero con estilo viejo y en una sola pantalla.

### Superficies donde el founder esperaría IA y NO la tiene
| Superficie | ¿IA hoy? | Feature que la cablea |
|---|---|---|
| Dashboard (`DashboardPage.jsx`) | NO (métricas + crear sesión) | — (no está planificada; ver quick-win) |
| Sesión en vivo — pregunta libre | SÍ (AIPanel) | ya existe; **F18** lo amplía con presets/modos y lo restilizba |
| Sesión en vivo — presets (Resumen/Cronología/Estado/Inventarios) y topics de sistema | NO | **F18** |
| Detalle de sesión finalizada (Notas/Eventos/Resumen/IA) | NO (`HistoryPage` solo expande resumen+stats inline) | **F19** |
| Catálogos (Habilidades/Items/NPCs/Personajes) | NO | — (no planificado; fuera de alcance) |
| Gestión de docs para RAG (ingesta) | SÍ, pero escondida | en `GameSystemPanel` (tab Documentos, F6) — accesible desde el Lobby viejo |

**Confirmado contra `feature_list.json`:** F18 cablea los presets de sesión + modos
Sesión/Sistema + checkbox "incluir sesiones anteriores"; F19 cablea el AIPanel en modo
consulta sobre la sesión finalizada (con stats de F7). Ambas están `pending`.

---

## 3. Dependencias de runtime que el founder DEBE satisfacer (mini-guía)

Para que la IA "funcione de verdad" (no solo degrade con elegancia), correr esto **una vez**,
desde la raíz del repo `C:\Users\gabri\dev\rolapp-v1` (Docker es el camino canónico; no hace
falta Node local):

```bash
# 0) Asegura margen de disco en C: (Docker Desktop guarda containerd ahí; con C: lleno el
#    daemon pasa a read-only y nada arranca — lección conocida de F9).

# 1) Levanta la app + Ollama (perfil ai). SIN esto, Ollama ni existe.
docker compose --profile ai up -d --build

# 2) Descarga los modelos DENTRO del contenedor ollama (idempotente; tarda unos min).
#    nomic-embed-text (~275MB, embeddings 768d) + qwen2.5:3b (~2GB, LLM local).
docker compose --profile ai run --rm ai-bootstrap
#    (equivalente: docker compose --profile ai exec ollama ollama pull nomic-embed-text
#     y ... pull qwen2.5:3b)

# 3) Verifica que la IA quedó lista (ambos ok:true, ready:true).
curl -s http://localhost:3000/api/ai/status        # nginx del frontend proxya /api al backend
#    esperado: {"...","llm":{"ok":true,...},"embeddings":{"ok":true,...},"ready":true}
```

### DEUDA MENOR OBLIGATORIA: reindexar los vectores del RAG
Los docs se ingirieron con el seed **sin Ollama** (modo `resilient`) → tienen chunks + FTS
pero **NO vectores**. Hasta reindexar, el retrieval funciona **solo por keyword** (BM25); el
aporte semántico vectorial está ausente. Hay que reindexar **cada doc** ya ingerido una vez
que Ollama tiene modelos:

- Vía UI: Lobby → "Sistemas de juego" → sistema (p.ej. Stormlight) → tab **Documentos** →
  botón **Reindexar** en cada doc.
- Vía API (por doc): `POST /api/game-systems/:id/docs/:docId/reindex` con `{ "dm_id": <id> }`.
  Listar docs primero: `GET /api/game-systems/:id/docs`.
- No existe un "reindex all" de un golpe: es **por documento**. Si en el futuro se re-ejecuta
  el seed con Ollama ya arriba, la ingesta ya vendría vectorizada y este paso no haría falta.

### Si en vez de Ollama local se usa una API externa
En `.env` (ver `.env.example`): `AI_PROVIDER=api`, `EMBED_PROVIDER=api`, `API_KEY=...`,
`AI_API_BASE_URL`, `EMBED_API_URL`, `AI_MODEL`, `EMBED_MODEL`. **OJO:** el vector store espera
**768 dims** — elegir un modelo de embeddings compatible o el insert falla. `docker compose up`
(sin perfil `ai`). Igual hay que **reindexar** los docs para vectorizarlos con la API.

---

## 4. Spec para F18 — presets del asistente IA (componer sobre F9–F12, sin motor nuevo)

La regla de oro: **F18 es UI + un endpoint de notas. No se necesita arquitectura de IA nueva.**
Todo lo que sigue se apoya en funciones/endpoints que YA existen.

### 4.1 Modos y presets (mapa a lo existente)

**Modo Sesión** (contexto = sesión en vivo). Presets:
- **Resumen** → `POST /api/sessions/:id/summary` (ya existe: `summarizeSession`). Nota: ese
  servicio **ya lee `session_notes`** (ai.js), así que en cuanto F18 puebla notas, el resumen
  mejora solo. Botón "Generar" del panel actual ya lo hace.
- **Cronología** → nueva **pregunta canned** que dispara `streamRulesQuestion`/`assistPlanning`
  con un prompt fijo ("Ordena cronológicamente los eventos de esta sesión…") + `sessionId` en
  el scope. El estado ya está disponible vía `getEventHistory(sessionId)`. **Opción más limpia
  con Ollama local** (sin tools): añadir en `ai.js` un helper `answerSessionQuestion({sessionId,
  gameSystemId, preset, history})` que arme el contexto con `getSessionState`+`getEventHistory`
  y use el prompt del preset. Reutiliza `callLlmStream` y el contrato `{answer, sources}`.
- **Estado de personajes** → mismo helper, prompt "Resume el estado actual de cada personaje
  (atributos, PV/voluntad)"; datos de `getSessionState(sessionId)`.
- **Inventarios** → mismo helper, prompt sobre inventarios; datos de `get_character` /
  `character_inventory` (ya consultado en `aiTools.js::getCharacterTool`).
- **Pregunta libre** → lo que el AIPanel ya hace hoy (`ai:ask` streaming).

**Recomendación de diseño:** en vez de N funciones nuevas, definir en `ai.js` un mapa
`SESSION_PRESETS = { resumen, cronologia, estado, inventarios }` → `{ systemPrompt, buildUserContent(sessionId) }`
y una única `streamSessionPreset({ sessionId, gameSystemId, preset, history }, onToken)` que
reutilice `callLlmStream` + `packWithinBudget` + `toSources`. Un solo camino, testeable con el
stub de LLM igual que hoy. El socket handler `ai:ask` puede aceptar un `preset` opcional, o
añadir `ai:session_preset` análogo (mismo patrón `run()` de `sockets/ai.js`).

**Modo Sistema** (contexto = reglas del game system, sin sesión). Topics:
- **core / habilidades / items / NPCs** → son `streamRulesQuestion` con un **filtro por
  `section_type`/`doc` o un prefijo de query** por topic. `hybridSearch` YA acepta
  `sectionType` y `docId` (F11) y el socket/servicio ya trae `gameSystemId`. El topic "NPCs"
  puede mapearse a un doc o a `section_type` según cómo estén etiquetados los docs; si no hay
  buen mapeo, degradar a query temática ("reglas de NPCs / criaturas"). **No requiere backend
  nuevo** salvo pasar `sectionType` por el socket `ai:ask` (hoy no lo propaga; el REST
  `/rag/search` sí lo acepta).

### 4.2 Checkbox "incluir sesiones anteriores"
- Objetivo: al preguntar en modo Sesión, incluir contexto de sesiones **previas de la misma
  campaña**. Lo más barato y sin alucinación: **inyectar los `session_summaries` anteriores**
  (ya persistidos) de las sesiones cerradas de esa campaña, como bloque de contexto adicional.
- No existe un endpoint "summaries by campaign". Añadir uno pequeño (compone sobre lo que hay):
  `GET /api/campaigns/:id/summaries` → lista `{session_id, name, body}` de sesiones cerradas
  con resumen. El helper de preset concatena esos bodies (acotados por presupuesto de tokens,
  reusar `packWithinBudget`) cuando el flag está activo. Alternativa sin endpoint: derivarlo en
  frontend con `listSessions('closed')` + `getSessionSummary` por sesión (más llamadas, cero
  backend). Recomiendo el endpoint por limpieza y para no romper el presupuesto de contexto.

### 4.3 Endpoint de notas (lo ÚNICO de backend "de verdad" que falta para el punto (4) de F18)
- `session_notes` **YA existe en `schema.sql`** (líneas 454-463: `session_id, dm_id, title,
  body, event_type, is_public, created_at`). Pero **NO hay `routes/notes.js`**.
- Crear `routes/notes.js` como **factory `createNotesRouter(io)`** (patrón de la lección
  "routers que emiten por socket"): CRUD `GET/POST/PUT/DELETE /api/notes` (o
  `/api/sessions/:id/notes`), con `is_public` (privada solo DM), emitiendo `notes:updated` por
  socket al room de la sesión. Montarlo en `index.js` después de `io`. Esto es F18, no IA.

### 4.4 Qué NO tocar / reutilizar tal cual
- Contrato `{answer, sources}`, streaming por socket, degradación, prompts endurecidos, config
  por tarea, follow-ups: **intactos**. F18 los consume.
- El `AIPanel` actual debe restilizarse a tokens del handoff (parte (5) de F18) — hoy usa los
  viejos. El selector de sistema de juego que ya deriva de personajes (`listSessionCharacters`)
  se conserva.

### 4.5 Verificación sugerida para F18 (IA)
- Tests backend con stubs: `streamSessionPreset` por cada preset (arma contexto correcto),
  filtro `sectionType` por topic, `GET /api/campaigns/:id/summaries`, CRUD de notas + que el
  resumen incorpora notas. Sin Ollama. Igual que F9–F12.

---

## 5. Quick-wins y riesgos (priorizados)

### Quick-wins
- **[ALTO] Reindexar los docs tras levantar Ollama.** Es la diferencia entre "RAG solo-keyword"
  y "RAG híbrido real". Barato (un botón por doc) y desbloquea la calidad semántica. Ya está en
  la deuda menor; elevarlo a paso obligatorio del arranque de IA (ver §3).
- **[ALTO] Propagar `sectionType`/`preset` por el socket `ai:ask`.** Hoy el REST `/rag/search`
  filtra por `section_type` pero el socket de streaming no lo pasa. Es un cambio de una línea en
  `sockets/ai.js` + `streamRulesQuestion`, y habilita los "topics" de sistema de F18 casi gratis.
- **[MEDIO] Endpoint `GET /api/campaigns/:id/summaries`.** Habilita "incluir sesiones
  anteriores" (F18) y alimenta F19. Compone sobre datos existentes; ~15 líneas.
- **[MEDIO] IA en Dashboard (opcional, no planificada).** Un mini "pregunta rápida de reglas"
  reutilizando `AIPanel` en modo Sistema daría presencia de IA fuera de la sesión. Solo si el
  founder lo quiere; no está en el backlog.
- **[BAJO] Limpiar comentario obsoleto en `sockets/ai.js`** (JSDoc dice `ai:done`; el código
  emite `ai:answer_done`/`ai:planning_done`). Cosmético (ya señalado en review F9).
- **[BAJO] Consolidar `getSessionState`/`getEventHistory` duplicadas** entre `ai.js` y
  `aiTools.js` (queries casi idénticas; señalado en review F12). Antes de que F18 añada más
  consumidores, extraer a un módulo compartido evita divergencia.

### Riesgos / regresiones a vigilar
- **[ALTO] Calidad del LLM local sin verificar en vivo.** `qwen2.5:3b` es liviano y multilingüe
  pero NUNCA se probó respondiendo de verdad en este repo. Riesgo: respuestas pobres o citas
  inconsistentes en CPU. Mitigación: el founder debe probar en vivo tras §3; si flojea, subir a
  `qwen2.5:7b` vía `AI_MODEL_SUMMARY`/`AI_MODEL` (ya soportado por config, sin código).
- **[ALTO] Tool-use está OFF con Ollama** (`AI_TOOLS_ENABLED=0` por defecto; default de
  tools-client solo para `AI_PROVIDER=api`). Con Ollama local, F18 corre por la ruta de
  **inyección de contexto** (fallback), NO por tools. Diseñar los presets sobre el fallback
  (como recomiendo en §4), no asumir tool-use. El streaming token-a-token tampoco aplica en
  modo tools (respuesta completa de un golpe) — otra razón para preferir el fallback en local.
- **[MEDIO] `session_notes` sin rutas.** `summarizeSession` ya la consulta; si F18 no crea el
  CRUD, el preset "Resumen" seguirá sin incluir notas (no rompe, pero queda a medias). Es
  dependencia dura de F18 punto (1).
- **[MEDIO] Presupuesto de tokens al incluir sesiones anteriores.** Concatenar summaries de
  varias sesiones puede desbordar el contexto del LLM local. Reusar `packWithinBudget` y acotar;
  no meter historiales crudos, solo summaries.
- **[MEDIO] El AIPanel/SessionView con estilo viejo** conviven con el AppShell nuevo. F18 debe
  restilizarlos sin romper el streaming/citas/follow-ups actuales (regresión fácil si se
  reescribe el componente entero en vez de re-tematizar).
- **[BAJO] Scope multi-mesa en tools.** Ya mitigado (`executeTool` pisa scope con `context`);
  mantener ese patrón si F18 añade tools o presets que reciban ids del cliente.
- **[BAJO] Reindex no borra la caché de queries.** `clearQueryCache()` existe pero el reindex no
  la invoca; una query cacheada antes del reindex devolvería el mismo vector (no afecta a los
  chunks, solo al vector de la query — impacto nulo en práctica).

---

## Archivos leídos para esta auditoría (referencia)
- Backend IA: `backend/src/services/ai.js`, `rag.js`, `embeddings.js`, `aiTools.js`;
  `backend/src/routes/rag.js`; `backend/src/sockets/ai.js`; `backend/src/db/index.js`;
  `backend/src/index.js`; `backend/src/db/schema.sql` (session_notes/summaries/game_docs).
- Config: `docker-compose.yml`, `.env.example`, `scripts/ai-bootstrap.sh`.
- Frontend: `frontend/src/components/AI/AIPanel.jsx`, `frontend/src/lib/socket.js`,
  `frontend/src/lib/api.js`, `frontend/src/pages/SessionView.jsx`, `HistoryPage.jsx`,
  `DashboardPage.jsx` (refs), `frontend/src/App.jsx` (montaje fuera del AppShell).
- Reportes: `impl_/review_` de F6, F9, F11, F12.

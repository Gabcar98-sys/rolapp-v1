# Revisión: F9 — Activación y optimización de la IA (híbrido Ollama/API)
Fecha: 2026-06-30
Veredicto: **APROBADO**

El implementer reportó verificación PARCIAL por un bloqueo de entorno (disco C: lleno →
Docker read-only). El disco ya se liberó (18 GB libres, daemon escribible) y ejecuté la
verificación canónica completa de forma independiente. Todo pasa en verde.

---

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa en el contenedor (`docker compose exec backend npm run lint` → 0 errores)
- [x] Lint + build frontend pasan vía `docker compose build frontend` (forzados en el build stage)
- [x] No hay `console.log` de debug nuevos (el único `console.log` es el log de arranque preexistente en `index.js`)
- [x] `better-sqlite3` usado de forma **síncrona** (0 async/await sobre sus métodos; el único `await` es red de IA)
- [x] Prepared statements en todo `ai.js` (`db.prepare(...).get()/.all()/.run()`)
- [x] `session_events` tratado como **append-only** — `getEventHistory` solo hace SELECT
- [x] Frontend: solo Tailwind + tokens; cero `const s = {…}`, cero `style={{}}`
- [x] Frontend: cero `window.innerWidth` / `useWindowWidth`
- [x] Nombres descriptivos en inglés; funciones de una sola responsabilidad
- [x] Respeta la estructura (`services/`, `routes/`, `sockets/`, `lib/`, `components/`)
- [x] Sin dependencias npm nuevas (confirmado en el reporte y sin cambios en package.json)
- [x] Tests: existen para lo público nuevo (streaming, fallback, status, shape sources)
- [x] Todos los tests pasan (`npm test` → 74 pass / 1 skip intencional / 0 fail)
- [x] Cubren caso feliz y caso de error (fallback a no-streaming; `getAiStatus` con y sin probe)
- [x] Reporte del implementer presente (`impl_F9-ai-activation.md`)
- [x] Reporte del reviewer presente (este archivo)
- [x] Sin `node_modules` residual ni directorio `frontend;C` (ya no existe)
- [x] Componentes cableados: `AIPanel` importado y renderizado en `SessionView.jsx` (tab 🤖)

## Objetivo F9 — verificación funcional
- [x] **Turnkey/híbrido:** `docker-compose.yml` pasa todas las envs de IA con defaults Ollama
      (`AI_PROVIDER`, `EMBED_PROVIDER`, `EMBED_MODEL`, `AI_MODEL`, `API_KEY`, `AI_API_BASE_URL`,
      `EMBED_API_URL`) → API externa sin tocar código. Servicio one-shot `ai-bootstrap` +
      `scripts/ai-bootstrap.sh` (pull idempotente de nomic-embed-text + qwen2.5:3b).
- [x] **`.env.example` y `README.md`** documentan ambas rutas (Ollama local / API externa).
- [x] **`GET /api/ai/status`** implementado (con `?probe=0`); **`/api/health`** enriquecido con `ai.provider/model`.
- [x] **Contrato `{ answer, sources:[{doc_title, heading_path, snippet}] }`** — `toSources()` en `ai.js`;
      `citations` mantenido como alias de compat.
- [x] **Streaming por Socket.io** (`ai:ask` → `ai:token` / `ai:answer_done` / `ai:error`) con
      fallback no-streaming (`callLlmStream` → `nonStreamAsSingleToken`).
- [x] **Prompts en español** (RULES_SYSTEM con citas/no inventar, SUMMARY_SYSTEM estructurado, PLANNING_SYSTEM).
- [x] **Proveedor inyectable** (`setLlmClient` / `setLlmStreamClient` / `setEmbeddingProvider`) + degradación
      elegante (error claro 503, sin 500 opaco, sin crash).
- [x] **UX (`AIPanel.jsx`):** badge de motor ("Ollama local · modelo" / "API externa" / "IA no disponible" /
      "Comprobando IA…"), cursor de tokens en vivo (▍), fuentes citadas con doc_title/heading_path/snippet.

## Resultado de verificación (ejecutado en Docker — resultados EXACTOS)
```
docker compose up -d --build            → EXIT 0 (ambas imágenes construidas, contenedores Up)
docker compose exec backend npm run lint → 0 errores (LINT_EXIT=0)
docker compose exec backend npm test     → 1..75 · pass 74 · fail 0 · skipped 1 (intencional) · TEST_EXIT=0
docker compose build frontend            → Image rolapp-v1-frontend Built · FE_BUILD_EXIT=0 (lint+build en verde)
```
- **lint backend:** ✅
- **build+lint frontend:** ✅
- **test backend:** ✅ 74 pass / 1 skip / 0 fail (incluye los 4 casos nuevos: #40 shape sources, #41 streaming
  emite tokens, #42 fallback no-streaming, #43 getAiStatus con/sin probe)

### Endpoints (curl)
```
GET  /api/health   → HTTP 200
  {"status":"ok","version":"1.0.0","vecEnabled":true,"ftsEnabled":true,"ai":{"provider":"ollama","model":"qwen2.5:3b"}}

GET  /api/ai/status → HTTP 200 (ready:false, sin crash; detalle por componente)
  {"provider":"ollama","model":"qwen2.5:3b","embedProvider":"ollama","vecEnabled":true,"ftsEnabled":true,
   "llm":{"ok":false,...,"error":"Ollama LLM error 404: model 'qwen2.5:3b' not found"},
   "embeddings":{"ok":false,...,"error":"Ollama embeddings error 404: model \"nomic-embed-text\" not found..."},
   "ready":false}
```

### Degradación (Ollama arriba pero SIN modelos descargados — no se corrió `--profile ai` pull)
```
POST /api/ai/ask    → HTTP 503  {"error":"Ollama embeddings error 404: model \"nomic-embed-text\" not found..."}
POST /api/rag/search → HTTP 503 {"error":"Ollama embeddings error 404: model \"nomic-embed-text\" not found..."}
```
Ambos degradan con **503 + mensaje claro**, NO 500 sin manejar. El backend sigue **Up** tras las llamadas
(sin crash). Nota: el contenedor `ollama` estaba levantado de una sesión previa pero sin modelos, lo que
reproduce fielmente el escenario "proveedor alcanzable pero no listo" y confirma la degradación por 404.

### git status --short (post-verificación)
```
 M .claude/progress/current.md
 M .env.example
 M README.md
 M backend/src/index.js
 M backend/src/routes/rag.js
 M backend/src/services/ai.js
 M backend/src/services/ai.test.js
 M backend/src/services/embeddings.js
 M backend/src/sockets/index.js
 M docker-compose.yml
 M frontend/src/components/AI/AIPanel.jsx
 M frontend/src/lib/api.js
 M frontend/src/lib/socket.js
?? .claude/progress/impl_F9-ai-activation.md
?? backend/src/sockets/ai.js
?? scripts/
```
Sin `node_modules` residual. Todos los archivos dentro del scope declarado de F9.

## Lecciones aplicadas correctamente
- **"Routers/handlers que emiten por socket"** → el streaming vive en `sockets/ai.js` (handler dedicado),
  desacoplado del router REST. Correcto.
- **"Una feature de frontend no está terminada hasta estar cableada"** → `AIPanel` importado y renderizado en
  `SessionView.jsx` (tab 'ai'); `streamAiAsk` en `lib/socket.js`, `aiStatus`/`aiAssistPlanning` en `lib/api.js`.
  Verificado por grep. Correcto.
- **"Cero estilos inline / cero window.innerWidth"** → confirmado por grep (0 ocurrencias). Correcto.
- **"Normalizar fallos de red de IA a mensajes claros"** → reusado en `getAiStatus`, `probeEmbeddings` y el
  streaming (503 / `ai:error`, nunca 500 opaco). Verificado en vivo (503). Correcto.
- **"No declarar un checkpoint en verde sin ejecutarlo en Docker"** → el implementer fue honesto marcando
  lint/test backend como ⚠️ NO EJECUTADO por el bloqueo de disco, en vez de inventar un ✅. Ejemplar; el
  reviewer los ejecutó ahora y salen verdes.
- **"better-sqlite3 síncrono"** → 0 async/await sobre `db.*`; prepared statements en todo `ai.js`. Correcto.

## Puntos a corregir (si RECHAZADO)
Ninguno. Aprobado.

## Observaciones (no bloqueantes)
1. **Comentario obsoleto en `sockets/ai.js` (líneas 4-5):** el JSDoc dice "al terminar llega `ai:done`",
   pero el código emite `ai:answer_done` / `ai:planning_done`. Solo el comentario está desactualizado; el
   código y el cliente (`lib/socket.js`) usan los nombres correctos. Cosmético.
2. **Planeación con streaming sin punto de entrada en la UI:** existen `streamPlanning` (servicio),
   el handler `ai:assist_planning` (socket) y `api.aiAssistPlanning` (REST), pero ningún componente los
   invoca todavía. No es un huérfano de render (AIPanel sí está cableado) y la planeación no es un
   requisito de UI de F9 (el objetivo pide los *prompts* de planeación, presentes). Queda como capacidad
   backend lista para una feature futura. No bloqueante.
3. **Ollama arriba sin modelos:** durante la verificación el contenedor `ollama` seguía levantado de una
   sesión previa (sin modelos). No afecta el veredicto; de hecho fortalece la prueba de degradación
   (404 "model not found" → 503). Para la prueba real de IA, el founder debe correr
   `docker compose --profile ai run --rm ai-bootstrap`.

## Candidatos para LEARNINGS.md
- **Degradación de IA distingue dos escenarios y ambos deben dar 503.** Categoría RAG/embeddings o Backend/IA.
  (a) proveedor caído → `fetch failed`/ECONNREFUSED normalizado a "no disponible"; (b) proveedor alcanzable
  pero modelo no descargado → 404 "model not found". El regex de `fail()` en `routes/rag.js` captura ambos
  (`/no disponible|...|Ollama|LLM|embedding/i`) → 503 con mensaje claro, nunca 500 opaco ni crash. Verificado
  en vivo. Vale documentarlo para que features futuras de IA mapeen el 404-de-modelo a 503, no a 500.
- **Contrato `{ answer, sources }` con `citations` como alias.** Categoría Backend/IA. Migrar el nombre de un
  campo ya consumido por la UI/tests sin romper: mantener el nombre viejo como alias del nuevo. Buen patrón,
  ya propuesto por el implementer.
- **Streaming del LLM: NDJSON (Ollama) vs SSE `data:` (OpenAI).** Categoría Backend/IA. Bufferizar por `\n`
  (un chunk de red puede partir una línea); `res.body` es async-iterable en Node 22; fallback a no-streaming
  cuando el proveedor no soporta stream. Propuesto por el implementer; confirmado sólido en la lectura.
- **La verificación canónica se cae si C: se llena (Docker Desktop en read-only).** Categoría Docker/infra.
  Propuesto por el implementer; se materializó como bloqueo real en esta feature. Recomendado adoptarlo:
  mantener margen de disco en C: es prerrequisito del checkpoint de Docker.

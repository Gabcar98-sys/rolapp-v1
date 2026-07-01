# Implementación: F9 — Activación y optimización de la IA

Fecha: 2026-06-30
Status: completado (con verificación Docker PARCIAL — bloqueo de entorno: disco C: lleno, ver §Verificación)

## Resumen

La IA ya estaba implementada (F6) pero apagada: no había forma turnkey de encender el
motor ni bootstrap de modelos, la respuesta no venía en streaming, y las citas usaban un
shape `citations` en vez del `{ answer, sources }` pedido. F9 la deja **turnkey, híbrida
(Ollama local por defecto / API por env sin tocar código), con streaming, citas
estructuradas y estado observable**. No se rompió ningún test de stub de F6.

## Archivos creados

### Backend
- `backend/src/sockets/ai.js`: handlers de **streaming por Socket.io**. `ai:ask`
  (reglas) y `ai:assist_planning` emiten `ai:token` por fragmento y `ai:answer_done` /
  `ai:planning_done` con `{ answer|suggestion, sources }` al terminar; error del proveedor
  → `ai:error`. Se emite SOLO al socket solicitante, correlacionado por `requestId`.

### Infra / scripts
- `scripts/ai-bootstrap.sh`: descarga idempotente de modelos (`ollama pull` de
  `nomic-embed-text` + `qwen2.5:3b`). Respeta `EMBED_MODEL`/`AI_MODEL`. Corre standalone o
  como el servicio `ai-bootstrap` de compose.

## Archivos modificados

### Backend
- `backend/src/services/ai.js`:
  - **Streaming**: clientes `ollamaLlmStream` (NDJSON de `/api/generate` con `stream:true`)
    y `apiLlmStream` (SSE `data:` estilo OpenAI). Inyectables vía `setLlmStreamClient`.
    `callLlmStream(prompt, onToken)` con **degradación elegante**: si no hay stream client
    pero sí uno no-streaming (stub/override) usa no-streaming; si el stream falla por error
    no-de-disponibilidad, cae a no-streaming (un solo token); si el proveedor está caído,
    propaga el error claro.
  - **Citas**: contrato canónico `{ answer, sources: [{ doc_title, heading_path,
    section_type, snippet, score }] }`. `citations` se mantiene como **alias** de `sources`
    (compat con la UI/tests previos). Nuevas variantes `streamRulesQuestion` /
    `streamPlanning`.
  - **Prompts afinados en español** (system prompts explícitos): (a) Q&A de reglas —cita
    fuentes, no inventa, dice "no encuentro esa regla" si no hay contexto—; (b) resumen con
    estructura **Qué pasó / Decisiones clave / Hilos abiertos**; (c) planeación —sugerencias
    accionables apoyadas en reglas+estado, no inventa reglas—.
  - **Estado**: `getAiStatus({ vecEnabled, ftsEnabled, probe })` sondea LLM + embeddings sin
    lanzar y reporta `{ provider, model, embedProvider, vecEnabled, ftsEnabled, llm,
    embeddings, ready }`. `probe:false` responde sin tocar la red. Export `AI_CONFIG`.
  - **Default LLM local** cambiado a `qwen2.5:3b` (antes `llama3.1:8b`); liviano y
    multilingüe. Sobreescribible con `AI_MODEL`. `AI_API_BASE_URL` soportado (con fallback a
    `AI_API_URL`).
- `backend/src/services/embeddings.js`: `probeEmbeddings()` (sondeo sin lanzar) y export
  `EMBED_CONFIG`.
- `backend/src/routes/rag.js`: endpoint `GET /api/ai/status` (con `?probe=0`).
- `backend/src/index.js`: `/api/health` ahora expone `{ vecEnabled, ftsEnabled, ai:{
  provider, model } }`.
- `backend/src/sockets/index.js`: registra `registerAiHandlers`.
- `backend/src/services/ai.test.js`: tests nuevos (ver abajo) + primer test actualizado al
  shape `sources`.

### Frontend
- `frontend/src/lib/socket.js`: helper `streamAiAsk({ query, gameSystemId }, callbacks)`
  que emite `ai:ask` y enruta `ai:token`/`ai:answer_done`/`ai:error` por `requestId`;
  devuelve función de limpieza.
- `frontend/src/lib/api.js`: `aiStatus(probe)` (GET `/ai/status`) y `aiAssistPlanning(...)`.
- `frontend/src/components/AI/AIPanel.jsx`: **badge de motor activo** ("Ollama local ·
  modelo" / "API externa" / "IA no disponible" / "Comprobando IA…") derivado de
  `/ai/status`; respuesta con **streaming visible** (cursor ▍ mientras llegan tokens);
  **fuentes citadas** con `heading_path`/`doc_title` + snippet bajo la respuesta; aviso de
  degradación con los comandos exactos para encender la IA. Solo clases Tailwind, sin inline,
  sin `window.innerWidth`.

### Infra / docs
- `docker-compose.yml`: backend recibe todas las envs de IA con defaults (`AI_PROVIDER`,
  `EMBED_PROVIDER`, `EMBED_MODEL`, `AI_MODEL`, `API_KEY`, `AI_API_BASE_URL`, `EMBED_API_URL`)
  → API externa configurable sin editar código. Nuevo servicio one-shot **`ai-bootstrap`**
  (profile `ai`) que ejecuta el script montando `./scripts`.
- `.env.example`: documentadas las dos rutas (Ollama local / API externa) con todas las
  envs y notas (768 dims esperadas por el vector store).
- `README.md`: sección "IA / RAG (opcional, turnkey)" con pasos exactos para ambas
  opciones y para verificar estado (`/api/health`, `/api/ai/status`).

## Tests escritos (backend, node --test, con stubs deterministas — sin Ollama)
- `streamRulesQuestion emite tokens y devuelve respuesta + fuentes`: stub generador →
  verifica que llegan los N tokens y que `sources` sale del retrieval con su `heading_path`.
- `streamRulesQuestion cae al cliente no-streaming si no hay stream`: sin stream client +
  LLM no-streaming → degrada a un único token (camino de fallback).
- `getAiStatus reporta motor y disponibilidad (probe con stub)`: `ready:true` con stubs;
  `probe:false` no toca la red.
- Test existente de `answerRulesQuestion` actualizado al shape `{ answer, sources, snippet }`
  y verifica que `citations === sources` (alias).

## Resultado de verificación
- lint backend: ⚠️ NO EJECUTADO en Docker (bloqueo de entorno, ver abajo). Revisión
  estática hecha: ESM, sin `no-unused-vars`, sin `console.log` de debug, sin async/await
  sobre better-sqlite3 (el único async es la red de IA).
- build + lint frontend (`docker compose build frontend`): ✅ — la imagen frontend **buildeó
  completa** (su build stage fuerza `RUN npm run lint && RUN npm run build`) ANTES de que el
  disco se llenara. Es decir: lint + build del frontend en verde, verificado en Docker.
- test backend (`docker compose exec backend npm test`): ⚠️ NO EJECUTADO (bloqueo). Ver
  candidatos de riesgo abajo (ninguno detectado en revisión estática).
- Manual / degradación: ⚠️ NO EJECUTADO por el mismo bloqueo.

### BLOQUEO DE ENTORNO (no de código)
El disco **C: del host está al 100% (754 MB libres de 465.8 GB)**. El almacenamiento de
containerd de Docker Desktop vive en C:, así que el daemon quedó en **read-only**: los
contenedores ya corriendo siguen, pero no se pueden crear/borrar contenedores ni ejecutar
`docker run`/`npm test`/`npm run lint`. Diagnóstico confirmado desde la VM
(`/mnt/host/c … 100% Use%`) y por el error repetido `write …/meta.db: read-only file
system`. **Un reinicio de Docker no lo arregla** (el disco está lleno). Acción del founder:
liberar espacio en C: y reintentar la verificación canónica (§siguiente). Los DOS builds de
imagen (backend y frontend) SÍ completaron antes del bloqueo.

## Pasos EXACTOS para el founder

### Verificación canónica (tras liberar espacio en C:)
```bash
cd /c/Users/gabri/dev/rolapp-v1
docker compose up -d --build
docker compose exec backend npm run lint      # esperado: 0 errores
docker compose exec backend npm test           # esperado: verde (incluye los 4 nuevos casos)
docker compose build frontend                  # esperado: lint + build OK (ya verificado)
curl -s http://localhost:3000/api/health        # { vecEnabled, ftsEnabled, ai:{provider,model} }
curl -s http://localhost:3000/api/ai/status      # sin IA: ready:false con detalle; no 500
```
Sin Ollama: `/api/ai/ask` y `/api/rag/search` deben degradar con 503 y mensaje claro.

### Probar la IA real (Ollama local)
```bash
docker compose --profile ai up -d --build
docker compose --profile ai run --rm ai-bootstrap   # pull de nomic-embed-text + qwen2.5:3b
curl -s http://localhost:3000/api/ai/status          # esperado: ready:true, llm.ok, embeddings.ok
```
Luego en la UI: sesión → tab 🤖 → badge "Ollama local · qwen2.5:3b" → preguntar una regla
y ver los tokens llegar en streaming con las fuentes citadas debajo. (No se pudo hacer un
`ollama pull` real aquí por el disco lleno; queda documentado.)

### Probar la IA real (API externa)
En `.env`: `AI_PROVIDER=api`, `EMBED_PROVIDER=api`, `API_KEY=…` (+ `AI_API_BASE_URL`,
`AI_MODEL`, `EMBED_MODEL` según proveedor). `docker compose up -d --build`. El LLM y los
embeddings usan la API sin cambios de código. OJO: el vector store espera **768 dims**
(`EMBEDDING_DIMS`); elegir un modelo de embeddings compatible o el insert fallará con
mensaje claro.

## Lecciones aplicadas
- "Routers/handlers que emiten por socket" → el streaming va por un handler de socket
  dedicado (`sockets/ai.js`), no acoplado al router REST.
- "Una feature de frontend no está terminada hasta estar cableada" → `AIPanel` (ya montado
  en el tab 🤖 de `SessionView` desde F6) reescrito y el badge/streaming/fuentes quedan
  alcanzables; `streamAiAsk` centralizado en `lib/socket.js`, `aiStatus`/`aiAssistPlanning`
  en `lib/api.js`.
- "Cero estilos inline / cero window.innerWidth" → AIPanel solo con clases Tailwind + tokens.
- "Normalizar fallos de red de IA a mensajes claros" (F6) → reusado en `getAiStatus`/probes
  y en el streaming (503/`ai:error`, nunca 500 opaco ni crash).
- "No declarar checkpoint verde sin ejecutarlo en Docker" → por eso lint/test backend se
  marcan ⚠️ NO EJECUTADO, no ✅. Solo el build del frontend se declara verde porque SÍ
  completó en Docker.

## Decisiones tomadas
- **Streaming por Socket.io** (no SSE): el AIPanel ya está en la sesión y el socket ya está
  unido al room; reusa la infraestructura existente y emite al socket solicitante por
  `requestId`. El REST `POST /ai/ask` se mantiene como fallback no-streaming.
- **`sources` como contrato + `citations` alias**: cumple el shape pedido sin romper la UI
  ni los tests previos. `snippet` = primeros 240 chars del chunk (contexto legible en la UI).
- **LLM local por defecto `qwen2.5:3b`**: liviano (~2 GB), buen español, razonable en CPU;
  documentada la alternativa `llama3.2:3b`. Sobreescribible con `AI_MODEL`.
- **`ai-bootstrap` como servicio one-shot** (imagen `ollama/ollama` con el CLI, montando
  `./scripts`): `docker compose --profile ai run --rm ai-bootstrap`. Idempotente.
- **`getAiStatus` con `probe` opcional**: el badge de la UI puede pedir estado inmediato
  (`probe:false`) o el estado real sondeando la red; `/api/health` nunca sondea (rápido).
- Sin dependencias npm nuevas.

## Candidatos para LEARNINGS.md
- **Streaming del LLM: NDJSON (Ollama) vs SSE `data:` (OpenAI).** Categoría Backend/IA.
  Ollama `/api/generate` con `stream:true` emite JSON por línea con `.response`; la API estilo
  OpenAI emite `data: {json}` con `choices[0].delta.content` y termina en `data: [DONE]`. Hay
  que bufferizar por `\n` porque un chunk de red puede partir una línea. `res.body` de fetch en
  Node 22 es async-iterable. Fallback a no-streaming cuando el proveedor no soporta stream.
- **Verificación canónica se cae si el disco C: del host se llena.** Categoría
  Docker/infra. Docker Desktop guarda containerd en C:; con C: al 100% el daemon pasa a
  read-only (`write …meta.db: read-only file system`) y no se pueden crear contenedores ni
  correr `npm test`/`lint`; reiniciar Docker NO ayuda. Mantener margen de disco en C: es
  requisito para el checkpoint de Docker. Diagnóstico: `wsl -d docker-desktop -e sh -c "df -h"`.
- **Contrato de respuesta de IA `{ answer, sources }` con `citations` como alias.** Categoría
  Backend/IA. Cambiar el shape rompería la UI; mantener un alias de compatibilidad al migrar
  nombres de campos de un contrato ya consumido evita romper tests y frontend.

## Notas / fuera de scope
- Existe un directorio residual `frontend;C` en la raíz del repo (de un error previo, NO
  creado por F9). No lo toqué (fuera de mi scope declarado: `frontend/`). Conviene borrarlo
  para que no ensucie el build context; lo dejo señalado para el founder/líder.

## Bloqueantes
- **Entorno, no código:** disco C: del host lleno → verificación canónica en Docker (lint +
  test backend, y la prueba manual de degradación) no pudo ejecutarse. El código está
  completo y revisado estáticamente; los builds de imagen completaron. Requiere que el
  founder libere espacio en C: y corra los comandos de la sección "Pasos EXACTOS".

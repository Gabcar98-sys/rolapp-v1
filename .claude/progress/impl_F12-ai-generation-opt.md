# Implementación: F12 — Generación + tools + UX (última de la optimización de IA)
Fecha: 2026-07-01
Status: completado

## Resumen
Se añadió **tool-use real con fallback**, **prompts endurecidos (citar-o-abstenerse)**,
**config por tarea**, **follow-ups conversacionales** y **UX** (score de fuentes, regenerar,
panel de depuración de retrieval). Todo verificable **sin Ollama** con stubs deterministas.
Se mantiene el contrato `{ answer, sources }` (extendido con `score` en cada fuente y
`citations` como alias de compatibilidad).

## Archivos creados
- `backend/src/services/aiTools.js`: registro de las 5 tools internas (`retrieve_rules`,
  `get_character`, `get_session_state`, `get_event_history`, `get_stats`) como funciones
  testeables (síncronas salvo `retrieve_rules`, async por la red de embeddings), sus
  `TOOL_SCHEMAS` en formato function-calling estilo OpenAI, y `executeTool(name,args,context)`
  que fusiona el `context` de scope (gameSystemId/sessionId) POR ENCIMA de los args del
  modelo (evita que el modelo consulte datos de otra mesa).
- `backend/src/services/aiTools.test.js`: 9 tests de las tools + executeTool (retrieval,
  ficha de personaje, estado/eventos de sesión, stats por scope, prioridad del contexto,
  errores).

## Archivos modificados
- `backend/src/services/ai.js`: reescrito. Añade:
  - **Orquestador de tool-use** `runToolLoop`: loop pedir-tool → ejecutar → inyectar
    resultado como mensaje `role:'tool'` → repetir hasta respuesta en texto o `AI_TOOL_MAX_ITERS`.
    Acumula los chunks de `retrieve_rules` (dedup por doc+heading) como `sources` citadas.
  - **Fallback** por inyección de contexto (comportamiento previo) cuando tools OFF o el
    proveedor no soporta function-calling.
  - **Cliente de tools inyectable** `activeLlmTools` + `setLlmToolsClient` + `apiLlmTools`
    (estilo OpenAI `tools`/`tool_choice:auto`). Default de tools solo para `AI_PROVIDER=api`.
  - **Prompts endurecidos**: cláusula `NO_HALLUCINATION` reutilizable (no inventes / cita o
    abstente / "No encuentro esa información…") aplicada a reglas, resumen y planeación.
  - **Config por tarea** `resolveTaskConfig(task)`: lee `AI_MODEL_<T>`/`AI_TEMPERATURE_<T>`/
    `AI_TOP_K_<T>`/`AI_MAX_CONTEXT_<T>` con fallback a los generales.
  - **Follow-ups**: todas las funciones aceptan `history`; `normalizeHistory` acota a
    `AI_HISTORY_MAX_TURNS` turnos y `AI_HISTORY_MAX_CHARS` chars. El prompt pasó de string a
    lista de **mensajes chat** (`[{role,content}]`) para separar system/historial/pregunta.
  - `callLlm`/`callLlmStream` ahora aceptan `opts` (model/temperature) y prompt|messages.
  - `getAiStatus` reporta `toolsEnabled`.
- `backend/src/sockets/ai.js`: `ai:ask` y `ai:assist_planning` aceptan `history` opcional.
- `backend/src/routes/rag.js`: `POST /ai/ask` y `POST /ai/assist-planning` aceptan `history`.
- `backend/src/services/ai.test.js`: stubs actualizados a mensajes chat; +6 tests F12
  (tool-loop, fallback, prompt citar-o-abstenerse, follow-up, normalizeHistory, resolveTaskConfig).
- `backend/src/services/rag.f11.test.js`: 1 stub aplanado a texto (el servicio ahora manda
  mensajes chat, no un string). Sin cambio de comportamiento verificado por el test.
- `frontend/src/lib/socket.js`: `streamAiAsk` acepta y emite `history`.
- `frontend/src/lib/api.js`: `aiAsk`/`aiAssistPlanning` aceptan `history`.
- `frontend/src/components/AI/AIPanel.jsx`: **score visible** por fuente, botón **Regenerar**
  (reusa la última consulta y el historial previo), **panel de depuración de retrieval**
  colapsable (usa `POST /rag/search` para mostrar chunks con score/heading_path/snippet),
  **memoria corta** de conversación para follow-ups (últimos 6 turnos) + botón "Nueva
  conversación". Badge de motor muestra 🛠️ si `toolsEnabled`. Streaming de F9 intacto.
- `.env.example`: nuevas envs documentadas (sección F12).

## Envs nuevas
- `AI_TOOLS_ENABLED` (0/1, default 0): activa el orquestador de tools. Solo con proveedores
  con function-calling (típico `AI_PROVIDER=api`); Ollama local usa fallback.
- `AI_TOOL_MAX_ITERS` (default 4): tope de iteraciones del loop de tools.
- `AI_TEMPERATURE` (default 0.4): temperatura general (fallback de la config por tarea).
- `AI_MODEL_<TAREA>` / `AI_TEMPERATURE_<TAREA>` / `AI_TOP_K_<TAREA>` / `AI_MAX_CONTEXT_<TAREA>`
  para TAREA ∈ {RULES, SUMMARY, PLANNING}: overrides por tarea con fallback a los generales.
- `AI_HISTORY_MAX_TURNS` (default 6) y `AI_HISTORY_MAX_CHARS` (default 4000): cota del historial.

## Diseño del orquestador de tools + fallback
1. `answerRulesQuestion`/`streamRulesQuestion` deciden la ruta: si `AI_TOOLS_ENABLED` y hay
   cliente de tools (inyectado o `apiLlmTools`), usan `runToolLoop`; si no, inyección de contexto.
2. `runToolLoop` arma `[{system}, ...history, {user}]`, llama al cliente de tools con
   `TOOL_SCHEMAS`. Si el asistente pide `tool_calls`, ejecuta cada una vía `executeTool` (con
   el `context` de scope), añade `role:'assistant'` (con tool_calls) + un `role:'tool'` por
   resultado, y reitera. Cuando el asistente responde en texto, devuelve `{ answer, sources }`.
   Si se agotan las iteraciones, fuerza una respuesta directa (degradación elegante).
3. Las `sources` en modo tools se derivan de los chunks devueltos por `retrieve_rules`
   (dedup por `doc_title::heading_path`), manteniendo el contrato `{ answer, sources }`.
4. Fallback = comportamiento previo: `retrieveRules` (hybridSearch + empaquetado por
   presupuesto) → prompt con contexto estructurado → `callLlm`/`callLlmStream`.
5. **Todo verificable sin Ollama**: `setLlmToolsClient` inyecta un stub que "pide" una tool
   y luego responde; las tools corren contra la DB con embeddings stubbeados.

## Resultado de verificación (Docker, canónico, sin --profile ai)
- lint (backend, en contenedor): ✅ `docker compose exec backend npm run lint` → 0 errores/warnings.
- build (frontend, en imagen): ✅ `docker compose build frontend` → lint + build OK (RUN steps).
- test (backend, en contenedor): ✅ `docker compose exec backend npm test` → 107 pass, 0 fail,
  1 skipped (108 subtests). Incluye tool-loop, fallback, prompt citar-o-abstenerse, follow-up.
- health: ✅ `curl /api/health` → 200 `{status:ok, vecEnabled, ftsEnabled, ai:{...}}`.
- ai/status: ✅ `curl /api/ai/status` → 200 con `toolsEnabled:false` y degradación clara
  (llm/embeddings `ok:false` con error legible porque los modelos Ollama no están pulled; sin crash).
- git status: ✅ sin `node_modules` residual.

## Lecciones aplicadas
- **better-sqlite3 síncrono / prepared statements** (SQLite): todas las tools usan
  `db.prepare(...).get()/.all()` sin async/await sobre la DB.
- **session_events append-only** (Backend): `get_event_history`/`get_stats` solo LEEN el log.
- **Cero estilos inline / cero window.innerWidth** (Frontend): la nueva UX del AIPanel usa
  solo clases Tailwind + tokens y breakpoints; el panel de debug y los scores no miden ancho en JS.
- **Componentes cableados y accesibles** (Frontend): la UX nueva vive dentro del AIPanel ya
  montado en la sesión; no hay componentes huérfanos.
- **ESLint 9 flat config del frontend**: no se introdujeron disables a plugins no registrados;
  `line-clamp-2` es utilidad core de Tailwind 3.4 (sin plugin extra).
- **Lint/test en el entorno canónico (Docker)**: todo se ejecutó en contenedor, no "en teoría".
- **node_modules residual envenena el build** (Docker): no se corrió npm install en el dir montado.

## Decisiones tomadas
- **Prompt string → mensajes chat**: para soportar system prompt separado + historial +
  tool-use, `callLlm`/`callLlmStream` ahora reciben `[{role,content}]`. Consecuencia: dos tests
  previos (ai.test.js:62 y rag.f11.test.js:180) que inspeccionaban el prompt como string se
  ajustaron para aplanar los mensajes a texto (sin cambiar lo que verifican). Ollama `/api/generate`
  (no-chat) recibe el texto aplanado vía `promptText()`; la API OpenAI recibe los mensajes nativos.
- **Tool-use no hace streaming token-a-token**: con tools, la respuesta se produce tras el loop;
  se emite completa como un único token por el socket (el streaming real sigue en el fallback).
  Decisión pragmática: el streaming incremental durante un loop de tools añade complejidad sin
  valor claro para v1.0.
- **`context` pisa los args del modelo** en `executeTool` para claves de scope: evita fuga de
  datos entre mesas si el modelo alucina un id.
- Sin dependencias nuevas (`npm install`): todo con Node/Express/better-sqlite3 existentes.

## Candidatos para LEARNINGS.md
- **(IA/Arquitectura) Tool-use con fallback por config, no por proveedor hardcodeado.** El
  orquestador se activa con `AI_TOOLS_ENABLED` + presencia de cliente de tools; con Ollama local
  (sin function-calling fiable) cae a inyección de contexto. Mantener las tools como funciones
  internas testeables (aiTools.js) desacopla la lógica del LLM y permite verificar el loop con
  un stub que "pide" una tool. Por qué importa: probar tool-use sin depender de un LLM real.
- **(Testing) Cambiar el contrato interno prompt→mensajes rompe tests que inspeccionan el prompt
  como string.** Al pasar de un prompt string a `[{role,content}]`, los stubs/aserciones que
  hacían `.match`/`.includes` sobre el arg deben aplanar los mensajes. Conviene que los stubs de
  LLM acepten ambas formas desde el principio. Por qué importa: evita romper features previas (F11).
- **(IA) Prompts endurecidos: cláusula anti-alucinación reutilizable.** Centralizar "no inventes /
  cita o abstente" en una constante compartida por las tres tareas mantiene el tono y facilita
  testear la instrucción con un assert sobre el system prompt.

## Bloqueantes
Ninguno.

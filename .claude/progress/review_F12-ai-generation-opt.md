# Revisión: F12 — Generación + tools + UX (optimización de IA)
Fecha: 2026-07-01
Veredicto: APROBADO

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa EN EL CONTENEDOR (`docker compose exec backend npm run lint` → 0 errores/warnings).
- [x] Lint + build frontend pasan vía `docker compose build frontend` (RUN npm run lint + RUN npm run build en el build stage; imagen construida).
- [x] No hay "lint ✅" declarado sin ejecutarlo en el contenedor.
- [x] No hay código comentado sin explicación; comentarios explican el porqué.
- [x] No hay `console.log` de debug (grep sin resultados en los archivos nuevos/tocados).
- [x] `better-sqlite3` usado de forma **síncrona** (todas las tools y `getSessionState`/`getEventHistory` usan `db.prepare().get()/.all()` sin async/await sobre la DB; el único async en tools es `retrieve_rules`, por la red de embeddings — correcto).
- [x] **Prepared statements** siempre; sin interpolación de SQL.
- [x] `session_events` tratado como **append-only** (`get_event_history`/`getEventHistory`/`get_stats` solo SELECT).
- [x] Frontend: estilos **solo** Tailwind + tokens. Cero `const s = {…}`, cero `style={{…}}` (grep sin resultados en `AIPanel.jsx`).
- [x] Frontend: responsive con clases Tailwind; **cero `window.innerWidth`** / `useWindowWidth`.
- [x] Nombres descriptivos en inglés; funciones con una sola responsabilidad.
- [x] Sin dependencias nuevas (verificado en el reporte; no hay cambios en package.json de deps).
- [x] Tests existen y cubren caso feliz + casos de error (tool-loop, fallback, prompt citar-o-abstenerse, follow-up, normalizeHistory, resolveTaskConfig, errores de tools).
- [x] Contrato `{ answer, sources }` NO roto (se conserva; `citations` alias; `sources` con `score`).
- [x] Respeta estructura de `.claude/docs/architecture.md` (tools en `services/`, router delgado, socket handler delgado).
- [x] Componentes cableados: la UX nueva vive dentro de `AIPanel.jsx` ya montado en la sesión (no huérfanos).
- [x] Reporte del implementer presente (`impl_F12-ai-generation-opt.md`).
- [x] Reporte del reviewer escrito (este archivo).
- [x] Sin archivos fuera de scope (todo lo modificado/creado coincide con el reporte; `current.md` y `feature_list.json` son tracking del harness).
- [x] Sin `node_modules` residual tras el build.

## Resultado de verificación (Docker — canónico, SIN --profile ai)
Comandos ejecutados literalmente en `C:\Users\gabri\dev\rolapp-v1`:

- `docker compose up -d --build` → ✅ Backend y Frontend construidos y arrancados.
- `docker compose exec backend npm run lint` → ✅ **0 errores / 0 warnings** (`eslint src scripts`, exit 0).
- `docker compose exec backend npm test` → ✅ **tests 108 / pass 107 / fail 0 / skipped 1** (duration ~390 ms). Incluye:
  - `tool-loop: el orquestador ejecuta la tool pedida y produce { answer, sources }` (LLM stub pide `retrieve_rules` → se ejecuta → 2ª llamada responde en texto; verifica que el resultado se inyectó como `role:'tool'`).
  - `fallback: con tools deshabilitadas usa inyección de contexto` (aunque haya tools-client inyectado, con `AI_TOOLS_ENABLED` OFF NO se llama; usa `REGLAS RECUPERADAS`).
  - `prompts: el system prompt de reglas obliga a citar-o-abstenerse` (`/no inventes/i` + `/No encuentro esa información|absten/i`).
  - `follow-up: el backend acepta historial y lo incluye acotado`.
  - `normalizeHistory` y `resolveTaskConfig`.
- `docker compose build frontend` → ✅ **lint + build OK** (RUN npm run lint y RUN npm run build en el build stage; imagen `rolapp-v1-frontend:latest` construida, exit 0).
- `curl -s http://localhost:3000/api/health` → ✅ `{"status":"ok","version":"1.0.0","vecEnabled":true,"ftsEnabled":true,"ai":{"provider":"ollama","model":"qwen2.5:3b"}}`.
- `curl -s http://localhost:3000/api/ai/status` → ✅ 200 con `toolsEnabled:false`, `vecEnabled:true`, `ftsEnabled:true`, y **degradación elegante**: `llm.ok:false` / `embeddings.ok:false` con `error` legible (404 model not found, porque se corrió SIN --profile ai y los modelos Ollama no están pulled), `ready:false`. Sin 500 ni crash.
- `git status --short` → ✅ sin `node_modules` residual. Archivos tocados dentro del scope declarado.

Resumen:
- lint:  ✅
- build: ✅
- test:  ✅ [107 pass, 0 fail, 1 skipped / 108 subtests]
- health / ai-status: ✅ [200, contrato y degradación correctos]

## Verificación de los objetivos F12
- **Tool-use real con fallback:** ✅ Orquestador `runToolLoop` en `services/ai.js`; 5 tools internas testeables en `services/aiTools.js` (`retrieve_rules`, `get_character`, `get_session_state`, `get_event_history`, `get_stats`) con `TOOL_SCHEMAS` y `executeTool`. Se activa por env (`AI_TOOLS_ENABLED`) + presencia de tools-client; si no, fallback por inyección de contexto. Tests del loop y del fallback presentes y en verde. `executeTool` fusiona `context` (scope gameSystemId/sessionId) POR ENCIMA de los args del modelo — evita fuga entre mesas (test dedicado).
- **Prompts endurecidos:** ✅ Constante `NO_HALLUCINATION` reutilizada en RULES/SUMMARY/PLANNING (ES consistente, "no inventes / cita o abstente / No encuentro esa información"). Test asserta la instrucción sobre el system prompt.
- **Config por tarea:** ✅ `resolveTaskConfig(task)` lee `AI_MODEL_<T>`/`AI_TEMPERATURE_<T>`/`AI_TOP_K_<T>`/`AI_MAX_CONTEXT_<T>` con fallback a generales; documentado en `.env.example` (sección F12). Test verifica override + fallback.
- **Follow-ups:** ✅ Backend acepta `history` (socket `ai:ask`/`ai:assist_planning`, rutas `POST /ai/ask` y `/ai/assist-planning`); `normalizeHistory` acota turnos/chars. `AIPanel` mantiene memoria corta (`MAX_HISTORY_TURNS`) + botón "Nueva conversación".
- **UX (`AIPanel.jsx`):** ✅ Fuentes con `score` (`fmtScore`), botón **Regenerar** (reusa última consulta y historial previo), **panel de depuración de retrieval** colapsable (vía `POST /rag/search`), badge de motor con 🛠️ si `toolsEnabled`, streaming de F9 intacto. Solo Tailwind, sin inline, sin `window.innerWidth`. Componentes cableados en la vista de sesión.
- **Degradación elegante:** ✅ `/api/ai/status` con `toolsEnabled`; probes atrapan errores (no lanzan). Router `rag.js` mapea errores a 503/422 y el `getAiStatus` degrada a `ready:false` sin 500. Contrato `{answer, sources}` intacto.

## Lecciones aplicadas correctamente
- **better-sqlite3 síncrono / prepared statements:** ✅ Confirmado en `aiTools.js` y `ai.js`.
- **session_events append-only:** ✅ Solo lectura en tools de historial/stats.
- **Cero estilos inline / cero window.innerWidth:** ✅ Confirmado por grep en `AIPanel.jsx`.
- **Componentes cableados y accesibles:** ✅ UX dentro del AIPanel ya montado; sin huérfanos.
- **ESLint 9 flat config sin disables a plugins no registrados:** ✅ Lint 0. `line-clamp-2` es utilidad core (tailwindcss ^3.4.17).
- **Lint/test en entorno canónico (Docker):** ✅ Todo ejecutado en contenedor.
- **node_modules residual:** ✅ No hay residual.

## Puntos a corregir (si RECHAZADO)
No aplica — APROBADO.

## Observaciones (no bloqueantes)
1. El mensaje de "IA no disponible" en `AIPanel.jsx` sugiere `docker compose --profile ai up` + `scripts/ai-bootstrap.sh`. Es coherente con `.env.example` (el perfil `ai` es opcional y separado de la verificación canónica). No es un fallo; solo dejar constancia de que el arranque canónico SIN --profile ai deja `ready:false` de forma esperada (modelos Ollama no pulled).
2. El streaming token-a-token NO aplica en modo tool-use (la respuesta se emite completa como un único token tras el loop). Decisión pragmática documentada por el implementer; el streaming real sigue vivo en el fallback (ruta por defecto con Ollama local). Aceptable para v1.0.
3. `getSessionState`/`getEventHistory` en `ai.js` y sus equivalentes `get_session_state`/`get_event_history` en `aiTools.js` duplican queries casi idénticas. No bloqueante; candidato a consolidación futura (ver LEARNINGS).

## Candidatos para LEARNINGS.md
- **(IA/Arquitectura) Tool-use con fallback por config, no por proveedor hardcodeado.** Activar el orquestador con `AI_TOOLS_ENABLED` + presencia de tools-client, con caída a inyección de contexto para Ollama local. Mantener las tools como funciones internas testeables (`aiTools.js`) desacopla la lógica del LLM y permite verificar el loop con un stub que "pide" una tool.
- **(Testing) Cambiar el contrato interno prompt→mensajes rompe tests que inspeccionan el prompt como string.** Al pasar a `[{role,content}]`, los stubs deben aplanar los mensajes. Conviene que los stubs de LLM acepten ambas formas desde el principio (evita romper features previas, p. ej. F11).
- **(IA) Cláusula anti-alucinación reutilizable.** Centralizar "no inventes / cita o abstente" en una constante compartida por las tres tareas mantiene el tono y facilita testear la instrucción sobre el system prompt.
- **(Arquitectura, del reviewer) Queries de estado de sesión duplicadas entre `ai.js` y `aiTools.js`.** La lógica de `get_session_state`/`get_event_history` casi replica `getSessionState`/`getEventHistory`. Considerar extraer un módulo compartido para que la fuente de verdad sea única y no diverja en features futuras.

# Implementación: F21-ai-tone (IA menos robótica — prompts por tarea)
Fecha: 2026-07-22
Status: completado

## Resumen
La causa raíz era la cláusula única `NO_HALLUCINATION` (doc-céntrica) concatenada a los 4
system prompts, que forzaba la frase enlatada "No encuentro esa información en los documentos
cargados" incluso en tareas que razonan sobre datos de sesión, y que el modelo local pequeño
sobre-obedecía. Se reemplazó por **variantes por tarea** con tono natural, se sacó todo el
lenguaje doc-céntrico de donde no aplica, y se ajustó el caso de contexto vacío en reglas.
Sin cambios de firmas ni de claves de retorno; retrieval, tool-loop y degradación intactos.

## Archivos modificados
- `backend/src/services/ai.js`:
  - **Eliminada** la constante única `NO_HALLUCINATION` (líneas ~315-319) y sus 4 usos.
  - **Creada** `RULES_GROUNDING` (anti-alucinación SOLO sobre reglas oficiales, tono natural).
  - Reescritos `RULES_SYSTEM`, `SUMMARY_SYSTEM`, `PLANNING_SYSTEM` y `SESSION_SYSTEM` (texto
    final abajo).
  - `buildRulesPrompt`: instrucción del mensaje `user` ahora es condicional a `chunks.length`
    (caso contexto vacío deja de empujar al rechazo robótico).
- `backend/src/services/ai.test.js`:
  - Reemplazado el test `prompts: … obliga a citar-o-abstenerse` (que aserta la frase antigua)
    por `prompts: … es natural, cita y no inventa reglas oficiales`.
  - Añadido `prompts: sin contexto, el prompt de reglas pide ayuda honesta (no rechazo robótico)`.
- `backend/src/services/ai.presets.test.js`:
  - Añadido `F21: el system prompt de sesión razona sobre datos de sesión y NO menciona documentos`.
- `.claude/feature_list.json`: F21-ai-tone → `in_progress` (NO marcado `done`).

## Constantes creadas / quitadas
- QUITADA: `NO_HALLUCINATION` (única, doc-céntrica, con frase enlatada).
- CREADA: `RULES_GROUNDING` — reutilizada por `RULES_SYSTEM` (y alineada con `PLANNING_SYSTEM`).
- Los 4 system prompts quedan con guías independientes por tarea.

## Texto final de cada system prompt

**RULES_GROUNDING** (usado por RULES_SYSTEM):
> Apóyate en las reglas recuperadas del contexto y cita entre corchetes la sección que respalda
> cada afirmación, p. ej. [Combate > Iniciativa]. Nunca presentes como regla oficial algo que no
> esté en el contexto. Si lo que se pregunta no aparece en las reglas cargadas, dilo con
> naturalidad y, si te sirve, ofrece una orientación general dejando claro que es una sugerencia
> NO oficial; evita rechazos secos y frases enlatadas.

**RULES_SYSTEM** (answerRulesQuestion / streamRulesQuestion):
> Eres el asistente de reglas de una mesa de rol. Responde SIEMPRE en español con un tono
> natural, conversacional y útil (nada robótico). Cuando tengas reglas recuperadas, sé directo y
> factual. + RULES_GROUNDING

**SUMMARY_SYSTEM** (summarizeSession):
> Eres el cronista de una mesa de rol. Resume la sesión en español con un tono natural y cercano,
> razonando ÚNICAMENTE sobre el contexto de la sesión que se te da (eventos, personajes,
> atributos, inventarios, notas y resúmenes previos), que es tu única fuente. Estructura:
> **Qué pasó:** … / **Decisiones clave:** … / **Hilos abiertos:** …
> Sé conciso y concreto y no inventes hechos que no estén en el contexto. Si la sesión apenas
> comienza y aún no hay actividad que resumir, dilo en una sola línea breve y natural, sin frases
> enlatadas.

**PLANNING_SYSTEM** (assistPlanning / streamPlanning):
> Eres el asistente de planificación del DM. Responde en español con un tono natural y creativo,
> y PROPÓN SIEMPRE ideas concretas y accionables (encuentros, eventos, giros, NPCs) apoyadas en
> el estado actual de la sesión y en las reglas recuperadas. Cita entre corchetes las reglas
> relevantes cuando las uses. No presentes como regla oficial algo que no esté en las reglas:
> ofrece esas ideas marcadas como sugerencia. Nunca te niegues a proponer ni recites frases de
> rechazo; tu trabajo es inspirar al DM.

**SESSION_SYSTEM** (streamSessionPreset — resumen/estado/cronología/inventarios):
> Eres el asistente de mesa del DM en una sesión de rol en vivo. Responde SIEMPRE en español, con
> un tono natural y útil, de forma concisa y factual, razonando ÚNICAMENTE sobre el contexto de
> la sesión que se te proporciona (eventos, personajes, atributos, inventarios, notas y resúmenes
> previos), que es tu única fuente; no inventes datos que no estén en el contexto. Si la sesión
> tiene poca actividad todavía, dilo en una sola línea breve y natural (p. ej. "La sesión apenas
> comienza; aún no hay eventos que resumir"), sin frases enlatadas.

## Manejo del caso contexto-vacío en reglas
`buildRulesPrompt` ahora elige la instrucción del mensaje `user` según `chunks.length`:
- **Con contexto:** "Responde la pregunta apoyándote en las reglas recuperadas y cita las
  secciones entre corchetes."
- **Sin contexto (chunks vacío):** "No se recuperaron reglas para esta consulta. Reconoce con
  naturalidad que eso no aparece en las reglas cargadas y, si puedes, ofrece una orientación
  general útil marcada claramente como sugerencia NO oficial. No inventes una regla como si fuera
  oficial ni respondas con una frase enlatada de rechazo."
`renderRules([])` sigue devolviendo `''`, así que sin contexto no aparece el bloque "REGLAS
RECUPERADAS". Aplica igual a la ruta streaming (comparte `buildRulesPrompt`).

## Nota de diseño (ajuste durante la implementación)
Los primeros borradores de `SUMMARY_SYSTEM`/`SESSION_SYSTEM` incluían la instrucción negativa
`Nunca menciones "documentos cargados"`, que (a) contenía literalmente la frase a evitar y (b)
con un modelo pequeño la negación puede *primar* justo lo que se prohíbe. Se reformuló en
positivo ("…que es tu única fuente"), sin usar la palabra "documento" en esos dos prompts. Esto
hace además que el guardián de regresión (`doesNotMatch(/documentos cargados/i)`) sea significativo.

## Tests ajustados y por qué
- `ai.test.js`: el test antiguo aserta `/No encuentro esa información|absten/i` sobre el system
  prompt — esa frase ya no existe. Se sustituyó por aserciones del nuevo tono (`/regla oficial/i`,
  `/natural/i`, `/no oficial/i`) + `doesNotMatch` de la frase enlatada. Se añadió un test del caso
  sin contexto que verifica que la instrucción `user` pide orientación útil (no rechazo) y que no
  hay bloque "REGLAS RECUPERADAS".
- `ai.presets.test.js`: nuevo test que captura el system prompt de `streamSessionPreset` y verifica
  que razona sobre "contexto de la sesión", tiene tono "natural" y NO contiene "documentos cargados".
- Ningún test de contrato fue debilitado: los que verifican `{ answer, sources }` /
  `{ suggestion, sources }` / presets `{ answer, sources: [] }` siguen intactos y en verde.

## Resultado de verificación (entorno canónico Docker, imagen backend reconstruida)
Comandos exactos:
```
docker compose build backend
docker compose run --rm --no-deps backend npm run lint
docker compose run --rm --no-deps backend npm test
```
- lint:  ✅ (eslint src scripts, exit 0)
- build: No aplica (backend puro; imagen reconstruida OK para correr lint/test)
- test:  ✅ 144 tests / 143 pass / 0 fail / 1 skipped (pre-existente de F12)
  - ✅ `prompts: … es natural, cita y no inventa reglas oficiales`
  - ✅ `prompts: sin contexto, el prompt de reglas pide ayuda honesta (no rechazo robótico)`
  - ✅ `F21: el system prompt de sesión razona sobre datos de sesión y NO menciona documentos`
- Higiene: sin `node_modules` residual en el host; contenedores `run` limpiados con `--rm`.

## Checklist
- [x] `NO_HALLUCINATION` única reemplazada por variantes por tarea.
- [x] Reglas: anti-alucinación sobre reglas oficiales con tono natural (cita o matiza sin frase fija).
- [x] Sesión/Resumen: razonan solo sobre contexto de sesión, sin lenguaje doc-céntrico.
- [x] Planificación: creativa, propone siempre; anti-alucinación solo sobre reglas oficiales.
- [x] Caso contexto-vacío en `buildRulesPrompt` ajustado (aplica también a streaming).
- [x] Retrieval (`retrieveRules`/`hybridSearch`/`packWithinBudget`), tool-loop (`runToolLoop`) y
      degradación elegante INTACTOS.
- [x] Contratos de retorno sin cambios (`{ answer, sources, citations }` / presets / planning).
- [x] Tests actualizados sin debilitar contratos; lint + tests en verde en Docker.
- [x] Fuera de alcance respetado: NO se tocó `rag.js`, `aiTools.js`, `embeddings.js`, sockets ni rutas.

## Lecciones aplicadas
- "El lint/test debe poder correr en el entorno canónico (Docker)": corrí `lint` y `test` con
  `docker compose run --rm --no-deps backend …`.
- "El backend baked-in no toma cambios sin rebuild": el primer run corrió código viejo (el compose
  del backend NO monta `src/` como volumen). Reconstruí la imagen (`docker compose build backend`)
  antes de re-verificar. (Candidato a LEARNINGS abajo.)
- "Cada servicio con imagen Docker necesita .dockerignore / sin node_modules residual": verificado
  que el host sigue limpio.

## Candidatos para LEARNINGS.md
- **El servicio `backend` de compose NO monta `src/` como volumen** (solo `./data` y `./game-packs`).
  Verificar cambios de backend requiere `docker compose build backend` ANTES de `docker compose run
  --rm backend npm test`; si no, se corre el código viejo horneado y los asserts pasan/fallan sobre
  la versión anterior (síntoma engañoso: el test muestra el nombre viejo del test).
- **Negar una frase en un system prompt puede primarla en modelos pequeños:** preferir formular el
  alcance en positivo ("tu única fuente es el contexto de la sesión") a prohibir literalmente
  ('Nunca menciones "documentos cargados"'), que además reintroduce la frase a evitar.

## Bloqueantes
Ninguno.

## Nota de scope
En el working tree aparecen también cambios en `frontend/src/components/Session/SessionToolbar.jsx`,
`session.test.jsx`, `.claude/LEARNINGS.md`, `.claude/progress/current.md` y archivos nuevos de F20:
NO son míos (los selló el auto-commiteador del entorno / quedaron de F20). Mis únicos cambios son
`backend/src/services/ai.js` + sus dos tests y el flag `in_progress` en `feature_list.json`.

# Implementación: F26 — IA directa y exacta (menos chachara)

Fecha: 2026-07-23
Status: completado

## Resumen
Las respuestas de la IA divagaban (preámbulos y cierres de cortesía). Se añadió una
cláusula de estilo compartida `DIRECT_STYLE` concatenada a los CUATRO system prompts, se
cambió el tono de `RULES_SYSTEM` de "natural, conversacional" a "directo y factual"
(conservando citas `[Sección]` y la cláusula anti-alucinación `RULES_GROUNDING`), y se bajó
el default de temperatura de la tarea `rules`. Alcance: SOLO `backend/src/services/ai.js` y
sus dos test files. Cero cambios en retrieval, tool-loop y contratos de retorno.

## Archivos modificados
- `backend/src/services/ai.js`:
  - Nueva constante `DIRECT_STYLE` (cláusula de estilo directo/exacto, en POSITIVO).
  - `RULES_SYSTEM`: "tono natural, conversacional y útil" → "directa y factual (nada
    robótico, sin divagar)"; se mantiene `RULES_GROUNDING` (citas `[Sección]` +
    anti-alucinación) y se le concatena `DIRECT_STYLE`.
  - `SUMMARY_SYSTEM`, `PLANNING_SYSTEM`, `SESSION_SYSTEM`: se les concatena `DIRECT_STYLE`
    (se conserva íntegro el resto de F21: sesión/resumen razonan sobre contexto de sesión y
    no mencionan "documentos"; planeación sigue proponiendo ideas).
  - `resolveTaskConfig`: nuevo `TASK_DEFAULT_TEMP = { rules: 0.2, summary: 0.4, planning:
    0.4 }`; la tarea `rules` arranca en 0.2 (más determinista/seca). `AI_TEMPERATURE`
    (general) y `AI_TEMPERATURE_RULES` siguen teniendo prioridad sobre este default.
- `backend/src/services/ai.test.js`:
  - Import de `assistPlanning`; helper `assertDirectStyle(prompt, label)`.
  - Test de prompt de reglas actualizado (F21→F26): conserva anti-alucinación (`regla
    oficial`, `sugerencia NO oficial`) y el `doesNotMatch` de la frase enlatada; añade
    `directo/factual`, `doesNotMatch(/conversacional/i)` y `assertDirectStyle`.
  - Nuevo test: estilo directo en resumen (`summarizeSession`) y planificación
    (`assistPlanning`), verificando además que planeación sigue proponiendo (`/propón/i`).
  - Nuevo test: `rules` usa un default de temperatura más bajo, con `AI_TEMPERATURE_RULES` y
    `AI_TEMPERATURE` (general) con prioridad sobre ese default.
- `backend/src/services/ai.presets.test.js`:
  - Helper local `assertDirectStyle`; nuevo test: el system prompt de sesión exige estilo
    directo, conservando "contexto de la sesión" y sin "documentos cargados" (F21).

## Cláusula DIRECT_STYLE (pegada)
```
Estilo directo y exacto: abre con la respuesta misma y responde únicamente lo que se
pregunta, usando frases cortas o listas. Cada frase debe aportar información concreta.
Da la respuesta por terminada en cuanto quede completa.
```
Formulada EN POSITIVO a propósito (lección F21: negar/citar literalmente las frases de
relleno las prima en modelos pequeños). Describe el comportamiento deseado —empezar por la
respuesta (= sin preámbulo), ir al grano, cerrar al completar (= sin cierre de cortesía)—
sin reintroducir las frases de relleno prohibidas.

## Texto final de cada system prompt
**RULES_SYSTEM** (`RULES_GROUNDING` intacto en medio):
```
Eres el asistente de reglas de una mesa de rol. Responde SIEMPRE en español de forma
directa y factual (nada robótico, sin divagar). Apóyate en las reglas recuperadas del
contexto y cita entre corchetes la sección que respalda cada afirmación, p. ej. [Combate >
Iniciativa]. Nunca presentes como regla oficial algo que no esté en el contexto. Si lo que
se pregunta no aparece en las reglas cargadas, dilo con naturalidad y, si te sirve, ofrece
una orientación general dejando claro que es una sugerencia NO oficial; evita rechazos secos
y frases enlatadas. Estilo directo y exacto: abre con la respuesta misma y responde
únicamente lo que se pregunta, usando frases cortas o listas. Cada frase debe aportar
información concreta. Da la respuesta por terminada en cuanto quede completa.
```

**SUMMARY_SYSTEM** (estructura Qué pasó / Decisiones clave / Hilos abiertos intacta):
```
Eres el cronista de una mesa de rol. Resume la sesión en español con un tono natural y
cercano, razonando ÚNICAMENTE sobre el contexto de la sesión que se te da (eventos,
personajes, atributos, inventarios, notas y resúmenes previos), que es tu única fuente.
Estructura:
**Qué pasó:** los eventos importantes en orden.
**Decisiones clave:** qué decidieron los personajes y sus consecuencias.
**Hilos abiertos:** tramas o preguntas sin resolver para la próxima sesión.
Sé conciso y concreto y no inventes hechos que no estén en el contexto. Si la sesión apenas
comienza y aún no hay actividad que resumir, dilo en una sola línea breve y natural, sin
frases enlatadas. Estilo directo y exacto: abre con la respuesta misma y responde únicamente
lo que se pregunta, usando frases cortas o listas. Cada frase debe aportar información
concreta. Da la respuesta por terminada en cuanto quede completa.
```

**PLANNING_SYSTEM** (sigue proponiendo ideas):
```
Eres el asistente de planificación del DM. Responde en español con un tono natural y
creativo, y PROPÓN SIEMPRE ideas concretas y accionables (encuentros, eventos, giros, NPCs)
apoyadas en el estado actual de la sesión y en las reglas recuperadas. Cita entre corchetes
las reglas relevantes cuando las uses. No presentes como regla oficial algo que no esté en
las reglas: ofrece esas ideas marcadas como sugerencia. Nunca te niegues a proponer ni
recites frases de rechazo; tu trabajo es inspirar al DM. Estilo directo y exacto: abre con
la respuesta misma y responde únicamente lo que se pregunta, usando frases cortas o listas.
Cada frase debe aportar información concreta. Da la respuesta por terminada en cuanto quede
completa.
```

**SESSION_SYSTEM** (razona sobre contexto de sesión, no "documentos"):
```
Eres el asistente de mesa del DM en una sesión de rol en vivo. Responde SIEMPRE en español,
con un tono natural y útil, de forma concisa y factual, razonando ÚNICAMENTE sobre el
contexto de la sesión que se te proporciona (eventos, personajes, atributos, inventarios,
notas y resúmenes previos), que es tu única fuente; no inventes datos que no estén en el
contexto. Si la sesión tiene poca actividad todavía, dilo en una sola línea breve y natural
(p. ej. "La sesión apenas comienza; aún no hay eventos que resumir"), sin frases enlatadas.
Estilo directo y exacto: abre con la respuesta misma y responde únicamente lo que se
pregunta, usando frases cortas o listas. Cada frase debe aportar información concreta. Da la
respuesta por terminada en cuanto quede completa.
```

## ¿Se tocó la temperatura?
Sí. `resolveTaskConfig` ahora tiene `TASK_DEFAULT_TEMP = { rules: 0.2, summary: 0.4,
planning: 0.4 }`. La tarea `rules` baja de 0.4 → 0.2 por default (respuestas más
deterministas y secas). El default general (0.4) para summary/planning no cambia. La
precedencia se mantiene y está cubierta por test: `AI_TEMPERATURE_RULES` > `AI_TEMPERATURE`
(general) > default de tarea. NO rompe el test existente `resolveTaskConfig respeta env por
tarea con fallback al general` (con `AI_TEMPERATURE=0.5`, rules sigue cayendo a 0.5).

## Tests ajustados
- `ai.test.js`:
  - Modificado: `prompts: ... reglas es directo/factual, cita y no inventa reglas oficiales`.
  - Nuevo: `F26: los system prompts de resumen y planificación exigen estilo directo`.
  - Nuevo: `F26: rules usa un default de temperatura más bajo, con overrides con prioridad`.
- `ai.presets.test.js`:
  - Nuevo: `F26: el system prompt de sesión exige estilo directo (sin preámbulo ni cierre)`.
- NO se debilitó ninguna aserción de contrato (`{ answer, sources, citations }`, presets,
  planning) ni de F21 (citas, anti-alucinación, "sesión no menciona documentos").

## Resultado de verificación (entorno canónico Docker)
Comandos ejecutados:
- `docker compose build backend` → imagen reconstruida OK.
- Vigencia por HASH host↔imagen (los tres archivos del alcance coinciden):
  - `src/services/ai.js`          → `f7078069909303160beb17dec9ced780145822a0572e1ff88cb056075a4a47f3`
  - `src/services/ai.test.js`     → `8f5492365c6f1b191ab6afd11b5e0108d536ec51e4fbb20be091bbf0468c9efb`
  - `src/services/ai.presets.test.js` → `35511a853b250db85cb4804129e597ae01dec3b2d373a7a365524531e48a7146`
- `docker compose run --rm --no-deps backend npm run lint` → **exit 0**.
- `docker compose run --rm --no-deps backend npm test` → **exit 0**.

- lint:  ✅
- build: ✅ (imagen backend reconstruida; vigencia probada por hash)
- test:  ✅ 151 tests: 150 pass / 0 fail / 1 skipped (skip preexistente, no del alcance).
  Los 4 tests de F26 pasan (ok 81 sesión, ok 96 reglas, ok 97 resumen+planificación,
  ok 102 temperatura).
- Manual / e2e: No aplica en esta entrega (la prueba EN VIVO la hará el líder).
- node_modules residual: ninguno (todo corrió en contenedor).

## Lecciones aplicadas
- "Negar una frase en un system prompt puede primarla en modelos pequeños" (F21):
  `DIRECT_STYLE` se formuló EN POSITIVO, describiendo el estilo deseado (empezar por la
  respuesta, ir al grano, cerrar al completar) SIN reintroducir las frases de relleno a
  evitar ("aquí tienes", "espero que esto te ayude"...).
- "El servicio backend de compose NO monta src/: reconstruir antes de verificar": se
  reconstruyó la imagen antes de testear.
- "Prueba que la imagen está al día por HASH": se compararon los hashes host↔imagen de los
  tres archivos del alcance antes de correr lint/test.

## Decisiones tomadas
- Bajé el default de temperatura de `rules` a 0.2 (la feature invitaba a "considerar/evaluar"
  bajarla). Verificado que NO rompe el test de `resolveTaskConfig` porque los overrides de
  env conservan prioridad; añadí un test que fija ese contrato. Si el founder prefiere no
  cambiar el default, basta revertir `TASK_DEFAULT_TEMP.rules` a 0.4 (ya era configurable vía
  `AI_TEMPERATURE_RULES`).
- En el test de prompt de reglas reemplacé la aserción `/natural/i` (no protegida) por
  `directo/factual` + `doesNotMatch(/conversacional/i)`. `RULES_GROUNDING` conserva "dilo con
  naturalidad" (comunicar con naturalidad la ausencia de una regla), que NO contradice el
  estilo directo.
- Sin dependencias nuevas.

## Candidatos para LEARNINGS.md
- Para exigir "sin preámbulo/cierre" en prompts de modelos pequeños, formula el estilo en
  positivo ("abre con la respuesta", "cierra al completar") y compártelo como una única
  cláusula concatenada a todos los system prompts; así se testea con `assert.match` sobre
  frases presentes en vez de `doesNotMatch` de frases que la negación podría primar.
- Para bajar un default por tarea sin romper el test de fallback al general, mete el default
  de tarea como fallback de `numEnv('AI_TEMPERATURE', taskDefault)`: los overrides de env
  siguen ganando y el test existente (que fija `AI_TEMPERATURE`) no cambia.

## Bloqueantes / acción para el líder
- No bloqueante para el código. PENDIENTE DE ACCIÓN DEL LÍDER: `feature_list.json` tiene F26
  como `pending`. Se me pidió ponerlo `in_progress`, pero las reglas estrictas del
  implementer prohíben modificar `.claude/feature_list.json`, así que NO lo toqué. El líder
  debe cambiar F26 a `in_progress` (y luego a `done` tras la aprobación del reviewer).
- La prueba EN VIVO (preguntar a la IA y confirmar respuesta directa, sin filler) queda para
  el líder, como indica el encargo.

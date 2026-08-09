# Implementación: F37 — La IA de sesión no ve la sesión
Fecha: 2026-08-08
Status: completado

## Resumen en una línea

La pregunta libre de modo Sesión ahora manda un `sessionId` opcional; con él, el backend
inyecta el **estado de la sesión + el historial de eventos** (con los NPCs y participantes
que antes se tiraban) **además** de las reglas recuperadas. Sin `sessionId` no cambia nada.

---

## Diagnóstico del líder: confirmado punto por punto

Confirmé los tres defectos antes de tocar código, contra la DB real (`/data/rolapp.db`,
abierta en `readonly:true` desde el contenedor; **cero escrituras**):

1. **Causa raíz**: `ai:ask` no aceptaba `sessionId` (`sockets/ai.js:26` original) y
   `streamRulesQuestion` (`services/ai.js:666` original) solo llamaba a `retrieveRules()`.
   Confirmado.
2. **`renderEvents` tiraba datos**: la sesión 17 tiene 41 eventos, de los cuales 10 son
   narrativos; **3 son apariciones de NPC** cuyo nombre vive SOLO en `payload.npc_name`
   (`Brightlord Amaram` en los eventos 90 y 121 — ojo, `npc_id` viaja como `5` en uno y
   como `"5"` (string) en el otro — y `Vela la mensajera` en el 95). Y el evento 93
   (`El descenso al Abismo`) lleva `participants: [{id:4,Talani},{id:3,Buenatracio}]`.
   Todo eso se perdía. Confirmado.
3. **`session_reset` no estaba en el SKIP**: 16 de los 41 eventos de la sesión 17 son
   `session_reset`. Confirmado.

---

## Archivos creados

- `backend/src/services/ai.f37.test.js`: 16 tests de la feature (detalle abajo).

## Archivos modificados

### `backend/src/services/ai.js` (el grueso del cambio)

| Línea | Qué cambió | Por qué |
|-------|-----------|---------|
| `489-493` | `getEventHistory`: `session_reset` entra al `SKIP` | 16 de 41 eventos de la sesión 17 eran ruido puro que desplazaba eventos reales del contexto |
| `540-546` | **nuevo** `eventActorLabel(event)` | `e.actor` es siempre el username de `actor_id` (el DM que disparó). Si `actor_type === 'npc'` y hay `npc_name`, la etiqueta pasa a ser `NPC <nombre>` |
| `548-554` | **nuevo** `eventParticipantNames(event)` | Extrae los nombres de `payload.participants` (tolera strings sueltos y payloads sin la clave) |
| `556-567` | **nuevo** `renderEventLine(event)` | El formato de una línea de evento, extraído de `renderEvents` para poder empaquetarlo por presupuesto sin duplicar formato. Añade `(participantes: A, B)` |
| `569-573` | `renderEvents` ahora compone con `renderEventLine` | Un solo formato para los 4 presets y para el camino nuevo (misma fuente, lección F24) |
| `584-587` | **nuevo** `SESSION_CONTEXT_TOKEN_BUDGET` (env `AI_SESSION_CONTEXT_TOKEN_BUDGET`, default 1200) | Presupuesto **propio** para los eventos, independiente del de reglas |
| `593-603` | **nuevo** `packEventLines(lines, budget)` | Mismo patrón que `packWithinBudget`, pero prioriza los eventos **más recientes** y los devuelve en orden cronológico. Devuelve `{ lines, omitted }` |
| `609-618` | **nuevo** `collectSessionNpcs(events)` | Roster de NPCs que han actuado, deduplicado **por nombre** y en orden de aparición (ver "Decisiones tomadas") |
| `621-634` | **nuevo** `buildSessionContext(sessionId, {budget})` | Compone `ESTADO DE SESIÓN` + `NPCS QUE HAN APARECIDO` + `HISTORIAL DE EVENTOS` acotado. Devuelve `''` si la sesión no existe |
| `354-371` | **nuevo** `SESSION_RULES_SYSTEM` | System prompt del camino CON sesión: declara las dos fuentes y que, para preguntas de la partida, manda la sesión. Formulado en positivo (F21) y termina con `DIRECT_STYLE` (F26) |
| `725-757` | `buildRulesPrompt(query, chunks, history, **sessionBlock**)` | Con `sessionBlock === ''` el prompt es idéntico byte a byte al anterior. Con bloque: cambia system + instrucción, y el bloque se inserta **entre** las reglas y la pregunta |
| `762-793` | `answerRulesQuestion({..., sessionId = null})` | REST |
| `796-826` | `streamRulesQuestion({..., sessionId = null})` | Socket / streaming |

**Lo que NO toqué en `ai.js`** (verificado con `git diff | grep "^-"`, 24 líneas eliminadas,
ninguna de prompt existente): `DIRECT_STYLE`, `RULES_GROUNDING`, `RULES_SYSTEM`,
`SUMMARY_SYSTEM`, `PLANNING_SYSTEM`, `SESSION_SYSTEM`, `TASK_DEFAULT_TEMP` (rules sigue a
0.2), `resolveTaskConfig`, el pipeline de RAG y el schema.

### Resto

- `backend/src/sockets/ai.js:22-35` — `ai:ask` acepta `sessionId = null` y lo propaga. La
  validación (`query` y `gameSystemId` requeridos) no cambia: `sessionId` es opcional puro.
- `backend/src/routes/rag.js:134-152` — `POST /api/ai/ask` lee `session_id` y lo pasa como
  `sessionId: session_id || null`. **El frontend ya lo mandaba** (`api.js:336-340` acepta
  `sessionId` desde F9) y el backend lo ignoraba: era un contrato declarado a medias.
- `backend/src/services/aiTools.js:123-125` — `session_reset` también en el `SKIP` de
  `get_event_history`. Es el **mismo dato servido por dos caminos** (tool-use e inyección);
  blindar uno y olvidar el otro es la clase de bug de la lección F33. Cambio de una palabra;
  la ruta está dormida (`AI_TOOLS_ENABLED=0`) pero divergente no puede quedarse.
- `frontend/src/lib/socket.js:45-56` — `streamAiAsk` acepta `sessionId = null` y lo mete en
  el payload.
- `frontend/src/components/AI/AIPanel.jsx`:
  - `93-95` — **nuevo** helper puro exportado `freeAskSessionId(mode, sessionId)` (lección
    F20: el vitest del frontend no tiene jsdom, así que la lógica load-bearing se extrae).
  - `182-192` — `runFreeAsk(queryText, history, sectionType, **askSessionId**)`, que viaja
    también en `lastRun`.
  - `217` (modo Sistema → `null`) y `225` (modo Sesión → `sessionId`).
  - `239` — `regenerate()` reusa `lastRun.askSessionId`, para que regenerar reproduzca la
    MISMA consulta aunque el usuario haya cambiado de modo entretanto.
- `frontend/src/components/Session/session.test.jsx` — import + bloque `describe('freeAskSessionId (F37)')`.

---

## Tests escritos

`backend/src/services/ai.f37.test.js` (16 tests) — todos contra la **función real**:

**(a) renderEvents**
1. Un evento de NPC se atribuye a `NPC Brightlord Amaram`, no a `DM1`.
2. Un evento del DM (`actor_type:'dm'`) sigue atribuyéndose al username — **no-regresión**.
3. Los participantes específicos (`Talani, Buenatracio`) llegan a la línea, y la ubicación se conserva.
4. `eventParticipantNames` tolera payloads sin `participants`, con string, con nulos.
5. `getEventHistory` descarta `session_reset` junto a join/leave/end/message (16 resets → 0).

**(c) presupuesto — el riesgo que el líder marcó**
6. `packEventLines` prioriza los recientes y **mantiene el orden cronológico**.
7. **Un presupuesto de 1 token NUNCA recorta a cero**: siempre sobrevive el evento más reciente. (Éste es el guard contra el fallo silencioso: si el recorte vaciara el contexto, el síntoma sería idéntico al bug original.)
8. `buildSessionContext` trae estado + NPCs + eventos, y declara los omitidos.
9. `buildSessionContext(sesión inexistente)` → `''` sin lanzar.
10. `collectSessionNpcs` deduplica **por nombre** (cubre el `npc_id` 5 vs `"5"` real de la sesión 17).
11. El roster de NPCs **sobrevive a un recorte** de eventos por presupuesto.
12. Con `sessionId`: el prompt lleva `REGLAS RECUPERADAS` **y** `ESTADO DE SESIÓN`, el streaming emite 2 tokens, `sources.length > 0`, `citations === sources`, y el bloque de sesión va **después** de las reglas.

**(b) retrocompatibilidad**
13. **SIN `sessionId` el mensaje `user` se compara BYTE A BYTE** con el literal histórico (sin docs ingeridos, el bloque de reglas es `''`, así que la comparación exacta es posible). Además: system = `RULES_SYSTEM`, y ni `ESTADO DE SESIÓN` ni el nombre del NPC se filtran aunque la sesión TENGA eventos.
14. SIN `sessionId` y CON reglas: el user empieza por `=== REGLAS RECUPERADAS ===` y **termina exactamente** con la instrucción histórica.
15. Un `sessionId` inexistente degrada al camino de reglas sin lanzar.
16. `ai:ask` con y sin `sessionId` (socket falso, patrón de `sockets/chat.test.js`): ambas terminan en `ai:answer_done`; el prompt de la primera contiene `Vela la mensajera` y el de la segunda **no**.

`frontend/src/components/Session/session.test.jsx` (+3): `freeAskSessionId` devuelve el
sessionId en modo Sesión, `null` en modo Sistema, y `null` (no `undefined`) si aún no hay
sesión resuelta.

---

## Resultado de verificación

Entorno canónico (Docker). **Vigencia probada por HASH host↔imagen**, no por timestamp:

```
ai.js       3ba2e846f4f26d0c…  ==  3ba2e846f4f26d0c…
sockets/ai.js 8d3aff111724fe2a…  ==  8d3aff111724fe2a…
routes/rag.js 09235d1c2357ec26…  ==  09235d1c2357ec26…
aiTools.js  34c51420428172b6…  ==  34c51420428172b6…
```

- **lint backend**: ✅ `docker compose run --rm --no-deps backend npm run lint` → exit 0, cero salida.
- **test backend**: ✅ 199 tests, **198 pass, 0 fail**, 1 skipped (el skip es preexistente:
  `hybridSearch lanza error claro cuando vec y FTS están deshabilitados`, saltado porque
  vec/FTS están activos). Baseline antes de F37: 183 → +16.
- **build+lint frontend**: ✅ `docker compose build frontend` exit 0 (el Dockerfile fuerza
  `RUN npm run lint` y `RUN npm run build` en el build stage).
- **test frontend**: ✅ 15 archivos, **160/160**. Baseline 157 → +3. Corridos en contenedor
  efímero (`docker build --target build -t tmp` → `docker run --rm tmp npm test` → `docker rmi`),
  sin dejar `node_modules` en el host (verificado: no existe `frontend/node_modules`).
- **Manual / e2e**: ✅ (abajo).

---

## Prueba funcional real contra la sesión 17

`docker compose ps`: backend/frontend/ollama up. `/api/ai/status` → `ready:true`,
`model: qwen2.5:3b`, `vecEnabled:true`, `ftsEnabled:true`, `toolsEnabled:false`.

### Contexto que se construye para la sesión 17 (volcado de `buildSessionContext(17)`)

1623 chars ≈ **406 tokens** de 1200 de presupuesto → **`omitted = 0`, los 10 eventos
narrativos entran enteros**. Esto cierra el riesgo que marcó el líder: el recorte no es la
causa de nada aquí.

```
=== ESTADO DE SESIÓN: [DEMO] Asedio de la Torre ===
Campaña: Honor
- Buenatracio (DM1)
- Talani (Jugador1): Intellect=3, Willpower=3, Deflect=0, … Presence=2

=== NPCS QUE HAN APARECIDO ===
Brightlord Amaram, Vela la mensajera

=== HISTORIAL DE EVENTOS ===
DM1: [Campamento de Guerra › Tienda del Brightlord] (historia) Consejo de guerra — …
NPC Brightlord Amaram: (interacción) Amaram exige la Esquirla — Amaram promete gloria…
DM1: [Campamento de Guerra › Tienda del Brightlord] (interacción) Aceptan el encargo — …
DM1: (exploración) Tormenta eterna en el horizonte — …
DM1: [Las Llanuras Quebradas › El Abismo] (exploración) El descenso al Abismo — … (participantes: Talani, Buenatracio)
DM1: (historia) Un puente-hombre cae al abismo — …
NPC Vela la mensajera: (NPC) Vela trae noticias del frente — …
DM1: [Las Llanuras Quebradas › La Torre] (combate) Emboscada de los Fusionados — …
DM1: (recompensa) Botín inesperado: una gema corazón — …
NPC Brightlord Amaram: (historia) apareción en frente de los heroes
```

(Cero `session_reset`. Los tres NPCs y los participantes, presentes.)

### El camino REAL del usuario: socket `ai:ask` con `sessionId: 17`

Cliente socket.io real contra `backend:3001` por la red de compose, emitiendo el MISMO
payload que `streamAiAsk` desde `AIPanel`. Pregunta: **"¿qué NPC han aparecido hoy?"**,
`gameSystemId: 5`. **Respuestas literales, 5 corridas consecutivas:**

```
-- run 1 --  [sessionId=17] tokens=22 fuentes=8
Los NPC que han aparecido hoy son:
- Brightlord Amaram
- Vela la mensajera

-- run 2 --  [sessionId=17] tokens=13 fuentes=8
NPC Brightlord Amaram, NPC Vela la mensajera

-- run 3 --  [sessionId=17] tokens=11 fuentes=8
Brightlord Amaram, Vela la mensajera

-- run 4 --  [sessionId=17] tokens=13 fuentes=8
NPC Brightlord Amaram, NPC Vela la mensajera

-- run 5 --  [sessionId=17] tokens=19 fuentes=8
NPCs que han aparecido hoy: Brightlord Amaram, Vela la mensajera
```

**5/5 nombran a Brightlord Amaram y a Vela la mensajera.** Streaming token a token vivo
(11-22 tokens incrementales por respuesta) y `sources.length === 8` en todas: **citas y
streaming intactos**.

(Re-verificado 3 corridas más contra la imagen FINAL desplegada —hash `3ba2e846…`— tras el
último cambio de comentario: 3/3 `"Brightlord Amaram, Vela la mensajera"`, 11 tokens,
8 fuentes. Total: **11 de 11 corridas** nombran a los dos NPCs.)

### Control de retrocompatibilidad: la MISMA pregunta SIN `sessionId`

Es la prueba más limpia que hay: mismo modelo, misma temperatura, mismo retrieval; lo único
que cambia es el `sessionId`. **Reproduce exactamente el bug que reportó el founder:**

```
-- run 1 --  [sessionId=null] tokens=72 fuentes=8
[Empresas (Endeavors) :: 9. Empresas (Endeavor)] Los NPC aparecieron hoy según la
estructura establecida por el GM. El GM fue quien estableció la escena, los jugadores
decidieron qué hacer, y luego el GM pidió pruebas de habilidad y narró los resultados.

-- run 2 --  [sessionId=null] tokens=27 fuentes=8
No está especificado qué NPCs han aparecido hoy. [Empresas (Endeavors) > Estructura de una Empresa]
```

Cita de reglas irrelevante + rechazo honesto, igual que el 2026-08-08. El camino sin
`sessionId` no cambió ni un byte (y el test 13 lo asserta a nivel de string exacto).

### Vía REST (`POST /api/ai/ask`, contra el backend directo para esquivar el 504 de nginx, lección F23)

```
CON session_id=17 → HTTP 200 en 27.4s
"NPC Brightlord Amaram, Vela la mensajera"

SIN session_id     → HTTP 200 en 22.0s
"No hay información sobre qué NPC han aparecido hoy en las reglas cargadas.
 [Stormlight RPG — Guía Completa > 9. Empresas (Endeavors) > Estructura de una Empresa]"
```

### Efecto colateral esperado de (a): los 4 presets mejoran solos

`ai:session_preset` con `preset: cronologia` sobre la sesión 17 ahora produce, entre otras:

```
8. [Las Llanuras Quebradas › La Torre] - El NPC Vela la mensajera trae noticias del frente…
9. (historia) apareción en frente de los heroes - (NPC Brightlord Amaram)
```

Antes esas dos líneas habrían dicho `DM1:`. Sin cambiar una línea del código de presets.

### Preguntas de mecánica en modo Sesión (no-regresión)

`"¿cómo funciona la iniciativa en combate?"` con `sessionId=17` sigue respondiéndose desde
el manual y correctamente (turno Rápido/Lento, mayor Speed, desempate d20, 1 reacción,
Sorprendido), con `fuentes = 8` en todas las corridas. Ver observación O-1.

---

## Lecciones aplicadas

- **F21 (negar una frase la prima en modelos pequeños)** — el `SESSION_RULES_SYSTEM` está
  escrito en positivo ("la fuente que manda es el contexto de la sesión"), sin prohibir
  frases. Y me **ahorró introducir un bug**: ver "Decisiones tomadas", punto 3.
- **F33 (el mismo dato por dos caminos necesita el MISMO filtro)** — por eso toqué también
  el `SKIP` de `aiTools.js`.
- **F24 (dos vistas del mismo dato derivan de la misma fuente)** — `renderEvents` y el
  camino nuevo comparten `renderEventLine`; no hay dos formatos de evento.
- **F17 (extender = props opcionales retrocompatibles)** — `sessionId` opcional con default
  `null` en las cuatro firmas (servicio, socket, REST, cliente de socket); `sessionBlock`
  opcional con default `''` en `buildRulesPrompt`.
- **F20 (vitest del frontend sin jsdom → helper puro)** — `freeAskSessionId` exportado.
- **F26/F21 (prompts existentes)** — no se tocó ninguno; `git diff | grep "^-"` lo prueba.
- **Docker/infra F21 y "prueba por hash"** — reconstruí la imagen del backend antes de cada
  verificación y comparé `sha256sum` host↔imagen; el compose NO monta `src/`.
- **F8b/F20 (no ensuciar el build context)** — los tests del frontend corrieron en un
  contenedor efímero; `frontend/node_modules` sigue sin existir en el host.
- **F34/F36 (el fallo silencioso)** — de ahí el test 7 (presupuesto mínimo ≠ contexto cero)
  y el volcado literal del contexto de la sesión 17 en este informe.

---

## Decisiones tomadas

1. **Orden del prompt: reglas primero, sesión pegada a la pregunta.** En modelos pequeños
   lo más cercano a la consulta pesa más, y la pregunta que motiva F37 es sobre la partida.
   El test 12 fija ese orden como invariante.

2. **Añadí un bloque derivado `=== NPCS QUE HAN APARECIDO ===` al contexto de sesión.**
   Esto NO estaba en el encargo, así que lo justifico con la medición que lo motivó:
   con solo el arreglo de `renderEvents` (item (a)), el contexto era correcto y completo,
   pero qwen2.5:3b **nombraba solo a Amaram en 4 de 6 corridas** (el evento más reciente de
   la sesión es justamente de Amaram, y `DIRECT_STYLE` empuja a respuestas mínimas). Con el
   roster: **11 de 11 corridas nombran a los dos**. Es dato ESTRUCTURADO derivado del log
   append-only, genérico para cualquier sesión (no una respuesta enlatada), en la misma
   línea que los bloques `ESTADO DE SESIÓN` / `INVENTARIOS` que ya existían, y coherente con
   el principio "la IA accede a datos estructurados, no a volcados de texto". Bonus: se
   calcula sobre **todos** los eventos, no solo los que caben en el presupuesto, así que un
   recorte por espacio no puede borrar a un NPC.
   Dedupe **por nombre**, no por `npc_id`: en la DB real Amaram aparece con `npc_id: 5` y
   `npc_id: "5"`, y por id habría salido dos veces en la lista.

3. **Probé a forzar la cita inline en el camino con sesión y lo REVERTÍ.** Al repetir el
   ejemplo literal `p. ej. [Combate > Iniciativa]` en la instrucción del mensaje `user`,
   una de 3 corridas devolvió *"Las reglas están respaldadas por [Combate > Iniciativa]"* —
   una cita **inventada** (esa sección no existe en el doc de Stormlight; la real es
   `Guía Completa > 5. Combate > Estructura del Turno`). Es exactamente la lección F21:
   el ejemplo pegado a la generación se copia. Volví a la redacción sin ejemplo y dejé el
   hallazgo comentado en el código (`ai.js:732-734`) para que nadie lo "arregle" otra vez.

4. **Presupuesto de eventos configurable por env** (`AI_SESSION_CONTEXT_TOKEN_BUDGET`,
   default 1200) siguiendo el patrón de `RAG_CONTEXT_TOKEN_BUDGET`. Es independiente del de
   reglas a propósito: el encargo pedía "presupuesto de tokens propio para los eventos".

5. **`sessionId` no se toma de `socket.data`.** Podría parecer lo correcto por la lección
   F33, pero ahí el criterio era "el id de QUIÉN PREGUNTA sale del socket". Aquí `sessionId`
   es el **recurso consultado**, no la identidad, y el precedente del propio proyecto es
   `ai:session_preset`, que ya recibe `sessionId` por payload desde F18. Mantener la
   simetría con el handler hermano pesa más que inventar un patrón nuevo. (Lo anoto como
   observación abajo: los handlers de IA no comprueban pertenencia a la sesión — es
   preexistente y no lo cambié.)

6. **Sin dependencias nuevas.** `npm install` no se ejecutó en ningún paquete.

---

## Lo que decidí NO hacer (y por qué)

- **No toqué `DIRECT_STYLE`, `RULES_GROUNDING`, `RULES_SYSTEM`, `SUMMARY_SYSTEM`,
  `PLANNING_SYSTEM`, `SESSION_SYSTEM` ni `temperature`.** Prohibición explícita del encargo
  y, medido, innecesaria: el rechazo del camino sin sesión es la conducta correcta.
- **No toqué el pipeline de RAG/ingesta ni el schema.** Cero migraciones.
- **No metí un clasificador de intención ni tool-use.** Descartados por el founder.
- **No unifiqué `getEventHistory` (ai.js) con `getEventHistoryTool` (aiTools.js).** Sería lo
  correcto (son el mismo dato), pero `ai.js` importa `aiTools.js`, así que la deduplicación
  real exige mover el helper a un tercer módulo (`services/events.js`) y eso es refactor de
  otra feature. Me limité a igualar el `SKIP` y a dejarlo comentado en ambos sitios.
- **No añadí las notas del DM (`session_notes`) al contexto de sesión.** El encargo dice
  "eventos + estado"; las notas ya viven en el preset de resumen. Ampliar el contexto por mi
  cuenta gasta ventana del modelo sin que nadie lo haya pedido.
- **No cambié el orden ni el `topK` del retrieval de reglas en el camino con sesión.** Sería
  la palanca para reducir el ruido del manual en preguntas de partida, pero toca el
  retrieval (fuera de alcance) y ya no hace falta.

---

## Observaciones no bloqueantes (para el líder)

- **O-1 — Citas inline en preguntas de MECÁNICA dentro de modo Sesión.** El contrato de
  citas está intacto: `sources` llega siempre con 8 fuentes (score + snippet) y el panel
  "Fuentes" del `AIPanel` las pinta igual. Pero el modelo **rara vez** añade la cita entre
  corchetes *dentro del texto* cuando el prompt lleva las dos fuentes (0 de 5 corridas
  medidas; en modo Sistema sí las emite). La causa probable es la dilución de atención con
  el bloque de sesión de por medio. Intentar forzarlo con un ejemplo literal produjo una
  cita FALSA (ver Decisión 3), así que paré. Si al founder le importa, la vía sana es
  reducir el ruido de reglas cuando hay sesión (menos `topK`), no endurecer el prompt.

- **O-2 — Los handlers de IA no verifican pertenencia a la sesión.** `ai:ask` con
  `sessionId` devuelve el estado y los eventos de esa sesión a cualquier socket que lo pida,
  sin comprobar que el usuario esté en la mesa. Es la misma superficie que ya tenía
  `ai:session_preset` desde F18 (y `GET /api/sessions/:id/events`), o sea **preexistente y
  no introducida por F37**; ahora es una superficie más. La lección F33 recomienda que la
  identidad salga de `socket.data.userId`: cabría un guard `session_members`. No lo hice
  para no ampliar el alcance sin decisión del founder — **candidato a feature propia**.

- **O-3 — Los eventos con `payload.title` vacío quedan como líneas casi mudas.** El evento
  121 de la sesión 17 (`apareción en frente de los heroes`, sin descripción) renderiza
  `NPC Brightlord Amaram: (historia) apareción en frente de los heroes`. Es correcto, pero
  refleja que el dato de entrada es pobre; no es cosa del renderer.

- **O-4 — `AIPanel` sigue sin cobertura de render en modo Sesión con preset libre.** Lo
  load-bearing (`freeAskSessionId`) sí está cubierto, pero el runner no tiene jsdom, así que
  no se puede ejercitar el submit. Es la misma limitación de siempre (lección F20).

---

## Candidatos para LEARNINGS.md

1. **"El actor de un evento no es siempre quien lo escribió: sigue el payload hasta el
   render."** — `session_events.actor_id` guarda al DM que dispara, mientras que quien actúa
   en ficción vive en `payload.npc_name` con `actor_type:'npc'`. Cualquier vista que muestre
   "quién hizo algo" (IA, cronología, stats, TV) tiene que resolver la etiqueta desde el
   payload, no desde el JOIN con `users`. El síntoma es perfecto para pasar desapercibido:
   la línea se ve bien formada, solo que atribuida a la persona equivocada. Regla práctica:
   cuando una tabla tenga `actor_id` **y** un `actor_type` en el payload, el `actor_id` es la
   procedencia técnica y el payload es la verdad narrativa.

2. **"Un modo que se llama 'Sesión' pero cuyo contrato de transporte no acepta `sessionId`
   es un bug de contrato, no de prompt."** — El síntoma (respuestas irrelevantes, tono
   robótico) invita a retocar el system prompt; la causa estaba dos capas más abajo, en el
   payload del evento de socket. Antes de tocar un prompt, imprime el contexto REAL que se
   está mandando: aquí `buildSessionContext(17)` habría cerrado el diagnóstico en un minuto.
   Corolario de verificación: **la prueba definitiva de este tipo de arreglo es la MISMA
   pregunta con y sin el parámetro nuevo**, misma temperatura y mismo retrieval; si la
   versión sin parámetro reproduce el bug original palabra por palabra, la retrocompatibilidad
   y la causa raíz quedan demostradas a la vez.

3. **"Con un modelo pequeño, el dato correcto en el contexto no basta: hay que ponerlo
   también AGREGADO."** — Tras arreglar el render, los dos NPCs estaban en el contexto y el
   modelo seguía nombrando a uno solo en 4 de 6 corridas (sesgo de recencia + estilo directo).
   Añadir un bloque derivado y agregado (`NPCS QUE HAN APARECIDO: a, b`) llevó el acierto a
   11/11. Para preguntas de tipo "enumera X de la sesión", precomputa la lista en el contexto
   en vez de esperar que el modelo la extraiga del historial: es dato estructurado, es
   genérico, y de paso sobrevive a los recortes por presupuesto.

4. **"Un ejemplo literal de formato pegado a la generación se copia como contenido."** —
   Ampliación de F21 con evidencia nueva: el mismo ejemplo `[Combate > Iniciativa]` es
   inofensivo en el system prompt (donde lleva desde F21) y **tóxico** en la instrucción
   final del mensaje `user`, donde el modelo lo devolvió como cita inventada. Los ejemplos
   de formato van lejos de la generación; cerca, se convierten en respuesta.

---

## Bloqueantes

Ninguno.

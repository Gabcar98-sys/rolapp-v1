# Revisión: F37 — La IA de sesión no ve la sesión
Fecha: 2026-08-08
Revisor: reviewer (independiente)
Veredicto: **APROBADO**

> Todo lo que sigue lo verifiqué yo, ejecutando los comandos. Donde el informe del
> implementer afirmaba algo, lo re-probé por un camino distinto al suyo (comparación contra
> `git show HEAD`, mutación en contenedor efímero, cliente socket propio). Las cifras que
> aparecen aquí son las de MIS corridas, no las suyas.

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint backend en el contenedor: `docker compose exec backend npm run lint` → **exit 0**, sin hallazgos.
- [x] Lint + build frontend vía `docker compose build frontend` → **exit 0** (el Dockerfile fuerza `RUN npm run lint` y `RUN npm run build` en el build stage).
- [x] No se declaró ningún lint en verde sin ejecutarlo.
- [x] No hay código comentado sin explicación. Los comentarios nuevos son abundantes pero todos explican el *porqué* (conventions.md).
- [x] Cero `console.log` de debug: barrido del diff → ninguno.

### Código y patrones del proyecto
- [x] `better-sqlite3` síncrono. El código nuevo (`buildSessionContext`, `collectSessionNpcs`, `packEventLines`) no introduce un solo `await` sobre DB; reusa `getSessionState`/`getEventHistory`, que ya eran síncronos. Barrido de `await .*(db\.|prepare)` en el diff → ninguno.
- [x] Prepared statements: F37 no añade SQL nuevo; la única línea "SQL" tocada es el `Set` de tipos filtrados (JS, no SQL).
- [x] `session_events` append-only: cero `UPDATE`/`DELETE` sobre la tabla en el diff. El log solo se LEE.
- [x] Frontend sin estilos inline ni `window.innerWidth`: barrido de `style={{`, `const s = {` y `window.innerWidth` en el diff → ninguno. El cambio de frontend es lógica pura, no toca JSX de presentación.
- [x] Mobile-first / breakpoints: no aplica (no hay markup nuevo).
- [x] Nombres descriptivos en inglés, comentarios en español. Una responsabilidad por función: `eventActorLabel` / `eventParticipantNames` / `renderEventLine` / `packEventLines` / `collectSessionNpcs` / `buildSessionContext` están bien separadas.
- [x] Sin dependencias circulares: `aiTools.js` importa `db`, `rag.js` y `stats.js`; **no** importa `ai.js`. La dirección `ai.js → aiTools.js` sigue siendo única.

### Tests
- [x] **Vigencia de la imagen probada por HASH host↔imagen** (no por timestamp ni cache-hit), sobre los 5 archivos backend tocados:

  | archivo | host | imagen |
  |---|---|---|
  | `src/services/ai.js` | `3ba2e846f4f26d0c…` | `3ba2e846f4f26d0c…` |
  | `src/sockets/ai.js` | `8d3aff111724fe2a…` | `8d3aff111724fe2a…` |
  | `src/routes/rag.js` | `09235d1c2357ec26…` | `09235d1c2357ec26…` |
  | `src/services/aiTools.js` | `34c51420428172b6…` | `34c51420428172b6…` |
  | `src/services/ai.f37.test.js` | `f27035a50f79e4ab…` | `f27035a50f79e4ab…` |

  Comprobé además que el **contenedor en ejecución** (no solo la imagen) sirve ese mismo código: `docker compose exec backend sha256sum src/services/ai.js` → `3ba2e846…`. Y para el frontend, `docker build --target build` + `sha256sum` de `AIPanel.jsx` (`a601310…`), `lib/socket.js` (`a1adc72…`) y `session.test.jsx` (`4997078…`): idénticos host↔imagen, así que las capas cacheadas de `RUN npm run lint`/`RUN npm run build` se produjeron sobre ESTE contenido.
- [x] Existe al menos un test por función pública nueva no trivial (16 tests backend + 3 frontend; las 6 funciones exportadas nuevas están cubiertas).
- [x] Todos los tests pasan.
- [x] Caso feliz y casos de error cubiertos (sesión inexistente, payload sin `participants`, presupuesto mínimo, `npc_id` número vs string, sesión sin NPCs).

### Arquitectura
- [x] Respeta la estructura de `architecture.md`: servicio en `services/`, handler en `sockets/`, router delgado en `routes/`, socket del cliente en `lib/socket.js`.
- [x] Cero dependencias nuevas (`package.json` de ambos paquetes intacto en `git status`).
- [x] Cero cambios de esquema y cero migraciones.
- [x] `POST /api/ai/ask` no es endpoint nuevo; el body sigue la convención snake_case del proyecto (`session_id`, como `game_system_id`).

### Learnings
- [x] Se proponen 4 lecciones en el informe del implementer; añado 3 más abajo.

### Reporte
- [x] `.claude/progress/impl_F37-session-aware-ai.md` existe, con archivos tocados, decisiones y observaciones.
- [x] Este archivo.

### Scope
- [x] `git status` coincide exactamente con lo declarado: `backend/src/{services/ai.js, services/aiTools.js, sockets/ai.js, routes/rag.js}`, `frontend/src/{components/AI/AIPanel.jsx, components/Session/session.test.jsx, lib/socket.js}`, nuevo `backend/src/services/ai.f37.test.js`, más `.claude/`. Ningún archivo fuera del alcance. (`.claude/docs/online_deployment.md` es un untracked previo a la feature, no lo tocó.)

---

## Resultado de verificación (ejecutado por mí)

- **lint backend:** ✅ `docker compose exec backend npm run lint` → exit 0.
- **test backend:** ✅ `docker compose run --rm --no-deps backend npm test` → exit 0. **199 tests, 198 pass, 0 fail, 1 skipped.** El skip es preexistente y auto-declarado: `hybridSearch lanza error claro cuando vec y FTS están deshabilitados # SKIP vec/FTS activos`. De los 199, **16 son de F37** y los 16 pasan. Baseline coherente (199 − 16 = 183; no se borró ni editó ningún test previo del backend).
- **lint+build frontend:** ✅ `docker compose build frontend` → exit 0.
- **test frontend:** ✅ contenedor efímero (`docker build --target build -t <tag propio>` → `docker run --rm … npm test` → `docker rmi`). **15 archivos, 160/160.** `session.test.jsx` pasa de 14 a 17 tests (160 − 3 = 157 de baseline).
- **Host limpio:** ni `frontend/node_modules` ni `backend/node_modules` existen en el host antes ni después de mi revisión; `git status` al terminar es idéntico al del inicio. Toda mi verificación vivió en contenedores efímeros con etiquetas propias (`rolapp-review-f37-*`), ya eliminadas.

---

## 1. Retrocompatibilidad — VERIFICADA POR CAMINO INDEPENDIENTE

No me fié del test 13 (compara contra un literal, que podría haberse copiado del código nuevo).
Verifiqué de dos maneras:

**(a) Literal contra `git show`.** Extraje `HEAD:backend/src/services/ai.js` y comparé las
instrucciones históricas: el literal del test 13 ("No se recuperaron reglas para esta
consulta. …") y el del test 14 ("Responde la pregunta apoyándote en las reglas
recuperadas…") son **exactamente** los de HEAD. El test no es circular.

**(b) Ejecución simultánea de las dos versiones.** Monté un contenedor efímero con el
`ai.js` de HEAD como `ai_head.js` junto al actual, y comparé el array de `messages` que
cada uno entrega al LLM (comparación estricta) sobre la misma DB:

```
OK  A: sin sessionId, sin reglas          -> prompt idéntico a HEAD
OK  B: sin sessionId, con reglas          -> prompt idéntico a HEAD
OK  C: sin sessionId, con history         -> prompt idéntico a HEAD
OK  D: sin sessionId, con sectionType     -> prompt idéntico a HEAD
OK  E: sessionId INEXISTENTE              -> prompt idéntico a HEAD
OK  F (control positivo): con sessionId real SÍ cambia el prompt
```

El escenario F es el control que hace que los otros cinco signifiquen algo: si el arnés
comparase mal, F habría salido "iguales". La retrocompatibilidad queda demostrada **byte a
byte y contra HEAD**, no contra el propio código.

Complemento estructural: comparé por hash la región de los 7 prompts que el encargo prohibía
tocar.

```
DIRECT_STYLE  RULES_GROUNDING  RULES_SYSTEM  SUMMARY_SYSTEM
PLANNING_SYSTEM  SESSION_SYSTEM  TASK_DEFAULT_TEMP     ->  7/7 IGUAL a HEAD
```

Y las 23 líneas eliminadas de `ai.js` son todas del `SKIP`, del cuerpo de `renderEvents`, de
las firmas y de la reestructuración ternario → `if/else` de la instrucción (con literales
idénticos). **Ningún prompt existente fue modificado.**

---

## 2. Prueba funcional — REPETIDA POR MÍ

`/api/ai/status` desde la red de compose: `ready:true`, `model: qwen2.5:3b`,
`vecEnabled:true`, `ftsEnabled:true`, `toolsEnabled:false`.

Cliente socket.io propio (imagen efímera con `socket.io-client`), contra `backend:3001` por
la red de compose, emitiendo el MISMO payload que `streamAiAsk`. Sesión 17, `gameSystemId: 5`
(confirmado en la DB: sesión 17 → campaña "Honor" → sistema 5 "Stormlight RPG").

**CON `sessionId: 17`** — respuestas literales:

```
-- run 1 -- tokens=11 fuentes=8
Brightlord Amaram, Vela la mensajera

-- run 2 -- tokens=11 fuentes=8
Brightlord Amaram, Vela la mensajera

-- run 3 -- tokens=19 fuentes=8
NPCs que han aparecido hoy: Brightlord Amaram, Vela la mensajera
```

**3/3 nombran a los dos NPCs.** Streaming token a token vivo y `sources.length === 8` en
todas: citas y streaming intactos.

**SIN `sessionId`** (mismo modelo, misma temperatura, mismo retrieval — lo único que cambia
es el parámetro nuevo):

```
-- run 1 -- tokens=37 fuentes=8
No está especificado qué NPC han aparecido hoy. [Stormlight RPG — Guía Completa ::
Stormlight RPG — Guía Completa > 1. Introducción]

-- run 2 -- tokens=23 fuentes=8
No están especificadas qué NPC han aparecido hoy, solo las reglas sobre el manejo del combate.

-- run 3 -- tokens=31 fuentes=8
[Stormlight — Enemigos y Compañeros :: Cosmere RPG - Adversarios y Companeros > Compañeros] (general)
```

Es **exactamente el bug que reportó el founder**: cita de reglas irrelevante + rechazo
genérico. La misma pregunta, el mismo día, la misma DB: la causa raíz y la
retrocompatibilidad quedan demostradas con la misma corrida.

---

## 3. Fallo silencioso (clase F34/F36) — GUARD VALIDADO POR MUTACIÓN

**Mutación dentro de contenedor efímero** (lección F36: no toqué el árbol real; el
`git status` no se movió). Quité el guard de `packEventLines`
(`if (kept.length && used + cost > budget)` → `if (used + cost > budget)`) y corrí los tests
en la capa de escritura del contenedor:

```
not ok 7  - F37c: un presupuesto minúsculo NUNCA recorta el contexto a cero
not ok 8  - F37c: buildSessionContext trae estado + eventos y avisa de los omitidos
not ok 11 - F37c: el roster de NPCs sobrevive aunque el presupuesto recorte los eventos
# tests 17 # pass 14 # fail 3
```

El guard está **armado de verdad**: si alguien lo quita, tres tests se ponen rojos.

**Medición independiente sobre la DB REAL** (copia dentro del contenedor, original montada
`:ro`; ojo, hay que copiar también `rolapp.db-wal` o la sesión 17 aparece vacía):

```
Sesión 17 — eventos crudos: 41  (session_reset:16, session_leave:9, session_join:6,
                                 historia:3, interacción:2, exploración:2,
                                 recompensa:1, combate:1, NPC:1)
Eventos tras el SKIP:        10
Tokens de las líneas:       326
packEventLines(1200):       kept=10  omitted=0
buildSessionContext:        1692 chars ~ 423 tokens
NPCs derivados:             ["Brightlord Amaram","Vela la mensajera"]
¿contiene session_reset?    false
```

El contexto real entra ENTERO en el presupuesto: `omitted = 0`. El recorte no está
enmascarando nada. (El informe decía 1623 chars / 406 tokens; yo mido 1692 / 423. Diferencia
inmaterial y en la dirección segura.)

**Además probé el suelo del presupuesto por env**, contra la sesión real:

| `AI_SESSION_CONTEXT_TOKEN_BUDGET` | contexto resultante |
|---|---|
| `1` | 1185 chars, ambos NPCs presentes |
| `0` | 1692 chars, ambos NPCs |
| `abc` | 1692 chars, ambos NPCs |
| `-500` | 1185 chars, ambos NPCs |

`Math.max(200, Number(env) || 1200)` hace que ni un valor absurdo ni uno negativo puedan
vaciar el contexto. El riesgo que marcó el líder queda cerrado por tres vías: mutación,
medición real y barrido de env.

---

## 4. Cableado del frontend — DATO SEGUIDO DE PUNTA A PUNTA

No basta con que el helper exista. Seguí el valor:

1. `AIPanel.jsx:222-226` — rama `mode === 'session'` + `preset === 'libre'` (el camino exacto
   del founder) → `runFreeAsk(q, conversation, null, freeAskSessionId('session', sessionId))`.
2. `AIPanel.jsx:185-192` — `runFreeAsk(…, askSessionId)` → `streamAiAsk({ …, sessionId: askSessionId, … })`.
3. `lib/socket.js:50-56` — `streamAiAsk` mete `sessionId` en el payload y llama a `streamAi('ai:ask', payload)`.
4. `lib/socket.js:32` — `socket.emit('ai:ask', payload)`. **El `sessionId` viaja de verdad.**
5. `sockets/ai.js:29-34` — el handler lo desestructura y lo propaga a `streamRulesQuestion`.
6. Consumidores reales de `AIPanel`: `SessionView.jsx:100` y `SessionDetail.jsx:143-147`, ambos
   pasan `sessionId={session.id}`. No hay componente huérfano ni prop sin rellenar.

La rama de modo Sistema (`AIPanel.jsx:217`) manda `null` explícito, que es lo que preserva la
retrocompatibilidad medida en el punto 1. El test 16 del backend cierra el círculo desde el
otro lado: dispara `ai:ask` con y sin `sessionId` sobre un socket falso y asserta que el
prompt de la primera contiene `Vela la mensajera` y el de la segunda no.

---

## 5. Las dos decisiones fuera de encargo — JUZGADAS

### (a) El bloque `=== NPCS QUE HAN APARECIDO ===` — **aceptado**

Lo evalué contra el riesgo real (que sea una respuesta enlatada para una sola pregunta):

- **Es dato derivado, no una respuesta.** Sale de `collectSessionNpcs(events)`, que filtra por
  `payload.actor_type === 'npc'` y deduplica por nombre. No hay ninguna cadena que responda a
  la pregunta; hay una lista de entidades.
- **Se comporta bien sin NPCs.** Lo probé: en una sesión con eventos pero ninguno de tipo NPC,
  `buildSessionContext` devuelve solo el estado y el historial —
  `"=== ESTADO DE SESIÓN: … ===\nCampaña: Honor\n\n=== HISTORIAL DE EVENTOS ===\nDM1: (historia) Consejo de guerra — El DM narra\n\n"` —
  **el bloque no aparece**. Y en una sesión sin ningún evento, solo el bloque de estado. Nada
  que "rellenar" ni encabezado vacío.
- **Es genérico**, en la misma línea que los bloques `ESTADO DE SESIÓN` / `INVENTARIOS` que ya
  existían desde F18. Coherente con "la IA accede a datos estructurados".
- **Hace trabajo medible.** Levanté un backend efímero sobre una COPIA de la DB con los 3
  eventos de NPC neutralizados (`actor_type: 'dm'`, sin `npc_name`) — sin roster, por tanto —
  y pregunté lo mismo 3 veces: `"El Brightlord / Amaram / Vela"`, `"Velas, Amaram, dos
  Fusionados, un portador de Esquirla"` y **`"Buenatracio"`** (que es un personaje JUGADOR, no
  un NPC). Sin el bloque agregado, el modelo improvisa desde la prosa y se equivoca. Con él,
  3/3 exactas. La justificación del implementer se sostiene con datos míos.

### (b) El `SKIP` de `aiTools.js` — **alcance justificado, no creep**

Es un cambio de una palabra (`'session_reset'` dentro de un `Set`) en la copia dormida del
MISMO filtro (`AI_TOOLS_ENABLED=0`). La lección F33 dice literalmente que "un mismo dato
servido por dos caminos necesita el MISMO filtro en ambos; es fácil blindar uno y olvidar el
otro". Dejar los dos `SKIP` divergentes habría sido plantar exactamente esa bomba. Está
declarado en el informe, comentado en ambos sitios y no cambia comportamiento observable hoy.
Lo apruebo. (Ver observación O-C sobre su falta de test.)

---

## 6. No-regresión de los 4 presets — CAMBIO CONFIRMADO COMO EL PRETENDIDO

Comparé el **contexto real que recibe el LLM** en cada preset, HEAD vs ahora, sobre la sesión
17 real (misma técnica del punto 1: los dos módulos vivos en el mismo proceso, cliente de
stream falso, sin llamar a Ollama):

| preset | resultado |
|---|---|
| `resumen` | CAMBIA — solo lo pretendido |
| `cronologia` | CAMBIA — solo lo pretendido |
| `estado` | **IDÉNTICO byte a byte** |
| `inventarios` | **IDÉNTICO byte a byte** |

El diff completo de los dos que cambian son exactamente tres cosas:

```
- DM1: (interacción) Amaram exige la Esquirla — …
+ NPC Brightlord Amaram: (interacción) Amaram exige la Esquirla — …

- DM1: [Las Llanuras Quebradas › El Abismo] (exploración) El descenso al Abismo — …
+ DM1: [Las Llanuras Quebradas › El Abismo] (exploración) El descenso al Abismo — … (participantes: Talani, Buenatracio)

- DM1: (NPC) Vela trae noticias del frente — …
+ NPC Vela la mensajera: (NPC) Vela trae noticias del frente — …

- (16 líneas "DM1: (session_reset)" desaparecen)
```

Los eventos narrativos siguen siendo 10, el bloque de estado sigue completo, el orden se
conserva y `cronologia` pasa de 30 a 14 líneas de contexto **sin perder un solo evento real**.
Es el efecto colateral que el encargo pedía en el punto (a), y no hay daño colateral.

---

## Lecciones aplicadas correctamente

- **F21** (no negar frases; formular en positivo) — `SESSION_RULES_SYSTEM` está redactado en
  positivo. Verificado además que el ejemplo de cita `[Combate > Iniciativa]` que lleva dentro
  tiene **precedente exacto** en `RULES_GROUNDING` (que lo lleva desde F21, en el system
  prompt), y que NO se repitió en la instrucción del mensaje `user`. Coherente.
- **F33** (el mismo dato por dos caminos, el mismo filtro) — aplicada al `SKIP` de `aiTools.js`.
- **F24** (dos vistas del mismo dato, una sola fuente) — `renderEvents` y el camino nuevo
  comparten `renderEventLine`; verificado que no quedaron dos formatos de línea.
- **F17** (extender = props opcionales retrocompatibles) — `sessionId` con default `null` en
  las 4 firmas y `sessionBlock` con default `''`; probado por comparación contra HEAD.
- **F20** (vitest sin jsdom → helper puro) — `freeAskSessionId` exportado y testeado.
- **F36** (mutar dentro del contenedor, nunca en el árbol real) — la aplicó él y la apliqué yo.
- **F8b/F20** (no ensuciar el build context) — no hay `node_modules` en el host.
- **Docker: vigencia por HASH** — la aplicó y la re-verifiqué, incluido el contenedor vivo.

No detecté ninguna lección relevante ignorada.

---

## Puntos a corregir (bloqueantes)

**Ninguno.** No hay ningún criterio de rechazo automático activado: lint verde, build verde,
cero tests en rojo, imagen probada al día por hash, cero archivos fuera del scope declarado,
reporte del implementer presente, cero estilos inline y cero `window.innerWidth`, cero
async/await sobre better-sqlite3.

---

## Observaciones (no bloqueantes)

**O-A — Severidad de su O-2 (pertenencia a la sesión): correcto cerrarlo así; NO debe bloquear.**
Lo comprobé: el backend **no tiene capa de autenticación en absoluto** (búsqueda de
`requireAuth` / `authMiddleware` / `req.user` en `src/routes/*.js` → cero resultados). En el
mismo archivo que tocó, `ai:session_preset` (F18) y `ai:assist_planning` ya reciben `sessionId`
por payload sin comprobar nada, y `ai:session_preset` devuelve ese contexto **literalmente**,
mientras que `ai:ask` solo devuelve una paráfrasis del mismo material. O sea: F37 **no amplía
el conjunto de datos expuestos**, añade una superficie más sobre un dato ya expuesto. Bloquear
F37 por esto sería inconsistente con F18, con el REST y con el modelo de despliegue (app de
LAN). **Recomendación al líder:** abrir feature propia "guard de pertenencia en los handlers
de IA" (`socket.data.userId` + `session_members`, fail-closed para el espectador de TV, patrón
F33), y decidir de paso si `GET /api/sessions/:id/events` entra en el mismo lote. No es deuda
que F37 haya creado, pero ya son tres puertas.

**O-B — Su O-1 (citas inline en modo Sesión): convincente, y el hallazgo real es más grande
que el que él reporta.** Confirmé el fenómeno con mis propias corridas de
"¿cómo funciona la iniciativa en combate?": en modo Sesión (3 corridas) solo 1 llevó cita
inline; en modo Sistema (3 corridas) las 3 la llevaron. El contrato de `sources` sigue en 8
fuentes en TODAS las corridas de ambos modos, y el contenido de mecánica es correcto en los
dos (Speed, desempate d20, 1 reacción, Sorprendido). Hasta aquí, como él dice.
**Pero:** fui a la DB a comprobar si las citas eran reales y no existe ninguna sección
`Combate > Iniciativa` ni `5. Combate > Iniciativa` en los docs (las reales son
`… > 5. Combate > Estructura del Turno`, `… > Apéndice: Resumen Rápido > Orden de Combate`,
`Cosmere RPG - Mecánicas Core > Turnos en Combate`). Las dos citas inventadas que registré
salieron del camino **SIN `sessionId`** — el camino que F37 no toca — y reproducen el literal
del ejemplo de `RULES_GROUNDING`. Conclusión: la cita fabricada es **preexistente** y no la
introdujo F37; su decisión de revertir el ejemplo en la instrucción del `user` fue correcta
(habría añadido una segunda fuente del mismo problema), pero la atribución del informe se
queda corta. Es material para una feature de calidad de citas, no para F37.

**O-C — El `SKIP` de `aiTools.js` no tiene test.** El único test que ejercita
`get_event_history` (`aiTools.test.js:109`) inserta un evento `encounter` y cuenta 1; no hay
ningún assert sobre `session_reset`. Si alguien revierte esa palabra, **nada se pone rojo** —
justo la clase de regresión silenciosa que LEARNINGS pide blindar. No bloqueo (es una ruta
dormida y el cambio va en la dirección correcta), pero merece un assert de dos líneas en la
próxima feature que toque `aiTools.js`.

**O-D — `freeAskSessionId(mode, …)` se invoca siempre con literales.** En los dos call sites el
primer argumento está escrito a mano (`'system'` y `'session'`), no se pasa la variable `mode`.
Funciona y es correcto (el propio `if (mode === 'system')` ya seleccionó la rama), pero
significa que la rama del helper solo la ejercita el test, no la app; lo que el helper aporta
*en producción* es la coerción `?? null`. Es defendible por la lección F20, solo que el valor
del test es menor de lo que sugiere el informe. El cableado real ya lo verifiqué a mano
(punto 4), así que no cambia el veredicto.

**O-E — El roster solo ve NPCs etiquetados.** `collectSessionNpcs` depende de
`payload.actor_type === 'npc'`. Un NPC que el DM mencione solo en la prosa del evento (sin
crear el evento como NPC) no entra en el roster, mientras el system prompt pide "cuando la
respuesta sea una lista, enumérala COMPLETA". El resultado puede sonar exhaustivo sin serlo.
Es un problema de calidad del dato de entrada (la misma familia que su O-3), no del renderer,
y la alternativa —extraer nombres de la prosa— sería peor. Conviene saberlo si el founder ve
algún día una lista corta.

**O-F — Discrepancias menores de cifras del informe.** Él reporta el contexto de la sesión 17
en 1623 chars / 406 tokens; yo mido 1692 / 423. Y reporta 11/11 corridas nombrando a los dos
NPCs; yo pude repetir 3/3. Ninguna de las dos altera una conclusión (el margen de presupuesto
es de ~3x en ambos casos, y el acierto fue total en todas mis corridas), pero dejo constancia
de que las cifras exactas del informe no son reproducibles al dígito.

---

## Candidatos para LEARNINGS.md

1. **"Para probar retrocompatibilidad, corre las DOS versiones a la vez; un test contra un
   literal no distingue el contrato de una copia."** — El test 13 comparaba el mensaje `user`
   contra un literal escrito a mano: si el implementer lo hubiera copiado del código nuevo,
   habría pasado igual demostrando nada. La prueba fuerte es barata: volcar `git show
   HEAD:ruta` como `modulo_head.js` dentro de un contenedor efímero, importar los DOS módulos
   en el mismo proceso y comparar el artefacto (aquí, el array de `messages`) con comparación
   estricta. Y **acompáñalo siempre de un control positivo** (un caso donde DEBE diferir): sin
   él, un arnés roto produce cinco "iguales" tranquilizadores. Complemento estático: para "no
   toqué el prompt X", hashea la región de cada constante en HEAD y ahora, en vez de leer el
   diff.

2. **"Al leer una SQLite en modo WAL desde fuera, copia también el `-wal` o verás la base de
   hace semanas."** — Copiar solo `rolapp.db` para inspeccionar la sesión 17 en un contenedor
   devolvió **cero eventos** y una sesión inexistente; el fichero `.db` era de hacía dos
   semanas y todo lo reciente vivía en un `-wal` de 6 MB. El síntoma es idéntico a "la feature
   no escribe nada" o "el id no existe", así que se diagnostica mal. Regla: al auditar la DB
   real, copia `base.db` **y** `base.db-wal` (la original montada `:ro`) y abre la copia; si el
   resultado es sospechosamente vacío, sospecha del WAL antes que del código.

3. **"Un bloque agregado en el contexto no es 'hacer trampa' si desaparece cuando el dato no
   existe — pruébalo apagando el dato, no leyendo el código."** — Ante un bloque derivado
   añadido para que el modelo acierte (`NPCS QUE HAN APARECIDO: a, b`), la pregunta de revisión
   no es "¿está enlatado?" sino dos comprobaciones ejecutables: (1) que con el dato ausente el
   bloque **no se emita** (ni encabezado vacío ni "ninguno"), y (2) que **sin él el modelo
   empeore de verdad**. Lo segundo se mide levantando un backend efímero sobre una COPIA de la
   DB con el dato neutralizado: aquí, sin roster, qwen2.5:3b llegó a responder el nombre de un
   personaje JUGADOR como si fuera NPC. Con las dos comprobaciones, un agregado derivado pasa
   de "decisión fuera de encargo" a "dato estructurado justificado".

# Revisión: F38 — El botón que parecía "atrás" y reiniciaba el mapa de toda la mesa
Fecha: 2026-08-08
Revisor: reviewer independiente
Veredicto (primer pase): **APROBADO CON OBSERVACIONES**
Veredicto (tras el pase de endurecimiento, 2026-08-08): **APROBADO** — ver `## Revisión delta del pase de endurecimiento` al final.

El código hace lo que el founder decidió ("etiquetarlo y pedir confirmación") y lo hace bien:
icono con significado, texto visible, confirmación con el `Modal` del proyecto, endpoint y
socket intactos. Todos los checkpoints obligatorios están en verde y ninguno de los criterios
de rechazo automático se cumple. Las observaciones son **de cobertura de tests** (cuatro
mutaciones destructivas quedan en verde) y **una frase de la copy que no es literalmente
cierta**. Ninguna bloquea, pero las dos primeras conviene cerrarlas antes de que el guard se
oxide.

---

## Checklist CHECKPOINTS.md

- [x] Lint frontend pasa — forzado en `docker build --target build` y corrido en vivo.
- [x] Lint backend pasa en el contenedor.
- [x] Build frontend pasa (`docker compose build frontend` exit 0).
- [x] La imagen refleja el código ACTUAL — **probado por hash host-imagen**, 4/4 archivos.
- [x] Tests existen y todos pasan (frontend 170/170, backend 198 pass + 1 skip / 0 fail).
- [x] Caso feliz cubierto (`confirmed: true` cierra el modal y dispara el reset una vez).
- [x] Caso de error cubierto (`confirmed: false`, más barrido de valores laxos; y "sin callbacks no lanza").
- [x] `better-sqlite3` síncrono — **no aplica**: F38 no toca backend.
- [x] `session_events` append-only — **no aplica**: F38 no toca backend.
- [x] Frontend: cero estilos inline, cero `const s = {…}`, cero `window.innerWidth`.
- [x] Frontend: responsive con utilidades de Tailwind (`flex-wrap`), sin medir ancho en JS.
- [x] Cero `console.log` de depuración; cero código comentado sin explicación.
- [x] Nombres descriptivos en inglés; helper con una sola responsabilidad.
- [x] Respeta la estructura de `architecture.md`; cero dependencias nuevas.
- [x] Dentro del scope declarado (`SessionToolbar.jsx` + `Icon.jsx` + `session.test.jsx`).
- [x] Reporte del implementer presente y fiel a lo que hay en el árbol.
- [x] Lección propuesta para `LEARNINGS.md` (tres candidatas).

**Ninguno de los criterios de rechazo automático se cumple.**

---

## Resultado de verificación (ejecutado por mí, en Docker, sin Node en el host)

| Comando | Resultado |
|---|---|
| `docker build --target build -t rolapp-f38-review ./frontend` | exit **0** (incluye `RUN npm run lint` y `RUN npm run build`) |
| `docker run --rm rolapp-f38-review npm run lint` | exit **0** — 0 errores, 6 warnings preexistentes y ajenos (`PrepWorkspace.jsx` x5, `DashboardPage.jsx` x1). Cero warnings en los 3 archivos de F38. |
| `docker run --rm rolapp-f38-review npm test` | exit **0** — **170 passed (170)**, 15 archivos, `session.test.jsx` con **27 tests**. |
| `docker compose build frontend` | exit **0** |
| `docker compose run --rm --no-deps backend npm run lint` | exit **0** |
| `docker compose run --rm --no-deps backend npm test` | exit **0** — 199 tests: **198 pass, 0 fail, 1 skipped** |

### Vigencia probada por hash (no por timestamp ni por cache-hit)

El build salió íntegramente de caché, así que no lo acepté como prueba. Comparación
`sha256sum` host contra imagen:

```
SessionToolbar.jsx  1770c8ef…88b80e2f   host == imagen
Icon.jsx            b8522df8…99cb4227   host == imagen
session.test.jsx    7b3884e5…f57ea94a   host == imagen
sessions.js (back)  6636e065…56e76163   host == imagen
```

4/4 idénticos. Lo que corrí es lo que hay en el árbol.

### Higiene

Host sin `frontend/node_modules` ni `frontend/dist` antes y después. Imagen temporal
`rolapp-f38-review` borrada (0 imágenes `f38` restantes). `git status --porcelain` con
**las mismas 17 entradas** al principio y al final: ninguna mutación tocó el árbol real.

---

## Verificación punto por punto del encargo

### 1. El botón ya no ejecuta directamente — CORRECTO

`SessionToolbar.jsx:227` tiene `onClick={() => setShowReset(true)}`. Rastreo exhaustivo de
`onReset` en el archivo: solo aparece en la firma de props (`:57`), dentro del helper
(`:38`) y en la única llamada al helper (`:125`). No hay ninguna otra ruta.

Los tres caminos de salida del modal pasan por `closeReset`: backdrop/Escape/aspa
(`Modal onClose` con `closeReset(false)`), Cancelar con `closeReset(false)` y
"Sí, reiniciar mapa" con `closeReset(true)`. Verificado además en `Modal.jsx` que `onClose`
está cableado a los tres (Escape en el `useEffect`, backdrop en el div exterior, aspa en el
header), así que "cerrar sin querer" siempre es `confirmed === false`.

`confirmed === false` no llama a `onReset`: probado por lectura (`if (confirmed) onReset?.()`),
por test unitario y por la mutación M2 (ver abajo).

### 2. El icono `refresh` existe DE VERDAD — CORRECTO

`Icon.jsx:71-76`, sección "Acciones", dos `<path>` solo-stroke dentro del viewBox 0 0 24 24
(glifo rotate-cw), mismo estilo que el resto. No me quedé en la lectura: volqué el HTML
renderizado real del botón en un contenedor y sale un `<svg>` real con sus dos `<path>`
seguido del nodo de texto " Reiniciar mapa", no el `null` silencioso de
`if (!paths) return null`. La mutación M3 (borrar la clave `refresh` del set) pone **3 tests
en rojo**, así que la existencia del icono está probada, no supuesta. El fallo silencioso
tipo F34/F36 queda cerrado.

### 3. La copy contra lo que hace el endpoint — CASI EXACTA, con un matiz que sí hay que decir

`backend/src/routes/sessions.js:145-149` (sin modificar en el working tree) hace tres cosas:
el UPDATE que pone `image_url` y `tldraw_snapshot` a NULL, un `logEvent(..., 'session_reset', ...)`
y el `emit` de `session:reset` al room entero.

- "Se borrarán el mapa de fondo y los dibujos del canvas" — **cierto y completo**:
  `image_url` es el fondo, `tldraw_snapshot` son los dibujos. Bien visto no reducirlo a "el mapa".
- "para toda la mesa, no solo en tu pantalla: los jugadores y el Modo TV verán el canvas
  vacío al instante" — **cierto**: el emit va al room `session:<id>` completo, y
  `SessionView.jsx:41` (`socket.on('session:reset', ...)` que hace `setImageUrl(null)`) es el
  suscriptor de todos los clientes, TV incluida.
- "No afecta a eventos, notas, chat ni personajes." — **notas, chat y personajes: cierto**
  (el endpoint no los toca). **"Eventos": levemente engañoso.** Mi opinión explícita, que es
  la que se me pidió:

  El endpoint **sí escribe** una fila `session_reset` en `session_events`. Se lee
  razonablemente como "no borra tus eventos" —que es la ansiedad que un diálogo de
  confirmación existe para calmar, y en ese sentido es verdad: nada se pierde— pero como
  afirmación literal es falsa, y lo es de una forma **medible y visible para el DM**:
  `stats.js:136` devuelve `event_count: events.length` **sin filtrar** los tipos de motor, así
  que cada reinicio suma 1 al total de eventos de la sesión (en la sesión 17 eso son 16 de
  41: el **39%** de la cifra), y `duration_seconds` se estira si el reset es el último evento.
  Lo que sí está bien aislado: `isPlanningEvent` (`frontend/src/lib/planning.js:93-104`) lo
  saca del feed, `ENGINE_TYPES` (`stats.js:25-31`) lo excluye del desglose por categoría, y
  desde F37 el SKIP de `getEventHistory` lo saca del contexto de la IA.

  Es irónico en una feature cuyo objetivo es "hacer el botón honesto", pero **no bloquea**:
  el error va en la dirección inocua (tranquiliza de más sobre algo que no se pierde) y no
  induce al usuario a una acción destructiva. **Recomendación de una palabra**: cambiar
  "No afecta a" por "No borra", o añadir "(queda registrado en el historial de la sesión)".
  Con eso la frase pasa a ser exactamente cierta.

### 4. `flex-wrap` en el grupo derecho — JUSTIFICADO, no es creep

`ml-auto flex items-center gap-2` pasó a `ml-auto flex flex-wrap items-center justify-end gap-2`.
Mi juicio: **cambio necesario y de riesgo prácticamente nulo**, dentro del radio de la
feature (el botón acaba de ganar texto y por tanto ancho), de una línea, y comentado en el
código explicando el porqué. Análisis de regresión:

- `flex-wrap` solo tiene efecto cuando el contenido **desborda**; a los anchos donde hoy cabe
  todo, es inerte.
- `justify-end` es un no-op mientras haya una sola línea: el div es un flex item
  shrink-to-fit empujado por `ml-auto`, así que sus hijos ya estaban pegados a la derecha.
  Solo importa cuando la segunda línea existe, y ahí alinear a la derecha es lo correcto.
- El contenedor exterior ya era `flex-wrap`, así que el grupo entero ya sabía bajar de línea;
  lo que faltaba era que pudiera partirse **por dentro** cuando ni bajando cabe.

**Caveat honesto:** los números concretos del reporte (unos 314 px, cabe en 360, desborda a
320) son un cálculo a mano del implementer que **no reproduje**; no hay test ni comprobación
en navegador que cubra layout. No cambia el veredicto —el cambio es inerte o beneficioso en
todos los casos— pero que conste que la cifra no está verificada.

### 5. Backend y socket intactos — CONFIRMADO

`git status --porcelain` no lista `backend/src/routes/sessions.js` ni `backend/src/sockets/`.
Los archivos backend modificados en el árbol (`routes/rag.js`, `services/ai.js`,
`services/aiTools.js`, `sockets/ai.js`, `services/ai.f37.test.js`) son **de F37**, que ya está
`done` y aprobado; F38 no los tocó. El hash de `sessions.js` coincide con el de la imagen
backend recién construida. La semántica del endpoint no se cambió, tal y como decidió el founder.

### 6. Tests — 170/170, contados por mí

170 passed (170) en 15 archivos; `session.test.jsx` con **27 tests**, y el diff añade
exactamente **10 bloques `it(...)` nuevos** bajo los dos `describe` de F38. Ningún test previo
fue borrado ni editado: el diff solo añade líneas, en las regiones de F38 y F37.

### 7. Mutación — el punto más importante

Todas dentro de contenedores efímeros (`docker run --rm` con el script de mutación montado
en solo lectura desde el scratchpad). El árbol real nunca se tocó: `git status` idéntico al final.

**Control positivo del arnés** (para descartar verdes tranquilizadores de un runner roto):
inyecté una aserción imposible en el archivo de tests y salió **`Tests 1 failed | 27 passed`**.
El arnés reporta rojos. Además, en cada mutación verifiqué (a) que el parche se aplicó de
verdad —el script aborta con `FALLO_MUTACION` si el patrón no está— y (b) que el rojo es un
`AssertionError`, no un error de sintaxis disfrazado de test caído.

| # | Mutación | Resultado | Lectura |
|---|---|---|---|
| **M1** | Botón vuelve al `<Icon name="arrow-left" />` sin texto | **ROJO — 2 tests** | La aserción endurecida funciona. **Confirmo la afirmación del implementer.** |
| **M2** | `if (confirmed) onReset?.()` pasa a `onReset?.()` | **ROJO — 2 tests** | Cancelar-que-dispara se detecta. |
| **M3** | Borrar la clave `refresh` de `Icon.jsx` | **ROJO — 3 tests** | La existencia del icono está probada. |
| **M4** | Quitar "para toda la mesa" de la copy | **VERDE** | **Hueco**: la copy no está cubierta por ningún test. |
| **M5** | Cancelar pasa `closeReset(true)` en vez de `false` | **VERDE** | **Hueco serio**: un "Cancelar" que reinicia el canvas de la mesa pasa toda la suite. |
| **M6** | `onClick={() => setShowReset(true)}` pasa a `onClick={() => onReset()}` | **VERDE** | **Hueco serio**: el guard de fuente busca el literal `onClick={onReset}` y esta variante lo esquiva. Es exactamente la regresión que F38 arregla, y no se pone nada rojo. |
| **M7** | Borrar el modal de confirmación entero | **VERDE** | El botón abriría la nada; el reset dejaría de existir (fail-safe, pero invisible para la suite). |

M1-M3 reproducen y confirman lo que reporta el implementer. M4-M7 son míos y son el hallazgo
de esta revisión: **la confirmación está protegida por dentro (el helper) pero casi no lo está
por fuera (el cableado y la copy)**.

---

## Juicios explícitos que se me pidieron

### ¿Es frágil la aserción endurecida? Sí. Y tengo una propuesta probada.

No es frágil ante lo que uno teme primero (Prettier, saltos de línea, una clase extra): el
HTML lo genera React, no el formateo del JSX, y el `\s*` absorbe el espacio que JSX colapsa.
**Lo comprobé.** Es frágil ante otra cosa, mucho más probable en este archivo concreto:
**cualquier elemento entre el cierre del svg y el cierre del button**. Lo demostré con una
mutación más:

- **M8**: envolver la etiqueta en un `<span>` neutro, sin cambiar ni un píxel de lo que ve el
  usuario, pone el test **ROJO**. Falso positivo.

Y el `<span>` no es hipotético: es el patrón con el que se oculta texto en móvil
(`<span className="hidden sm:inline">`), justo el retoque que invita una toolbar que el propio
implementer documenta como apretada a 320 px.

**Propuesta concreta**, escrita y corrida en contenedor: borrar todas las etiquetas y asertar
sobre el texto que queda, que es literalmente la propiedad que se quiere afirmar. El
`aria-label` y el `title` viven dentro de los corchetes angulares, así que se van con ellos:

```js
const visibleText = (html) => html.replace(/<[^>]*>/g, '');
expect(html).toContain('aria-label="Reiniciar mapa"');  // el atributo sigue estando
expect(visibleText(html)).toContain('Reiniciar mapa');  // y ADEMÁS es texto visible
```

Medido: **verde** sobre el código real, **rojo bajo M1** (botón mudo: el texto no está en
ningún nodo de texto) y **verde bajo M8** (el `<span>` no la engaña). Misma fuerza contra la
regresión que importa, sin el falso positivo.

### ¿Es problema que el botón no quede `disabled` mientras el reset está en vuelo? No.

Irrelevante en la práctica, por tres razones:

1. El modal es un throttle **más fuerte** que un `disabled`: exige dos clics deliberados en
   sitios distintos de la pantalla, y `closeModal()` corre **antes** que `onReset()`, así que
   el botón de confirmar se desmonta en el mismo commit de React. Un doble clic humano no
   alcanza a aterrizar dos veces sobre un botón que ya no existe.
2. La operación es **idempotente** en la DB (poner dos columnas a NULL). Un hipotético disparo
   doble no rompe nada; el único coste sería una fila extra en el log.
3. El problema original nunca fue la concurrencia: fue que **un solo clic ya era destructivo y
   no lo parecía**. Eso es lo que F38 arregla.

Nota de paso, **fuera del alcance de F38**: `SessionView.handleReset` es
`await api.resetSession(...)` **sin try/catch y sin estado de ocupado** — si el PATCH falla
(403, red caída), el modal ya se cerró, el usuario cree que reinició y no hay ni error ni
reintento. Es deuda preexistente, no la introdujo esta feature, pero es el sitio natural donde
vivirían el `disabled` y el mensaje de error si el founder los quiere algún día.

### ¿Bloquea que no se haya corrido ningún e2e? No, pero declaro la limitación.

**Nadie ha abierto dos pestañas.** Ni el implementer (lo dice él mismo en su reporte) ni yo.
No he comprobado en un navegador real que el jugador conserve el mapa al cancelar y lo pierda
al confirmar.

No bloquea, y el argumento es que **el camino de red no cambió**: el endpoint, el `logEvent` y
el emit al room son byte a byte los mismos que llevan en producción desde F4 (hash verificado),
y el propio bug del founder —seis resets propagados en dos segundos— es la prueba de campo de
que la propagación funciona. F38 es 100% presentación.

Pero el e2e cerraría exactamente el hueco que M5 deja abierto. Por eso, en vez de exigirlo,
propongo la versión de 60 segundos que el founder puede hacer solo: **abrir una sesión, pulsar
"Reiniciar mapa", pulsar "Cancelar" y confirmar que el mapa sigue ahí.** Eso valida el único
cableado que ningún test cubre.

---

## Lecciones aplicadas correctamente

- **F35 / iconos** — aplicada, y bien: censo previo de los 35 nombres, icono nuevo en vez de
  reutilizar uno de significado equivocado, control negativo con nombre inventado en el test y
  mutación M3, que yo reproduje. Es el punto más sólido de la entrega.
- **F35 / guard que reescanea el código** — aplicada dos veces (censo de iconos literales de
  la toolbar y guard de cableado del helper). Con la salvedad de M6: el segundo guard es más
  estrecho de lo que su nombre sugiere.
- **F20 / no hay jsdom, testea helpers puros** — aplicada correctamente: `resolveMapReset`
  exportado y ejercitado directo, sin simular clics ni añadir dependencias.
- **F36 / mutar dentro del contenedor efímero** — aplicada por el implementer y por mí. El
  `git status` del host no se movió en toda la revisión.
- **F22 / vigencia por hash** — aplicada; la reproduje con mis propios hashes.
- **F8b / no ensuciar el host** — aplicada; sin `node_modules` ni `dist` residuales, imagen
  temporal borrada.
- **F5 / cableado real** — aplicada: el helper se invoca de verdad desde el componente.
- **Frontend/Tailwind** — cero estilos inline y cero `window.innerWidth`, verificado con grep
  y con control positivo del patrón (el mismo grep sí encuentra los `style={` legítimos de
  `EventFlowGraph.jsx`, así que el cero no es un falso limpio).

No detecté ninguna lección que debiera haberse aplicado y se ignorara.

---

## Puntos a corregir

Ninguno bloqueante. Nada de lo listado abajo incumple un checkpoint ni un criterio de rechazo
automático, y el código que hay hoy en el árbol es correcto.

## Observaciones (no bloqueantes, ordenadas por lo que yo cerraría primero)

1. **El "Cancelar" del modal no está cubierto (M5 verde).** Es el hueco de mayor consecuencia:
   una futura errata de un carácter (`closeReset(true)` en Cancelar) convierte el botón de
   escape en el botón destructivo, y la suite entera sigue verde. Arreglo barato, en la misma
   línea que los guards que ya hay: asertar sobre la fuente que el `onClick` de Cancelar pasa
   `false`. Mejor aún: extraer el cuerpo del modal a un componente exportado y renderizarlo por
   SSR, lo que de paso cubriría la copy (punto 3) y M7.

2. **El guard de "no puentear el modal" es esquivable (M6 verde).** El
   `not.toMatch(/onClick=\{onReset\}/)` solo ve la forma literal; `onClick={() => onReset()}`
   pasa. Sugerencia: buscar `onReset` en toda la fuente y exigir que aparezca **únicamente**
   en la firma de props y en la llamada a `resolveMapReset` (contar ocurrencias y fijar el
   número, o asertar que ninguna línea con `onClick` contenga también `onReset`). Importa
   especialmente porque el implementer propone esta técnica como lección para `LEARNINGS.md`:
   si va al archivo, debe ir **con la advertencia de que el regex tiene que cubrir las
   variantes**, o estaremos canonizando un guard con la puerta abierta.

3. **La copy del modal no está cubierta (M4 verde).** Es el corazón de la decisión del founder
   ("que el texto nombre el alcance") y hoy se puede borrar entera sin que nada se ponga rojo.
   Una línea: asertar que la fuente contiene "para toda la mesa".

4. **Cambiar "No afecta a eventos…" por "No borra eventos…".** Ver el punto 3 de la
   verificación. Una palabra, y la frase pasa de "casi cierta" a cierta.

5. **Endurecer la aserción de texto visible** con la variante de borrado de etiquetas que dejé
   probada arriba. No es urgente (falla en la dirección segura), pero costará una sesión de
   depuración confusa el día que alguien envuelva la etiqueta en un `<span>`.

6. **El censo de iconos solo cubre `SessionToolbar.jsx`.** El implementer lo dice y propone
   llevarlo a `designDebt.test.js`, que ya reescanea todo `src/`, y deja comprobado que hoy
   pasaría en verde con los 37 usos del árbol. Estoy de acuerdo en que se quedó fuera por
   respetar el alcance; es un candidato limpio a micro-feature.

7. **Deuda preexistente adyacente:** `SessionView.handleReset` sin try/catch ni estado de
   ocupado (ver el juicio sobre `disabled`). No la introdujo F38.

8. **Detalle menor de trazabilidad:** el reporte cita "la lección F35 dice que un nombre
   inexistente no rompe el build". Esa frase no está literalmente en `LEARNINGS.md` (lo que F35
   aportó fue "una regresión que no rompe el build necesita un test-guard que reescanee el
   código"); viene del propio encargo en `feature_list.json`, que la nombra así. La conducta es
   correcta y el comportamiento descrito es real (`Icon.jsx:170`, `if (!paths) return null`,
   verificado); solo dejo constancia de que la cita es del brief, no del archivo.

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)

1. **Un `aria-label` puede hacer pasar en verde el test de "texto visible"** — la candidata
   número 1 del implementer, que **respaldo con evidencia propia** (M1 rojo con la aserción
   endurecida). **Propongo enmendar la forma recomendada**: en vez de anclar el texto entre el
   cierre del svg y el del button —que yo demostré que se rompe con un `<span>` inocuo (M8)—,
   la receta robusta es *borrar todas las etiquetas del HTML y asertar sobre el texto que
   queda* (`html.replace(/<[^>]*>/g, '')`). Los atributos de accesibilidad viven dentro de las
   etiquetas y se van con ellas, así que la aserción dice exactamente lo que quiere decir sin
   acoplarse a la estructura del DOM. Verificado: verde en el código real, rojo bajo el botón
   mudo, verde bajo el `<span>`.

2. **Un helper puro extraído necesita un guard de cableado — y el guard necesita su propia
   mutación, en las variantes** — la candidata número 2 del implementer, **con la corrección
   que sale de M6**: validar el guard contra la única forma sintáctica que se te ocurrió no
   basta; `onClick={() => accion()}` esquiva `not.toMatch(/onClick=\{accion\}/)`. La regla útil
   es afirmar sobre el **conjunto** de ocurrencias del símbolo peligroso (que aparezca solo en
   la firma y en la llamada al helper), no sobre una forma concreta. Sin esto, la lección
   canoniza un guard con un agujero.

3. **Un control destructivo que afecta a otros usuarios no puede ser un icono sin etiqueta** —
   la candidata número 3 del implementer, que suscribo sin cambios. El `title` HTML no es una
   etiqueta y en móvil no existe; una flecha se lee como "volver" diga lo que diga el `title`;
   y el usuario **repite** el clic porque "no pasa nada", multiplicando el efecto destructivo
   en las pantallas de los demás.

4. **(Mío) Cuando extraes la lógica a un helper puro porque no hay jsdom, el cableado del
   diálogo se queda sin cubrir por los dos lados.** F38 protegió el botón que **abre** el modal
   (guard de fuente) y el helper que **decide** (tests unitarios), pero no los tres `onClick`
   que **eligen el argumento** (Cancelar, Confirmar y el `onClose`): M5 —Cancelar pasando
   `true`— deja la suite entera en verde. En un diálogo de confirmación, el argumento booleano
   de cada botón **es** la feature. Si no hay DOM, asértalo sobre la fuente junto al resto de
   guards, o extrae el cuerpo del modal para poder renderizarlo por SSR.

5. **(Mío) Una frase tranquilizadora en un diálogo de confirmación es una afirmación técnica:
   verifícala contra el endpoint, telemetría incluida.** "No afecta a eventos" era falsa por un
   `logEvent` que el propio endpoint escribe y que `stats.event_count` cuenta sin filtrar (39%
   del total en la sesión 17). El patrón general: al redactar la copy de una confirmación,
   recorre **todos** los efectos del handler —UPDATE, log, emit, snapshot— y comprueba que cada
   negación de la copy sobrevive a los cuatro. Y prefiere verbos concretos ("no borra") a
   verbos totales ("no afecta"), que son casi siempre falsos.

---

## Conclusión

**APROBADO CON OBSERVACIONES.** El botón dejó de mentir: tiene un glifo que significa reiniciar
(y que existe de verdad, probado por mutación), texto visible, `aria-label`, un `title` que
describe el efecto real y una confirmación que nombra el alcance. El endpoint y el socket están
intactos, como decidió el founder. Lint, build y tests en verde en el entorno canónico, con la
vigencia del código probada por hash y no por cache-hit.

Lo que no está resuelto no es el código, son los tests: **cuatro mutaciones destructivas
(M4-M7) quedan en verde**, y dos de ellas —Cancelar que confirma, y el botón que vuelve a
puentear el modal— son precisamente la regresión que esta feature existe para impedir. Nada de
eso incumple un checkpoint ni un criterio de rechazo, y el código de hoy es correcto —lo leí
línea por línea—, así que no lo bloqueo. Pero si el líder va a canonizar la lección del guard
de cableado en `LEARNINGS.md`, debe hacerlo con la enmienda de M6, o el harness aprenderá una
técnica con el agujero incluido.

**Limitación conocida y declarada: no se corrió ningún e2e.** Sugiero al founder la
comprobación manual de 60 segundos descrita arriba (abrir sesión, "Reiniciar mapa", "Cancelar",
el mapa sigue), que es justo el camino que ningún test cubre.

---
---

## Revisión delta del pase de endurecimiento

Fecha: 2026-08-08
Alcance de esta revisión: **solo el delta**. No repito la revisión completa; lo que ya validé
en el primer pase (endpoint intacto, icono real, cero estilos inline, `flex-wrap` justificado)
sigue igual y lo reconfirmo por hash donde toca.

**Veredicto del delta: APROBADO.** Las cinco observaciones están cerradas y las verifiqué
reproduciendo las mutaciones, no leyendo su tabla. Encontré **un escape residual** en el guard
de cableado (M6d, abajo): no es un defecto del código de hoy ni bloquea, pero **sí obliga a
matizar la lección que el líder se llevaba a `LEARNINGS.md`**, que es exactamente lo que se me
pidió avisar antes de canonizar.

### Verificación ejecutada (Docker, contenedores efímeros, host intacto)

| Comando | Resultado |
|---|---|
| `docker build --target build -t rolapp-f38-delta ./frontend` | exit **0** (lint y build forzados en el stage) |
| `docker run --rm rolapp-f38-delta npm run lint` | exit **0** — 0 errores, los **mismos 6 warnings** preexistentes y ajenos |
| `docker run --rm rolapp-f38-delta npm test` | exit **0** — **179 passed (179)**, 15 archivos |
| `docker compose build frontend` | exit **0** |
| `docker compose run --rm --no-deps backend npm test` | exit **0** — **199 tests: 198 pass, 0 fail, 1 skipped** |

**Vigencia por hash host contra imagen**, sin timestamps ni cache-hit:

```
SessionToolbar.jsx  7657f40a5eba…eceecc8fe   host == imagen
session.test.jsx    67f2f8114626…8a7052bd    host == imagen
Icon.jsx            b8522df8160f…99cb4227    host == imagen  == al hash de mi PRIMER pase
```

La tercera línea es la prueba de alcance más limpia: `Icon.jsx` tiene **el mismo hash que
registré antes del pase**, así que no lo tocó. Rehasheé el host al terminar todas mis
mutaciones: los tres siguen idénticos.

### El conteo, contado por mí

- **179 tests en la suite** (yo mismo, no su reporte). Baseline de mi primer pase 170, o sea **+9**.
- **`session.test.jsx`: 36 tests.** Reparto: 17 previos (F18/F20/F37) más 19 de F38 (9 en
  `Reiniciar mapa`, 6 en `MapResetConfirm`, 4 en `resolveMapReset`).
- **Ningún test previo borrado ni editado — probado, no supuesto.** `git diff -U0` sobre
  `session.test.jsx` tiene **exactamente 2 líneas eliminadas**, y las dos son los `import` que
  se ampliaron. Cualquier edición de una línea existente habría aparecido como borrado; no hay
  ninguna. Lo único reescrito son aserciones de tests que el implementer añadió en el pase
  anterior, que era literalmente el encargo.

### Mutaciones — reproducidas por mí, con control positivo inyectado en CADA corrida

Adopté su técnica (el control va dentro de cada corrida, no una vez) porque para leer M8 hace
falta distinguir "verde porque la aserción es robusta" de "verde porque el runner no arrancó".
Inyecté mi propio `src/__revctl.test.js` con una aserción que siempre falla, así que **el suelo
de toda corrida es 1 rojo**. Corrida de referencia sin mutación (`NONE`):
`Tests 1 failed | 179 passed (180)`, suelo confirmado. Además mi script **aborta** si el patrón
no aparece exactamente 1 vez, para que una mutación no aplicada no se disfrace de verde.

| # | Mutación | Antes (mi 1er pase) | **Ahora (mío)** | Rojos sobre el suelo | Test que la mata |
|---|---|---|---|---|---|
| M1 | Botón vuelve al icono mudo `arrow-left` | ROJO | **ROJO** | +2 | `texto visible y aria-label` y `ya no usa la flecha` |
| M2 | `if (confirmed) onReset?.()` pasa a `onReset?.()` | ROJO | **ROJO** | +2 | los 2 de `resolveMapReset` |
| M3 | Borrar la clave `refresh` de `Icon.jsx` | ROJO (3) | **ROJO** | +2 | `el icono refresh existe DE VERDAD` y `todos los iconos literales` |
| M4b | Quitar "para toda la mesa" **de la copy del modal** | **VERDE** | **ROJO** | +1 | `la copy nombra el alcance real…` |
| M5 | Cancelar pasa `onResolve(true)` | **VERDE** | **ROJO** | +1 | `"Cancelar" resuelve en false…` |
| M6 | `onClick={() => onReset()}`, la forma que esquivaba el guard viejo | **VERDE** | **ROJO** | +1 | `el botón abre la confirmación…` |
| M6b | `onClick={onReset}`, forma literal | (no probada) | **ROJO** | +1 | idem, el guard mata **las dos** |
| M7 | Borrar el montaje de `MapResetConfirm` | **VERDE** | **ROJO** | +1 | `la toolbar monta de verdad la confirmación…` |
| **M6d** | **(mía, nueva)** renombrar el enlace de la prop y puentear con él | — | **VERDE** | **+0** | **ninguno, ver abajo** |
| M8 | Envolver la etiqueta en un `<span>` neutro | ROJO (falso positivo) | **VERDE** | **+0** | correcto: no cambia un píxel |

**M1-M7 mueren de verdad y M8 sigue verde.** El objetivo del pase se cumple: la nueva aserción
de texto visible no reintrodujo el falso positivo que yo había demostrado.

**Su "M6b" no es decorativa.** Es la forma literal `onClick={onReset}`, la que el guard
*anterior* sí cazaba. Tiene sentido incluirla: al reescribir el guard para cubrir la familia,
había que demostrar que no se perdió la única forma que antes sí cubría. Es una prueba de
no-regresión del propio guard, y la reproduje: roja.

**Confirmo sus dos matices, ambos correctos.** M3 pasó de 3 rojos a 2 porque el tercero lo
ponía la aserción anclada al cierre del svg, es decir un rojo por acoplamiento al DOM, justo
lo que el ítem 5 pedía quitar; la existencia del icono sigue cubierta por dos tests dedicados.
Y M5/M7 en su forma adaptada son la misma errata con la misma consecuencia; no hay trampa en
la adaptación.

**Corrección de mi propio primer pase (me la debo a mí):** mi M4 original reemplazaba
"para toda la mesa" **en todo el archivo**, y esa frase aparece **dos veces**: en la copy del
modal y en el `title` del botón. Mi script nuevo, que exige exactamente 1 coincidencia, lo
detectó y abortó. Reejecutada apuntando **solo al `<strong>` de la copy** (M4b), sale **ROJA**.
El hueco está cerrado; y queda anotado que esa frase vive en dos sitios, por si alguien vuelve
a mutarla.

### El escape residual que encontré: M6d

Lo busqué a propósito porque el implementer propone la técnica como lección. El guard nuevo es
**léxico** (censo de 4 apariciones de `onReset` más la prohibición de la familia
`on[A-Z]\w*=\{[^}]*onReset`), y un guard léxico se derrota **renombrando**:

```jsx
onReset: fireReset,                                     // en la firma de props
resolveMapReset({ confirmed, onReset: fireReset, … });  // el helper sigue invocándose
onClick={() => fireReset()}                             // el botón puentea el modal
```

Medido en contenedor: **`onReset` sigue apareciendo exactamente 4 veces** (el censo pasa),
`HANDLER_WITH('onReset')` no encuentra nada, `resolveMapReset({` sigue presente, el guard de
montaje sigue verde, y **la suite entera queda verde** (+0 rojos sobre el suelo). Y no es
código de pega: **`npm run lint` da 0 errores y `npm run build` compila**. Es decir, un botón
que vuelve a reiniciar el canvas de toda la mesa sin confirmación, con todos los checkpoints
en verde.

**Mi juicio: no bloquea, y no pido cambiar el guard.** Requiere tres ediciones coordinadas y
deliberadas, no la errata de una línea que era M6; el guard cumple lo que tiene que cumplir
(impedir la reintroducción accidental) y ya es netamente mejor que el anterior. La única
defensa realmente inmune al renombrado es **ejecutar el comportamiento**, y aquí no se puede:
`SessionToolbar` tiene hooks, así que, a diferencia de `MapResetConfirm`, no se puede invocar
como función pura sin jsdom. El hueco es **estructural**, no un descuido.

Lo que sí pido es que **la lección se escriba con ese límite dentro** (ver la enmienda al final).

### La vía elegida para el ítem 1: extraer el componente — bien elegida y bien justificada

Le di a elegir entre asertar sobre la fuente o extraer el componente. **Eligió extraer, y el
argumento que da es el correcto**: la vía de la fuente era *más regex sobre el código*, o sea
duplicar la apuesta sobre el método que M6 acababa de demostrar frágil. La vía elegida
**ejecuta los `onClick` de verdad** (invoca `MapResetConfirm` como función, recorre el árbol de
elementos y dispara los manejadores) sin jsdom y sin dependencias nuevas. Es la lección F20
aplicada a un componente JSX sin hooks. Cubre M5 y, de propina, la copy sobre el HTML
renderizado en vez de sobre el texto del archivo.

Declaró el coste (M7 dejaba de caer sola al mover el diálogo fuera del árbol) **y lo cubrió**
con un guard de montaje que yo verifiqué rojo. Eso es exactamente cómo se declara un coste.

**"No cambió nada de lo que ve el usuario": lo probé, no me fié.** Reconstruí verbatim en un
contenedor el bloque `Modal` que la toolbar tenía antes de la extracción, rendericé los dos por
SSR y los comparé fragmento a fragmento:

```
num de fragmentos viejo/nuevo: 28  28
fragmentos distintos: 1
  VIEJO: <p class="text-xs text-muted">No afecta a eventos, notas, chat ni personajes.
  NUEVO: <p class="text-xs text-muted">No borra eventos, notas, chat ni personajes; el reinicio queda registrado en el historial de la sesión.
```

**27 de 28 fragmentos idénticos**, y el único distinto es el párrafo que el ítem 4 mandaba
cambiar. La extracción es visualmente neutra, demostrado. Esto cierra además la limitación
número 3 que él declaró ("no he probado que renderice idéntico byte a byte"): ya está probado.

### La copy nueva contra el endpoint — ahora sí es literalmente cierta

Releído `backend/src/routes/sessions.js:135-152`, que hace tres cosas y solo tres: el `UPDATE`
de `canvas_state`, el `logEvent` de `session_reset` y el `emit` al room.

- "No borra eventos, notas, chat ni personajes" — **exactamente cierto**: no hay un solo
  `DELETE` en el handler, y `session_events` es append-only por diseño. El verbo total
  ("no afecta"), que era el falso, desapareció **y tiene su propio `not.toContain('No afecta a')`**
  para que no pueda volver en silencio.
- "el reinicio queda registrado en el historial de la sesión" — **cierto**: es el `logEvent`
  que yo había señalado, el que `stats.js:136` cuenta en `event_count` sin filtrar los tipos de
  motor. La frase es deliberadamente no-técnica y no promete que se vea en el feed de eventos
  (no se ve: `isPlanningEvent` lo filtra), solo que queda registrado. Correcto.

**Mi observación 4 queda cerrada.** Y el comentario que dejó en el código, atando la copy al
endpoint, es el detalle que hace que la próxima persona que la retoque sepa contra qué
validarla.

### Alcance — respetado

- **Dos archivos tocados en este pase**: `SessionToolbar.jsx` y `session.test.jsx`.
- `Icon.jsx`: **mismo sha256 que registré antes del pase**. No tocado.
- `backend/`: diffstat **idéntico** al de mi primera revisión (`rag.js` 11, `ai.js` 180,
  `aiTools.js` 4, `sockets/ai.js` 9, todos de F37). Endpoint y socket sin tocar.
- `designDebt.test.js`: **no modificado**. `SessionView.jsx`: **no modificado**.
- **Sin `disabled` en el botón y sin try/catch nuevos**: los únicos `try/catch` del archivo son
  los preexistentes de `submitQuick` y `submitNpc`.
- Cero dependencias nuevas (sin jsdom, sin testing-library).

### Higiene

`git status --porcelain` con **las mismas 18 entradas** al principio y al final de mi revisión
(la 18 es este propio informe). Rehash de los tres archivos del host tras todas las mutaciones:
idénticos. Host sin `frontend/node_modules`, `frontend/dist` ni `backend/node_modules`. Imagen
`rolapp-f38-delta` borrada (0 imágenes `f38` restantes).

### Estado de mis cinco observaciones

| # | Observación del primer pase | Estado |
|---|---|---|
| 1 | El "Cancelar" del modal no está cubierto | **CERRADA** — M5 roja, vía componente extraído |
| 2 | El guard de cableado es esquivable | **CERRADA con matiz** — M6 y M6b rojas; queda M6d (renombrado), ver arriba |
| 3 | La copy del modal no está cubierta | **CERRADA** — M4b roja |
| 4 | "No afecta a eventos…" no era cierto | **CERRADA** — redacción nueva verificada contra el endpoint |
| 5 | La aserción de texto visible es frágil | **CERRADA** — M1 roja y M8 verde, el falso positivo desapareció |

Las observaciones 6, 7 y 8 del primer pase (llevar el censo de iconos a `designDebt.test.js`,
el `handleReset` sin try/catch, y la nota de trazabilidad de la cita de F35) **siguen abiertas
a propósito**: las tres estaban fuera del alcance de este pase por instrucción explícita del
líder. La 6 sigue siendo un buen candidato a micro-feature; la 7 es deuda preexistente.

### Limitaciones que siguen vigentes

1. **Sigue sin haber e2e.** Nadie ha abierto dos pestañas, tampoco en este pase. Los tests
   nuevos disparan los `onClick` reales del diálogo, que es un paso más cerca, pero no son un
   navegador. **La comprobación de 60 segundos sigue siendo la única validación de extremo a
   extremo**: abrir sesión, "Reiniciar mapa", "Cancelar", y ver que el mapa sigue ahí. Ahora
   pesa menos que antes (M5 ya está cubierta por test), así que la degrado de "recomendada para
   cerrar el hueco" a "recomendada como confirmación final del founder".
2. **Ninguna verificación de layout.** Ni él ni yo hemos abierto un navegador ni medido un
   ancho. La extracción no cambia ni una clase (probado por el diff de fragmentos), así que el
   riesgo sigue siendo el que juzgué nulo, pero los 314 px / 320 px del primer pase siguen sin
   reproducirse.
3. **M6d.** El guard de cableado es léxico y se derrota renombrando. Documentado arriba.

### Enmienda a la lección que el líder iba a canonizar

El implementer propone como candidata 2: *"Un guard de fuente se valida con su propio control
positivo, y afirma sobre el CONJUNTO de apariciones"*. **Estoy de acuerdo con las cuatro partes
(a-d) y las he verificado**: el censo con número fijo, la familia `on[A-Z]\w*=\{[^}]*sym`, el
colapsado de espacios y el test que ejercita el propio guard con formas peligrosas y una
legítima. M6 y M6b mueren gracias a eso.

**Pero la lección no debe prometer más de lo que da.** Pido añadirle una cláusula:

> **Un guard de fuente es léxico y por tanto se derrota renombrando el símbolo** (probado en
> F38: alias la prop a otro nombre y el censo sigue cuadrando, el regex no encuentra nada, y
> lint y build pasan). Lo que garantiza es que **la regresión no vuelva por accidente en una
> línea**, no que sea imposible. Cuando la unidad se pueda ejecutar —un componente **sin
> hooks** se invoca como función y se le disparan los manejadores— **prefiere siempre el test
> de comportamiento al guard de fuente**; deja el guard solo para lo que no se puede ejecutar
> (aquí, el componente con estado que monta el diálogo).

Con esa cláusula, la candidata 1 del implementer (componente sin hooks testeable como función
pura) y la 2 dejan de ser dos técnicas sueltas y pasan a ser una jerarquía: **ejecuta si
puedes, escanea si no puedes, y sabe cuál de las dos estás usando.** Así canonizada, la lección
no lleva el agujero dentro.

Las candidatas 3 (control positivo en cada corrida) y 4 (la aserción de texto visible no se
ancla al DOM) las suscribo sin cambios: la 3 me la he apropiado en esta misma revisión porque
es la que hace legible el verde de M8, y la 4 la medí yo antes y la he vuelto a medir ahora.

### Conclusión del delta

**APROBADO.** El pase hizo lo que se le pidió y lo hizo por la vía más fuerte de las dos que se
le ofrecieron: en vez de añadir más regex sobre la fuente, extrajo el diálogo a una unidad que
se puede **ejecutar**, y eso convirtió tres de mis cuatro mutaciones supervivientes en tests de
comportamiento reales. Las cinco observaciones están cerradas, verificadas por mí y no por su
tabla: M1-M7 rojas, M8 verde, 179/179, 36 tests en el archivo, dos únicas líneas eliminadas en
el diff (imports), alcance de dos archivos, y vigencia por hash.

Queda un escape residual (M6d) que **no bloquea** pero que **sí cambia la redacción de la
lección**. Prefiero que el líder lo sepa ahora, que es literalmente lo que me pidió.

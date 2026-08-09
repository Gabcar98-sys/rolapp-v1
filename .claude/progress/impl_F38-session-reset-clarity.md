# Implementación: F38 — El botón que parece "atrás" y borra el mapa de la mesa
Fecha: 2026-08-08
Status: completado

## Resumen

El control acusado (`SessionToolbar.jsx:203-206`, un `Icon name='arrow-left'` mudo con
`title='Reiniciar canvas'`) ya no existe. En su lugar hay un botón con **icono de flecha
circular de reinicio**, **texto visible "Reiniciar mapa"**, `aria-label` propio y un **modal
de confirmación** que nombra el alcance real (toda la mesa). El endpoint y el socket no se
tocaron: `PATCH /api/sessions/:id/reset` y `session:reset` siguen byte a byte como estaban.

## Archivos modificados

### `frontend/src/components/ui/Icon.jsx`
- **`Icon.jsx:69-76`** — nuevo icono `refresh` en la sección "Acciones". El set NO tenía
  ningún glifo de reiniciar/refrescar (censé los 35 nombres: `dashboard, book, map, skills,
  id-card, sliders, user, users, cube, clock, logout, plus, edit, trash, chevron-right,
  chevron-down, search, pin, link, x, check, arrow-right, arrow-left, upload, download,
  shield, heart, bag, coin, file, chart, zap, dice, swords, message`), así que hubo que
  añadirlo. Estilo idéntico al resto: dos `<path>` de solo stroke, sin `fill`, dentro del
  viewBox 0 0 24 24 y en el rango 3..21 que usan los demás iconos (glifo tipo `rotate-cw`:
  arco de 270° + la esquina de la punta de flecha arriba a la derecha).

### `frontend/src/components/Session/SessionToolbar.jsx`
- **`:31-39`** — nuevo helper puro exportado `resolveMapReset({ confirmed, onReset, closeModal })`.
  Es el **único** punto que puede disparar el reset. Extraído del componente porque el runner
  de vitest no tiene jsdom (lección F20): así la lógica load-bearing —"confirmar dispara una
  vez, cancelar no dispara nunca"— se testea de verdad en vez de simular clics.
- **`:70-71`** — estado `showReset`.
- **`:124-126`** — `closeReset(confirmed)`, que delega en el helper. Lo usan los tres caminos
  de salida del modal (Cancelar, Confirmar y el `onClose` del backdrop/Escape/aspa).
- **`:223`** — el `div` derecho pasa de `ml-auto flex items-center gap-2` a
  `ml-auto flex flex-wrap items-center justify-end gap-2` (ver sección de móvil).
- **`:224-232`** — el botón: `onClick={() => setShowReset(true)}` (ya **no** ejecuta nada),
  `aria-label="Reiniciar mapa"`, `title` que ahora describe el efecto real, e
  `<Icon name="refresh" size={15} className="mr-1" /> Reiniciar mapa` — mismo patrón exacto
  que `Cambiar mapa` / `Nuevo Evento` / `Evento NPC` / `Modo TV`.
- **`:270-287`** — modal de confirmación, con el **mismo componente `Modal`** que la toolbar
  ya usa para "Cambiar mapa" (nada de `window.confirm`). Texto renderizado (verificado, ver
  abajo): *"Se borrarán el mapa de fondo y los dibujos del canvas **para toda la mesa**, no
  solo en tu pantalla: los jugadores y el Modo TV verán el canvas vacío al instante."* +
  *"No afecta a eventos, notas, chat ni personajes."* Botones `Cancelar` / `Sí, reiniciar mapa`
  (este último en `variant="danger"`).
- **`:42-44`** — actualizado el comentario de cabecera del componente.

> El texto del modal describe lo que hace el endpoint de verdad, leído en
> `backend/src/routes/sessions.js:134-152`: `UPDATE canvas_state SET image_url = NULL,
> tldraw_snapshot = NULL` (o sea, fondo **y** dibujos) + `io.to(session:<id>).emit('session:reset')`
> a todo el room. De ahí "para toda la mesa" y "No afecta a eventos, notas, chat ni personajes".

### `frontend/src/components/Session/session.test.jsx`
Ampliado (no reescrito): los 17 tests previos siguen intactos y en verde.

## Qué icono usé y cómo comprobé que existe DE VERDAD

Icono: **`refresh`**, añadido por mí a `ICONS` (no existía ninguno adecuado).

La lección F35 dice que un nombre inexistente no rompe el build: `Icon` hace
`if (!paths) return null` y el botón se queda sin glifo, en silencio. Por eso no me limité a
mirarlo, lo dejé como invariante ejecutable y lo validé por mutación:

1. **Censo previo** de los 35 nombres reales del objeto `ICONS` → confirmado que no había
   ningún reinicio/refresco/rotación. Censé además los `<Icon name="…">` literales de todo
   `frontend/src` (37 usos distintos): todos resuelven hoy, así que el guard no llega con
   deuda heredada.
2. **Test de existencia + control negativo** (`session.test.jsx`): `ICON_NAMES` contiene
   `refresh`; `renderToStaticMarkup(<Icon name="refresh"/>)` produce `<svg>` con `<path>`;
   y `<Icon name="reiniciar"/>` (nombre inventado) **no lanza y no produce `<svg>`** — el
   control negativo deja escrita en el test la forma exacta de la regresión silenciosa.
3. **Guard de la toolbar**: el test lee la fuente real de `SessionToolbar.jsx`, extrae todos
   los `<Icon name="…">` literales y exige que todos estén en `ICON_NAMES`, con control
   positivo del patrón (sobre una fuente falsa con `name="no-existe"` el regex sí lo captura).
4. **Prueba por mutación (M4)**: renombré `refresh` → `refreshXX` dentro del contenedor →
   **3 tests rojos**. La existencia del icono está probada, no supuesta.

## Prueba por mutación de los tests nuevos

Todas ejecutadas **dentro del contenedor efímero** (`docker run --rm … sh -c "sed -i … && npx vitest"`),
nunca sobre el árbol del host (lección F36: el auto-commiteador podría sellar la mutación).
`git status` del host quedó idéntico al inicio.

| # | Mutación | Resultado |
|---|----------|-----------|
| M1 | Volver al `<Icon name="arrow-left" size={15}/>` sin texto | ❌ 2 tests rojos |
| M2 | `onClick={() => setShowReset(true)}` → `onClick={onReset}` (sin confirmación) | ❌ 1 test rojo |
| M3 | `if (confirmed)` → `if (!confirmed)` en el helper | ❌ 3 tests rojos |
| M4 | `refresh` renombrado en `ICONS` | ❌ 3 tests rojos |

M1 me hizo **endurecer un test flojo**: mi primera versión afirmaba
`expect(html).toContain('Reiniciar mapa')`, que **pasaba igual con el botón mudo** porque el
`aria-label` ya contiene esa cadena. Ahora exige el nodo de texto visible dentro del botón:
`expect(html).toMatch(/<\/svg>\s*Reiniciar mapa<\/button>/)`. Sin la mutación, ese test se
habría quedado sin cubrir justamente lo que la feature arregla.

M2 es la razón del guard sobre la fuente (`resolveMapReset({` presente y `onClick={onReset}`
ausente): el helper puro más perfecto no sirve de nada si el componente deja de invocarlo, y
eso no lo detecta ningún test de unidad ni el build.

**Verificación visual del modal**: forcé `useState(true)` en `showReset` dentro del contenedor
y volqué el HTML renderizado para leer la copia final (espaciado del `{' '}`, el `<strong>`
inline y los dos botones). Sale correcta y el diálogo lleva `role="dialog"`, `aria-modal="true"`
y `aria-label="Reiniciar mapa"` (los pone `Modal`, no yo).

## Cómo queda la toolbar en móvil

- El contenedor exterior ya era `flex flex-wrap items-center gap-2`: al crecer el botón, los
  controles **envuelven a otra línea**, no se desbordan ni se recortan.
- El grupo derecho (`ml-auto`) **no** tenía `flex-wrap` y ahí sí había riesgo real: con texto,
  `Reiniciar mapa` + `Finalizar` + el icono de salir suman ≈314 px (text-sm, `px-3 py-1.5`,
  `gap-2`). Cabe en 360 px (336 útiles tras `px-3`), pero **se desbordaba a 320 px**. Le añadí
  `flex-wrap` + `justify-end`: si no cabe, el trío se parte en dos filas alineadas a la
  derecha en vez de salirse.
- Mobile-first respetado: la solución es intrínsecamente fluida (`flex-wrap`), sin necesidad
  de breakpoints, y **sin** `window.innerWidth` ni estilos inline (comprobado con grep sobre
  los dos archivos de producción: cero coincidencias de `style={`, `const s = {` y
  `window.innerWidth`).
- El modal ya es responsive por diseño (`w-full max-w-md` + `p-4` del backdrop en `Modal.jsx`).

## Tests escritos

`frontend/src/components/Session/session.test.jsx` — +10 tests (17 → 27 en el archivo):

**`describe('Reiniciar mapa (F38)')`** (6)
- texto visible dentro del `<button>` + `aria-label`, y ausencia del `title` mudo `Reiniciar canvas`;
- el HTML de la toolbar ya no contiene el path de `arrow-left` (el path se **extrae en runtime**
  de `<Icon name="arrow-left"/>`, así que el test no se acopla a las tripas de `Icon.jsx`);
- el icono `refresh` existe y pinta svg + control negativo con un nombre inventado;
- todos los `<Icon name="…">` literales de la toolbar existen en el set, con control positivo del patrón;
- el botón abre la confirmación y no puentea el helper (guard sobre la fuente real);
- al montar, el modal está cerrado (ni `role="dialog"` ni el cuerpo del aviso).

**`describe('resolveMapReset (F38)')`** (4)
- confirmar → cierra el modal y llama a `onReset` **una** vez;
- cancelar / backdrop / Escape → cierra y **no** llama a `onReset`;
- solo `confirmed === true` dispara (barrido de `undefined, null, 0, '', NaN`);
- sin callbacks no lanza.

## Resultado de verificación

Entorno canónico (Docker), imagen efímera con etiqueta propia `rolapp-f38-frontend`.

- **lint: ✅** — `docker run --rm rolapp-f38-frontend npm run lint` → **exit 0**, 0 errores,
  6 warnings **preexistentes y ajenos** a esta feature (`PrepWorkspace.jsx` ×5,
  `DashboardPage.jsx` ×1). Cero warnings en los archivos que toqué. Además el
  `docker build --target build` ejecuta `RUN npm run lint` antes del build, así que el lint
  está forzado por dos vías.
- **build: ✅** — `docker build --target build -t rolapp-f38-frontend ./frontend` → exit 0
  (`RUN npm run lint` + `RUN npm run build`, vite compila sin errores).
- **test: ✅ 170 pasando** (15 archivos) — baseline 160 → **+10**, todos míos. Ningún test
  previo borrado ni editado, salvo el endurecimiento de una aserción **nueva** mía.
- **Vigencia probada por hash host↔imagen** (lección F22), 3/3 idénticos sobre la imagen final:
  - `SessionToolbar.jsx` → `1770c8ef…b80e2f`
  - `Icon.jsx` → `b8522df8…b4227`
  - `session.test.jsx` → `7b3884e5…7ea94a`
- **Sin residuos**: `docker rmi rolapp-f38-frontend` ejecutado (0 imágenes `rolapp-f38`
  restantes); el host queda **sin `frontend/node_modules` ni `frontend/dist`** (comprobado),
  así que el build context sigue limpio (lección F8b).
- **Manual / e2e: no ejecutado.** No levanté `docker compose up` para clicar el flujo en el
  navegador; el render del modal lo verifiqué por SSR forzando el estado abierto. Un e2e real
  (dos pestañas, ver que el jugador pierde el mapa solo tras confirmar) queda para el reviewer
  o el founder si lo considera necesario.

## Lecciones aplicadas

- **F35 (icono inexistente = regresión silenciosa)** — es el eje del punto 1 del encargo:
  censo de nombres reales, control negativo en test y mutación M4. Ver sección dedicada.
- **F35 (una regresión que no rompe el build necesita un test-guard que reescanee el código)** —
  el guard de iconos literales de la toolbar y el guard de cableado del helper reescanean la
  fuente en cada `npm test`, y ambos están validados por mutación.
- **F20 (el vitest del frontend no tiene jsdom)** — nada de simular clics: la lógica
  load-bearing (confirmar/cancelar) vive en `resolveMapReset`, exportado y testeado directo.
- **F36 (mutar dentro del contenedor efímero, nunca en el árbol real)** — las 5 mutaciones
  (M1-M4 + el volcado del modal) se hicieron con `sed -i` dentro de `docker run --rm`.
- **F22 (vigencia por hash, no por timestamp ni cache-hit)** — hashes host↔imagen de los 3
  archivos, y el lint corrido **en vivo** en el contenedor además de como capa del build.
- **F8b (no ensuciar el host)** — build stage + contenedor efímero, `docker rmi` al terminar,
  cero `npm install` en el directorio montado.
- **F5 (una feature de frontend no está terminada hasta estar cableada)** — el helper nuevo se
  invoca de verdad desde el componente y el guard de M2 impide que deje de estarlo.
- **Frontend/Tailwind (cero estilos inline, cero `window.innerWidth`)** — verificado por grep.

## Decisiones tomadas

1. **Icono nuevo `refresh` en vez de reutilizar uno existente.** No había alternativa: ningún
   glifo del set significa reiniciar. Descarté `arrow-right` (sigue siendo una flecha
   direccional, mismo malentendido) y `x`/`trash` (sugieren borrar/cerrar la sesión entera,
   que es lo que hace "Finalizar").
2. **Etiqueta "Reiniciar mapa"** tal y como pedía el encargo. Nota: el endpoint también borra
   `tldraw_snapshot` (los dibujos), no solo el fondo; en vez de alargar la etiqueta lo dejé
   explícito en el texto del modal y en el `title`.
3. **Botón de confirmación en `variant="danger"`** y redactado como "Sí, reiniciar mapa" (no
   un "Aceptar" genérico) para que el botón afirmativo diga qué va a pasar.
4. **`aria-label` idéntico al texto visible.** Con texto visible el `aria-label` es redundante,
   pero el encargo lo pedía explícitamente; al ser idéntico no rompe a los lectores de
   pantalla (el problema sería que difiriera del texto visible).
5. **`flex-wrap` + `justify-end` en el grupo derecho.** Cambio de una línea, fuera de la letra
   del encargo pero dentro del aviso "comprueba que la toolbar no se rompe": sin él, el grupo
   se desborda por debajo de ~330 px de ancho.
6. **Cero dependencias nuevas.**

## Lo que decidí NO hacer (y por qué)

- **No añadí un botón "Volver"** ni toqué el enrutado: descartado explícitamente por el founder.
- **No moví el control dentro del modal "Cambiar mapa"**: descartado explícitamente por el founder.
- **No toqué `SessionView.jsx`, el endpoint ni el socket.** `handleReset`, `PATCH
  /api/sessions/:id/reset` y `session:reset` quedan intactos; el arreglo es 100% de presentación.
- **No añadí un `disabled` cuando no hay mapa cargado.** Sería tentador (el founder machacó el
  botón sin mapa), pero el reset también limpia los dibujos de tldraw, y la toolbar no sabe si
  hay dibujos — solo recibe `currentImageUrl`. Deshabilitarlo por `!currentImageUrl` dejaría al
  DM sin poder limpiar un canvas dibujado. Con confirmación el problema ya está resuelto.
- **No metí el censo de iconos en `designDebt.test.js`** (que ya reescanea todo `src/`), pese a
  que ahí cubriría los 37 usos del árbol y no solo los de la toolbar. Habría sido salirme del
  alcance declarado ("solo `SessionToolbar.jsx` + `Icon.jsx`"). Comprobé que hoy **pasaría en
  verde** (los 37 nombres literales del árbol existen), así que es una ampliación barata y sin
  deuda pendiente → la dejo propuesta abajo.
- **No cambié el `title` por un tooltip propio** ni toqué los demás botones de la toolbar.

## Candidatos para LEARNINGS.md

1. **Un `aria-label` puede hacer pasar en verde el test de "texto visible"** — *Contexto:* F38,
   el test `expect(html).toContain('Reiniciar mapa')` seguía verde tras revertir el botón a
   icono mudo, porque la cadena vivía también en el `aria-label` y el `title`. *Lección:* para
   afirmar que un texto es VISIBLE hay que anclar la aserción al nodo de texto
   (`/<\/svg>\s*Etiqueta<\/button>/`), no buscar la cadena suelta en el HTML: los atributos de
   accesibilidad contienen las mismas palabras y convierten el test en tautología. Se detecta
   con una mutación, no releyendo el test. *Por qué importa:* el test de una feature de
   etiquetado puede estar verde sin cubrir exactamente lo que la feature arregla.
2. **Un helper puro extraído necesita además un guard de que el componente lo invoca** —
   *Contexto:* F38, `resolveMapReset` concentra la confirmación del reset. *Lección:* la
   lección F20 (extraer helpers puros porque no hay jsdom) tiene un flanco: si alguien vuelve
   a colgar la acción del `onClick`, los tests del helper siguen todos verdes y la
   confirmación desaparece sin que nada se ponga rojo. Acompaña el helper con una aserción
   sobre la fuente real del componente (`toMatch(/helper\(\{/)` + `not.toMatch(/onClick=\{accion\}/)`),
   validada por mutación. *Por qué importa:* es el mismo fallo silencioso que un componente
   huérfano (F5), pero a nivel de handler.
3. **Un control destructivo que afecta a otros usuarios no puede ser un icono sin etiqueta** —
   *Contexto:* F38, 16 `session_reset` en la sesión 17, seis en un mismo segundo. *Lección:*
   si una acción emite a todo el room (o escribe en el log append-only), exige texto visible +
   confirmación que nombre el alcance ("para toda la mesa"), y elige el icono por su
   significado, no por el hueco que llena: una flecha se lee como "volver" aunque el `title`
   diga otra cosa. El `title` HTML no es una etiqueta — en móvil ni siquiera existe.
   *Por qué importa:* el usuario repite el clic porque "no pasa nada", y cada repetición
   dispara el efecto destructivo en las pantallas de los demás.

## Bloqueantes

Ninguno.

---

# Pase de endurecimiento (post-review)

Fecha: 2026-08-08
Status: **completado**
Origen: `.claude/progress/review_F38-session-reset-clarity.md` — "APROBADO CON OBSERVACIONES".
Alcance tocado: **`SessionToolbar.jsx` + `session.test.jsx`, y nada más.** `Icon.jsx` intacto
(`sha256 b8522df8…99cb4227`, el mismo que registró el reviewer), backend intacto, endpoint y
socket intactos.

El reviewer aprobó el código y señaló que lo que no estaba resuelto eran **los tests**: cuatro
mutaciones destructivas (M4-M7) quedaban en verde, más un matiz de copy que no era literalmente
cierto. Este pase cierra los cinco ítems.

---

## 1. Cobertura del "Cancelar" (M5) — vía elegida: **extraer el componente**

El reviewer dejaba elegir entre (a) asertar sobre la fuente que cada camino de salida pasa el
booleano correcto y (b) extraer el cuerpo del modal a un componente exportado. **Elegí (b)**, y
la razón no es de gusto:

- La vía (a) es **otro guard de regex sobre la fuente**, o sea exactamente la técnica que M6
  acaba de demostrar que se esquiva cambiando la forma sintáctica. `onClick={() => closeReset(false)}`
  y `onClick={cancelHandler}` son equivalentes para el usuario y distintos para el regex.
  Duplicar la apuesta sobre el método que acaba de fallar era la opción débil.
- La vía (b) **ejecuta el `onClick` real**. `MapResetConfirm` no tiene estado ni efectos, así
  que se puede invocar como función pura, recorrer el árbol de elementos React que devuelve y
  disparar sus manejadores — sin jsdom y sin una sola dependencia nueva. Es la lección F20
  ("no hay jsdom: testea helpers puros") aplicada a un componente JSX en vez de a un helper.
- De propina cubre el ítem 3: la copy se asierta sobre el **HTML renderizado** del diálogo, no
  sobre el texto del archivo. Un test que lee la fuente dice que la cadena está escrita; uno
  que renderiza dice que el usuario la ve.
- **Coste que asumo y declaro:** al mover el diálogo fuera del árbol de la toolbar, M7 deja de
  caer solo. Le puse su propio guard de cableado (lección F5), que sí lo mata.

**Nada de lo que ve el usuario cambió** por la extracción: el JSX se movió verbatim (mismo
`Modal`, mismas clases, mismos dos botones en el mismo orden, mismo `variant="danger"`). Lo
único que cambia en pantalla es la frase del ítem 4, que era el encargo.

## 2. Guard de "no puentear el modal" (M6) — se afirma sobre el CONJUNTO, no sobre una forma

El `not.toMatch(/onClick=\{onReset\}/)` se sustituyó por tres afirmaciones, sobre una copia de
la fuente con los espacios colapsados (`FLAT_SRC`) para que ni Prettier ni un salto de línea
abran un hueco:

1. `resolveMapReset({` sigue invocándose.
2. **Censo completo**: `onReset` aparece **exactamente 4 veces**, y las cuatro están nombradas
   en el comentario del test (firma del helper, cuerpo del helper, firma de props del
   componente, única llamada al helper). Una quinta aparición **es** una vía nueva hacia el
   reset y hay que justificarla editando el test.
3. Ninguna aparición cuelga de un manejador de eventos: `on[A-Z]\w*=\{[^}]*onReset`, que cubre
   `onClick={onReset}`, `onClick={() => onReset()}` y cualquier `onXxx` futuro.

Y **el guard tiene su propio control positivo** (`it('el guard de cableado pilla también la
forma envuelta en arrow')`): se le pasan las tres formas peligrosas y se comprueba que las
marca, más una forma legítima (`resolveMapReset({ confirmed, onReset, closeModal })`) que **no**
debe marcar. Sin ese control, un regex roto daría un verde tranquilizador.

## 3. Copy cubierta (M4)

`it('la copy nombra el alcance real y dice la verdad sobre el endpoint')` renderiza
`<MapResetConfirm open />`, borra las etiquetas y asierta sobre el texto plano: qué se borra,
**"para toda la mesa"**, "no solo en tu pantalla", "el Modo TV", qué NO se borra, que el
reinicio queda registrado, que los dos botones se leen, y que no hay emojis.

## 4. Copy corregida — "No afecta a…" era falso contra el endpoint

Antes: *"No afecta a eventos, notas, chat ni personajes."*
Ahora: *"No borra eventos, notas, chat ni personajes; el reinicio queda registrado en el
historial de la sesión."*

Verificado frase por frase contra `backend/src/routes/sessions.js:145-149`, que hace tres
cosas y solo tres: el `UPDATE canvas_state SET image_url = NULL, tldraw_snapshot = NULL`, el
`logEvent(session.id, 'session_reset', dm_id, {})` y el `emit` al room.

- **"No borra"** es exactamente cierto: no hay un solo DELETE en el handler, y `session_events`
  es append-only por diseño.
- La segunda cláusula hace explícito el `logEvent` que el reviewer detectó — el que
  `stats.js:136` cuenta en `event_count` sin filtrar los tipos de motor (39% del total en la
  sesión 17). Ya no hay nada que el diálogo niegue y el endpoint haga.
- El test incluye `expect(text).not.toContain('No afecta a')`, así que la formulación total
  (que era la falsa) no puede volver en silencio.

Dejé el porqué escrito **en el código**, junto a la copy, para que quien la retoque vea contra
qué hay que validarla.

## 5. Aserción de texto visible endurecida

Sustituida la variante anclada `/<\/svg>\s*Reiniciar mapa<\/button>/` por la que dejó probada
el reviewer, con `visibleText` como helper de módulo:

```js
const visibleText = (html) => html.replace(/<[^>]*>/g, '');
expect(html).toContain('aria-label="Reiniciar mapa"');
expect(visibleText(html)).toContain('Reiniciar mapa');
```

Lo verifiqué yo mismo, no me fié de la medición ajena:

| Escenario | Aserción NUEVA | Aserción VIEJA |
|---|---|---|
| Código real | **verde** | verde |
| M1 — botón mudo (`<Icon name="arrow-left"/>` sin texto, con el `aria-label` intacto) | **roja** | roja |
| M8 — etiqueta envuelta en `<span className="hidden sm:inline">` | **verde** | **ROJA** (falso positivo) |

La última fila la medí aplicando M8 **y** revirtiendo la aserción a la forma antigua en el
mismo contenedor: `Tests 1 failed | 35 passed`. El cambio no era cosmético.

Además añadí `it('visibleText no se deja engañar por atributos ni por etiquetas extra')`, un
control del propio helper en las dos direcciones: un botón cuya etiqueta solo vive en
`aria-label`/`title` **no** la tiene como texto visible, y envolverla en un `<span>` **no**
rompe la aserción.

---

## Archivos modificados (los dos únicos)

### `frontend/src/components/Session/SessionToolbar.jsx`
- **Nuevo export `MapResetConfirm({ open, onResolve })`** (justo debajo de `resolveMapReset`):
  contiene el `<Modal>` de confirmación entero — los tres caminos de salida y la copy.
  `onResolve(confirmed)` es el **único** punto de salida del diálogo. Comentado el porqué de la
  extracción (que los tests puedan disparar los `onClick` reales sin DOM).
- **Copy del segundo párrafo** corregida (ítem 4), con el comentario que la ata al endpoint.
- **El bloque `<Modal>…</Modal>` del render** se sustituye por
  `<MapResetConfirm open={showReset} onResolve={closeReset} />`. El comentario explicativo de
  F38 que había encima se conserva tal cual.
- Sin cambios en: el botón de la toolbar, el `flex-wrap`, `resolveMapReset`, `closeReset`, los
  otros tres modales, ni ninguna otra acción.

### `frontend/src/components/Session/session.test.jsx`
Ampliado, **no reescrito**. +9 tests (27 → **36** en el archivo).

- `import Modal` y `MapResetConfirm` añadidos a los imports existentes.
- `visibleText` como helper de módulo, documentado.
- **Reescritas 2 aserciones dentro de un test que añadí yo en el pase anterior** (el de texto
  visible) y **el cuerpo del guard de cableado**, también mío. Ver la nota de integridad abajo.
- Tests nuevos:
  - `visibleText no se deja engañar por atributos ni por etiquetas extra (control del arnés)`
  - `el guard de cableado pilla también la forma envuelta en arrow (control positivo)`
  - `la toolbar monta de verdad la confirmación, con su estado y su resolvedor` (mata M7)
  - `describe('MapResetConfirm: los tres caminos de salida (F38)')` con 6:
    `usa el Modal del proyecto, no un window.confirm` ·
    `"Cancelar" resuelve en false` · `"Sí, reiniciar mapa" resuelve en true` ·
    `cerrar por backdrop/Escape/aspa resuelve en false` ·
    `un solo clic resuelve una sola vez` ·
    `la copy nombra el alcance real y dice la verdad sobre el endpoint`

**Integridad de los tests previos — comprobado, no supuesto.** `git diff HEAD` sobre
`session.test.jsx` tiene exactamente **2 líneas eliminadas**, y las dos son líneas de `import`
que se ampliaron:
```
-import SessionToolbar, { buildQuickEventPayload } from './SessionToolbar.jsx';
-import AIPanel, { resolveSessionGameSystems } from '../AI/AIPanel.jsx';
```
Es decir: **ningún test anterior a F38 fue borrado ni editado**. Lo único reescrito son
aserciones de tests que escribí yo en el pase anterior de esta misma feature, que era el
encargo.

---

## Resultado de verificación

Entorno canónico (Docker). El founder no tiene Node local; nada se corrió en el host.

| Comando | Resultado |
|---|---|
| `docker build --target build -t rolapp-f38-hard ./frontend` | exit **0** (incluye `RUN npm run lint` y `RUN npm run build`) |
| `docker run --rm rolapp-f38-hard npm run lint` | exit **0** — 0 errores; **6 warnings preexistentes y ajenos** (`PrepWorkspace.jsx` ×5, `DashboardPage.jsx` ×1). Cero warnings en los 2 archivos que toqué. |
| `docker run --rm rolapp-f38-hard npm test` | exit **0** — **179 passed (179)**, 15 archivos; `session.test.jsx` con **36 tests**. |
| `docker compose build frontend` | exit **0** |
| `docker compose build backend` + `npm run lint` | exit **0** |
| `docker compose run --rm --no-deps backend npm test` | exit **0** — **198 pass, 0 fail, 1 skipped** (idéntico al baseline del reviewer; no toqué backend) |

- **lint:  ✅**
- **build: ✅**
- **test:  ✅ 179 pasando** (baseline del reviewer 170 → **+9**, todos míos y todos nuevos)
- **Manual / e2e: ❌ no ejecutado** — ver limitaciones.

### Vigencia probada por hash (no por timestamp ni por cache-hit)

`sha256sum` host contra la **misma imagen sobre la que corrieron los tests**:

```
SessionToolbar.jsx  7657f40a5eba…eceecc8fe   host == imagen
session.test.jsx    67f2f8114626…8a7052bd    host == imagen
Icon.jsx            b8522df8160f…699cb4227   host == imagen  (y == al hash del reviewer: NO lo toqué)
```

3/3 idénticos, y rehasheados al final del pase: los archivos del árbol siguen siendo byte a
byte los que se testearon.

---

## Mutaciones M1-M8 — tabla actualizada

**Arnés:** todo dentro de contenedores efímeros (`docker run --rm`, script decodificado desde
base64 en `/tmp`), **nunca sobre el árbol real** (lección F36: el auto-commiteador sellaría la
mutación). El script **aborta con `FALLO_MUTACION`** si el patrón no aparece exactamente 1 vez,
así que una mutación que "no se aplicó" no puede disfrazarse de verde; cada corrida imprime
`MUTACION_APLICADA`.

**Control positivo en TODAS las corridas** (no solo en una): el script inyecta
`src/__mutctl.test.js` con una aserción que **debe** fallar. Por tanto **toda** corrida tiene
como mínimo 1 rojo, y una corrida con exactamente 1 rojo significa "el runner estaba vivo y la
mutación no añadió ninguno" — que es justo lo que hay que poder distinguir en M8. Corrida de
referencia sin mutación (`NONE`): `Tests 1 failed | 179 passed (180)`.

| # | Mutación | Antes (reviewer) | **Ahora** | Rojos añadidos sobre el control | Test que la mata |
|---|---|---|---|---|---|
| **M1** | Botón vuelve al `<Icon name="arrow-left"/>` sin texto (aria-label intacto) | ROJO | **ROJO** | 2 | `texto visible y aria-label` + `ya no usa la flecha` |
| **M2** | `if (confirmed) onReset?.()` → `onReset?.()` | ROJO | **ROJO** | 2 | los 2 de `resolveMapReset` |
| **M3** | Borrar la clave `refresh` de `Icon.jsx` | ROJO (3) | **ROJO** (2) | 2 | `el icono refresh existe DE VERDAD` + `todos los iconos literales existen` |
| **M4** | Quitar "para toda la mesa" de la copy | **VERDE** | **ROJO** | 1 | `la copy nombra el alcance real…` |
| **M5** | "Cancelar" pasa `true` en vez de `false` | **VERDE** | **ROJO** | 1 | `"Cancelar" resuelve en false…` |
| **M6** | `onClick={() => setShowReset(true)}` → `onClick={() => onReset()}` | **VERDE** | **ROJO** | 1 | `el botón abre la confirmación…` (censo: 5 ≠ 4) |
| **M6b** | La misma regresión en su forma literal: `onClick={onReset}` | (no probada) | **ROJO** | 1 | idem — el guard mata **las dos** formas |
| **M7** | Borrar el montaje de la confirmación | **VERDE** | **ROJO** | 1 | `la toolbar monta de verdad la confirmación…` |
| **M8** | Envolver la etiqueta en un `<span>` neutro | ROJO (falso positivo) | **VERDE** | **0** | — correcto: no cambia un píxel |

Objetivo cumplido: **M1-M7 rojas** (M7 incluida) y **M8 verde**.

**Dos matices que declaro en vez de esconder:**

1. **M3 pasó de 3 rojos a 2.** El tercero que contó el reviewer venía de la aserción anclada
   `/<\/svg>\s*…<\/button>/`, que se ponía roja porque `Icon` devolvía `null` y desaparecía el
   `<svg>`. Es decir: era un rojo por **acoplamiento a la estructura del DOM**, exactamente lo
   que el ítem 5 pedía quitar. La existencia del icono sigue cubierta por dos tests dedicados
   (censo del set + control negativo con nombre inventado), así que M3 sigue siendo ROJA; solo
   deja de serlo por el motivo equivocado.
2. **M5 y M7 se ejecutaron en su forma adaptada a la extracción**, porque su objetivo literal
   ya no existe en el código: M5 muta `onResolve(false)` → `onResolve(true)` en el botón
   Cancelar (misma errata de un carácter, mismo efecto: el escape se vuelve destructivo), y M7
   borra el `<MapResetConfirm … />` de la toolbar (misma consecuencia: el botón abre la nada).
   La forma "borrar además el componente entero" no la probé porque rompería el `import` del
   test con un error de módulo, no con un assert legible — sería un rojo de infraestructura,
   no evidencia.

### Higiene

- `git status --porcelain` con las **mismas 18 entradas** al principio y al final (`diff`
  literal de los dos volcados: idéntico). Ninguna mutación tocó el árbol real.
- Host sin `frontend/node_modules`, `frontend/dist` ni `backend/node_modules`, antes y después.
- Imagen temporal `rolapp-f38-hard` borrada (`0` imágenes `f38` restantes).

---

## Lecciones aplicadas

- **F36 (mutar dentro del contenedor efímero)** — las 10 corridas de mutación, incluida la del
  ítem 5 que además muta el test.
- **F37 / F35 (control positivo obligatorio)** — llevado un paso más allá que el reviewer: el
  control no se corre una vez, se **inyecta en cada corrida**, que es lo que permite leer el
  verde de M8 como "arnés vivo, cero rojos" y no como "quizá el runner no arrancó".
- **F20 (no hay jsdom: testea unidades puras)** — aplicada a un componente JSX: `MapResetConfirm`
  no tiene hooks, así que se invoca como función y se recorre su árbol de elementos.
- **F5 (una feature de frontend no está terminada hasta estar cableada)** — el guard nuevo de
  montaje del diálogo, validado por M7.
- **F22 (vigencia por hash)** — hashes host↔imagen antes de los tests y rehash al final.
- **F8b (no ensuciar el host)** — build stage + contenedores efímeros + `docker rmi`.
- **Frontend/Tailwind** — el JSX se movió verbatim: cero estilos inline, cero
  `window.innerWidth`, cero dependencias nuevas.
- **Enmienda de M6 del reviewer** — el guard de cableado ya no afirma sobre una forma
  sintáctica sino sobre el **conjunto** de apariciones del símbolo peligroso, y trae su propio
  control positivo.

## Decisiones tomadas

1. **Extraer `MapResetConfirm` en vez de asertar la fuente** (ítem 1). Justificada arriba.
2. **`MapResetConfirm` vive en `SessionToolbar.jsx`**, no en un archivo nuevo: el alcance del
   encargo son dos archivos, y el diálogo tiene un único consumidor. Si algún día se reutiliza,
   mudarlo a `components/ui/` es un movimiento mecánico.
3. **El componente envuelve el `<Modal>` entero**, no solo su cuerpo. Así los **tres** caminos
   de salida (incluido el `onClose` del backdrop/Escape/aspa) quedan dentro de la unidad
   testeable; si hubiera dejado el `<Modal>` fuera, el tercero seguiría sin cobertura.
4. **Fijar el número de apariciones de `onReset` en 4.** Es deliberadamente estricto: un
   refactor legítimo lo pondrá rojo y obligará a editar el test. Ese es el punto — cada vía
   nueva hacia el reset debe pasar por una decisión consciente. Los 4 sitios están enumerados
   en el comentario para que el rojo sea accionable en 10 segundos.
5. **Cero dependencias nuevas.** Sin jsdom, sin testing-library.

## Lo que NO hice (fuera de alcance, por instrucción explícita)

- Llevar el censo de iconos a `designDebt.test.js` — candidato a micro-feature propia.
- Añadir `disabled` al botón o try/catch a `SessionView.handleReset` — deuda preexistente.
- Tocar el endpoint, el socket o `Icon.jsx`.

## Limitaciones declaradas (lo que NO puedo dar por verde)

1. **Sigue sin haber e2e. Nadie ha abierto dos pestañas** — ni yo en este pase. Los tests
   nuevos ejercitan el `onClick` real del diálogo, que es un paso más cerca que antes, pero no
   son un navegador. La comprobación de 60 segundos que propuso el reviewer (abrir sesión →
   "Reiniciar mapa" → "Cancelar" → el mapa sigue ahí) **sigue vigente y sigue siendo la única
   validación de extremo a extremo**.
2. **Ninguna verificación de layout.** No he abierto un navegador ni medido un ancho: los
   números de 314 px / 320 px del pase anterior siguen siendo un cálculo a mano no reproducido.
   La extracción no cambia ni una clase, así que el riesgo es el mismo que el reviewer ya
   juzgó nulo, pero que conste que tampoco lo he medido yo.
3. **No he probado que `MapResetConfirm` renderice idéntico byte a byte** al bloque anterior.
   Comparé el JSX a mano (mismo `Modal`, mismas clases, mismo orden) y el segundo `<p>` cambia
   a propósito por el ítem 4, así que un diff de HTML no habría sido concluyente de todos modos.

## Candidatos para LEARNINGS.md (el líder decide)

1. **Un componente sin hooks se puede testear como función pura: invócalo y recorre el árbol
   de elementos.** *Contexto:* F38, cubrir los tres `onClick` de un diálogo de confirmación sin
   jsdom. *Lección:* la lección F20 ("no hay jsdom, testea helpers puros") no obliga a sacar la
   lógica a un helper no-JSX. Un componente **sin estado ni efectos** se invoca como función
   (`MapResetConfirm({ open: true, onResolve })`), devuelve un árbol de elementos React y sus
   `props.onClick` se disparan directamente: se ejercita el cableado REAL, no una copia. Cubre
   lo que ni el SSR ve (los manejadores no salen en el HTML) ni un guard de fuente prueba (la
   forma sintáctica, no el comportamiento). *Por qué importa:* en un diálogo de confirmación el
   booleano que pasa cada botón **es** la feature, y sin esto queda sin cubrir por los dos lados.
2. **Un guard de fuente se valida con su propio control positivo, y afirma sobre el CONJUNTO de
   apariciones.** *Contexto:* F38, `not.toMatch(/onClick=\{onReset\}/)` dejaba pasar
   `onClick={() => onReset()}` — la regresión que la feature existía para impedir. *Lección:*
   (a) cuenta las apariciones del símbolo peligroso y **fija el número**, enumerando en un
   comentario cada sitio legítimo; (b) prohíbe la **familia** de formas (`on[A-Z]\w*=\{[^}]*sym`),
   no una; (c) colapsa los espacios de la fuente antes de aplicar el regex; (d) mete un test que
   pase al guard las formas peligrosas y confirme que las marca, y una legítima y confirme que
   no. Sin (d), un regex roto es un verde tranquilizador. *Por qué importa:* si esta técnica se
   canoniza sin la enmienda, el harness aprende un guard con la puerta abierta.
3. **El control positivo del arnés va en CADA corrida, no una vez al principio.** *Contexto:*
   F38, había que distinguir "M8 verde porque la aserción es robusta" de "M8 verde porque el
   runner no arrancó". *Lección:* inyecta en cada corrida de mutación un test que **debe**
   fallar. Así el suelo de toda corrida es 1 rojo, y una mutación que debe quedar VERDE se lee
   como "exactamente 1 rojo" — evidencia positiva de que el runner estaba vivo, no ausencia de
   evidencia. Cuesta 6 líneas. *Por qué importa:* la mutación que más información da es
   justamente la que debe quedar verde (el falso positivo), y es la única que un arnés roto
   imita a la perfección.
4. **Una aserción de "texto visible" no debe anclarse a la estructura del DOM.** (Refuerza la
   candidata 1 del reviewer, con medición propia.) `toContain('Etiqueta')` es tautológico
   —`aria-label` y `title` contienen la cadena— y `/<\/svg>\s*Etiqueta<\/button>/` se rompe con
   un `<span className="hidden sm:inline">` que no cambia un píxel. La receta correcta es
   `html.replace(/<[^>]*>/g, '')`: los atributos viven dentro de los corchetes angulares y se
   van con ellos. Medido en las tres casillas (código real / botón mudo / `<span>`), y **con el
   helper testeado en las dos direcciones** para que el propio `visibleText` no sea el bug.

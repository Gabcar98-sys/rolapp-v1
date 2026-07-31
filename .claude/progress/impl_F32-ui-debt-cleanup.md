# Implementación: F32 — Deuda visual y código muerto (restyle ChatPanel/CanvasBoard + borrar huérfanos)

Fecha: 2026-07-30
Status: completado

## Archivos modificados

- `frontend/src/components/Chat/ChatPanel.jsx`: restyle completo a tokens del handoff, cero
  emojis, hora por mensaje, `aria-label` en select e input, y extracción de dos piezas puras
  exportadas (`formatMessageTime`, `ChatMessage`) para poder testear con el runner SSR.
- `frontend/src/components/Canvas/CanvasBoard.jsx`: `bg-ink-800`→`bg-rail` (x2),
  `border-ink-line`→`border-line`, `text-gray-600`→`text-muted`. Sin cambios de lógica
  (error boundary + Suspense + fallback de imagen intactos).

## Archivos creados

- `frontend/src/components/Chat/chatPanel.test.jsx`: 11 tests (helper puro + burbuja + panel).

## Archivos borrados (código muerto)

- `frontend/src/components/DMMaster/GameSystemPanel.jsx` (725 líneas)
- `frontend/src/components/DMMaster/BaseCharactersPanel.jsx` (361 líneas)
- `frontend/src/components/DMMaster/SkillsPanel.jsx` (256 líneas)
- `frontend/src/components/DMMaster/ItemsPanel.jsx` (268 líneas)

Total: **1610 líneas de código muerto eliminadas** (y con ellas, 4 de los 6 archivos que
seguían usando la paleta v0 completa `gold`/`ink-*`/`text-gray-*`).

## Archivos NO tocados (convivencia con F31 / F30)

`App.jsx`, `lib/route.js`, `pages/TvView.jsx`, `Session/SessionToolbar.jsx`,
`Session/SessionCharactersPanel.jsx`, `Session/PartyVitals.jsx`, `backend/src/sockets/session.js`,
`Character/CharacterSheet.jsx`, `lib/api.js`, `lib/planning.js`, `session.test.jsx`.
Cero cambios de backend. Cero dependencias nuevas. `tailwind.config.js` sin cambios (ver §5).

---

## 1. Restyle v0 → tokens del handoff

Mapeo aplicado (tal cual la tabla del líder):

| v0 | handoff | dónde |
|---|---|---|
| `bg-ink-900` | `bg-bg` | select e input de ChatPanel |
| `bg-ink-800` | `bg-rail` | contenedor y fallback de CanvasBoard |
| `bg-ink-600` | `bg-surface-2` | burbuja propia |
| `bg-ink-500` | `bg-hover` | burbuja ajena |
| `border-ink-line` | `border-line` | separadores y bordes de campo (ambos archivos) |
| `text-gray-100` | `text-title` | texto de select e input |
| `text-gray-600` | `text-muted` | estado vacío del chat, aviso del canvas |
| `text-gold` | `text-accent-text` | autor del mensaje, marca de privado |
| `border-gold` / `focus:border-gold` | `border-accent` / `focus:border-accent` | realce de privado y foco |
| `rounded-md` | `rounded-btn` | select e input |
| `rounded-lg` (burbuja) | `rounded-btn` | la burbuja es densa (`px-2.5 py-1.5 text-sm`); 9px encaja mejor que los 13px de `rounded-card` |

Añadido `placeholder:text-faint` al input (antes heredaba el gris del navegador).
Cero `const s = {…}`, cero `style=`, cero `window.innerWidth`. Responsive sin cambios
(el panel ya vive en el aside `md:` / bottom-sheet de `SessionView`).

## 2. Cero emojis

| antes | ahora |
|---|---|
| `📢 Todos` (option) | `Todos` + `<Icon name="users">` **fuera** del `<select>` |
| `🔒 {username}` (option) | `Privado · {username} (DM)` + el icono de la fila cambia a `pin` cuando hay destinatario |
| `🔒 privado` (burbuja) | `<Icon name="pin" size={10}>` + texto `privado` |
| `➤` (botón enviar) | `<Icon name="arrow-right" size={16}>` con `aria-label="Enviar mensaje"` |
| `🔒 Mensaje privado…` (placeholder) | `Mensaje privado…` |

**Desviación necesaria y su porqué:** un `<option>` nativo solo renderiza TEXTO — un `<svg>`
dentro se ignora. Por eso el icono del destinatario va en la fila, junto al select, y alterna
`users` (público) ↔ `pin` (privado) según `toUserId`; las opciones quedan en texto plano
("Todos" / "Privado · ana"). La alternativa era sustituir el `<select>` por un dropdown propio,
que es rediseño y estaba explícitamente fuera de alcance.

Nombres de icono verificados contra `ui/Icon.jsx` (`ICON_NAMES`): `users`, `pin`, `arrow-right`
existen. No hay icono de candado; el líder indicó `pin` y `pin` se usó. **Nota para el líder:**
`shield` (también disponible, y contemplado en la entrada de `feature_list.json` como
`'pin'/'shield'`) lee más natural para "privado" que un pin de mapa; el cambio es una palabra
si lo prefieres.

Barrido final de emojis en todo `src/`: 0 (comprobado con el rango
`[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]`, además aserción en 4 de los tests nuevos).

## 3. Usabilidad del chat (sin tocar el contrato de socket)

- **Hora por mensaje:** helper puro exportado `formatMessageTime(unixSeconds)` → `"HH:MM"`
  (24h, local, con relleno de ceros). `created_at` llega en unixepoch **segundos**
  (`backend/src/sockets/chat.js:42` lo emite como `Math.floor(Date.now()/1000)`).
  Devuelve **siempre una cadena** (`''` si el dato no sirve): nunca un número, para no
  reintroducir el footgun `{0 && …}` de F30. Se pinta en `text-muted` `text-[0.65rem]`.
- `aria-label="Destinatario del mensaje"` en el `<select>`.
- `aria-label` dinámico en el input ("Escribir mensaje privado" / "…para todos").
- `Enter` para enviar: **intacto**.
- Eventos y payload de socket: **idénticos** (`chat:history`, `chat:message` con
  `{ sessionId, from, body, to }`). Cero cambios de backend.

Único cambio de semántica interna, deliberado: `isPrivate` pasa de `msg.to_user_id !== null`
a `Boolean(msg.to_user_id)`. Para los datos reales (id o `null`) el resultado es el mismo, y
además cubre el caso `undefined` (que antes daba "privado" por error) y sigue la lección de F30.

## 4. Borrado de código muerto — tabla de paridad funcional

Método de verificación: (a) `grep -rn` en TODO el repo (js/jsx/json/html/md, excluyendo
`node_modules` y `.claude/`) para confirmar cero importadores; (b) extracción de **cada**
método invocado por el huérfano y comprobación de que existe también en la página que lo
reemplaza (incluye llamadas encadenadas multilínea).

### 4.1 `GameSystemPanel.jsx` → `pages/AttributesPage.jsx`

| Capacidad del huérfano | En AttributesPage | Nota |
|---|---|---|
| Listar sistemas (`listGameSystems`) | ✅ | tabla con nº atributos + fecha |
| Crear sistema (`createGameSystem`) | ✅ (modal "Nuevo sistema") | |
| Eliminar sistema (`deleteGameSystem`) | ✅ | |
| **Importar game pack** (`importGamePack`, desde archivo) | ✅ `AttributesPage.jsx:71` | mismo flujo file→JSON.parse→import, con reset del input |
| **Exportar pack** (`exportGameSystem` + descarga Blob) | ✅ `AttributesPage.jsx:85` | código equivalente línea a línea |
| Detalle: atributos (`createAttribute`/`deleteAttribute`, categoría, fórmula derivada, is_core, has_max) | ✅ tab Atributos | |
| Detalle: slots de equipo (`createEquipmentSlot`/`deleteEquipmentSlot`, slot_key, máximo) | ✅ tab Slots | |
| Detalle: **mecánicas** (`createMechanic`/`deleteMechanic` + params `createMechanicParam`/`deleteMechanicParam`) | ✅ tab Mecánicas | tipo, ámbito y params dinámicos |
| Detalle: **documentos RAG** (`listDocs`/`ingestDoc`/`reindexDoc`/`deleteDoc`) | ✅ tab Docs | incluye reindexar |
| Detalle: tab Habilidades (montaba `SkillsPanel`) | ✅ **página propia** `SkillsPage` (nav "Habilidades") | superset (ver 4.3) |
| Detalle: tab Objetos (montaba `ItemsPanel`) | ✅ **página propia** `ItemsPage` (nav "Items") | superset (ver 4.4) |
| — | ➕ tab **Personajes base** (extra de la página) | no existía en el huérfano |

**Diff de métodos invocados: 0 faltantes.** Veredicto: **BORRADO**.

### 4.2 `BaseCharactersPanel.jsx` → `pages/BaseCharactersPage.jsx`

| Capacidad del huérfano | En BaseCharactersPage | Nota |
|---|---|---|
| Listar pregens (`listBaseCharacters`) | ✅ | grid de tarjetas con glifo/barras |
| Crear (`createBaseCharacter`) + elegir sistema (`listGameSystems`) | ✅ | |
| Eliminar (`deleteBaseCharacter`) | ✅ | |
| Detalle (`getBaseCharacter`) | ✅ | |
| Atributos del pregen (`getGameSystem` + `setBaseCharacterAttrs`) | ✅ tab Atributos | |
| Inventario (`addBaseCharacterItem`/`deleteBaseCharacterItem`) | ✅ tab Inventario | |
| Habilidades: elegir formato (`listSkillFormats`) + catálogo (`getSkillFormat`) + enlazar/desenlazar (`link/unlinkBaseCharacterSkill`) | ✅ tab Habilidades (`BaseCharactersPage.jsx:602-631`) | mismo flujo, con chips de lo enlazado |
| — | ➕ **Editar** pregen (`updateBaseCharacter`) | no existía en el huérfano |

**Diff de métodos invocados: 0 faltantes.** Veredicto: **BORRADO**.

### 4.3 `SkillsPanel.jsx` (huérfano derivado) → `pages/SkillsPage.jsx`

Tras borrar `GameSystemPanel` (su único importador) queda con **cero** importadores.

| Capacidad | En SkillsPage | Nota |
|---|---|---|
| Formatos (`listSkillFormats`/`getSkillFormat`/`createSkillFormat`/`deleteSkillFormat`) | ✅ | además agrupados/filtrados por sistema (`listGameSystems`) |
| Campos del formato (`createSkillField`) | ✅ | ➕ con **tipo** (text/number/boolean, vía `Catalog/FormatShared`) y ➕ `deleteSkillField`; el huérfano creaba campos sin tipo |
| Habilidades (`createSkill`/`deleteSkill`) | ✅ | ➕ `updateSkill`, búsqueda, chips de filtro y paginación |
| — | ➕ **Importación masiva JSON** (`bulkImportSkills`) | |

**Superset estricto.** Veredicto: **BORRADO**.

### 4.4 `ItemsPanel.jsx` (huérfano derivado) → `pages/ItemsPage.jsx`

| Capacidad | En ItemsPage | Nota |
|---|---|---|
| Formatos (`listItemFormats`/`getItemFormat`/`createItemFormat`/`deleteItemFormat`) | ✅ | ➕ agrupados por sistema |
| Campos (`createItemField`) | ✅ | ➕ con tipo y ➕ `deleteItemField` |
| Objetos (`createItem`/`deleteItem`) y flag **equipable** | ✅ (`equippable` editable en el modal, badge "No equipable" en la tarjeta) | ➕ `updateItem`; en el huérfano `equippable` era solo lectura |

**Superset estricto.** Veredicto: **BORRADO**.

Todas las capacidades siguen alcanzables desde el AppShell: `navItems.js` expone
Habilidades, Personajes Base, Bases de Atributos e Items para el DM.

## 5. Alias v0 de Tailwind: **NO se eliminan** (siguen con consumidores)

`grep` final en `frontend/src` (excluyendo mi propio test, que solo los nombra dentro de una
aserción anti-regresión):

| Alias | Consumidores que quedan |
|---|---|
| `gold` | `components/Stats/Sparkline.jsx:25` (`text-gold`), `pages/MyCharacters.jsx:9,88,129` (`focus:border-gold`, `text-gold` x2) |
| `ink-900` | `components/Stats/CampaignStatsPanel.jsx:66,79`, `pages/MyCharacters.jsx:9` |
| `ink-line` | `components/Stats/CampaignStatsPanel.jsx:66,79`, `pages/MyCharacters.jsx:9` |
| `ink-800` / `ink-700` / `ink-600` / `ink-500` | **CERO** (F32 los dejó sin consumidores) |
| `ink` (DEFAULT, `text-ink`) | 23 archivos — token vigente del handoff, se conserva sí o sí |
| `text-gray-*` / `border-gray-*` | `Stats/CampaignStatsPanel.jsx`, `Stats/CharacterStatsPanel.jsx`, `Stats/Sparkline.jsx`, `lib/planning.js:24` (`categoryClasses.general`), `pages/MyCharacters.jsx` |

Como `gold`, `ink-900` e `ink-line` siguen usados, **`tailwind.config.js` queda intacto**
(la instrucción era eliminarlos solo con CERO consumidores). Falso positivo descartado:
`lib/catalog.js:33` contiene la cadena `'gold'` como **nombre de campo de datos**
(`VALUE_FIELD_NAMES`), no como clase Tailwind.

**Deuda restante para cerrar los alias en una futura pasada (3 archivos + 1 constante):**
`pages/MyCharacters.jsx`, `components/Stats/CampaignStatsPanel.jsx`,
`components/Stats/CharacterStatsPanel.jsx`, `components/Stats/Sparkline.jsx` y
`lib/planning.js:24`. Cuando esos migren, se pueden borrar `gold` e `ink.900/800/700/600/500/line`
del config conservando `ink.DEFAULT`.

## Tests escritos

`frontend/src/components/Chat/chatPanel.test.jsx` — 11 tests, patrón F20/F30 (SSR con
`renderToStaticMarkup`, sin jsdom):

- `formatMessageTime` (4): formato `HH:MM` con relleno; medianoche → `00:00`; entradas
  inservibles (`null`, `undefined`, `0`, `-1`, `''`, `'ayer'`, `NaN`) → cadena vacía y
  **tipo string** (caso de error); no confunde segundos con milisegundos.
  Los timestamps se construyen con `new Date(y,m,d,h,min)` para no depender de la zona
  horaria del contenedor.
- `ChatMessage` (5): mensaje ajeno (autor + hora + cuerpo, sin emojis); mensaje propio (no
  repite autor, conserva hora); mensaje privado (texto "privado" + `<svg>` en vez del
  candado, realce `border-accent`); **sin `created_at` no pinta hora ni deja un literal
  suelto** (regresión estilo F30, aserción sobre el texto sin tags); no usa la paleta v0.
- `ChatPanel` (2): `aria-label` del input y del botón de enviar; `aria-label` del select de
  destinatario y opciones sin emojis.

## Resultado de verificación (Docker, tag temporal propio `tmp-f32`)

Host sin `frontend/node_modules` **antes y después** (comprobado; el patrón `--target build`
no instala nada en el host).

```
$ docker build --target build -t tmp-f32 ./frontend
#10 [build 6/7] RUN npm run lint      → DONE 1.8s      (lint exit 0)
#11 [build 7/7] RUN npm run build     → ✓ built in 3.78s
   dist/assets/index-*.js 450.96 kB │ gzip: 120.74 kB
EXIT=0
```

**Primera pasada** (con F31 a medio escribir): 137 pass / 2 fail, y los 2 fallos eran
ajenos — mismo bug en `frontend/src/lib/vitals.js` + `components/Session/PartyVitals.jsx`
(`pickVitals()` devolvía vitales para un personaje sin `templateAttrs` en vez de `[]`):

```
FAIL src/lib/vitals.test.js > pickVitals … sin atributos devuelve lista vacía
  expected [ {..Health..}, {..Vitality..} ] to deeply equal []
FAIL src/pages/tvView.test.jsx > PartyVitals no renderiza nada si el personaje no tiene atributos
  expected '<div class="flex flex-col gap-1 ">…0…' to be ''
```

Siguiendo la regla de convivencia **no los arreglé**: esperé, reconstruí y reintenté. F31
los corrigió entretanto. **Segunda pasada (resultado final, TODO en verde):**

```
$ docker build --target build -t tmp-f32 ./frontend
#10 [build 6/7] RUN npm run lint
#11 [build 7/7] RUN npm run build
BUILD_EXIT=0

$ docker run --rm tmp-f32 npm test
 ✓ src/components/Chat/chatPanel.test.jsx (11 tests) 14ms   ← F32
 ✓ src/lib/vitals.test.js (9)      ✓ src/lib/catalog.test.js (21)
 ✓ src/lib/planning.test.js (14)   ✓ src/lib/route.test.js (9)
 ✓ src/lib/metrics.test.js (13)    ✓ src/components/layout/navItems.test.js (4)
 ✓ src/pages/tvView.test.jsx (14)  ✓ src/components/Character/characterSheet.test.jsx (6)
 ✓ src/components/Session/session.test.jsx (14)
 ✓ src/pages/sessionDetail.test.jsx (9)   ✓ src/pages/pages.test.jsx (16)
 Test Files  12 passed (12)
      Tests  140 passed (140)
TEST_EXIT=0

$ docker rmi tmp-f32     → Untagged: tmp-f32:latest / Deleted: sha256:40b993b978b3…
$ test -e frontend/node_modules → host limpio: sin frontend/node_modules
```

- lint:  ✅ exit 0 (forzado en el build stage, `Dockerfile:8`)
- build: ✅ exit 0 (`Dockerfile:9`)
- test:  ✅ **140/140** (12 archivos), de los cuales **11 nuevos de F32**
- host:  ✅ sin `frontend/node_modules` antes y después; imagen temporal `tmp-f32` borrada

## Lecciones aplicadas

- **F20 — "el runner de vitest no tiene jsdom: testea helpers puros"**: extraje
  `formatMessageTime` y el subcomponente `ChatMessage` en vez de simular clics; todo el
  test es SSR + función pura, sin dependencias nuevas.
- **F20 — "correr los tests del frontend en Docker sin ensuciar el host"**:
  `docker build --target build -t tmp-f32 ./frontend` + `docker run --rm tmp-f32 npm test`
  + `docker rmi`. Cero `npm install` en el host, cero `node_modules` residual (que además
  envenenaría el build context, lección F8b).
- **F30 — "un entero 0/1 de SQLite en `{flag && <…/>}` pinta el número"**: al añadir la hora
  usé ternarios (`{time ? <span/> : null}`) y `Boolean(message.to_user_id)`, y el helper
  devuelve siempre string. Barrido del archivo: no queda ningún guard `&&` con valor
  numérico (`privateTargets.length > 0` y `messages.length === 0` son comparaciones).
- **F13 — cero emojis, iconografía solo desde `ui/Icon.jsx`**: verifiqué los nombres reales
  en `ICON_NAMES` antes de usarlos.
- **F17 — "extender un componente compartido = props opcionales retrocompatibles"**: la
  firma pública de `ChatPanel` (`sessionId`, `user`, `connectedUsers`) y la de `CanvasBoard`
  (`sessionId`, `imageUrl`) no cambian; `SessionView` no necesitó tocarse.
- **Frontend — cero estilos inline / cero `window.innerWidth`**: respetado (solo clases
  Tailwind + tokens).

## Decisiones tomadas

1. **Icono fuera del `<option>`** (ver §2): un `<select>` nativo no renderiza SVG. El icono
   de la fila alterna `users`/`pin` según destinatario y las opciones quedan en texto plano.
2. **`pin` para "privado"** siguiendo la instrucción literal del líder; dejo constancia de
   que `shield` (también disponible) es semánticamente mejor. Cambio de una palabra.
3. **`formatMessageTime` y `ChatMessage` viven en `ChatPanel.jsx`**, no en `lib/`: son
   específicos del chat y así evito tocar módulos compartidos mientras F31 está en vuelo
   (patrón de F30 con `coreMarker` en `CharacterSheet.jsx`).
4. **Burbuja con `rounded-btn`** (9px) en vez de `rounded-card` (13px): la burbuja es densa
   y 13px la deformaba.
5. **`tailwind.config.js` intacto**: quedan consumidores reales de `gold`, `ink-900` e
   `ink-line` (§5). Eliminar solo los tonos `ink-800/700/600/500` (ya sin consumidores)
   habría sido un cambio parcial y ruidoso del config sin beneficio; se documenta como
   deuda cerrable en una sola pasada futura.
6. **`git rm`** para los 4 borrados (no borrado a mano), para que el índice refleje la
   eliminación sin ambigüedad.

## Pendientes que dejo (por instrucción explícita del líder)

- **APLAZADO — punto 3 del backlog (exports muertos)**: `listCampaignSummaries`
  (`frontend/src/lib/api.js`) y `categoryClasses` (`frontend/src/lib/planning.js`) **no** se
  tocaron para evitar colisión con F31 (que trabaja sobre `lib/`). Siguen pendientes de
  confirmar con `grep` y eliminar junto con sus tests. Ojo: `planning.js:24` es además uno de
  los últimos consumidores de `text-gray-*`, así que ese borrado adelanta también el §5.
- **Deuda visual restante** para poder retirar los alias `gold`/`ink-*` del config:
  `pages/MyCharacters.jsx`, `Stats/CampaignStatsPanel.jsx`, `Stats/CharacterStatsPanel.jsx`,
  `Stats/Sparkline.jsx` (§5). `SessionStatsPanel.jsx`, mencionado en el título de la entrada
  de `feature_list.json`, **ya está en tokens del handoff** — no requería trabajo.
- **Bug ajeno de F31** (informativo): `pickVitals` no devolvía `[]` para un personaje sin
  `templateAttrs` y `PartyVitals` pintaba un `0`. **Ya corregido por F31** entre mi primera
  y segunda pasada de verificación; no lo toqué. Se parecía al footgun de la lección F30.

## Candidatos para LEARNINGS.md

- **Frontend — "un `<option>` nativo no renderiza SVG: el icono va fuera del `<select>`"**:
  al erradicar emojis de un selector, no se puede sustituir `📢`/`🔒` por `<Icon>` dentro del
  `<option>` (el navegador solo pinta texto). Patrón: icono en la fila junto al select,
  reflejando el valor seleccionado, y opciones en texto plano ("Todos" / "Privado · ana").
  La alternativa (dropdown propio) es rediseño, no restyle.
- **Proceso — "borrar código muerto se justifica con una tabla de paridad método a método,
  no con un `grep` de imports"**: cero importadores prueba que está muerto *hoy*, no que su
  capacidad exista en el reemplazo. Barato y objetivo: extraer todos los `\.metodo(` que
  invoca el huérfano y comprobar que aparecen en la página que lo reemplazó (ojo con las
  llamadas encadenadas multilínea, `api\n  .listSkillFormats(...)`, que un `grep api\.\w+`
  se pierde). En F32 el borrado de un huérfano dejó a otros dos (`SkillsPanel`/`ItemsPanel`)
  huérfanos en cascada: hay que re-correr el análisis después de cada borrado.

# Implementación: F35 — Último resto de deuda v0 (cierra F32)

Fecha: 2026-07-31
Status: completado

Alcance ejecutado en los 4 pasos pedidos, en orden: emojis → tokens → exports muertos → censo + retirada de alias.
Solo frontend. Cero dependencias nuevas, cero cambios de backend, cero cambios de comportamiento
(mismos datos, mismas llamadas API, mismos handlers).

---

## Archivos creados

- `frontend/src/designDebt.test.js`: **test de guardia** contra la regresión SILENCIOSA de los alias
  retirados. Recorre todo `src/` (`.js`/`.jsx`/`.css`, excluyendo `*.test.*`) y falla si reaparece una
  clase con forma de utilidad Tailwind de la paleta v0 (dorado, sombras `ink` numéricas, `ink-line`,
  grises crudos). Incluye control positivo del patrón y un caso negativo (`text-ink` y los tokens del
  handoff NO son deuda). También comprueba que los 4 archivos migrados en F35 siguen sin emojis.
- `frontend/src/components/Stats/stats.test.jsx`: 8 tests SSR de `Sparkline`, `LocationChip` y `AttributeRow`.
- `frontend/src/pages/myCharacters.test.jsx`: 5 tests SSR de `PregenCard` y `CharacterRow`.

## Archivos modificados

- `frontend/src/pages/MyCharacters.jsx`: 6 emojis → iconos; paleta v0 → tokens del handoff; banner de
  error `bg-danger/20 + text-red-300` → `bg-danger-tint + text-danger-text`. Se extrajeron dos
  componentes de presentación PUROS y exportados, `PregenCard` y `CharacterRow` (mismo patrón que
  `ChatMessage` en F32), para poder testear con SSR el markup que antes solo existía tras cargar datos
  por `useEffect`. El JSX movido es idéntico salvo los tokens/iconos; los handlers se pasan por prop.
- `frontend/src/components/Stats/CampaignStatsPanel.jsx`: 1 emoji → icono; tokens; chip de ubicación
  extraído a `LocationChip` (exportado, SSR-testeable).
- `frontend/src/components/Stats/CharacterStatsPanel.jsx`: 1 emoji → icono; tokens; fila de atributo
  extraída a `AttributeRow` (exportada, SSR-testeable).
- `frontend/src/components/Stats/Sparkline.jsx`: `text-gray-500` → `text-faint`, `text-gold` →
  `text-accent-text`. La geometría del SVG (viewBox/points calculados) no se tocó.
- `frontend/src/lib/api.js`: eliminado `listCampaignSummaries` (export muerto).
- `frontend/src/lib/planning.js`: eliminados `categoryClasses` y su tabla `CATEGORY_CLASSES` (export
  muerto y último consumidor de los grises crudos). Queda una nota explicando el porqué, redactada
  SIN nombres de clase literales para no ensuciar el censo ni el JIT.
- `frontend/tailwind.config.js`: retirados los alias `gold` (DEFAULT/soft/dim) y las sombras
  `ink-900|800|700|600|500` + `ink-line`. **`ink` se conserva** como color plano `#ECE6DB`.
- `.claude/feature_list.json`: F35 marcada `in_progress` (por instrucción explícita del líder; es lo
  único que toqué fuera de `frontend/`).

---

## 1) Tabla emoji → icono

Los nombres se verificaron contra `ICONS` en `frontend/src/components/ui/Icon.jsx` (ninguno inventado)
y se eligieron para coincidir con lo que ya usa la página sucesora `CharactersPage.jsx`.

| Emoji | Dónde | Icono | Accesibilidad |
|---|---|---|---|
| 🧙 | `MyCharacters` — botón "Desde pregen" | `id-card` | El botón tiene texto visible; el icono va `aria-hidden` (lo pone `Icon`) |
| 📋 | `MyCharacters` — contador de atributos (pregen) | `sliders` | `title="Atributos"` en el contenedor |
| ⚡ | `MyCharacters` — contador de habilidades | `skills` | `title="Habilidades"` |
| 🎒 | `MyCharacters` — contador de inventario | `bag` | `title="Inventario"` |
| 📊 | `MyCharacters` — botón "ver estadísticas" | `chart` | `aria-label="Ver estadísticas de {nombre}"` (ya existía, conservado) |
| 🗑 | `MyCharacters` — botón "eliminar" | `trash` | `aria-label="Eliminar {nombre}"` (ya existía, conservado) |
| 📍 | `CampaignStatsPanel` — chip de ubicación visitada | `pin` | Decorativo junto al nombre de la ubicación |
| ⭐ | `CharacterStatsPanel` — marca de atributo principal | `skills` (glifo de estrella del set) | Decorativo; se mantiene DENTRO del ternario `is_core ? … : null` |

Emojis vivos en el alcance: **8 → 0**.

`bc.avatar_icon` en `PregenCard` NO se tocó: es un DATO del personaje base que viene de la DB, no un
emoji escrito en el código.

## 2) Mapeo de tokens aplicado (el mismo de F32)

`bg-ink-900`→`bg-bg` · `border-ink-line`→`border-line` · `text-gray-100/200`→`text-title` ·
`text-gray-300/400`→`text-sub` · `text-gray-500`→`text-faint` · `text-gold`→`text-accent-text` ·
`focus:border-gold`→`focus:border-accent`.
No aparecían `ink-800/700/600/500` ni `text-gray-600` en estos archivos.

Extra (misma familia de deuda v0, mismos archivos): los 3 banners de error pasaron de
`bg-danger/20 … text-red-300` a `bg-danger-tint … text-danger-text`, que es lo que ya usan las páginas
del handoff. Se anota por transparencia: es el único cambio visual fuera de la lista literal de tokens.

Cero estilos inline nuevos. `Sparkline` no necesitó `style={{}}`: su geometría va en el `viewBox` y en
`points` (atributos SVG), no en CSS (lección F17 no aplica aquí).

## 3) Exports muertos

| Export | Consumidores encontrados | Resultado |
|---|---|---|
| `listCampaignSummaries` (`lib/api.js`) | 1 (su propia definición) tras grepear `frontend/` **y** `backend/` | **Eliminado**. También se comprobó que nadie llama al endpoint desde el frontend (`grep -rn "summaries" frontend/src` → solo esa línea). El endpoint del backend NO se tocó. |
| `categoryClasses` (`lib/planning.js`) | 1 (su propia definición) | **Eliminado** junto con su tabla `CATEGORY_CLASSES`. |
| `eventCategoryClasses` (`lib/planning.js`) | 16 referencias en 8 archivos (PlanningPanel, TvView, EventListView, EventFlowGraph, NotesPanel, SessionEventsPanel, planning.test.js) | **Conservado**, como advertía el líder. |

Detalle de método que importa (casi me lleva a una conclusión equivocada): `grep -rn "categoryClasses"`
devuelve SOLO la línea 27, no la 94 de `eventCategoryClasses` — no es un falso negativo, es
**case-sensitivity**: la segunda contiene `CategoryClasses` con C mayúscula. Lo verifiqué con `grep -c`,
`grep -F` y leyendo la línea 94 en crudo antes de dar el dato por bueno.

## 4) Censo final de alias (comandos + exit code)

**Censo literal**, `LC_ALL=en_US.UTF-8`, sobre `frontend/src`, comprobando exit code
(1 = sin coincidencias, 0 = hay, 2 = error de grep):

```
gold           exit=0  (10 coincidencias — TODAS no-consumidoras, ver abajo)
ink-900        exit=1  CERO
ink-800        exit=1  CERO
ink-700        exit=1  CERO
ink-600        exit=1  CERO
ink-500        exit=1  CERO
ink-line       exit=0  (2 coincidencias — no-consumidoras)
text-gray-     exit=1  CERO
bg-gray-       exit=1  CERO
border-gray-   exit=1  CERO
```

Las coincidencias de `gold`/`ink-line` NO son consumidores: son (a) los *regex* de los tests que
asertan la AUSENCIA de la paleta v0 (`chatPanel.test.jsx` de F32 + los dos míos), y (b) la cadena de
datos `'gold'` dentro de `VALUE_FIELD_NAMES` en `lib/catalog.js` (un nombre de campo de catálogo, no
una clase). Ninguna tiene forma de utilidad Tailwind.

**Censo que decide** (misma familia pero exigiendo FORMA de clase `prefijo-color`, que es lo único que
el JIT convierte en CSS):

```
$ LC_ALL=en_US.UTF-8 grep -rnP "(bg|text|border|ring|divide|from|via|fill|stroke|outline|shadow|placeholder|decoration)-(gold(-(soft|dim))?|ink-(900|800|700|600|500|line)|gray-\d{2,3})\b" frontend/src
EXIT=1   → CERO consumidores
$ … frontend/index.html
EXIT=1   → CERO
```

**Control positivo del patrón** (para no repetir el falso negativo de F32 — un `exit=1` solo vale si el
patrón demuestra que sabe encontrar algo):

```
$ git show HEAD:frontend/src/pages/MyCharacters.jsx | LC_ALL=en_US.UTF-8 grep -nP "<mismo patrón>"
9:  'rounded-md border border-ink-line bg-ink-900 … focus:border-gold';   (+4 líneas)   EXIT=0
$ git show HEAD:frontend/src/components/Stats/CampaignStatsPanel.jsx | grep -cP "…"
14                                                                                      EXIT=0
```

También verifiqué el `ink` DEFAULT antes de tocar nada: `text-ink` tiene **21 archivos consumidores**
(20 componentes/páginas + el `@apply bg-bg font-sans text-ink` de `src/styles/index.css`).

### Decisión sobre `tailwind.config.js`

**Retirados** `gold` (DEFAULT/soft/dim) y las sombras `ink-900|800|700|600|500` + `ink-line`, porque el
censo da CERO consumidores con exit code comprobado y control positivo.
**Conservado `ink`** como color plano `#ECE6DB` (equivalente al DEFAULT anterior): `text-ink` es el
color de texto principal de la app y lo usan 21 archivos, incluido el `@apply` de `index.css` (que sí
habría roto el build, pero el resto de usos habría fallado en SILENCIO).

Como la retirada de un alias no rompe el build, añadí el test de guardia `src/designDebt.test.js` para
que el retorno de una de esas clases sea un test ROJO y no una regresión visual invisible.

## Tests escritos

- `frontend/src/designDebt.test.js` (4 tests): árbol no vacío (si no, el censo no probaría nada);
  control positivo/negativo del patrón; cero clases v0 en todo `src/`; cero emojis en los 4 archivos de F35.
- `frontend/src/components/Stats/stats.test.jsx` (8): `Sparkline` en sus dos ramas (guion / serie, con
  `text-faint` y `text-accent-text`, polilínea y `aria-label` intactos); `LocationChip` (icono SVG, cero
  emoji, tokens); `AttributeRow` con los 4 casos de bandera entera — incluido el de la lección F30:
  `is_core=0` y `has_max=0` deben producir el texto exacto `Deflect4` / `Salud7`, **sin el 0 fantasma**.
- `frontend/src/pages/myCharacters.test.jsx` (5): `PregenCard` (3 SVG, cero emojis, conteos reales y
  degradación a 0 sin listas, tokens); `CharacterRow` (los dos `aria-label` conservados, 2 SVG, cero
  emojis, "Sin sistema" de reserva).

**Validación por MUTACIÓN** (patrón F30, para no entregar tests que pasan siempre): reintroduje
`text-gold` en `Sparkline.jsx`, reconstruí y corrí → 2 tests en ROJO, y el de guardia nombró el archivo
culpable (`expected [ 'components/Stats/Sparkline.jsx' ] to deeply equal []`). Restaurado y re-verificado
en verde.

## Resultado de verificación

Ejecutado de verdad en Docker con tag propio (sin `docker compose build frontend`, sin tocar backend):

```
$ docker build --target build -t tmp-f35 ./frontend     → BUILD_EXIT=0   (el stage corre npm run lint && npm run build)
$ docker run --rm tmp-f35 npm test                      → TEST_EXIT=0
   Test Files  16 passed (16)
        Tests  162 passed (162)
$ docker rmi tmp-f35                                    → exit 0
```

- lint:  ✅ (dentro del build stage, `RUN npm run lint`)
- build: ✅ (`vite build`, 893 módulos, exit 0)
- test:  ✅ 162 pasando / 0 fallando (16 archivos; 17 tests nuevos de F35)
- **Vigencia por hash host↔imagen** ✅ — comparados los 8 archivos tocados
  (`MyCharacters.jsx`, `CampaignStatsPanel.jsx`, `CharacterStatsPanel.jsx`, `Sparkline.jsx`, `api.js`,
  `planning.js`, `tailwind.config.js`, `designDebt.test.js`): idénticos.
- **Host sin `node_modules` residual** ✅ antes y después (`frontend/` y `backend/` limpios; nunca corrí
  npm en el host). Imagen temporal eliminada.
- **Fallos ajenos de F33: NINGUNO.** Los tests de F33 que ya estaban en el árbol
  (`src/components/ui/modal.test.jsx`, 5 tests) pasan en mi build; no toqué ni abrí `chat.js`,
  `chat.test.js`, `Modal.jsx` ni `nginx.conf`.

## Lecciones aplicadas

- **F32 / falso negativo de grep**: usé `LC_ALL=en_US.UTF-8` y comprobé el exit code en cada censo
  (1 = cero, 0 = hay, 2 = error), y además pasé un **control positivo** contra `git show HEAD:` para
  demostrar que el patrón sabe encontrar coincidencias. Sin eso, un `exit=1` no prueba nada.
- **F30 (entero 0/1 de SQLite en un guard)**: `is_core` y `has_max` se quedan como CONDICIÓN de ternario
  (`is_core ? <Icon/> : null`); barrí `\{[^}]*&&\s*[(<]` en los archivos que toqué → no hay ningún guard
  `&&` con bandera entera, y hay 2 tests que asertan el texto exacto para el caso 0.
- **F20 (vitest sin jsdom)**: nada de simular clics; extraje componentes de presentación PUROS y
  exportados y los rendericé con `renderToStaticMarkup`, ejercitando el código REAL (no una copia).
- **F20 / Docker sin ensuciar el host**: `docker build --target build` + `docker run --rm` + `docker rmi`.
- **F22 (vigencia por hash)**: hashes host↔imagen antes de creerme los tests.
- **F17 (`style={{}}` solo para geometría)**: no hizo falta ninguno; el sparkline resuelve su geometría
  con atributos SVG.
- **F14 (clases literales para el JIT)**: todas las clases nuevas son literales; ninguna interpolada.

## Decisiones tomadas

1. **Extraer 4 subcomponentes exportados** (`PregenCard`, `CharacterRow`, `LocationChip`, `AttributeRow`)
   en vez de dejar el JSX inline. Motivo: con el runner actual (SSR, sin jsdom) el markup con los emojis
   solo aparece después de que `useEffect` carga datos, así que era INTESTEABLE tal cual. Es el mismo
   patrón que F32 usó con `ChatMessage`. Sin cambio de comportamiento: el JSX es el mismo y los handlers
   viajan por prop.
2. **Añadir un test de guardia que escanea el árbol de fuentes** (`designDebt.test.js`). No es un test de
   unidad al uso, pero la propia entrada del backlog avisa de que retirar un alias produce una regresión
   SILENCIOSA; esto la vuelve ruidosa. Escanea `src/` excluyendo `*.test.*` y no escribe ninguna clase v0
   literal (las muestras del control positivo se componen en runtime) para que el censo del árbol siga
   dando cero y nadie lo confunda con un consumidor.
3. **Migrar también los 3 banners de error** (`bg-danger/20`/`text-red-300` → tokens `danger-*`): es la
   misma deuda de paleta v0, en los mismos archivos, y no estaba en la lista literal de tokens. Lo anoto
   por si el líder lo considera fuera de alcance.
4. **`ink` pasa de objeto a color plano** (`ink: '#ECE6DB'`) en vez de dejar `ink: { DEFAULT: … }`.
   Equivalente para Tailwind (`text-ink` sigue existiendo) y deja claro que ya no hay escala.
5. **Marqué F35 como `in_progress`** en `feature_list.json` por instrucción explícita del líder (mi
   protocolo por defecto dice que no toco ese archivo; lo hice solo por esa orden y no marqué nada `done`).
6. **NO toqué el `★` de `CharacterSheet.jsx`** aunque cae en el rango de emojis del censo: es el marcador
   deliberado de F30, su test lo aserta, y el archivo está fuera de mi alcance. Ver "Hallazgos".

Dependencias nuevas: **ninguna** (`npm install` no se ejecutó; `package.json` intacto).

## Hallazgos (para el líder — NO actuados, fuera de alcance)

1. **`frontend/src/pages/MyCharacters.jsx` es un componente HUÉRFANO.** Cero imports en todo `src/`
   (`App.jsx` monta `CharactersPage.jsx`, que ya cubre lista + pregens + ficha + stats con el estilo del
   handoff, e incluso con el mismo mapeo de iconos que acabo de aplicar). Es decir: hice la migración de
   un archivo que hoy el usuario no puede alcanzar. Es candidato claro a borrado en una F36 de limpieza
   (mismo criterio que F32 usó con los 4 paneles de `DMMaster/`), pero NO lo borré porque el líder me pidió
   migrarlo, no eliminarlo, y borrarlo exige la verificación de paridad funcional que F32 hizo método a
   método. Si se borra, se van con él `myCharacters.test.jsx` y su entrada en `designDebt.test.js`.
2. **`★` (U+2605) sigue vivo en `CharacterSheet.jsx` y en su test.** Cae dentro del rango de emojis del
   censo (`\x{2600}-\x{27BF}`), así que un censo de emojis en todo `src/` NO da cero. No es uno de los 8
   emojis de F35: es el marcador de atributo principal que F30 dejó a propósito y que su test aserta. Si
   se quiere "cero emojis literales" de verdad, es un cambio de F30 (sustituirlo por `<Icon name="skills">`
   y actualizar 5 asserts). Por eso mi guardia de emojis se limita a los 4 archivos de F35.
3. El endpoint backend `GET /api/campaigns/:id/summaries` se queda **sin ningún cliente** tras borrar
   `listCampaignSummaries`. No lo toqué (cero cambios de backend), pero es deuda simétrica: o se vuelve a
   cablear el checkbox "incluir sesiones anteriores" del AIPanel, o el endpoint sobra.

## Candidatos para LEARNINGS.md

1. **Frontend — "Retirar un alias de Tailwind es una regresión SILENCIOSA: censa con exit code y deja un
   test de guardia".** Quitar un color del `theme.extend` no rompe lint ni build; la clase simplemente deja
   de generarse y el elemento se queda sin color, y solo se ve mirando la app. Antes de retirarlo: censo con
   FORMA de clase (`prefijo-color`, que es lo único que el JIT compila) para no contar como consumidores los
   regex de tests ni las cadenas de datos; y después, un test que reescanee el árbol para que la reaparición
   sea roja en vez de invisible.
2. **Proceso — "Un `exit=1` de grep solo vale acompañado de un control positivo".** Además de
   `LC_ALL=en_US.UTF-8` y de mirar el exit code (1 = sin coincidencias, 2 = error), corre el MISMO patrón
   contra una versión que SÍ contiene el texto (p. ej. `git show HEAD:<archivo>`). Sin esa prueba, un patrón
   mal escrito y un árbol limpio son indistinguibles — que es exactamente lo que produjo la afirmación falsa
   de F32.
3. **Proceso — "Ojo con la case-sensitivity al confirmar que un export está muerto".** `grep "categoryClasses"`
   no encuentra `eventCategoryClasses` (C mayúscula). El riesgo va en las dos direcciones: puede convencerte
   de que un export vivo está muerto, o hacerte creer que hay consumidores donde no los hay. Confirma con
   `grep -c` / lectura de la línea cruda antes de borrar.
4. **Testing — "Para testear markup que solo existe tras `useEffect`, extrae el subcomponente de
   presentación y expórtalo".** Complemento de la lección F20: cuando el emoji/token a verificar vive en una
   lista que se pinta con datos cargados por efecto, SSR no lo ve. Extraer la hoja pura (`ChatMessage` en F32;
   `PregenCard`/`AttributeRow` aquí) la hace testeable sin jsdom y sin duplicar el código en el test.

## Bloqueantes

Ninguno.

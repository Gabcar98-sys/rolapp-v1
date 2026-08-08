# Implementación: F36 — Borrar `MyCharacters.jsx` (tercer huérfano)
Fecha: 2026-07-31
Status: completado

Veredicto: **CharactersPage.jsx es superconjunto estricto de MyCharacters.jsx.**
Cero capacidades exclusivas del huérfano. Borrado ejecutado.

---

## 1. Tabla de paridad, capacidad por capacidad

Método: lectura **completa del render de ambos archivos** (no de la superficie de API).
`MC` = `frontend/src/pages/MyCharacters.jsx` (314 líneas, estado en HEAD `ecfc21c`).
`CP` = `frontend/src/pages/CharactersPage.jsx` (430 líneas, vivo).

| # | Capacidad de MyCharacters | Dónde en MC | Equivalente en CP | Veredicto |
|---|---|---|---|---|
| 1 | Listar **mis** personajes | 23-30 `api.listMyCharacters(user.id)` | 36-45 misma llamada para jugador (+ `listAllCharacters` si DM) | ✅ paridad + extra |
| 2 | Cargar catálogo de sistemas al montar | 35 `listGameSystems(user.id)` | 50 `listGameSystems(isDM ? user.id : null)` | ✅ paridad (CP **corrige un bug**, ver nota A) |
| 3 | Cargar plantillas base al montar | 36 `listBaseCharacters()` (sin params) | 52-55 `listBaseCharacters(isDM ? user.id : null)` → para jugador `null` = misma URL sin params | ✅ paridad idéntica |
| 4 | **Crear personaje** (nombre) | 40-57, form inline vista `'create'` | 259-271 + 377-430 `CreateCharacterModal`; misma llamada `api.createCharacter(user.id, name, gameSystemId \|\| null)` | ✅ paridad |
| 5 | **Elegir sistema de juego al crear** (select opcional) | 169-180, opción `— Sistema de juego (opcional) —` | 411-420, select y **texto literal idénticos** | ✅ paridad literal |
| 6 | Validar nombre vacío al crear | 42 `if (!form.name.trim()) return;` | 391 igual + botón `disabled` (423) | ✅ paridad + extra |
| 7 | Tras crear → abrir la ficha del nuevo | 50-53 `setActiveId` + `setView('sheet')` | 264-268 idéntico | ✅ paridad |
| 8 | Cancelar la creación | 185-187 botón Cancelar | 422 Cancelar + `onClose` del Modal (+ Escape/`role=dialog`, F33) | ✅ paridad + extra |
| 9 | Entrada a pregens solo si hay plantillas | 136-141 `{baseChars.length > 0 && …}` "Desde pregen" | 211-216 mismo guard, "Desde plantilla" | ✅ paridad (rótulo distinto) |
| 10 | **Vista dedicada de pregens / plantillas base** | 193-211, vista `'pregen'`, grid | 131-197, vista `'pregen'`, grid | ✅ paridad |
| 11 | **Adoptar / crear desde pregen** | 59-69 `api.adoptBaseCharacter(bcId, user.id)` → recarga → abre ficha | 59-69 **código idéntico línea a línea** | ✅ paridad literal |
| 12 | Datos de la tarjeta de pregen: nombre, sistema, 3 contadores (atributos/habilidades/inventario) | 247-279 `PregenCard`, `Icon` sliders/skills/bag | 156-192, **los mismos 3 `Icon`** y los mismos `?? 0` | ✅ paridad (ver nota B) |
| 13 | Volver de pregens a la lista | 196-198 | 134-142 | ✅ paridad |
| 14 | **Estado vacío de pregens** | 202 "No hay personajes base disponibles." | 152 "No hay plantillas disponibles." | ✅ paridad |
| 15 | **Abrir la ficha** (`CharacterSheet`) | 109-124, `canEdit` fijo | 107-128, `canEdit` = dueño \|\| DM (para el dueño = `true`) | ✅ paridad |
| 16 | Volver de la ficha **recargando** la lista | 116-120 | 119-123 idéntico | ✅ paridad |
| 17 | **Ver estadísticas** (`CharacterStatsPanel`) | 83-106 | 83-104 | ✅ paridad |
| 18 | Volver de estadísticas | 94-101 | 88-98 | ✅ paridad |
| 19 | **Eliminar personaje** con `window.confirm` | 71-80 | 71-80 **idéntico literal** | ✅ paridad |
| 20 | Botón eliminar en la tarjeta (con `aria-label`) | 303-310, siempre | 319-328, si `isOwner` | ✅ paridad para el jugador (ver nota C) |
| 21 | Botón estadísticas en la tarjeta (con `aria-label`) | 295-302 | 311-318 | ✅ paridad |
| 22 | **Estado vacío de la lista** | 216-218 "No tienes personajes. Crea uno con «+ Nuevo»." | 229-237 caja punteada + icono + "No tienes personajes. Crea uno nuevo o adopta una plantilla." | ✅ paridad |
| 23 | **Banner de error** (mismas clases `bg-danger-tint`/`text-danger-text`) | 155-157 | 225-227 (lista) y 148-150 (pregen) | ✅ paridad |
| 24 | Orígenes de error cubiertos: cargar / crear / adoptar / eliminar | 27, 54, 66, 77 | 42, 67, 77 + `setError` inyectado en el modal (270, 395) | ✅ paridad (4/4) |
| 25 | **Filtros / búsqueda / paginación** | **no existen** en MC | tampoco en CP | ✅ nada que perder |
| 26 | Sistema del personaje en la tarjeta, con reserva "Sin sistema" | 289 | 285-291 (subtítulo `sistema · Nivel N · dueño`) | ✅ paridad + extra |
| 27 | Cabecera con título | 130-131 "Mis personajes" + `user.username` | 202-208 "Mis Personajes" (jugador) / "Personajes" (DM) + subtítulo descriptivo | ✅ paridad (el username vive en el bloque de usuario del AppShell) |
| 28 | Botón "← Lobby" (prop `onBack`) | 147-151 | **no existe** | ⚠️ **superseded, no perdido** (ver nota D) |
| 29 | Barras PV/EXP + 4 stats core en la tarjeta | **no existe** en MC | 332-372 | ➕ solo en CP |
| 30 | Vista DM: todos los personajes con su dueño | **no existe** en MC | 38-40 `listAllCharacters` | ➕ solo en CP |

**Resultado: 27 capacidades en paridad, 0 exclusivas de MyCharacters, 1 superseded por el
rediseño (nota D), 2 exclusivas de CharactersPage.** Se cumple la condición para borrar.

### Notas
- **A — el select de sistemas de MC estaba roto para su propio público.** MC llamaba
  `listGameSystems(user.id)` siendo `user` un **jugador**; ese parámetro es `dm_id`
  (`lib/api.js`), así que la consulta filtraba por "sistemas cuyo DM es este jugador" → lista
  vacía. Su comentario (MC:34) decía "el catálogo es global; sin dm_id devuelve todos" y luego
  pasaba el id igualmente. CP pasa `null` para el jugador (CP:49-50) y sí lista todos. Es decir,
  en la única capacidad donde MC y CP divergen funcionalmente, **CP es el correcto**.
- **B — `avatar_icon` vs glifo.** MC pintaba `baseChar.avatar_icon` (dato del pregen);
  CP pinta el glifo de inicial con color estable (`initialGlyph` + `GLYPH_CLASSES`). Es la
  decisión de diseño del handoff aplicada en F13/F15 y ya vigente en `BaseCharactersPage`;
  no es una capacidad, es la representación del mismo dato.
- **C — eliminar.** MC era exclusivamente vista de jugador (todos los personajes listados eran
  suyos), así que "eliminar siempre visible" ≡ "eliminar si `isOwner`". La restricción de CP
  solo aplica al DM mirando personajes ajenos, caso que MC ni siquiera podía mostrar.
- **D — "← Lobby".** `frontend/src/pages/Lobby.jsx` **fue borrado** en F13 (`476a07d`). El
  destino de ese botón ya no existe; la navegación equivalente es el sidebar del AppShell
  (`components/layout/navItems.js:32` → `{ id: 'characters', label: 'Mis Personajes' }` →
  `App.jsx:165-166` → `<CharactersPage/>`). No hay capacidad que portar.

---

## 2. Confirmación de orfandad (grep + git)

**Cero imports antes del borrado** (`LC_ALL=en_US.UTF-8`, exit code comprobado):

```
$ LC_ALL=en_US.UTF-8 grep -rn "MyCharacters|myCharacters" frontend/src frontend/index.html frontend/vite.config.js
frontend/src/components/Character/CharacterSheet.jsx:32:// Ficha dinámica reutilizable (MyCharacters y SessionView). …   ← comentario
frontend/src/components/Session/SessionCharactersPanel.jsx:35:      api.listMyCharacters(user.id)…                          ← helper REST
frontend/src/designDebt.test.js:33:  'pages/MyCharacters.jsx',                                             ← STRING de guard (¡ojo!)
frontend/src/lib/api.js:241:  listMyCharacters: (userId) => …                                            ← helper REST
frontend/src/pages/CharactersPage.jsx:40:        : await api.listMyCharacters(user.id);                  ← helper REST
frontend/src/pages/MyCharacters.jsx:14:export default function MyCharacters({ user, onBack })            ← él mismo
frontend/src/pages/myCharacters.test.jsx:3:import { PregenCard, CharacterRow } from './MyCharacters.jsx'; ← su propio test
```

Ni `App.jsx` ni ninguna página, componente o test **importa el módulo**. Los tres
`listMyCharacters` son el helper REST de `lib/api.js` (otra cosa: sigue vivo y con 2 consumidores).

**Desde cuándo está huérfano — `git log`:**

```
$ git log --oneline -- frontend/src/pages/MyCharacters.jsx
ecfc21c refactor(F35): retira la paleta v0 de Tailwind y cierra la deuda visual
e9676b5 feat(F8c): pulido mobile-first + tldraw
09cf63d feat(F7): estadisticas derivadas
eb93989 feat(F3): personajes con ficha dinamica por game system      ← nace aquí

$ git log --oneline -S "MyCharacters" -- frontend/src/App.jsx
(vacío)  → App.jsx NUNCA lo importó
```

El `git log` del archivo no dice cuándo se quedó huérfano (solo cuándo se editó), así que
rastreé **quién lo importaba** commit a commit (`git ls-tree` + grep por commit):

| commit | fecha | quién referenciaba `MyCharacters` |
|---|---|---|
| `eb93989` (F3) … `e9676b5` (F8c) | 2026-06-29 → 06-30 | **`pages/Lobby.jsx`** (`import MyCharacters from './MyCharacters.jsx'`, línea 11; render en la 208) |
| `476a07d` (F13) | **2026-07-02** | `Lobby.jsx` **ya no existe**; aparece `CharactersPage.jsx`. Cero importadores |
| `d894c3b`, `ecfc21c` (F35) | 2026-07-23 → 07-30 | sigue con cero importadores |

> **Huérfano desde `476a07d` — F13, 2026-07-02** (28 días y 22 features), cuando el rediseño
> sustituyó `pages/Lobby.jsx` por el AppShell + `CharactersPage.jsx` y su único importador
> desapareció con él. F35 lo migró de emojis y tokens sin saber que era inalcanzable.

---

## 3. Archivos borrados (`git rm`)

```
$ git rm frontend/src/pages/MyCharacters.jsx frontend/src/pages/myCharacters.test.jsx
rm 'frontend/src/pages/MyCharacters.jsx'
rm 'frontend/src/pages/myCharacters.test.jsx'
```

- `frontend/src/pages/MyCharacters.jsx` — **-314 líneas**. Vista de personajes del jugador de
  la era Lobby (F3), superseded por `CharactersPage.jsx` desde F13.
- `frontend/src/pages/myCharacters.test.jsx` — **-78 líneas**, 5 tests (3 de `PregenCard`,
  2 de `CharacterRow`). Nació en F35 cubriendo un archivo ya inalcanzable; muere con él.

**Censo posterior al borrado, con control positivo del patrón** (lección F32/F35 — un patrón
roto también devuelve cero):

```
$ LC_ALL=en_US.UTF-8 grep -rn "MyCharacters\.jsx|myCharacters\.test" frontend/src
frontend/src/designDebt.test.js:32:// F36 borró 'pages/MyCharacters.jsx' de esta lista…   ← mi propio comentario

$ git show HEAD:frontend/src/pages/myCharacters.test.jsx | grep -n "MyCharacters\.jsx"
3:import { PregenCard, CharacterRow } from './MyCharacters.jsx'   ← el MISMO patrón sí encuentra en HEAD
```

El cero es real, no un patrón roto.

---

## 4. Huérfanos en cascada: **ninguno**

Cada import y cada helper que usaba la página conserva otros consumidores vivos:

| Dependencia de MyCharacters | Consumidores tras el borrado | Acción |
|---|---|---|
| `components/Character/CharacterSheet.jsx` | `CharactersPage.jsx:21`, `Session/SessionCharactersPanel.jsx:6` | **se queda** |
| `components/Stats/CharacterStatsPanel.jsx` | `CharactersPage.jsx:22` (+ el guard `designDebt.test.js`) | **se queda** |
| `ui/Button.jsx`, `ui/Card.jsx`, `ui/Icon.jsx` | decenas de vistas | **se quedan** |
| `api.listMyCharacters` | `CharactersPage.jsx:40`, `SessionCharactersPanel.jsx:35` | **se queda** |
| `api.createCharacter` | `CharactersPage.jsx:264` | **se queda** |
| `api.deleteCharacter` | `CharactersPage.jsx:75` | **se queda** |
| `api.listGameSystems` | 6 páginas (Attributes, BaseCharacters, Characters, Items, Npcs, Skills) | **se queda** |
| `api.listBaseCharacters` | `AttributesPage:526`, `BaseCharactersPage:25`, `CharactersPage:53` | **se queda** |
| `api.adoptBaseCharacter` | `CharactersPage.jsx:62` | **se queda** |
| exports `PregenCard` / `CharacterRow` | único consumidor era `myCharacters.test.jsx`, borrado en el mismo acto | mueren con el archivo |

**Pero sí apareció un acoplamiento invisible al `grep` de imports** (y es el hallazgo del día):

`frontend/src/designDebt.test.js:33` listaba `'pages/MyCharacters.jsx'` como **string** dentro
de `F35_FILES`, y la línea 82 hace `readFileSync(join(SRC_DIR, rel))` **sin guard de existencia**
→ tras el borrado el guard de F35 habría reventado con `ENOENT`, no con un assert legible.
No es un import, así que ningún censo de imports lo habría visto.

---

## 5. El guard `designDebt.test.js` (F35): sigue armado

- **Sí dependía** del archivo borrado (línea 33) → retiré esa entrada y dejé comentado el porqué.
  Las otras 3 entradas de `F35_FILES` (CampaignStatsPanel, CharacterStatsPanel, Sparkline) y el
  censo general `V0_CLASS` sobre **todo** `src/` quedan intactos: cero pérdida de cobertura real
  (el archivo que sale de la lista ya no existe).
- **Validado por mutación** (no me fío de que "pase"): con dos mutaciones simultáneas —un emoji
  📊 en `Stats/Sparkline.jsx` y la clase v0 `bg-ink-800` en `Stats/CampaignStatsPanel.jsx`— el
  guard se puso **rojo en los dos tests**:

```
$ docker run --rm tmp-f36-mut npx vitest run src/designDebt.test.js
AssertionError: expected [ 'components/Stats/Sparkline.jsx' ] to deeply equal []
 ❯ src/designDebt.test.js:85  (test de emojis)
 Test Files  1 failed (1)
      Tests  2 failed | 2 passed (4)
```

  Nota: **el build de las mutaciones dio `BUILD_EXIT=0`** — lint y build tragan la clase v0 sin
  rechistar. Exactamente la regresión silenciosa para la que existe el guard.
  Mutaciones revertidas con `git checkout --` y árbol confirmado limpio; imagen `tmp-f36-mut`
  eliminada.

---

## Archivos creados
Ninguno.

## Archivos modificados
- `frontend/src/designDebt.test.js` (+3/-1): saco `'pages/MyCharacters.jsx'` de `F35_FILES`
  (obligatorio: `readFileSync` sobre un archivo borrado lanza `ENOENT`) y dejo 3 líneas de
  comentario explicando que el censo general sigue cubriendo todo `src/`.
- `frontend/src/components/Character/CharacterSheet.jsx` (+1/-1): **solo un comentario**, la
  línea 32 decía "Ficha dinámica reutilizable (MyCharacters y SessionView)" → referencia colgante
  a un archivo borrado; ahora dice `CharactersPage`. Cero cambio de código.
- `.claude/feature_list.json`: F36 `pending` → `in_progress` (a petición del líder).

## Archivos borrados
- `frontend/src/pages/MyCharacters.jsx` (-314)
- `frontend/src/pages/myCharacters.test.jsx` (-78)

## Tests escritos
Ninguno nuevo — la feature es un borrado. Los 5 tests del archivo eliminado desaparecen con él
(162 → 157) y ninguna capacidad viva pierde cobertura: `CharactersPage` sigue cubierta por
`pages/pages.test.jsx` (16 tests, incluye su SSR con `user` DM).

## Resultado de verificación

Entorno canónico, **tag propio** (F34 corre en paralelo; no toqué `docker compose build`):

```
$ docker build --target build -t tmp-f36 ./frontend
#10 [build 6/7] RUN npm run lint      DONE 1.8s
#11 [build 7/7] RUN npm run build     DONE 8.8s
BUILD_EXIT=0

$ docker run --rm tmp-f36 npm run lint
✖ 6 problems (0 errors, 6 warnings)      ← preexistentes, en PlanningPanel.jsx y DashboardPage.jsx,
                                            ninguno de los archivos que toqué

$ docker run --rm tmp-f36 npm test
 ✓ src/designDebt.test.js (4 tests)
 … 15 archivos …
 Test Files  15 passed (15)
      Tests  157 passed (157)

$ docker rmi tmp-f36   → exit 0; docker images | grep tmp-f36 → ninguna
```

**Vigencia de la imagen probada (checkpoint de CHECKPOINTS.md):**

```
$ docker run --rm tmp-f36 sh -c "ls src/pages/MyCharacters.jsx src/pages/myCharacters.test.jsx"
ls: cannot access 'src/pages/MyCharacters.jsx': No such file or directory
ls: cannot access 'src/pages/myCharacters.test.jsx': No such file or directory

$ sha256sum frontend/src/designDebt.test.js frontend/src/components/Character/CharacterSheet.jsx
994e2167ff981aa467ed5b64083a280c7479b505d23ec0dc84948a0544a58de7  designDebt.test.js
42019f7ea75e3a9560c92e3e57922253e51704e231e9776789511f42bfa36113  CharacterSheet.jsx
$ docker run --rm tmp-f36 sha256sum src/designDebt.test.js src/components/Character/CharacterSheet.jsx
994e2167ff981aa467ed5b64083a280c7479b505d23ec0dc84948a0544a58de7  src/designDebt.test.js
42019f7ea75e3a9560c92e3e57922253e51704e231e9776789511f42bfa36113  src/components/Character/CharacterSheet.jsx
```

Hashes idénticos host↔imagen y los borrados ausentes dentro de la imagen: los tests corrieron
sobre el código actual.

- lint:  ✅ (exit 0; 0 errores, 6 warnings preexistentes ajenos)
- build: ✅ (exit 0)
- test:  ✅ 157/157 (15 archivos, 0 fallos)
- higiene del host: ✅ sin `frontend/node_modules` **ni antes ni después** (comprobado en ambos
  momentos); imágenes `tmp-f36` y `tmp-f36-mut` eliminadas
- alcance: ✅ solo `frontend/src` (+ el flip de estado en `feature_list.json`). **Cero backend,
  cero `game-packs/`** (F34 sin interferencia), cero dependencias, cero cambios de esquema

Conteo de tests coherente: 162 (F35) − 5 (`myCharacters.test.jsx`) = **157**. No se perdió
ningún otro test.

## Lecciones aplicadas
- **F32 "un componente huérfano pasa lint/build/tests y no existe para el usuario"** → la tabla
  de paridad se hizo leyendo el **render completo** de ambos archivos, no la superficie de API
  (que es lo que el líder pudo hacer en el scout). Fue lo que destapó las notas A y D.
- **F35 "`grep -P` en Git Bash aborta por locale: un `|| echo CERO` produce un cero mentiroso"**
  → todos los censos con `LC_ALL=en_US.UTF-8`, comprobando exit code, y con **control positivo**
  del patrón contra `git show HEAD:` antes de autorizar el borrado.
- **F35 "una regresión que no rompe el build necesita un test-guard validado por mutación"** →
  no me limité a ver el guard en verde: lo mutilé a propósito y confirmé el rojo antes de revertir.
- **Docker (F20/F8b) "correr vitest en Docker sin ensuciar el host"** → `docker build --target
  build` + `docker run --rm` + `docker rmi`, sin `npm install` en el árbol montado.
- **CHECKPOINTS "prueba la vigencia por hash, no por timestamp ni cache-hit"** → hashes
  host↔imagen + verificación de que los archivos borrados no están dentro de la imagen.

## Decisiones tomadas
1. **Tocar `designDebt.test.js` (inevitable).** Alternativa descartada: envolver el
   `readFileSync` en un guard de existencia — habría hecho que la lista tolere rutas muertas y
   **debilitaría el guard en silencio** (un archivo renombrado dejaría de vigilarse sin avisar).
   Prefiero la lista explícita y correcta.
2. **Actualizar el comentario de `CharacterSheet.jsx`.** Es una línea de comentario con una
   referencia colgante a un archivo que acabo de borrar; cero cambio de comportamiento. Lo
   declaro aquí explícitamente para que no se lea como fuera de alcance.
3. **No toqué nada más.** `CharactersPage.jsx` quedó **byte a byte igual** (no aparece en
   `git status`): ni restyle, ni el arreglo de la nota A (que ya está bien en CP), ni portar el
   `avatar_icon`. Esta feature es un borrado.
4. Cero dependencias nuevas. Cero backend. Cero `game-packs/`.

## Candidatos para LEARNINGS.md
1. **Antes de borrar un archivo, censa también las rutas escritas como STRING, no solo los
   imports.** El `grep` de imports daba cero, pero `designDebt.test.js` referenciaba
   `'pages/MyCharacters.jsx'` como cadena dentro de una lista y lo abría con `readFileSync`:
   borrar el archivo habría roto el guard con un `ENOENT` (fallo de infraestructura, no un
   assert legible). Patrón general: los test-guards, configs y listas de rutas crean
   acoplamiento que ningún análisis de imports detecta — busca el **basename** del archivo, no
   solo `from '…'`. (Categoría: Testing.)
2. **Para fechar una orfandad, busca el commit donde murió su ÚLTIMO importador, no el
   `git log` del archivo.** El log de `MyCharacters.jsx` solo muestra sus 4 ediciones y sugiere
   que "está vivo" (¡la última es de ayer!). La orfandad real se data iterando `git ls-tree` +
   grep por commit hasta ver desaparecer al importador: aquí `pages/Lobby.jsx` en F13
   (2026-07-02), 22 features antes. Con esa fecha, el coste del despiste es cuantificable — F35
   invirtió trabajo en migrar emojis y tokens de una página inalcanzable desde hacía un mes.
   Corolario de proceso: el barrido de huérfanos va **al principio** del trabajo sobre un
   archivo, no después. (Categoría: Proceso y flujo de trabajo.)
3. **Un huérfano puede esconder un bug que nunca se reportó.** MC pasaba `user.id` (un jugador)
   donde la API espera `dm_id`, así que su selector de sistemas siempre salía vacío: nadie lo vio
   porque la página llevaba un mes inalcanzable. Al comparar huérfano vs sucesor, la divergencia
   suele ser el bug del huérfano — motivo extra para borrar en vez de "recuperar". (Categoría:
   Arquitectura.)

## Bloqueantes
Ninguno. La salvaguarda del líder (parar si aparecía UNA capacidad ausente en `CharactersPage`)
no llegó a dispararse: la tabla de la sección 1 cubre las 30 capacidades del huérfano y ninguna
falta. La única que no tiene equivalente literal —el botón "← Lobby"— apunta a una página
(`pages/Lobby.jsx`) borrada en el mismo commit que dejó huérfano a `MyCharacters`.

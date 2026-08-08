# Revisión: F36 — Borrar `MyCharacters.jsx` (tercer huérfano)
Fecha: 2026-08-07
Veredicto: **APROBADO**

Revisión independiente: rehíce por mi cuenta la tabla de paridad, el censo de orfandad (con
control positivo), la validación por mutación del guard y la verificación en Docker con
vigencia por hash. **No edité código**; el working tree quedó igual que al empezar.

---

## Checklist CHECKPOINTS.md

- [x] Lint frontend pasa EN EL CONTENEDOR — `docker run --rm tmp-rev-f36 npm run lint` → **exit 0**
- [x] Build frontend pasa — `docker build --target build` → **exit 0** (el stage fuerza `RUN npm run lint` + `RUN npm run build`)
- [x] **La imagen refleja el código ACTUAL** — el build fue CACHE-HIT completo, así que NO me fié de él: verifiqué currency por **hash host↔imagen** (4 archivos) + ausencia de los borrados dentro de la imagen
- [x] Tests existen y pasan — **157/157, 15 archivos, 0 fallos**
- [x] Caso feliz cubierto — `pages.test.jsx` sigue renderizando `CharactersPage` en el shell; `designDebt.test.js` (4 tests) sigue verde
- [x] Caso de error cubierto — el guard `designDebt.test.js` lo validé **por mutación** (3 mutaciones, todas rojas; ver sección 4)
- [x] No hay código comentado sin explicación — los 3 comentarios añadidos explican el porqué
- [x] No hay `console.log` de debug — cero en los 2 archivos tocados
- [x] `better-sqlite3` síncrono / prepared statements — **N/A** (cero backend; verificado: el commit y el working tree de F36 no tocan `backend/`)
- [x] `session_events` append-only — **N/A** (cero backend)
- [x] Cero estilos inline y cero `window.innerWidth` — repo-wide exit 1 con control positivo del grep. F36 no añade **ni una línea de JSX**
- [x] Mobile-first con breakpoints de Tailwind — N/A (no hay markup nuevo)
- [x] Nombres descriptivos en inglés — sin identificadores nuevos
- [x] Respeta la estructura de `architecture.md` — solo elimina de `pages/`
- [x] Cero dependencias nuevas, cero cambios de esquema
- [x] **Alcance respetado** — cero `backend/`, cero `game-packs/`
- [x] Reporte del implementer presente y completo (`impl_F36-mycharacters-orphan.md`)
- [x] Lecciones propuestas para LEARNINGS.md (3, todas de calidad)

---

## 1. La condición de borrado: ¿`CharactersPage` es superconjunto estricto?

Rehecha **por mi cuenta**, leyendo el render completo de `CharactersPage.jsx` (430 líneas, vivo)
contra `git show 5953b44^:frontend/src/pages/MyCharacters.jsx` (314 líneas). No me apoyé en la
tabla del implementer.

| Capacidad crítica | MyCharacters (borrado) | CharactersPage (vivo) | Veredicto |
|---|---|---|---|
| **Crear personaje** | 40-57, form inline vista create | 259-271 + `CreateCharacterModal` 377-430; misma llamada `api.createCharacter(user.id, name, gameSystemId ?? null)` | ✅ presente |
| Elegir sistema al crear | 169-180, opción "Sistema de juego (opcional)" | 411-420, **mismo literal** | ✅ presente |
| Validar nombre vacío | 42 | 391 + botón `disabled` (423) | ✅ presente + extra |
| Tras crear → abrir ficha | 50-53 | 264-268 | ✅ presente |
| Cancelar la creación | 185-187 | 422 + `onClose` + Escape + clic fuera (Modal.jsx) | ✅ presente + extra |
| **Crear DESDE PREGEN (`adoptBaseCharacter`)** | 59-69 | **59-69, idéntico línea a línea** | ✅ presente |
| Entrada a pregens solo si hay plantillas | 136-141 `baseChars.length > 0` | 211-216, mismo guard | ✅ presente |
| Vista dedicada de pregens (grid) | 193-211 | 131-197 | ✅ presente |
| Carga de plantillas | 36 `listBaseCharacters()` | 52-55 `listBaseCharacters(isDM ? user.id : null)` | ✅ **URL idéntica**: verifiqué el helper (`api.js:286-292`) — con `dmId` falsy no añade query param, así que para el jugador `(null)` equivale a `()` |
| Contadores de la tarjeta pregen (atributos/skills/inventario) | 260-273, `Icon` sliders/skills/bag + `?? 0` | 174-187, **los mismos 3 `Icon`** y los mismos `?? 0` | ✅ presente |
| Volver de pregens / estado vacío de pregens | 196-198 / 202 | 134-142 / 152 | ✅ presente |
| **Listar mis personajes** | 25 `listMyCharacters(user.id)` | 36-45, misma llamada para jugador | ✅ presente + `listAllCharacters` para DM |
| **Abrir ficha (`CharacterSheet`)** | 109-124, mismas 4 props | 107-128, mismas 4 props | ✅ presente |
| Volver de la ficha recargando la lista | 116-120 | 119-123 | ✅ presente |
| **Ver estadísticas (`CharacterStatsPanel`)** | 83-106 | 83-104 | ✅ presente |
| **Eliminar personaje** (`window.confirm` + `deleteCharacter`) | 71-80 | **71-80, idéntico literal** | ✅ presente |
| Botón eliminar en la tarjeta | 303-310, siempre visible | 319-328, **condicionado a `isOwner`** | ✅ presente — **ver 1.1, era el riesgo real y lo comprobé contra el backend** |
| Botón estadísticas con `aria-label` | 295-302 | 311-318 | ✅ presente |
| **Estado vacío de la lista** | 216-218 | 229-237 | ✅ presente |
| **Banner de error** (`bg-danger-tint` / `text-danger-text`) | 155-157 | 225-227 (lista) + 148-150 (pregen) | ✅ presente — ver observación O-3 |
| Orígenes de error: cargar/crear/adoptar/eliminar | 27, 54, 66, 77 | 42, 396, 67, 77 | ✅ 4/4 |
| Filtro/búsqueda/paginación | no existían | no existen | ✅ nada que perder |
| Botón "Lobby" | 147-151 | no existe | ✅ **sin destino**: confirmé que `frontend/src/pages/Lobby.jsx` NO existe y que solo queda una mención en texto (`PlanningPanel.jsx:389`). La navegación equivalente vive en `navItems.js:32` → `App.jsx:165-166` |

**Cero capacidades perdidas.** La condición de borrado se cumple.

### 1.1 El único riesgo real que encontré, y por qué NO es un hueco

`CharactersPage:319` condiciona el botón de eliminar a `isOwner={String(char.user_id) === String(user.id)}`,
mientras que MyCharacters lo mostraba siempre. Si `listMyCharacters` **no** devolviera `user_id`,
`isOwner` sería siempre `false` y **el jugador perdería la capacidad de eliminar** — un hueco de
paridad que ni el grep ni los tests detectarían.

Lo verifiqué contra el backend: `backend/src/routes/characters.js:126-139` responde con
`getCharacterFull(id)`, cuyo `SELECT c.*` (líneas 11-17) incluye `characters.user_id`. El campo
llega. `isOwner` es `true` para el dueño → **eliminar se conserva**. Lo mismo aplica al
`canEdit` de la ficha (`CharactersPage:111`), que además degrada a `true` si el personaje no
está en la lista.

---

## 2. Orfandad real y cero imports rotos (censo propio, con control positivo)

Apliqué la lección de F35 (`LC_ALL=en_US.UTF-8`, exit code comprobado, **control positivo**) y el
hallazgo del implementer (buscar el **basename como STRING**, no solo los imports).

```
[6] importadores JUSTO ANTES del borrado:
$ git grep -nE "from '.*MyCharacters|import .*MyCharacters" 5953b44^ -- frontend/src
5953b44^:frontend/src/pages/myCharacters.test.jsx:3: import { PregenCard, CharacterRow } from './MyCharacters.jsx';
-> el UNICO importador era su propio test. Orfandad probada en el instante del borrado.

[7] CONTROL POSITIVO del MISMO patron (commit donde si habia importador):
$ git grep -nE "from '.*MyCharacters|import .*MyCharacters" 476a07d^ -- frontend/src
476a07d^:frontend/src/pages/Lobby.jsx:11: import MyCharacters from './MyCharacters.jsx';
-> el patron SI encuentra cuando hay algo. El cero de [6] es real, no un patron roto.

[5] barrido repo-wide TRAS el borrado (basename como string, no solo imports):
frontend/src/lib/api.js:241                                    listMyCharacters  <- helper REST (vivo)
frontend/src/pages/CharactersPage.jsx:40                       listMyCharacters  <- consumidor vivo
frontend/src/components/Session/SessionCharactersPanel.jsx:35  listMyCharacters  <- consumidor vivo
frontend/src/designDebt.test.js:32                             comentario de F36 (intencional)
frontend/tailwind.config.js:66                                 comentario historico  <- ver O-1
```

**Cero imports rotos.** Confirmado también que el helper `api.listMyCharacters` (otra cosa
distinta del componente) conserva 2 consumidores vivos y debe quedarse.

---

## 3. Alcance

- Commit del borrado `5953b44`: **exactamente 2 archivos**, ambos en `frontend/src/pages/` (-392 líneas).
- Working tree de F36: `frontend/src/designDebt.test.js` (obligatorio, sección 4) y
  `frontend/src/components/Character/CharacterSheet.jsx` (**una línea de comentario**, verificado
  en el diff: MyCharacters → CharactersPage; cero cambio de comportamiento).
- `CharactersPage.jsx` quedó **byte a byte igual** (no aparece en `git status`) — disciplina de
  alcance correcta: el implementer no aprovechó para "arreglar de paso".
- **Cero `backend/`. Cero `game-packs/`.** El `game-packs/stormlight.json` modificado en el
  working tree es de F34 (en paralelo): no lo evalué ni lo toqué, según instrucción.

---

## 4. El guard `designDebt.test.js` sigue armado (validado por mutación, por mí)

Corrí las mutaciones **dentro del contenedor efímero**, nunca sobre el host (con un
auto-commiteador activo y otro agente trabajando en paralelo, mutar el árbol real es
inaceptable). Las tres se pusieron rojas:

| Mutación (en contenedor) | Resultado |
|---|---|
| **A** — emoji en `Stats/Sparkline.jsx` (sí está en `F35_FILES`) | 🔴 `expected [ 'components/Stats/Sparkline.jsx' ] to deeply equal []` |
| **B** — clase v0 `bg-ink-800` en `pages/CharactersPage.jsx` (**NO** está en `F35_FILES`) | 🔴 `expected [ 'pages/CharactersPage.jsx' ] to deeply equal []` |
| **C** — reponer `'pages/MyCharacters.jsx'` en `F35_FILES` | 🔴 `Error: ENOENT: no such file or directory, open '/app/src/pages/MyCharacters.jsx'` |

Conclusiones:
- **B prueba que no se perdió cobertura**: el censo general `V0_CLASS` recorre **todo** `src/`
  vía `collectSourceFiles(SRC_DIR)` (líneas 55, 76-81) y pilla archivos que no están en la lista.
  Retirar una entrada de `F35_FILES` no abre ningún agujero real.
- **C confirma la afirmación del implementer**: `readFileSync(join(SRC_DIR, rel))` en la línea 84
  **no tiene guard de existencia**, así que dejar la entrada habría reventado el guard con un
  ENOENT (fallo de infraestructura, no un assert legible). **Tocar `designDebt.test.js` era
  obligatorio**, no scope creep. Y su decisión de NO envolverlo en un guard de existencia es la
  correcta: eso habría hecho que la lista tolere rutas muertas y debilitaría el guard en silencio.

---

## Resultado de verificación (Docker, tag propio `tmp-rev-f36`, patrón F20)

```
$ docker build --target build -t tmp-rev-f36 ./frontend      -> BUILD_EXIT=0  (CACHE-HIT completo)
$ docker run --rm tmp-rev-f36 npm run lint                   -> LINT_EXIT=0
   6 problems (0 errors, 6 warnings)   <- preexistentes y AJENOS a F36
$ docker run --rm tmp-rev-f36 npm test                       -> TEST_EXIT=0
   Test Files  15 passed (15)
        Tests  157 passed (157)
$ docker rmi tmp-rev-f36                                     -> exit 0, sin residuos
```

**Vigencia probada por HASH, no por el cache-hit** (el build fue íntegramente cacheado, así que
por CHECKPOINTS no basta como prueba):

```
HOST                                                            IMAGEN
994e2167...4a58de7   src/designDebt.test.js                ==   994e2167...4a58de7
42019f7e...bfa36113  src/components/Character/CharacterSheet.jsx == 42019f7e...bfa36113
399c983e...799abab9  src/pages/CharactersPage.jsx          ==   399c983e...799abab9
30ff2ef8...abe11c221 tailwind.config.js                    ==   30ff2ef8...abe11c221

$ docker run --rm tmp-rev-f36 ls src/pages/MyCharacters.jsx src/pages/myCharacters.test.jsx
   -> No such file or directory (ambos)   +   src/pages/ tiene 17 entradas (= el host)
```

4/4 hashes idénticos y los borrados ausentes dentro de la imagen → los tests corrieron sobre el
código actual.

- lint:  ✅ exit 0 (0 errores, 6 warnings preexistentes en `PrepWorkspace.jsx` y `DashboardPage.jsx`)
- build: ✅ exit 0
- test:  ✅ **157/157** (15 archivos)
- **conteo confirmado**: el archivo borrado tenía exactamente **5** `it(...)` (los conté en
  `git show 5953b44^:.../myCharacters.test.jsx`). 162 - 5 = **157**. Cuadra: no se perdió ningún
  otro test, y los 5 cubrían `PregenCard` / `CharacterRow`, es decir **código muerto**.
- higiene del host: ✅ sin `frontend/node_modules` ni antes ni después; imagen propia eliminada;
  `git status` idéntico al de entrada (no toqué nada)

---

## Lecciones aplicadas correctamente

- **F32 — "un huérfano pasa lint/build/tests y no existe para el usuario"**: ✅ aplicada bien. La
  tabla de paridad se hizo sobre el **render completo**, no sobre la superficie de API; eso es lo
  que destapó las notas A (bug del huérfano) y D (el botón "Lobby" sin destino). Rehíce la
  comparación y llego al mismo veredicto.
- **F35 — "`grep -P` en Git Bash aborta por locale; un patrón roto también devuelve cero"**:
  ✅ aplicada. Usó `LC_ALL=en_US.UTF-8`, comprobó exit code y montó **control positivo** contra
  `git show HEAD:` antes de autorizar el borrado. (Matiz de transcripción en O-2.)
- **F35 — "una regresión que no rompe el build necesita un guard validado por mutación"**:
  ✅ aplicada y, además, **honesta**: registró que las mutaciones daban `BUILD_EXIT=0`, o sea que
  lint y build tragan la clase v0 sin rechistar. Reproduje sus mutaciones y confirmo el rojo.
- **F20/F8b — "vitest en Docker sin ensuciar el host"**: ✅ `--target build` + `--rm` + `rmi`, tag
  propio para no competir con el build de F34, host sin `node_modules`.
- **CHECKPOINTS — "vigencia por hash, no por timestamp ni cache-hit"**: ✅ aplicada, y con el
  extra correcto de comprobar que los archivos borrados **no están** dentro de la imagen.

---

## Puntos a corregir

Ninguno bloqueante.

---

## Observaciones (no bloqueantes)

- **O-1 — al censo se le escapó `frontend/tailwind.config.js`.** Su barrido cubrió
  `frontend/src`, `index.html` y `vite.config.js`, pero no el resto de `frontend/`. Queda una
  referencia colgante en `tailwind.config.js:66`: "F32 y F35 migraron las últimas (ChatPanel,
  CanvasBoard, **MyCharacters**, Stats/*) al handoff". Es narrativa histórica en pasado y
  fácticamente cierta (F35 lo migró de verdad), así que **no molesta y no pido cambiarla**. Pero
  ilustra que el censo que autoriza un borrado debería abarcar **todo** el paquete, no solo
  `src/`: configs, `Dockerfile`, `nginx.conf`.
- **O-2 — comando del reporte mal transcrito.** El reporte (sección 2) muestra
  `grep -rn "MyCharacters|myCharacters" ...` con 7 resultados. Con BRE ese `|` es un pipe literal
  y el comando **no habría encontrado nada**; los resultados implican que en realidad corrió con
  `-E` o `-P`. La ejecución fue correcta (mis censos independientes reproducen esos mismos
  resultados), pero justo la lección de F35 va de no fiarse de comandos transcritos: alguien que
  copie ese comando del reporte y lo re-ejecute tal cual obtendría un cero mentiroso.
- **O-3 — debilidad PREEXISTENTE de `CharactersPage` (no la introduce F36, no pido arreglarla
  aquí).** Si `createCharacter` falla, `CreateCharacterModal` llama `setError` (línea 396) pero el
  modal **sigue abierto** (`setCreateOpen(false)` está después del `await` y se salta al lanzar), y
  el banner de error se pinta en la página **por debajo** del backdrop `bg-black/70` del Modal
  (`Modal.jsx:21`). Resultado: el usuario ve el botón volver de "Creando..." a "Crear personaje"
  sin mensaje legible. En MyCharacters el form era inline y el error se veía perfectamente.
  **No es motivo de rechazo**: la página huérfana llevaba 34 días inalcanzable, así que ningún
  usuario pierde nada con el borrado, y tocar `CharactersPage` habría sido scope creep.
  Candidato a feature de seguimiento: mover el banner dentro del `<Modal>`.
- **O-4 — la ruta de JUGADOR de `CharactersPage` no tiene test.** `pages.test.jsx:29` la renderiza
  solo con `user={dm}`. Los 5 tests que murieron cubrían `PregenCard` / `CharacterRow` (código
  muerto), así que **no se perdió cobertura viva**; pero los equivalentes vivos (`CharacterCard`,
  `CreateCharacterModal`, la tarjeta de pregen inline) no están exportados ni cubiertos. Justo
  `isOwner` — el punto que tuve que verificar contra el backend en 1.1 — es lógica sin test.
  Añadir una entrada `<CharactersPage user={player} />` al array `PAGES` cuesta una línea.
- **O-5 — imagen huérfana en el host.** Quedó `tmp-rev36:latest` (**1,06 GB**, creada 2026-07-31
  19:01). **No es del implementer**: sus dos tags declarados (`tmp-f36`, `tmp-f36-mut`) están
  efectivamente borrados; el nombre apunta a una ejecución de *review* anterior. No la eliminé
  para no interferir con el trabajo en paralelo de F34. Conviene un `docker rmi tmp-rev36`.
- **O-6 — dos features en `in_progress` a la vez** (`F34-stormlight-catalog` y
  `F36-mycharacters-orphan`) en `.claude/feature_list.json`. Es el paralelismo que montó el líder
  a propósito, pero contradice el protocolo de arranque de CLAUDE.md (paso 6); conviene dejarlo
  anotado en `current.md` para que la próxima sesión no se pare en falso.

---

## Candidatos para LEARNINGS.md

Las **3 propuestas del implementer son buenas y las respaldo**, en especial la #1 (censar el
**basename como STRING**, no solo los imports): es un hueco real del checklist y lo confirmé por
mutación — dejar la entrada habría reventado el guard con ENOENT. Añado dos mías:

1. **Al borrar un huérfano, la paridad no acaba en el JSX: sigue el dato hasta el backend.** La
   capacidad de más riesgo aquí no era una vista ausente sino una **condición nueva**: el sucesor
   pinta el botón de eliminar tras `isOwner={String(char.user_id) === String(user.id)}` donde el
   huérfano lo mostraba siempre. Si el endpoint no devolviera `user_id`, la capacidad
   desaparecería sin romper lint, build ni tests, y sin que ningún grep lo viera. Regla: cuando el
   sucesor **añade un guard** sobre una capacidad que el huérfano ofrecía incondicionalmente,
   verifica en el backend que el campo del guard existe de verdad en la respuesta
   (aquí `getCharacterFull` -> `SELECT c.*`). Un `undefined` dentro de
   `String(a) === String(b)` no falla: devuelve `false` y esconde el botón en silencio.
   (Categoría: Frontend / Arquitectura.)
2. **Mutar para validar un guard: hazlo DENTRO del contenedor efímero, nunca en el árbol real.**
   El patrón "muto -> confirmo rojo -> `git checkout --`" deja una ventana en la que el working
   tree está corrupto; con un auto-commiteador en el entorno (documentado en este repo) o con otro
   agente trabajando en paralelo, esa ventana puede quedar sellada en un commit. Alternativa de
   coste cero: `docker run --rm <img> sh -c "muta && npx vitest run src/guard.test.js"`. La
   mutación vive y muere en la capa de escritura del contenedor, el host jamás se toca y el
   `git status` no se mueve. Sirve igual para probar fallos de infraestructura (reponer una ruta
   borrada en una lista y ver el ENOENT). (Categoría: Testing / Docker.)

---

## Nota para el líder

El borrado ya está commiteado (`5953b44`, sellado por el auto-commiteador del entorno). Lo que
sigue **sin commitear** son los dos archivos modificados de F36 (`designDebt.test.js`,
`CharacterSheet.jsx`), mezclados en el working tree con `game-packs/stormlight.json` de F34 y con
los `.claude/`. Si se commitea F36, conviene hacerlo con rutas explícitas para no arrastrar el
trabajo en curso de F34.

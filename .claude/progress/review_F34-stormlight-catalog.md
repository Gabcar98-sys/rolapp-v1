# Revisión: F34 — Poblar el catálogo estructurado de Stormlight
Fecha: 2026-08-07
Revisor: reviewer independiente (verificación propia, sin fiarme del reporte)
Veredicto: **APROBADO**

## Checklist CHECKPOINTS.md
- [x] Lint backend EN EL CONTENEDOR: `docker compose run --rm --no-deps backend npm run lint` → **exit 0** (cubre `src scripts`).
- [x] Lint + build frontend vía `docker compose build frontend` → **exit 0** (el stage de build fuerza `npm run lint` y `npm run build`). Lo corrí aunque no hay cambios en `frontend/`.
- [x] Imagen backend al día ANTES de los tests: `docker compose build backend` (CACHE-HIT) + **vigencia probada por sha256 host↔imagen** de 6 archivos (ver abajo). No me apoyé en el cache-hit ni en timestamps.
- [x] Tests: **182 tests / 181 pass / 1 skip preexistente (hybridSearch con vec+FTS) / 0 fail**, exit 0.
- [x] Existe test por módulo público nuevo (`seed-stormlight-catalog.test.js`, 8 casos + cleanup; el aislado da 9/9).
- [x] Caso feliz cubierto (enriquecimiento completo 21/2 → 135/90) y casos de borde/error (sin sistemas → `systemsSeeded = 0` y tabla vacía; sistema ajeno intacto; 2ª corrida no-op).
- [x] `better-sqlite3` **síncrono**: cero `await` sobre sus métodos. El único `async` es `runCatalogSeedCli` por el `import()` dinámico del módulo db — igual que el original de F28.
- [x] **Prepared statements** en todo el seed (`db.prepare(...)`); los nombres de tabla salen de constantes internas (SKILL_TABLES/ITEM_TABLES), nunca de input.
- [x] `session_events` append-only: no aplica (cero cambios en el log).
- [x] Frontend: no aplica (cero archivos de `frontend/` tocados; verificado con `git status frontend/` vacío).
- [x] Nombres descriptivos en inglés; una responsabilidad por función (`ensureFormat` / `ensureFields` / `seedEntities` / `seedCatalogForSystem` / `seedPackCatalog` / `loadPack` / `runCatalogSeedCli`).
- [x] Sin dependencias circulares: los wrappers importan `seed-catalog.js`; `seed-catalog.js` no importa a los wrappers.
- [x] Respeta la estructura de `architecture.md` (scripts en `backend/scripts/`, pack como única fuente de verdad). `architecture.md` no lista los seeds, así que no requiere actualización (mismo criterio que F28/F29).
- [x] Sin dependencias nuevas, sin migraciones, sin endpoints, sin cambios de esquema.
- [x] Sin `console.log` de debug: los `console.log` son la salida intencional del CLI del seed (idéntico patrón a F28).
- [x] Reporte del implementer presente y completo: `.claude/progress/impl_F34-stormlight-catalog.md`.
- [x] Lección propuesta para LEARNINGS.md (3 candidatas).

## Resultado de verificación (entorno canónico Docker)
- **Vigencia por HASH host↔imagen** (coinciden los 6):
  - `56e819fc…` scripts/seed-catalog.js
  - `26a067c0…` scripts/seed-dragonbane-catalog.js
  - `bd2813d3…` scripts/seed-stormlight-catalog.js
  - `363ca513…` scripts/seed-stormlight-catalog.test.js
  - `00fcf092…` scripts/seed-dragonbane-catalog.test.js
  - `bcaf364e…` /app/game-packs/stormlight.json (bind-mount)
  - Dato fuerte: el hash del test de Dragonbane (`00fcf092…`) es **byte a byte el mismo que registró el reporte de F29**. Prueba objetiva e independiente de que ese test NO se tocó.
- **lint backend**: ✅ exit 0
- **build+lint frontend**: ✅ exit 0
- **tests backend**: ✅ 182 (181 pass / 1 skip / 0 fail)
- **tests frontend** (build stage + `npm test`, patrón F20): ✅ **157 tests, 15 archivos, 0 fallos**. Imagen temporal borrada, host limpio.
- **Suite Stormlight aislada**: ✅ 9/9
- **Suite Dragonbane F28/F29 sin editar**: ✅ 9/9

## Verificación independiente de los 9 puntos de riesgo

### 1. Auditoría del trabajo huérfano — REHECHA POR MÍ, y el implementer tiene razón
Extraje los nombres de la fuente y del pack y comparé en **ambas direcciones**, con control positivo y negativo del extractor (lección F35):
- **Talentos**: fuente `03-talentos-y-paths.md` = **90 nombres únicos** (98 `####` + los Key Talents, incluido el caso especial de WARRIOR que trae DOS en una sola cabecera: `Vigilant Stance + End Stance`). Pack = 90.
  `fuente \ pack = 0` y `pack \ fuente = 0`. Control positivo: el extractor sí encuentra `Opportunist`, `Vigilant Stance` y `End Stance`. Control negativo: las Especialidades (`Spy`, `Thief`) NO se cuelan.
- **Acciones**: fuente `02-acciones.md` = **18** por cabeceras `###` y **18** por la tabla "Resumen Rápido de Costes". Pack = 18. Diferencia simétrica cero en ambos sentidos.
  **Dictamen sobre el conflicto 20 vs 18: el implementer tiene razón, la fuente tiene 18.** El "20" del brief era erróneo (el propio implementer lo corrigió en `current.md` explicando que su primer conteo con `awk` había arrastrado los 2 items de "Armas"). Reparto `4 Reaccion / 2 Libre / 12 Estandar` = 18, coherente con la tabla del MD.
- **Caminos Heroicos**: 6 = los 6 `## PATH` (AGENT, ENVOY, HUNTER, LEADER, SCHOLAR, WARRIOR).
- Comprobé además las dos "ausencias" que el reporte declara como fidelidad a la fuente y **son ciertas y benignas**: `Hunter` no tiene la clave `habilidades_recomendadas` (la clave está AUSENTE, no es la cadena "undefined" — el seed no inserta fila alguna); y 7 de 18 acciones tienen `cuando` (el MD solo da "Cuándo/Requisito" en esas 7).
- Barrido extra mío en todo el pack: **0 valores basura** (`undefined`/`null`/`NaN` literales), **0 descripciones vacías**, **0 valores huérfanos** (ningún `values.X` apunta a un field no declarado), **0 duplicados por nombre dentro de cada formato**.

### 2. Legacy intacto — CONFIRMADO contra `git show HEAD:game-packs/stormlight.json`
- Las **21 skills legacy**: mismo orden y nombres; `description`, `attribute` y `tasks` **idénticos a HEAD** una por una; la única clave añadida es `category`, y va **al final** del objeto `values` en las 21. Ninguna clave extra, ninguna desaparecida.
- La `category` es coherente con la categoría del atributo gobernante del propio pack en las 21/21.
- Los **2 items legacy** (`Espada larga`, `Maza pesada`): `JSON.stringify` **exactamente igual** al de HEAD (mismos 4 valores, sin ninguno nuevo), y siguen siendo los primeros del array. Los 4 fields legacy de "Armas" están intactos y en cabeza; los 4 nuevos van al final (aditivo).
- `attributes`, `equipment_slots`, `base_characters`, `mechanics`, `docs`, `description`, `name` y `pack_version`: **idénticos a HEAD**. El diff del pack es 100% aditivo.
- Runtime (DB desechable): tras el seed, `Espada larga` y `Maza pesada` conservan **4 valores exactos** en los DOS sistemas Stormlight.

### 3. Pregens del Puente Nueve — CONFIRMADO, sin colisiones de nombre
- Los 6 `base_characters` (Abena, Jomari, Palinor, Talani, Vedd, Zvynda) están byte a byte como en HEAD, con sus 13 atributos e inventarios.
- **Cero colisiones de nombre entre formatos**: los 135 nombres de skill del pack son únicos globalmente (y los 90 de item también). Es decir, el first-wins de `importGamePack` (`skillIdByName`, `if (!has(name)) set(...)`) ni siquiera llega a desempatar; además "Stormlight Skills" va primero en el array. Todos los `skill_links` resuelven contra el formato legacy.
- El test lo blinda a nivel DB: los links de Abena apuntan a `Stormlight Skills` tras el seed, y el conteo de links por pregen no cambia.

### 4. EL RIESGO GRANDE — el segundo `item_format`: **LEÍDO EN EL CÓDIGO Y CONFIRMADO**
- `frontend/src/pages/ItemsPage.jsx` pide `api.listItemFormats(user.id, systemFilter)` (backend: `SELECT * FROM item_formats WHERE dm_id = ? AND game_system_id = ?`, sin límite) y los pinta con `FormatGroups`, que agrupa por sistema y **mapea TODOS los formatos del grupo** (`group.formats.map(...)`). "Equipo" aparece como una tarjeta más junto a "Armas". **Los 76 items NO quedan invisibles.**
- `frontend/src/components/Character/CharacterSheet.jsx` → `EquipmentTab` (líneas 584-597): lista los formatos del sistema y hace `for (const fmt of formats) { const {format} = await api.getItemFormat(fmt.id); for (const it of format.items) all.push(it) }` → **agrega los items de TODOS los `item_formats`** antes de poblar el `<select>` de equipar. Confirmado.
- El endpoint de equipar (`backend/src/routes/characters.js`, POST `/:id/equipment`) valida el item con `SELECT id FROM item_masters WHERE id = ?`, **sin atarlo a un formato concreto** → equipar desde el segundo formato funciona.
- **Matiz al reporte (no bloqueante):** lo del "chip de filtro por `category` vía `TYPE_FIELD_NAMES`" es cierto para las páginas de HABILIDADES (`SkillsPage` sí tiene chips: Talentos filtrable por camino y Acciones por tipo), pero **`ItemsPage` no tiene chips de filtro**: ahí `TYPE_FIELD_NAMES` solo alimenta la línea de meta de la tarjeta. Y `findField` busca **por nombre, no por posición**, así que poner `category` primero no cambia nada funcionalmente (tampoco estorba). Efecto colateral bueno y real: `cost` cae en `VALUE_FIELD_NAMES`, así que el precio sale con su icono de moneda.
- Ninguno de los dos campos nuevos colisiona con los detectores: `damage_type` no matchea `type` (la comparación es por nombre completo).

### 5. Refactor retrocompatible — CONFIRMADO, y con prueba más fuerte que la del reporte
- `git status` no lista `backend/scripts/seed-dragonbane-catalog.test.js`: **no se tocó**. Y su sha256 (`00fcf092…`) coincide con el registrado en F29.
- `seed-dragonbane-catalog.js` sigue exportando `seedDragonbaneCatalog` y `seedCatalogForSystem`; la entrada documentada `node scripts/seed-dragonbane-catalog.js` corre y sale **exit 0** (probada sobre DB desechable).
- **Mutación mía (MUT C)**: al mutar `seed-catalog.js` dentro de un contenedor efímero, el test VIEJO de Dragonbane se pone en **rojo** (`not ok 4 - es idempotente`). Eso demuestra que el test histórico ejercita de verdad el módulo compartido nuevo — no es un "pasa" vacío.

### 6. Reglas duras del seed — CONFIRMADAS
- Idempotente: 2ª corrida real sobre DB desechable → `+0 skills (+0 valores), +0 items (+0 valores)` en ambos sistemas; ni formatos ni fields duplicados.
- Resuelve por **NOMBRE** (`WHERE name = ?` con `pack.name`) → alcanzó los **2** sistemas Stormlight de 2 DMs distintos en el ensayo.
- Formato por `(game_system_id, name)`, creado si falta; fields **aditivos** por `field_name` con `sort_order` tras los existentes; entidades solo si falta el nombre; valores con `INSERT OR IGNORE`.
- **Cero UPDATE y cero DELETE** en todo `seed-catalog.js` (revisado línea a línea). No crea sistemas (test 8 + verificado). Sin Ollama. Todo síncrono, una transacción por sistema.
- **El "único cambio funcional" declarado (`existingByName.set(...)` tras insertar) es correcto y sin efectos no deseados**: solo actúa si un pack trae dos entidades con el mismo nombre en un formato (hoy ninguno); en ese caso deduplica en vez de insertar dos filas, y los valores del segundo caen en `INSERT OR IGNORE` (gana el primero). No afecta a ningún camino existente.
- **Pero no era el único cambio de comportamiento** (ver Observaciones): también desapareció el fallback `pack.name ?? SYSTEM_NAME` y cambió el texto del log del CLI. Ambos inocuos.

### 7. Conteos de items contra las fuentes — RECONTADOS CON CONTROL POSITIVO
Extractor propio de filas de tabla por sección, con control positivo (`Whetstone` sí aparece en "Herramientas Variadas") y control **negativo** (un patrón de sección inexistente devuelve 0 filas, así que un cero no es un falso "limpio"):
- `04-armas-armaduras.md`: **6 ligeras + 5 pesadas + 6 armaduras**. Diferencia simétrica **cero** contra el pack en las 6 armaduras y en las 11 armas.
- `06-culturas-ancestrias-equipo.md`, sección por sección, diferencia simétrica **cero** en las 9: Médico 5, Venenos 3, Herramientas especiales 17, Iluminación 5, Ropa 3, Alimentos 5, Contenedores 11, Materiales de Escritura 4→3, Herramientas Variadas 18. Total de filas 71.
- Cuadre: **Armas 14** = 2 legacy + 11 de la fuente + 1 `Improvised Weapon`; **Equipo 76** = 6 armaduras + (71 − 1) de la 06.
- **Las dos exclusiones deliberadas están bien decididas:**
  - `Tuning Fork` de "Materiales de Escritura" es una **referencia cruzada**: el mismo objeto ya está en "Herramientas y Objetos Especiales" (lo verifiqué: está en los 17). Incluirlo dos veces habría creado un duplicado por nombre y roto el invariante de "cero duplicados". Bien excluido, sin pérdida de información.
  - **Esferas/gemas** (14 filas entre "Denominaciones base" y "Tipos de gema"): es el sistema de MONEDA, una matriz denominación×gema, no equipo equipable ni inventariable con precio/peso. Bien excluido. Comprobé que no se coló ningún nombre de moneda en el pack (`Unencased Gem (infused)` y `Lantern (sphere)` son objetos reales de las tablas de equipo, no denominaciones).
  - `Improvised Weapon` añadido pese a no tener fila de tabla: la fuente sí le da daño (1d4/1d6 Impact) y rasgos (Dangerous/Fragile); mismo criterio que F29 aplicó a los objetos contundentes de Dragonbane. Correcto.

### 8. Alcance — LIMPIO
`git status` (working tree completo):
- Modificados: `game-packs/stormlight.json`, `backend/scripts/seed-dragonbane-catalog.js`, `.claude/progress/current.md`.
- Nuevos: `backend/scripts/seed-catalog.js`, `seed-stormlight-catalog.js`, `seed-stormlight-catalog.test.js`, `.claude/progress/impl_F34-stormlight-catalog.md`.
- **Cero** en `frontend/`, **cero** en `backend/src/`, **cero** migraciones, `backend/package.json` intacto (cero dependencias), cero cambios en RAG/retrieval.

### 9. Verificación en Docker y ensayo de runtime (DB DESECHABLE, nunca la real)
- `docker compose build backend` ANTES de los tests; como salió CACHE-HIT, la prueba de vigencia fue el `sha256sum` host↔imagen de 6 archivos (todos coinciden).
- **Ensayo en contenedor efímero con `DB_PATH=/tmp/dispo.db` y SIN montar `./data`** (la DB real nunca se abrió): sembré 2 sistemas "Stormlight RPG" (2 DMs) en estado legacy + 1 "Dragonbane" completo, y corrí los CLI:
  - `node scripts/seed-stormlight-catalog.js` → exit 0; `2 sistema(s)`; **+114 skills (+453 valores), +88 items (+342 valores)** por sistema — **coincide exactamente con lo que el reporte predice para la DB del founder**.
  - 2ª corrida → `+0/+0` en ambos.
  - `node scripts/seed-dragonbane-catalog.js` → exit 0 (entrada histórica viva).
  - `node scripts/seed-catalog.js stormlight.json` → exit 0; sin argumento → mensaje de uso + **exit 1**.
  - Estado final: los dos Stormlight en 135 skills / 90 items con `item_formats: Armas, Equipo`; **Dragonbane intacto** en 91/136 y con su único formato `Equipo` (no se le añadió ni un field).
- **Validación por mutación (toda dentro de contenedores efímeros, jamás sobre el árbol real):**
  - MUT A `INSERT OR IGNORE` → `INSERT OR REPLACE`: **rojo el test 6 (idempotencia)**, resto verde.
  - MUT B `.all(pack.name)` → `.slice(0,1)`: **rojo el test 7 (ambos sistemas)**, resto verde.
  - MUT C (mía, extra) mutar `seed-catalog.js` y correr el test VIEJO de Dragonbane: **rojo** → el test histórico cubre de verdad el módulo compartido.
  - MUT D (mía, extra) añadir un valor nuevo al item legacy `Espada larga` en una copia del pack: **7 tests en rojo**. La regresión se detecta (aunque por otra vía: `importGamePack` rechaza un valor sin field declarado al reconstruir el pack legacy del test), así que "no tocar los legacy" es un invariante ejecutable.
- Host limpio al terminar: sin `node_modules` residuales, sin artefactos en `game-packs/`, imagen temporal de frontend borrada. Nada se escribió en el árbol real.

## Lecciones aplicadas correctamente
- **"Enriquecer catálogo existente ≠ importar pack" (F28)**: ✅ seed dedicado que asegura formato+fields e inserta faltantes; `importGamePack` es no-op sobre sistemas existentes.
- **"Seed genérico-por-formato absorbe formatos nuevos data-only" (F29)**: ✅ y llevada más lejos: el formato entero "Equipo" costó cero líneas de lógica, verificado en el ensayo (el seed lo creó solo).
- **"Ingerir por NOMBRE de sistema" (F23)**: ✅ verificado en runtime con 2 DMs.
- **"Seed idempotente sin clobbering" (F25/F28)**: ✅ verificado con 2ª corrida real + mutación.
- **"Reconstruir + probar por HASH" (F21/F22)**: ✅ rehecho por mí con 6 archivos.
- **"Testear con la función REAL" (F22)**: ✅ el test importa el wrapper y ejercita `seedPackCatalog`.
- **"`grep -P` + locale y CONTROL POSITIVO" (F35)**: ✅ el implementer lo aplicó y yo rehíce el censo con mis propios controles positivo y negativo.
- **"Regresión que no rompe el build necesita validación por mutación" (F35)**: ✅ las dos mutaciones declaradas son reales (las reproduje) y añadí dos más.

## Puntos a corregir
Ninguno bloqueante.

## Observaciones (no bloqueantes)
1. **El "único cambio funcional" del refactor son en realidad tres.** Además del `existingByName.set(...)` (correcto), desapareció el fallback `pack.name ?? SYSTEM_NAME` del viejo `seedDragonbaneCatalog` — ahora `seedPackCatalog` **lanza** si el pack no trae `name`. Es un cambio de comportamiento en un borde no cubierto por tests, y de hecho es MÁS seguro (antes, un pack sin nombre pasado al wrapper de Dragonbane habría sembrado los sistemas Dragonbane con datos ajenos). También cambió el texto del log del CLI (`Seed catálogo <pack.name> — N sistema(s)`, sin el nombre entre comillas). Ninguno rompe nada; solo conviene que el reporte no diga "único".
2. **`ItemsPage` no tiene chips de filtro.** El argumento de "poner `category` primero para el chip" solo aplica a `SkillsPage` (Talentos/Acciones sí quedan filtrables por camino/tipo, que es una ganancia real). En Items, `category` alimenta la línea de meta de la tarjeta. Además `findField` resuelve por nombre, no por posición. Si el founder quiere filtro por sección en Items (76 objetos en 9 categorías), hoy hace falta código de frontend: candidato natural a feature pequeña.
3. **`item_formats` se listan `ORDER BY created_at DESC`**, así que en la página de Items el formato "Equipo" (creado por el seed) aparecerá ANTES que "Armas". Es cosmético y no es culpa de F34, pero conviene saberlo al verificar en la app.
4. **Mezcla de idioma en los nombres de field**: "Armas"/"Equipo" usan inglés (`governing_skill`, `damage_type`, `weight`, `cost`, `deflect`) y los formatos de skills español (`talento_clave`, `activacion`, `prerequisito`, `coste`, `cuando`). Es coherente con lo legacy de cada formato y con lo que hizo F29 en Dragonbane, pero son etiquetas que el DM ve en la UI: si el founder quiere unificar, es un cambio de datos.
5. **Hallazgos de datos que el implementer NO corrigió y me parece bien que no lo hiciera** (quedan como decisión del founder, todos documentados en su reporte): `Thievery`/`Survival` con atributo divergente del MD; el pack legacy tiene 21 skills donde el MD lista 18; la `description` del formato dice "Las 15 habilidades documentadas" cuando hay 21 (y el seed nunca hace UPDATE de descripciones, así que cambiarlo en el pack solo afectaría a instalaciones nuevas → divergencia silenciosa pack↔DB); y la redundancia `Espada larga`≈`Longsword` / `Maza pesada`≈`Hammer`, inevitable porque los legacy no se pueden borrar ni renombrar.
6. **Fuera del scope declarado pero no es código**: `.claude/progress/current.md` (+59 líneas) está modificado y no aparece en la lista de archivos del reporte; y hay dos docs sin trackear en `.claude/docs/` (`online_deployment.md`, `rolapp_lite_prompt.md`) que vienen de la sesión de exploración "¿qué tan difícil sería tenerla en línea?", ajenos a F34. Nada de esto toca `backend/`, `frontend/` ni `game-packs/`, así que no es violación de alcance de código.
7. **El test cubre el borde "sin sistemas" pero no la rama que lanza** (`pack` sin `name`). Un `assert.throws` de 2 líneas cerraría el único camino no ejercitado de `seed-catalog.js`.

## Candidatos para LEARNINGS.md (para que el líder evalúe)
- **Respaldo las tres del implementer**, en especial la primera y la segunda:
  1. *Auditar antes de construir sobre trabajo previo sin commitear: la prueba es la DIFERENCIA SIMÉTRICA contra la fuente.* La rehíce por mi cuenta y funcionó exactamente igual; además destapó que el conteo del encargo (20 acciones) era erróneo y la fuente tiene 18. Añadiría al checklist: verificar que las entidades legacy son **`JSON.stringify`-idénticas a `git show HEAD:archivo`**, que no hay **colisiones de nombre ENTRE formatos** (críticas si algo resuelve por nombre con first-wins) y un **barrido de valores basura** (`"undefined"`/`"null"` literales), que es el modo típico en que un generador de datos deja una cadena fea que la UI pinta tal cual.
  2. *Cuando la única diferencia entre dos scripts son 2 constantes, extrae el cuerpo y deja wrappers — y usa el test viejo SIN TOCARLO como prueba del refactor.* Complemento del reviewer: "el test viejo pasa" solo prueba retrocompatibilidad si además **muta el módulo nuevo y confirma que ese test se pone en rojo**; si no, podría estar pasando por caminos que ya no se ejecutan. Y el `sha256sum` del test viejo comparado con el que registró la feature anterior es la forma barata de demostrar que no se editó.
  3. *Un formato nuevo es más barato que un nombre mentiroso* — con el matiz de que la afirmación "cero coste de frontend" hay que **probarla leyendo los tres consumidores** (la página que agrupa por formato, el agregador de la ficha y el endpoint que valida al equipar), porque si uno de ellos tomara solo el primer formato, N objetos quedarían invisibles sin romper lint, build ni tests. Aquí los tres pasan la prueba.
- **Propuesta propia:** *Añadir una entidad a un catálogo cuyo formato ya existe SÍ toca a los DM que ya lo editaron; añadir un FORMATO nuevo no.* El seed inserta valores también para entidades preexistentes (así es como las 21 skills legacy reciben `category`), así que la promesa de "no tocar lo legacy" no la garantiza el código: la garantiza el DATO (que el pack no declare valores nuevos para esas entidades) más un assert que cuente los valores (`size === 4`). Al revisar un seed aditivo, comprobar la promesa en el pack, no en el script.

## Verificación de runtime que queda para el líder (no es código)
- `docker compose exec backend node scripts/seed-stormlight-catalog.js` contra la DB real (NO requiere Ollama). Esperado, ya reproducido por mí en DB desechable: `2 sistema(s)` y por cada uno `+114 skills (+453 valores), +88 items (+342 valores)`.
- En la app, para los dos DMs: **Habilidades** de Stormlight con 4 formatos (Stormlight Skills 21 / Caminos Heroicos 6 / Talentos 90 filtrable por camino / Acciones 18) e **Items** con 2 formatos (Equipo 76 y Armas 14 — en ese orden por `created_at DESC`).

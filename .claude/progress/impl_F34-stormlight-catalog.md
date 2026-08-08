# Implementación: F34 — Poblar el catálogo estructurado de Stormlight
Fecha: 2026-08-07
Status: completado

## Resumen

Stormlight pasa de **21 skills / 2 items** a **135 skills / 90 items** en el pack, simétrico a lo
que F28/F29 hicieron con Dragonbane (91 / 136). La fuente de verdad sigue siendo
`game-packs/stormlight.json`. La lógica del seed se **extrajo** a un `scripts/seed-catalog.js`
genérico parametrizado por pack; `seed-dragonbane-catalog.js` queda como wrapper de CLI
retrocompatible y se añade `seed-stormlight-catalog.js` con el mismo patrón.

Conteos finales del pack:

| Formato | Tipo | Entidades | Estado |
|---|---|---|---|
| Stormlight Skills | skills | 21 | legacy, intacto + field `category` (aditivo) |
| Caminos Heroicos | skills | 6 | ya estaba en el working tree (auditado) |
| Talentos | skills | 90 | ya estaba en el working tree (auditado) |
| Acciones | skills | 18 | ya estaba en el working tree (auditado) |
| **Armas** | items | **14** | **2 legacy intactos + 11 de la fuente + 1 improvisada** |
| **Equipo** | items | **76** | **NUEVO: 6 armaduras + 70 de equipo** |

---

## 1. Auditoría del trabajo previo sin commitear

`game-packs/stormlight.json` llegaba modificado en el working tree (+173/−22 sobre HEAD),
sin reporte de origen. **Lo audité antes de tocar nada** (script de auditoría desechable ejecutado
en el contenedor, contrastando el JSON contra `02-acciones.md` y `03-talentos-y-paths.md`).

**Veredicto: el trabajo previo es correcto y lo conservé íntegro. No hubo que corregir nada.**

Qué comprobé y qué encontré:

- **JSON válido**, `name = "Stormlight RPG"`, `pack_version = "1.0"`. ✅
- **El diff es 100 % aditivo.** Las 23 líneas que git marca como eliminadas son las 21 skills
  legacy reescritas para añadirles `"category"` (más la coma del field `tasks`). Verifiqué línea
  a línea que `name`, `description`, `attribute` y `tasks` de las 21 skills son **idénticos** a
  HEAD. No se borró ni renombró nada.
- **`Talentos` = 90 y coincide EXACTAMENTE con la fuente.** `03-talentos-y-paths.md` tiene 98
  entradas `####` + 5 `### Key Talent:` = 103 apariciones, que colapsan en **90 nombres únicos**
  (9 talentos aparecen en 2–3 caminos). Diferencia simétrica pack↔fuente: **cero en ambos
  sentidos** (ni faltan ni sobran nombres). Reparto por camino: Agent 13, Envoy 13, Hunter 13,
  Leader 13, Scholar 15, Warrior 14, Compartido 9 → 81 propios + 9 compartidos = 90. ✅
- **`Acciones` = 18 y coincide EXACTAMENTE con `02-acciones.md`** (diferencia simétrica cero).
  ⚠️ El brief decía "20 acciones": **la fuente tiene 18**, así que el 20 era un dato erróneo del
  encargo, no un defecto del pack. Confirmado además contra la tabla "Resumen Rápido de Costes"
  del propio MD.
- **`Caminos Heroicos` = 6** = los 6 `## PATH` de la fuente (AGENT, ENVOY, HUNTER, LEADER,
  SCHOLAR, WARRIOR), con su Key Talent y especialidades correctos.
- **Cero duplicados por nombre** dentro de cada formato y **cero colisiones de nombre entre
  formatos** (importante: `importGamePack` resuelve `skill_links` por nombre con first-wins, y
  "Stormlight Skills" va primero en el array → los pregens nunca podrían engancharse a un talento
  homónimo; además no hay ninguno).
- **Cero fields huérfanos** (ningún `values.X` apunta a un field no declarado). Dos ausencias que
  **NO son defectos**, son fidelidad a la fuente: `Hunter` sin `habilidades_recomendadas` (el MD
  no las lista para ese camino) y 11 de 18 acciones sin `cuando` (el MD solo da "Cuándo/Requisito"
  en 7).
- **`base_characters` intactos**: los 6 pregens del Puente Nueve, 13 attrs cada uno, todos sus
  `skill_links` resuelven contra las 21 skills legacy. `item_formats` intacto (2 items).

### Hallazgos que NO corregí (y por qué) — para decisión del founder

1. **Dos atributos legacy divergen de `01-mecanicas-core.md`.** El MD clasifica `Thievery` como
   SPD (física) y `Survival` como AWA (espiritual); el pack legacy las tiene con `Intellect` y
   `Willpower`. La corrida previa derivó `category` del **atributo del propio pack** (regla que es
   la del MD: la categoría de una skill = la categoría de su atributo gobernante), así que
   quedaron "cognitiva" las dos. Mantuve ese criterio porque es el único internamente consistente
   con la columna `attribute` que se ve al lado en la ficha, y **no toqué los `attribute` legacy**
   (regla del encargo). Corregirlos es un cambio de datos de 2 líneas si el founder lo quiere.
2. **El pack legacy tiene 21 skills, no las 18 del MD**: añade `Trickery`, `Influence` y
   `Performance`. Sus categorías sí son coherentes con su atributo. Se conservan tal cual.
3. **La `description` del formato "Stormlight Skills" dice "Las 15 habilidades documentadas"**
   cuando hay 21. Es texto legacy de HEAD. No lo toqué: el seed **nunca hace UPDATE de
   descripciones**, así que cambiarlo en el pack solo afectaría a instalaciones nuevas y crearía
   una divergencia silenciosa pack↔DB. Queda anotado.
4. **Redundancia conceptual legacy en items**: `Espada larga` ≈ `Longsword` y `Maza pesada` ≈
   `Hammer`. No puedo borrar ni renombrar los legacy (regla dura), así que conviven. Los legacy
   además usan `damage` con rasgos inventados ("Versatil", "Pesada") que no existen en la fuente.

---

## 2. Trabajo hecho

### 2.1 Items (el hueco grande)

**Decisión: un SEGUNDO `item_format` llamado "Equipo", + fields aditivos en "Armas".**
Justificación (criterio F28/F29):

- La lección de **F29** ("un seed genérico-por-formato absorbe formatos nuevos sin tocar código")
  hace que un formato entero nuevo sea **puramente datos**: el seed lo crea por
  `(game_system_id, name)` sin cambio de lógica. Coste de código: cero.
- El formato legacy se llama literalmente **"Armas"**. Meter ahí `Soap`, `Blanket` o
  `Paper or Parchment` sería semánticamente falso y la regla dura impide renombrarlo. Dragonbane
  pudo usar un único formato porque el suyo ya se llamaba "Equipo" (genérico); aquí no.
- Los **conjuntos de fields son genuinamente distintos**: armas necesitan
  `governing_skill/damage/damage_type`; el equipo necesita `deflect/cost/weight`. Un formato único
  dejaría ~76 items con 4 campos de arma vacíos.
- **Cero coste en frontend** (verificado leyendo el código, sin tocarlo): `ItemsPage` agrupa por
  formato igual que `SkillsPage` hace con "Habilidades"+"Magia", y `CharacterSheet`
  (`EquipmentTab`) **agrega los items de TODOS los `item_formats` del sistema** antes de poblar el
  selector de equipar. Un segundo formato aparece solo.
- `category` va **primero** en "Equipo" para que el chip de filtro de la UI lo tome vía
  `TYPE_FIELD_NAMES` (lección F29). En "Armas" ya era el primero.

**"Armas" (14 items).** Fields aditivos al final, sin tocar los 4 existentes:
`damage_type`, `expertise_traits`, `weight`, `cost`.
- 2 legacy (`Espada larga`, `Maza pesada`): **byte a byte intactos**, sin valores nuevos.
- 6 armas ligeras + 5 pesadas de `04-armas-armaduras.md` (`category` = `light`/`heavy`, los
  mismos valores que ya usaban los legacy).
- 1 `Improvised Weapon` (`category: improvised`): la fuente le da daño/tipo/rasgos, mismo criterio
  que F29 usó con los "Objeto contundente ligero/pesado" de Dragonbane.

**"Equipo" (76 items, formato nuevo).** Fields:
`category, cost, weight, deflect, traits, expertise_traits`.

| `category` | N | Fuente |
|---|---|---|
| Armadura | 6 | 04-armas-armaduras.md |
| Medico y supervivencia | 5 | 06 § Equipo Médico y de Supervivencia |
| Veneno | 3 | 06 § Venenos |
| Herramienta especial | 17 | 06 § Herramientas y Objetos Especiales |
| Iluminacion | 5 | 06 § Iluminación |
| Ropa | 3 | 06 § Ropa |
| Alimento y bebida | 5 | 06 § Alimentos y Bebidas |
| Contenedor y transporte | 11 | 06 § Contenedores y Transporte |
| Material de escritura | 3 | 06 § Materiales de Escritura (la 4ª fila, `Tuning Fork`, es una referencia cruzada a Herramientas — no se duplica) |
| Herramienta variada | 18 | 06 § Herramientas Variadas |

Convenciones aplicadas:
- **Nombres en inglés canónico de la fuente** (`Knife`, `Rope (50 feet)`, `Poison (potent, 1 dose)`),
  igual que las 21 skills legacy y que los inventarios de los pregens. Sin traducciones inventadas.
- **Las reglas de cada objeto van en la `description`** (columna nativa), como F28/F29 hicieron con
  el "efecto". Los fields quedan para lo tabular.
- **Sin acentos ni ñ**, respetando la convención ASCII de todo el pack.
- `equippable`: `true` en todas las armas y las 6 armaduras; `false` en consumibles, herramientas
  y contenedores. (Es informativo: el selector de equipar no filtra por esa bandera.)
- **No añadí las esferas/gemas** de `06 § Sistema de Moneda`: son moneda, no equipo, y son una
  matriz 10×3. Exclusión deliberada.

### 2.2 Seed: generalizado, no duplicado

**Decisión: SÍ generalizar.** Lo único específico del juego en `seed-dragonbane-catalog.js` eran
`SYSTEM_NAME` y `PACK_FILE`; el resto ya iteraba todos los formatos del pack. Duplicar 220 líneas
para Stormlight habría creado dos copias que divergen.

- **`scripts/seed-catalog.js` (nuevo)** — toda la lógica, parametrizada por pack. Exporta
  `seedPackCatalog(db, pack)`, `seedCatalogForSystem(db, gsId, dmId, pack)`, `loadPack`,
  `resolveGamePacksDir`, `runCatalogSeedCli(packFile)` e `isInvokedDirectly(url)`. También es
  invocable directo: `node scripts/seed-catalog.js <pack.json>`.
- **`scripts/seed-dragonbane-catalog.js`** — reducido a wrapper de 26 líneas. **Retrocompat dura
  cumplida**: `docker compose exec backend node scripts/seed-dragonbane-catalog.js` sigue
  funcionando idéntico, y sigue exportando `seedDragonbaneCatalog` / `seedCatalogForSystem`, así
  que **`seed-dragonbane-catalog.test.js` pasa sin tocar una sola línea** — esa es la prueba
  objetiva de que el refactor no rompió F28/F29.
- **`scripts/seed-stormlight-catalog.js` (nuevo)** — wrapper simétrico.
  Entrada: `docker compose exec backend node scripts/seed-stormlight-catalog.js`.

**Reglas de seguridad (todas verificadas por test):** idempotente; sistemas resueltos por
**NOMBRE** (`WHERE name = 'Stormlight RPG'` → alcanza los systems 3 y 5 y a todos los DMs);
formato por `(game_system_id, name)` y creado si falta; fields **aditivos** por `field_name`;
entidades insertadas solo si no existe una con ese nombre; valores con `INSERT OR IGNORE` sobre el
`UNIQUE(entity, field)`; **cero UPDATE, cero DELETE**; una transacción por sistema; **sin Ollama**,
todo síncrono con better-sqlite3.

Único cambio funcional respecto al original: `seedEntities` ahora hace
`existingByName.set(ent.name, entId)` tras insertar. Protege contra un pack con dos entidades del
mismo nombre en un formato (habría insertado duplicados). Es defensivo; hoy ningún pack lo tiene.

---

## Archivos creados
- `backend/scripts/seed-catalog.js`: lógica genérica e idempotente del seed de catálogo,
  parametrizada por pack. Reemplaza el cuerpo duplicable de `seed-dragonbane-catalog.js`.
- `backend/scripts/seed-stormlight-catalog.js`: punto de entrada CLI para `stormlight.json`.
- `backend/scripts/seed-stormlight-catalog.test.js`: 8 tests + cleanup (`node:test`).

## Archivos modificados
- `game-packs/stormlight.json`:
  - `item_format "Armas"`: +4 fields aditivos (`damage_type`, `expertise_traits`, `weight`,
    `cost`) y +12 items (11 de la fuente + `Improvised Weapon`). Los 2 legacy sin tocar.
  - `item_format "Equipo"` NUEVO: 6 fields, 76 items.
  - (Los 3 `skill_formats` nuevos y el field `category` venían del working tree; auditados y
    conservados sin cambios.)
- `backend/scripts/seed-dragonbane-catalog.js`: reducido a wrapper de CLI sobre `seed-catalog.js`.
  Comportamiento y exports públicos idénticos.

## Tests escritos
`backend/scripts/seed-stormlight-catalog.test.js` — parte de un pack "legacy" (estado F10:
21 skills sin `category`, 2 items, sin los formatos nuevos) importado con `importGamePack` sobre
una DB `:file:` aislada, y ejercita la **función real**:

1. **Enriquecimiento completo**: 21/2 → totales del pack (135/90) y por formato
   (21 / 6 / 90 / 18 skills; 14 / 76 items).
2. **`category` aditivo**: orden final `[attribute, tasks, category]`, valores legacy intactos,
   category correcta por eje (fisica/cognitiva/espiritual), cero skills duplicadas.
3. **Caminos / Talentos / Acciones**: orden exacto de fields (con `category` primero en Talentos y
   Acciones), los 6 caminos con su talento clave, los 90 talentos repartidos 13/13/13/13/15/14/9,
   el efecto en la `description`, y las acciones por tipo (4 reacción / 2 libre / 12 estándar).
4. **Armas + Equipo**: fields aditivos al final; **los 2 items legacy conservan EXACTAMENTE sus 4
   valores** (assert de `size === 4`); armas por categoría; 6 armaduras con `deflect`; 9 items de
   equipo muestreados de secciones distintas; cero duplicados de nombre en todo el catálogo.
5. **Pregens del Puente Nueve**: los 6 sobreviven al seed con el mismo número de `skill_links`,
   sus enlaces siguen apuntando al formato "Stormlight Skills" (no a talentos), e inventario intacto.
6. **Idempotencia real**: 2ª corrida → 0 insertados, 0 valores, mismos conteos, y **tampoco se
   duplican formatos ni fields**.
7. **Alcanza los DOS sistemas Stormlight** (2 DMs) y **no toca Dragonbane** (mismos conteos, sin
   formatos nuevos, fields de su "Armas" sin ampliar).
8. **No crea sistemas**: sin sistemas previos, `systemsSeeded = 0` y la tabla queda vacía.

**Validación por MUTACIÓN** (los tests no pasan por casualidad). Con dos mutaciones simultáneas en
`seed-catalog.js` — `INSERT OR IGNORE` → `INSERT OR REPLACE`, y `.all(pack.name)` →
`.all(pack.name).slice(0,1)` — rebuild y re-run: **test 6 (idempotencia) y test 7 (ambos sistemas)
en ROJO**, el resto verde. Mutaciones revertidas y hash re-verificado.

## Resultado de verificación (entorno canónico Docker)

`docker compose build backend` ejecutado ANTES de los tests (lección F21/F22).

**Vigencia por HASH host↔imagen** (`sha256sum`, coinciden los 5):
```
56e819fc… scripts/seed-catalog.js
26a067c0… scripts/seed-dragonbane-catalog.js
bd2813d3… scripts/seed-stormlight-catalog.js
363ca513… scripts/seed-stormlight-catalog.test.js
bcaf364e… /app/game-packs/stormlight.json   (bind-mount)
```

- **lint** — `docker compose run --rm --no-deps backend npm run lint` → **exit 0** ✅ (cubre `src scripts`)
- **build frontend** — **No aplica**: cero cambios en `frontend/` (hay un reviewer en F36 en
  paralelo; no toqué nada ni lancé builds de frontend). `git status frontend/` sale vacío.
- **test** — `docker compose run --rm --no-deps backend npm test` → **exit 0**:
  **182 tests, 181 pass, 1 skip (preexistente: `hybridSearch` con vec/FTS activos), 0 fail** ✅
  - Suite Stormlight aislada: **9/9** ✅
  - Suite Dragonbane (F28/F29) **sin modificar**: pasa ✅ (prueba del refactor retrocompatible)
- **CLI (contra DB desechable `/tmp`, NUNCA la real)**:
  - `node scripts/seed-stormlight-catalog.js` → exit 0
  - `node scripts/seed-dragonbane-catalog.js` → exit 0 (entrada documentada intacta)
  - `node scripts/seed-catalog.js stormlight.json` → exit 0; sin argumento → uso + exit 1
- **Ensayo del seed sobre DB desechable** reproduciendo la DB del founder (2 sistemas Stormlight +
  1 Dragonbane): `systemsSeeded: 2`; por sistema **+114 skills (+453 valores), +88 items
  (+342 valores)**; conteos finales 21/6/90/18 skills y 14/76 items en AMBOS; Dragonbane sin tocar
  (21/2); 2ª corrida: todo en 0.
- **Integridad del pack** (auditoría re-ejecutada sobre el archivo final): JSON válido, cero
  duplicados, cero fields huérfanos, cero colisiones entre formatos, diferencia simétrica cero
  contra las fuentes de talentos y acciones.
- **Censo de las fuentes de items con CONTROL POSITIVO** (lección F35: `LC_ALL=en_US.UTF-8` +
  exit codes): 6 armas ligeras + 5 pesadas + 6 armaduras en `04`; 5+3+17+5+3+5+11+4+18 filas en las
  secciones de Equipo de `06`. Control positivo (`grep -P '^\| Whetstone'` → exit 0) y control
  negativo (patrón inexistente → exit 1) confirman que el patrón funciona, no que el archivo esté
  vacío. Los conteos cuadran con 14 y 76.
- **Host limpio**: sin `node_modules` residual en `backend/`, `frontend/` ni raíz; sin archivos
  temporales en `game-packs/`.

## Lecciones aplicadas
- **"Enriquecer catálogo existente ≠ importar pack" (F28)**: `importGamePack` es no-op sobre los
  sistemas Stormlight ya creados → seed dedicado que asegura formato+fields e inserta faltantes.
- **"Seed genérico-por-formato absorbe formatos nuevos data-only" (F29)**: gracias a eso, meter
  "Equipo" como formato entero nuevo costó **cero líneas de lógica** y cero frontend. También me
  llevó a poner `category` como primer field de "Equipo" para el chip de filtro.
- **"Ingerir por NOMBRE de sistema" (F23)**: `WHERE name = 'Stormlight RPG'` → systems 3 y 5, todos
  los DMs. Cubierto por el test de ambos sistemas.
- **"Seed idempotente sin clobbering" (F25/F28)**: por nombre + `INSERT OR IGNORE`, jamás
  UPDATE/DELETE.
- **"better-sqlite3 síncrono"**: todo el seed es síncrono; no requiere Ollama.
- **"Reconstruir + probar por hash" (F21/F22)**: rebuild antes de testear y `sha256sum` host↔imagen
  de los 5 archivos.
- **"Testear con la función REAL" (F22)**: los tests importan el wrapper de Stormlight y ejercitan
  `seedPackCatalog` sobre DB aislada.
- **"`grep -P` + locale y control positivo" (F35)**: aplicado al censo de las tablas fuente de items.
- **"Regresión que no rompe el build necesita validación por mutación" (F35)**: los dos asserts
  críticos (idempotencia, alcance a los 2 sistemas) se validaron por mutación.

## Decisiones tomadas
1. **Conservar íntegro el trabajo previo del working tree** tras auditarlo contra las fuentes
   (diferencia simétrica cero en talentos y acciones). No había nada que corregir.
2. **Segundo `item_format` "Equipo"** en vez de inflar "Armas" — justificado arriba (§2.1).
3. **Armaduras en "Equipo"**, no en "Armas": armadura es equipo, se pone en el slot `armor`, y su
   field discriminante (`deflect`) no tiene sentido en un formato de armas.
4. **Generalizar el seed** a `seed-catalog.js` con wrappers por juego, en vez de duplicar el script.
5. **Nombres de items en inglés canónico de la fuente**; reglas en la `description`; ASCII sin
   acentos.
6. **No añadir valores a los 2 items legacy** pese a que `INSERT OR IGNORE` sería inocuo: el
   encargo dice explícitamente que no se tocan. El test lo blinda (`size === 4`).
7. **Esferas/gemas excluidas** (moneda, no equipo).
8. **Sin dependencias nuevas.** Sin migraciones. Sin endpoints. Sin cambios en RAG/retrieval.
   Sin frontend.

## Candidatos para LEARNINGS.md
- **Auditar antes de construir sobre trabajo previo sin commitear: la prueba es la DIFERENCIA
  SIMÉTRICA contra la fuente, no "parece completo".** Ante un working tree modificado por una
  corrida que murió sin reporte, el chequeo barato y concluyente es extraer los nombres de la
  fuente y del pack y comparar en AMBAS direcciones (`fuente \ pack` y `pack \ fuente`); ambos
  vacíos = fidelidad probada. Complétalo con: JSON parseable, duplicados por nombre dentro de cada
  formato, colisiones de nombre ENTRE formatos (críticas si algo resuelve por nombre con
  first-wins, como `base_character.skill_links`), `values` que apunten a fields no declarados, y
  que las entidades legacy sean idénticas a `git show HEAD:archivo`. En F34 esto convirtió "173
  líneas de procedencia desconocida" en "auditado y aceptado" en una sola pasada, y de paso
  detectó que **el conteo del encargo (20 acciones) era erróneo: la fuente tiene 18**.
- **Cuando la única diferencia entre dos scripts son 2 constantes, extrae el cuerpo y deja
  wrappers — y usa el test viejo SIN TOCARLO como prueba del refactor.** `seed-dragonbane-catalog.js`
  y su gemelo de Stormlight solo diferían en `SYSTEM_NAME`/`PACK_FILE`. Al mover la lógica a
  `seed-catalog.js` y dejar wrappers de ~25 líneas que re-exportan los nombres históricos, el
  `seed-dragonbane-catalog.test.js` de F28/F29 pasa **sin editar una línea**: eso es evidencia
  objetiva de retrocompatibilidad, mucho más fuerte que releer el diff. Regla: si al refactorizar
  tienes que tocar el test viejo, no era un refactor.
- **Un formato nuevo es más barato que un nombre mentiroso.** Con un seed genérico-por-formato,
  añadir un `item_format`/`skill_format` entero cuesta cero código. Cuando el formato legacy tiene
  un nombre estrecho que no puedes renombrar ("Armas") y los fields del contenido nuevo son
  distintos, añade un formato en vez de estirar el viejo: la UI ya agrupa por formato
  (`ItemsPage`) y la ficha agrega todos los formatos del sistema (`CharacterSheet.EquipmentTab`),
  así que no hay coste de frontend.

## Verificación pendiente del líder (runtime, no código)
- Correr contra la DB real (NO requiere Ollama):
  `docker compose exec backend node scripts/seed-stormlight-catalog.js`
  Esperado: `2 sistema(s)`, y por cada uno `+114 skills (+453 valores), +88 items (+342 valores)`.
- Revisar en la app, para los dos DMs: **Habilidades** de Stormlight con 4 formatos
  (Stormlight Skills 21 / Caminos Heroicos 6 / Talentos 90 filtrable por camino / Acciones 18) e
  **Items** con 2 formatos (Armas 14 / Equipo 76 filtrable por sección).

## Bloqueantes
Ninguno.

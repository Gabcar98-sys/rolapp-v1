# Implementación: F28 — Poblar catálogo de Dragonbane (habilidades + items)
Fecha: 2026-07-23
Status: completado

## Resumen
Dragonbane pasó de 6 skills / 2 items a un catálogo completo derivado de los MDs
estructurados de la v0: **35 habilidades** y **61 items**. Fuente de verdad reproducible en
`game-packs/dragonbane.json`; seed dedicado idempotente que enriquece por NOMBRE de sistema
(alcanza los systems 4 y 6 y a TODOS los DMs) sin duplicar ni tocar sistemas ajenos.

## Archivos creados
- `backend/scripts/seed-dragonbane-catalog.js`: seed idempotente del catálogo. Busca todos
  los `game_system_templates WHERE name='Dragonbane'`, asegura los formatos "Habilidades" y
  "Equipo" + sus fields (aditivo por field_name), e inserta skills/items faltantes por nombre
  con sus valores de fields dinámicos. Exporta `seedDragonbaneCatalog(db, pack)` y
  `seedCatalogForSystem(db, gsId, dmId, pack)` para testeo directo (patrón F22). Todo síncrono
  (no usa embeddings/Ollama). CLI corre `main()` solo si se invoca directo.
- `backend/scripts/seed-dragonbane-catalog.test.js`: 6 tests + cleanup (node:test).

## Archivos modificados
- `game-packs/dragonbane.json`: enriquecido como fuente de verdad.
  - `skill_format` "Habilidades": fields `attribute, category, type, notes` (añadí `type` y
    `notes`, aditivos). 35 skills = 6 legacy preservadas + 29 nuevas de la fuente (Sigilo se
    dedup por nombre; se respeta el nombre canónico de la fuente). Mapeo DRB→pack:
    FUE→Fuerza, AGI→Destreza, INT→Inteligencia, CAR→Carisma. Las 6 legacy recibieron
    valores razonables de `type`/`notes`; `Concentracion` mantiene su atributo Voluntad
    (skill existente que no viene de la lista fuente, se preserva).
  - `item_format` "Equipo": fields `weight, cost` (existentes) + `availability, type, grip,
    str_req, range, damage, durability, armor`. 61 items = 2 legacy (Espada, Antorcha,
    intactos, referenciados por `base_characters`) + armaduras (6) + armas c/c (24) + armas a
    distancia (6) + fuentes de luz (5) + herramientas/equipo/medicina clave (18).

## Tests escritos
- `backend/scripts/seed-dragonbane-catalog.test.js`:
  - Enriquece un sistema "casi vacío" (import legacy de 6 skills/2 items) hasta el catálogo
    completo del pack (35/61) y añade los fields nuevos al formato.
  - Mapeo de atributos DRB correcto (Espadas→Fuerza, Arcos→Destreza, Alerta→Inteligencia,
    Enganar→Carisma) y category general vs arma.
  - Rellena `type`/`notes` en las 6 skills legacy sin duplicar (Sigilo queda con 1 fila).
  - Idempotencia: 2ª corrida = mismo estado, 0 inserciones, valores no duplicados.
  - Alcanza AMBOS sistemas Dragonbane (2 DMs) y NO toca un sistema ajeno ("Stormlight RPG").
  - No crea el sistema si no existe (solo enriquece).

## Resultado de verificación (entorno canónico Docker; imagen backend reconstruida)
- Currency por HASH host↔imagen (script y test): ✅ coinciden.
- lint (`docker compose run --rm --no-deps backend npm run lint`): ✅ exit 0.
- build: No aplica (no se tocó frontend).
- test (`npm test`, suite completa): ✅ 158 tests, 157 pass, 1 skip (preexistente), 0 fail.
  El test del catálogo solo: ✅ 7/7.

## Lecciones aplicadas
- "Los docs de reglas son contenido compartido: ingerir por NOMBRE de sistema" (F23): el seed
  opera por `WHERE name='Dragonbane'`, no por `--dm`, así alcanza los systems 4 y 6 y todos
  los DMs. Verificado con el test de "ambos sistemas".
- "Seed idempotente = reset por marcador / no clobbering" (F25): idempotencia por nombre de
  entidad + `INSERT OR IGNORE` sobre el UNIQUE(entity, field), sin UPDATE ni DELETE → nunca
  sobrescribe ediciones del DM ni duplica.
- "better-sqlite3 es síncrono" (arquitectura): todo el seed es síncrono; catálogo no necesita
  embeddings, corre sin Ollama.
- "El servicio backend no monta src/: reconstruir + probar por hash" (F21/F22): reconstruí la
  imagen y confirmé vigencia por sha256 host↔imagen antes de testear.
- "Para testear idempotencia real, exporta las funciones" (F22): exporté
  `seedDragonbaneCatalog`/`seedCatalogForSystem` y el test ejercita la función real sobre una
  DB `:file:` aislada.

## Decisiones tomadas
- **Script dedicado en vez de extender seed-examples.js.** `importGamePack` solo puebla
  skills/items al CREAR un sistema nuevo; los sistemas Dragonbane ya existen → el import es
  no-op para el catálogo. Por eso un script dedicado con el patrón "asegurar formato+fields,
  luego insertar faltantes por nombre" es el camino idempotente correcto. El pack sigue siendo
  la fuente de verdad: el seed lee el JSON (DRY), no hardcodea datos.
- **Añadí fields `type` y `notes`** al formato "Habilidades" para no perder el tipo de uso ni
  las notas mecánicas de la fuente. Aditivo (sort_order tras los existentes). Rellené `type`/
  `notes` también en las 6 skills legacy.
- **Añadí 8 fields de arma/equipo** al formato "Equipo" (availability, type, grip, str_req,
  range, damage, durability, armor). El "efecto" de herramientas/armaduras va en la
  `description` del item (columna nativa `item_masters.description`), evitando un field extra.
  Retrocompatible: `weight`/`cost` y los items Espada/Antorcha intactos → los `base_characters`
  que los referencian por nombre no se rompen.
- **`weight` de armas/armaduras aproximado** (1M→"1", 2M→"2"; armaduras 1–3): la fuente no
  lista peso para armas/armaduras y el sistema de carga de Dragonbane cuenta items, no kg.
  Documentado por si el founder quiere ajustar.
- Sin dependencias nuevas.

## Candidatos para LEARNINGS.md
- **Enriquecer catálogo de un sistema YA existente ≠ importar un pack.** `importGamePack` solo
  puebla al crear el sistema; para rellenar skills/items en sistemas existentes (varios, uno
  por DM) hace falta un seed dedicado que (1) asegure el formato+fields por game_system_id,
  (2) inserte entidades faltantes por nombre y (3) rellene valores con `INSERT OR IGNORE`
  sobre el UNIQUE(entity, field) — idempotente y sin clobbering. Mantener el pack JSON como
  única fuente de verdad y que el seed lo lea (DRY).

## Verificación pendiente de runtime del founder
- Correr el seed contra la DB real: `docker compose exec backend node scripts/seed-dragonbane-catalog.js`
  (NO requiere Ollama; es catálogo). Luego revisar en la app: página Habilidades de Dragonbane
  con ~35 skills (atributo/tipo/notas) y página Items poblada (~61) para todos los DMs.

## Bloqueantes
Ninguno.

# Implementación: F23 — Ingesta completa de MDs (Stormlight + Dragonbane)
Fecha: 2026-07-22
Status: completado

## Resumen
Se trajeron los 14 MDs de la v0 de ambos sistemas al repo, se extendió `SEED_PACKS`
con títulos legibles en ES y se **generalizó la ingesta a TODOS los sistemas con el
nombre del pack (todos los DMs)**. Tras reconstruir la imagen backend y correr el seed
con Ollama activo, los **4 sistemas (3,4,5,6)** quedaron con 7 docs y chunks+vectores.
NO se tocó `ingestDoc` ni el pipeline de RAG: solo datos + la lista/loop del seed.

## Archivos creados
- `game-packs/docs/dragonbane/DRAGONBANE_GUIA_SISTEMA.md` — copiado de la v0 (guía del sistema).
- `game-packs/docs/dragonbane/DRAGONBANE_BESTIARIO_DETALLADO.md` — bestiario.
- `game-packs/docs/dragonbane/DRAGONBANE_EQUIPO_DETALLADO.md` — equipo.
- `game-packs/docs/dragonbane/DRAGONBANE_ESTADISTICAS_DETALLADAS.md` — estadísticas.
- `game-packs/docs/dragonbane/DRAGONBANE_LISTADOS_ESPECIFICOS.md` — listados específicos.
- `game-packs/docs/dragonbane/DRAGONBANE_MAGIA_DETALLADA.md` — magia.
- `game-packs/docs/dragonbane/DRAGONBANE_SKILLS_DETALLADAS.md` — habilidades (skills).
- `game-packs/docs/stormlight/01-mecanicas-core.md` — mecánicas core (nuevo).
- `game-packs/docs/stormlight/02-acciones.md` — acciones (nuevo).
- `game-packs/docs/stormlight/03-talentos-y-paths.md` — talentos y paths (nuevo).
- `game-packs/docs/stormlight/04-armas-armaduras.md` — armas y armaduras (nuevo).
- `game-packs/docs/stormlight/05-enemigos-y-companeros.md` — enemigos y compañeros (nuevo).
- `game-packs/docs/stormlight/06-culturas-ancestrias-equipo.md` — culturas/ancestrías/equipo (nuevo).

## Archivos modificados
- `game-packs/docs/stormlight/STORMLIGHT_RPG_GUIDE.md` — **sobrescrito con la versión v0**
  (fuente de verdad). Resultó idéntica en content_hash a la ya ingerida (system 3) → esa
  quedó "sin cambios"; en system 5 (hash NULL previo) se reingirió en sitio con vectores.
- `backend/scripts/seed-examples.js`:
  - `SEED_PACKS`: 7 docs de Stormlight + 7 de Dragonbane, con títulos legibles en ES
    (la guía conserva el título existente `Stormlight RPG — Guia Completa` → reingiere en
    sitio, no duplica).
  - `main()`: la ingesta ya no usa solo el `gameSystemId` del DM objetivo; ahora, por cada
    pack, hace `SELECT id, dm_id FROM game_system_templates WHERE name = ?` (pack.name) e
    ingiere cada doc en CADA sistema encontrado → los docs quedan para todos los DMs. Se
    conservó `ensureSystem(dmId, pack)` (import de pack/pregens para fresh install; no-op si
    ya existe, no duplica sistemas). Comentario de cabecera (punto 4) actualizado.

### SEED_PACKS resultante
```js
const SEED_PACKS = [
  {
    file: 'stormlight.json',
    docs: [
      { title: 'Stormlight — Mecánicas Core', path: 'docs/stormlight/01-mecanicas-core.md' },
      { title: 'Stormlight — Acciones', path: 'docs/stormlight/02-acciones.md' },
      { title: 'Stormlight — Talentos y Paths', path: 'docs/stormlight/03-talentos-y-paths.md' },
      { title: 'Stormlight — Armas y Armaduras', path: 'docs/stormlight/04-armas-armaduras.md' },
      { title: 'Stormlight — Enemigos y Compañeros', path: 'docs/stormlight/05-enemigos-y-companeros.md' },
      { title: 'Stormlight — Culturas, Ancestrías y Equipo', path: 'docs/stormlight/06-culturas-ancestrias-equipo.md' },
      // Mismo título que la fila existente → reingiere en sitio (no duplica).
      { title: 'Stormlight RPG — Guia Completa', path: 'docs/stormlight/STORMLIGHT_RPG_GUIDE.md' },
    ],
  },
  {
    file: 'dragonbane.json',
    docs: [
      { title: 'Dragonbane — Guía del Sistema', path: 'docs/dragonbane/DRAGONBANE_GUIA_SISTEMA.md' },
      { title: 'Dragonbane — Bestiario', path: 'docs/dragonbane/DRAGONBANE_BESTIARIO_DETALLADO.md' },
      { title: 'Dragonbane — Equipo', path: 'docs/dragonbane/DRAGONBANE_EQUIPO_DETALLADO.md' },
      { title: 'Dragonbane — Estadísticas', path: 'docs/dragonbane/DRAGONBANE_ESTADISTICAS_DETALLADAS.md' },
      { title: 'Dragonbane — Listados Específicos', path: 'docs/dragonbane/DRAGONBANE_LISTADOS_ESPECIFICOS.md' },
      { title: 'Dragonbane — Magia', path: 'docs/dragonbane/DRAGONBANE_MAGIA_DETALLADA.md' },
      { title: 'Dragonbane — Habilidades (Skills)', path: 'docs/dragonbane/DRAGONBANE_SKILLS_DETALLADAS.md' },
    ],
  },
];
```

### Ingesta por-nombre (main())
```js
for (const spec of SEED_PACKS) {
  const pack = JSON.parse(readFileSync(join(packsDir, spec.file), 'utf8'));
  // Import del pack/pregens SOLO para el DM objetivo (fresh install; no-op si ya existe).
  const { gameSystemId, created } = ensureSystem(dmId, pack);
  // ...log de pregens...

  // Ingesta de docs para TODOS los sistemas con este nombre (todos los DMs).
  const systems = db
    .prepare('SELECT id, dm_id FROM game_system_templates WHERE name = ?')
    .all(pack.name);
  console.log(`  Ingiriendo ${spec.docs.length} docs en ${systems.length} sistema(s) "${pack.name}"`);
  for (const system of systems) {
    console.log(`  → sistema id=${system.id} (dm ${system.dm_id})`);
    for (const doc of spec.docs) {
      await ensureDoc(system.id, doc, packsDir);
    }
  }
}
```

## Tests escritos
- Ninguno nuevo. La feature es **datos + lista/loop del seed**; no cambia lógica de módulos
  con tests. La verificación es de ingesta real (chunks/vectores por sistema + consulta RAG),
  documentada abajo. `ensureDoc`/`ingestDoc` ya cubren la idempotencia (game_docs por título +
  content_hash) y están testeados desde F6/F10/F11. Lint sí cubre `scripts/`.

## Resultado de verificación
- lint:  ✅ `docker compose exec -T backend npm run lint` → `eslint src scripts` exit 0 (sin errores).
- build: ✅ `docker compose build backend` (solo se reconstruyó la capa `COPY scripts` — `src` cacheado).
- test:  No aplica (sin cambios en módulos con tests; ver arriba).
- Manual / e2e: ✅ ingesta real con vectores + retrieval + answer de Dragonbane (abajo).

### Currency de la imagen (por HASH, no timestamp — LEARNINGS)
```
HOST : ffb839a10e8c06bd139c2f917975ff849271fbfc0f4f83bb78d16dd5dd6fa8b7
IMAGE: ffb839a10e8c06bd139c2f917975ff849271fbfc0f4f83bb78d16dd5dd6fa8b7  (scripts/seed-examples.js)
```
Coinciden → la imagen contiene el seed actual.

### AI status previo al seed
`{"provider":"ollama","model":"qwen2.5:3b","vecEnabled":true,"ftsEnabled":true,"llm":{"ok":true},"embeddings":{"ok":true,"model":"nomic-embed-text"},"ready":true}`

### Comando de seed
`docker compose exec -T backend node scripts/seed-examples.js --dm dm`
Salida (resumen): "dm" = id 2. Stormlight (systems 3,5) y Dragonbane (systems 4,6) "ya
existía" (sin duplicar sistemas). Ingirió los 7 docs en cada uno de sus 2 sistemas, todos
"con vectores"; la guía de Stormlight en system 3 quedó "sin cambios" (hash idéntico al v0)
y en system 5 "reingerido con vectores".

### Chunks/docs por sistema (después)
```
┌────┬──────────────────┬──────┬────────┐
│ id │ name             │ docs │ chunks │
├────┼──────────────────┼──────┼────────┤
│ 3  │ 'Stormlight RPG' │ 7    │ 276    │
│ 4  │ 'Dragonbane'     │ 7    │ 217    │
│ 5  │ 'Stormlight RPG' │ 7    │ 276    │
│ 6  │ 'Dragonbane'     │ 7    │ 217    │
└────┴──────────────────┴──────┴────────┘
```
Los 4 sistemas con chunks>0. ✅

### Vectores (vec_chunks) — hay vectores, no solo FTS
```
vec_chunks total = 986 | doc_chunks total = 986   (100% embebido)
por sistema: gs3=276, gs4=217, gs5=276, gs6=217
```
`vec_chunks` > 0 en los 4 sistemas. ✅
(Nota: tras el seed, la guía de Stormlight de system 3 (62 chunks) quedaba sin vectores
porque venía de la ingesta F10 sin Ollama y ahora era "sin cambios"; se cerró la brecha
con el reindex documentado `POST /api/game-systems/3/docs/2/reindex {dm_id:2}` →
`{docId:2,chunks:62,reindexed:true}`. No es cambio de código ni del pipeline.)

### Consulta RAG real de Dragonbane (system 6) — proxy nginx :3000
`POST /api/rag/search {"query":"¿cómo funciona la magia?","game_system_id":6,"k":3}`
Devolvió 3 chunks, TODOS de docs de Dragonbane:
1. `Dragonbane — Guía del Sistema :: 10.1 Escuelas` → Animismo, Elementalismo, Mentalismo, magia común.
2. `Dragonbane — Magia :: 2) Magia general > Protección` → rango, prerrequisito, gesto/ingrediente, efecto.
3. `Dragonbane — Guía del Sistema :: 3.4 Recursos clave` → PV = combustible para capacidades y magia.

### Answer end-to-end (LLM) de Dragonbane
`POST /api/ai/ask {"query":"¿Cómo funciona la magia en este sistema?","game_system_id":6}`
(vía backend directo :3001, porque nginx da 504 por timeout de proxy con el LLM local en CPU;
la generación en sí funciona). La respuesta describe las escuelas, el hechizo de Protección y
PV/PG como recursos; `sources` = solo docs de Dragonbane (Magia, Guía del Sistema, Estadísticas).

### Estado final del stack
```
rolapp-v1-backend-1    Up   3001/tcp
rolapp-v1-frontend-1   Up   0.0.0.0:3000->80/tcp
rolapp-v1-ollama-1     Up   11434/tcp
```
Sin `node_modules` residual en host (no se corrió npm install en dirs montados).

## Lecciones aplicadas
- "El servicio backend de compose NO monta src/ (ni scripts/): reconstruir antes de verificar"
  → reconstruí la imagen (`build backend`) + recree el contenedor (`up -d backend`) ANTES de
  correr el seed nuevo. (game-packs SÍ se monta ro, así que los .md nuevos ya eran visibles.)
- "Prueba que la imagen está al día por HASH" → comparé sha256 host↔imagen de seed-examples.js
  (coinciden) antes de correr el seed.
- "Cada servicio Docker necesita .dockerignore / no dejar node_modules residual" → no corrí
  npm install en dirs montados; host limpio verificado.
- "better-sqlite3 es síncrono" → no toqué ese contrato; el único await del seed es la ingesta
  RAG (red de embeddings), como ya estaba.

## Decisiones tomadas
- **F23 → `in_progress`** en `feature_list.json`: lo pidió explícitamente el líder en la tarea
  (no lo marqué `done`). Es la única excepción a "el implementer no toca feature_list.json".
- **Reindex de la guía de Stormlight de system 3** (docId 2) para cerrar la brecha de vectores
  (había 62 chunks sin embeddings, herencia de la ingesta F10 sin Ollama, que quedaba como
  "sin cambios"). Usé el endpoint de reindex ya documentado en `game-packs/README.md`: re-embebe
  en sitio, NO re-chunkea, NO cambia código ni el pipeline. Resultado: 986/986 chunks con vector.
- **`ensureSystem` intacto** para el DM objetivo (fresh install / no-op), evitando duplicar
  sistemas; toda la generalización vive en el loop por-nombre de `main()`.
- Sin dependencias nuevas (`npm install` no ejecutado).

## Candidatos para LEARNINGS.md
- **Docs de reglas = contenido compartido entre DMs; ingerir por NOMBRE de sistema, no por
  el sistema del DM objetivo.** El seed histórico ingería solo en el sistema del `--dm`; con
  varios DMs dueños de "el mismo sistema" (misma `name`), unos quedaban sin reglas. Patrón:
  iterar `SELECT id FROM game_system_templates WHERE name = ?` y `ensureDoc` en cada uno.
- **Un game_doc creado como METADATO del pack (importGamePack) tiene `content_hash = NULL` y
  0 chunks.** Como NULL ≠ hash, `ingestDoc` lo reingiere (bien). Pero un doc ya ingerido SIN
  Ollama (F10) queda con hash válido + chunks sin vector; al reingerir con el mismo contenido
  sale "sin cambios" y NUNCA gana vectores → hay que **reindexar** ese doc explícitamente. Vale
  la pena un chequeo "chunks sin vector" post-seed cuando Ollama esté arriba.
- **nginx da 504 en `/api/ai/ask` con el LLM local en CPU** (proxy_read_timeout < tiempo de
  generación). Para verificar el answer end-to-end, pegarle al backend directo (:3001) o subir
  el timeout del proxy; el retrieval (`/api/rag/search`) es la prueba rápida y determinista.

## Bloqueantes
Ninguno.

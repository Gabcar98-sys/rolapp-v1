# Implementación: F10 — Sistemas listos + contenido para la IA (seed idempotente)
Fecha: 2026-07-01
Status: completado

## Resumen
Seed idempotente que deja el entorno listo para jugar: DM asegurado, Stormlight RPG +
Dragonbane importados como DATOS (packs JSON), los 6 pregens de Bridge Nine + 2 de
Dragonbane creados vía `importGamePack`, y la guía de Stormlight ingerida al RAG
(doc + chunks + FTS) de forma resiliente sin Ollama. Nada de contenido de juego vive en
migraciones ni código: todo entra por packs importables y un `.md` montado como dato.

## Archivos creados
- `backend/scripts/seed-examples.js`: script idempotente. `--dm <username>` (default `dm`);
  crea el DM con PIN por defecto `0000` si falta; importa `stormlight.json` y `dragonbane.json`
  solo si no existe ya un sistema con ese nombre para ese DM; ingiere los `.md` de docs con
  `embedMode: 'resilient'`. Resuelve `game-packs/` vía `GAME_PACKS_DIR` → `/app/game-packs`
  (montado) → `../../game-packs` (repo local).
- `backend/scripts/seed-examples.test.js`: tests con DB temporal (archivo, por vec0/FTS) +
  stub determinista de embeddings. Cubre: importa ambos sistemas; crea los 6 pregens de
  Bridge Nine (verifica conteo, atributos ligados a plantilla y skills con rank en Abena);
  Dragonbane trae pregens con skills; ingiere la guía (doc+chunks+FTS, sin duplicar el doc
  metadato del pack); idempotencia (2ª corrida no duplica sistema/pregens/doc); ingesta
  resiliente sin embeddings.
- `game-packs/docs/stormlight/STORMLIGHT_RPG_GUIDE.md`: copia de la guía v0 (dato para RAG).

## Archivos modificados
- `backend/src/services/gamePack.js`:
  - Import: los `base_characters` ahora soportan `skill_links` (`{ skill_name, rank }` →
    `base_character_skill_links` resolviendo el `skill_id` por nombre dentro del sistema; nombre
    inexistente aborta el import). Los `attrs` del pregen se ligan al `attribute_template_id`
    del sistema (mapa `category::name` con fallback por nombre) para que "adopt" copie valores.
  - Export: emite `skill_links` por NOMBRE para round-trip portable.
- `backend/src/services/rag.js`:
  - `ingestDoc` acepta `embedMode` ('strict' default = comportamiento previo; 'resilient' =
    si el proveedor de embeddings falla, persiste doc+chunks+FTS SIN vectores y sigue). Devuelve
    además `embedded`.
  - `hybridSearch` degrada a solo-FTS si `embedText` falla y FTS está activo (antes tumbaba la
    búsqueda con 503). Así el keyword/BM25 sirve docs ingeridos sin vectores.
- `game-packs/stormlight.json`: +6 skills que usaban los pregens (Heavy Weaponry, Crafting,
  Deduction, Intimidation, Leadership, Persuasion) y los 6 pregens de Bridge Nine (attrs
  ingleses = plantillas del pack, inventario y `skill_links` con rank, portados de M030). `docs`
  apunta a la guía.
- `game-packs/dragonbane.json`: 2 pregens coherentes (Brakka, Sella) con attrs, inventario y
  `skill_links`.
- `backend/Dockerfile`: `COPY scripts ./scripts` (para `docker compose exec backend node scripts/…`).
- `docker-compose.yml`: monta `./game-packs:/app/game-packs:ro` (packs como dato, no horneados).
- `backend/eslint.config.js` + `backend/package.json`: lint ahora cubre `scripts/**` (`eslint src scripts`).
- `game-packs/README.md` y `README.md`: cómo correr el seed, PIN por defecto, resiliencia sin
  Ollama y comando de reindex de vectores.

## Cómo correr el seed
```bash
cd /c/Users/gabri/dev/rolapp-v1
docker compose up -d --build
docker compose exec backend node scripts/seed-examples.js --dm dm
```
Idempotente: una 2ª corrida no duplica (systems "ya existía", doc "sin cambios").

## Cómo reindexar vectores cuando Ollama esté arriba
La guía queda con chunks + FTS (búsqueda por keyword ya funciona). Para generar los vectores:
```bash
docker compose --profile ai up -d --build
docker compose --profile ai run --rm ai-bootstrap        # descarga nomic-embed-text
curl -s "http://localhost:3000/api/game-systems/1/docs"  # obtener docId
curl -s -X POST "http://localhost:3000/api/game-systems/1/docs/<docId>/reindex" \
  -H 'Content-Type: application/json' -d '{"dm_id": 1}'
```

## Resultado de verificación (Docker, canónico — sin --profile ai)
- lint:  ✅ `docker compose exec backend npm run lint` → 0 errores, 0 warnings (incluye scripts).
- build: ✅ `docker compose build frontend` → OK (lint+build forzados en su build stage).
- test:  ✅ `docker compose exec backend npm test` → 82 tests, 81 pass, 1 skip (degradación vec
  intencional), 0 fail. Incluye los 6 nuevos tests de seed.
- Manual/e2e (DB limpia, seed corrido):
  - `GET /api/game-systems?dm_id=1` → Stormlight RPG (id=1, 13 attrs) + Dragonbane (id=2, 8 attrs). ✅
  - `GET /api/base-characters?dm_id=1&game_system_id=1` → 6 pregens; cada uno con 13 attrs,
    inventario y skillLinks (p. ej. Abena: 8 items, 3 skills; Zvynda: 12 items, 5 skills). ✅
  - `GET /api/game-systems/1/docs` → "Stormlight RPG — Guia Completa", 62 chunks, vec=true fts=true,
    content_hash presente. ✅
  - `GET /api/base-characters?dm_id=1&game_system_id=2` → 2 pregens (Brakka, Sella) con skills. ✅
  - `POST /api/rag/search {query:"iniciativa combate dado", game_system_id:1}` → **200**, 3
    resultados con heading_path citable (antes del fix de degradación devolvía 503 sin Ollama). ✅
  - Resiliencia real: en el entorno había un Ollama alcanzable SIN el modelo → el seed reportó
    "Ingesta sin vectores (…404 model not found)…" y completó igual (doc+chunks+FTS). ✅

## Lecciones aplicadas
- **better-sqlite3 síncrono / `db.transaction`**: el import de packs y la persistencia RAG son
  síncronos; el único async es la llamada de embeddings.
- **vec0/FTS con DB de archivo en tests** (LEARNINGS RAG): los tests de seed usan `mkdtempSync`,
  no `:memory:`, para que sqlite-vec y FTS5 se comporten como en producción.
- **Stub inyectable de embeddings** (`setEmbeddingProvider`): pipeline RAG probado sin red.
- **Lint/test en el contenedor** (LEARNINGS Docker/Proceso): todos los comandos se corrieron con
  `docker compose exec`; no se declaró nada "en verde" sin ejecutarlo. Sin node_modules residual
  en el host (verificado antes de `docker compose build frontend`).
- **No hornear contenido de juego en la imagen**: `game-packs/` se monta como volumen `:ro`, no
  se `COPY`ea; solo `scripts/` (código) entra a la imagen.

## Decisiones tomadas
- **Pregens embebidos en los packs JSON** (preferencia del brief) en vez de un seed aparte:
  `importGamePack` los crea, manteniendo "juegos = datos". Requirió extender el import con
  `skill_links` y el mapeo attr→plantilla.
- **`embedMode` en `ingestDoc`** ('strict' | 'resilient') en vez de cambiar el default: el endpoint
  REST conserva su contrato (falla sin dejar huérfano); solo el seed pide resiliencia.
- **Degradación de `hybridSearch` a solo-FTS**: toca F6, pero es imprescindible para cumplir la
  promesa de F10 de que el keyword-search sirve docs ingeridos sin Ollama. Cambio mínimo y
  aditivo (solo captura el fallo de embedding cuando FTS está activo).
- **PIN por defecto del DM = `0000`**, documentado en ambos README.
- **`game-packs/` montado en `/app/game-packs`** y resolución por prioridad de rutas en el script
  (env → mount → repo local) para que corra igual en Docker y en dev local.
- **Lint ampliado a `scripts/**`** (config `files` + `eslint src scripts` en package.json) para que
  el nuevo script pase por el checkpoint de lint.
- Sin dependencias nuevas (`npm install`).

## Candidatos para LEARNINGS.md
- **RAG / embeddings**: "Ingesta y retrieval deben degradar, no fallar, sin proveedor de
  embeddings." `ingestDoc` con `embedMode:'resilient'` persiste doc+chunks+FTS sin vectores;
  `hybridSearch` cae a solo-FTS si el embed de la query falla y hay FTS. Un Ollama *alcanzable
  pero sin el modelo* devuelve 404 (no ECONNREFUSED): el manejo de resiliencia debe cubrir ambos.
- **Arquitectura/seed**: "Contenido de juego se siembra como DATOS, no como código." Los pregens
  viven en `game-packs/*.json` (creados por `importGamePack`) y la guía es un `.md` montado como
  volumen `:ro`; solo el script de seed entra a la imagen. El seed es idempotente por
  nombre-de-sistema (packs) y por content_hash (docs).
- **Docker**: "El seed necesita las dos piezas separadas": `scripts/` se `COPY`ea a la imagen del
  backend (código), pero `game-packs/` se **monta** (dato). El build context del backend es
  `./backend`, así que los packs de la raíz del repo no pueden entrar por `COPY` — de ahí el volumen.

## Bloqueantes
Ninguno.

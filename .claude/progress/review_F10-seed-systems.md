# Revisión: F10 — Sistemas listos + pregens + ingesta de guía (seed idempotente)
Fecha: 2026-07-01
Revisor: reviewer (independiente)
Veredicto: **APROBADO**

---

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa EN EL CONTENEDOR (`docker compose exec backend npm run lint` → exit 0, incluye `scripts/`).
- [x] Lint + build frontend pasan vía `docker compose build frontend` (exit 0; forzados en build stage).
- [x] No hay `console.log` de debug olvidados. Los `console.log/warn` del seed son salida intencional de un script CLI (mismo patrón que `db/index.js`).
- [x] `better-sqlite3` usado de forma **síncrona**: sin `await` sobre `db`/`.get()/.all()/.run()/.transaction()` en los archivos nuevos/modificados (grep = NONE). El único async es la llamada de red de embeddings.
- [x] **Prepared statements** en todo el import y la persistencia RAG; sin concatenación de SQL con valores.
- [x] `db.transaction(...)` usado en `importGamePack` y en `ingestDoc` (persistencia atómica de doc+chunks+vec+fts).
- [x] `session_events` no se toca (fuera de scope de F10).
- [x] Frontend: no aplica (F10 no toca frontend). El build frontend igual se verificó verde.
- [x] Nombres descriptivos en inglés; funciones con una sola responsabilidad.
- [x] Tests existen y cubren caso feliz + casos de error (import, 6 pregens, Dragonbane, ingesta, idempotencia, resiliencia sin embeddings).
- [x] Todos los tests pasan (`npm test` → 82 tests, 81 pass, 1 skip intencional, 0 fail).
- [x] Respeta `architecture.md`: contenido de juego como DATO (packs JSON + `.md` montado), no en migraciones/código.
- [x] **`db/index.js` sigue con `migrations = []`** (baseline vacío) — no se sembró contenido de juego en código. VERIFICADO.
- [x] No se instalaron dependencias nuevas. `backend/package.json` solo cambió el script `lint` (`eslint src` → `eslint src scripts`). Sin cambios en `dependencies`.
- [x] Sin node_modules residual (`git status --short` limpio de node_modules; `.dockerignore` presente en backend y frontend).
- [x] Sin archivos fuera del scope declarado en el reporte del implementer.
- [x] Reporte del implementer presente: `.claude/progress/impl_F10-seed-systems.md`.
- [x] Reporte del reviewer escrito (este archivo).
- [x] Se propusieron lecciones para LEARNINGS.md (RAG resiliente, seed=datos, Docker copy vs mount).

---

## Objetivo F10 — verificación específica
- [x] **Script idempotente** `backend/scripts/seed-examples.js`: importa `stormlight.json` y `dragonbane.json`; guarda por nombre-de-sistema+DM; docs por content_hash. Doble corrida NO duplica.
- [x] **Contenido de juego como DATOS, no seed en migraciones:** `migrations = []` intacto; packs en `game-packs/` montados `:ro` (no `COPY` a la imagen); solo `scripts/` entra a la imagen backend.
- [x] **Pregens Stormlight (Bridge Nine):** los 6 (Abena, Jomari, Palinor, Talani, Vedd, Zvynda), cada uno con 13 attrs ligados a plantilla + inventario + skill_links con rank. Embebidos en el pack, creados por `importGamePack`.
- [x] **Pregens Dragonbane:** 2 (Brakka, Sella) con skills enlazadas.
- [x] **Guía:** `game-packs/docs/stormlight/STORMLIGHT_RPG_GUIDE.md` existe (24 KB); se ingiere como game_doc de Stormlight (62 chunks + FTS), reusando la fila game_docs que el import creó como metadato (1 solo doc, sin duplicar).
- [x] **Resiliente sin Ollama:** en el entorno había Ollama alcanzable SIN el modelo → 404; el seed persistió doc+62 chunks+FTS SIN vectores (`vec_chunks=0`), no falló. Reindex documentado en `game-packs/README.md`.
- [x] **RAG keyword sin Ollama = 200:** `POST /api/rag/search` devuelve 200 con resultados citables (heading_path + chunk_id) vía FTS/BM25, sin vectores.

---

## Resultado de verificación (Docker canónico, SIN --profile ai)
Entorno: `docker compose up -d --build` OK. vec_version v0.1.9, `vecEnabled=true`, `ftsEnabled=true`.

- **lint:** ✅ `docker compose exec backend npm run lint` → exit 0, 0 errores (cubre `src` y `scripts`).
- **test:** ✅ `docker compose exec backend npm test` → `# tests 82 / # pass 81 / # fail 0 / # skipped 1`.
  - El único skip (test 68, "hybridSearch lanza error claro cuando vec y FTS están deshabilitados") es intencional: `# SKIP vec/FTS activos: la degradación dura se valida en el código de guardia`. No es un fallo.
  - Los 6 tests de seed pasan (import ambos sistemas / 6 pregens Bridge Nine / Dragonbane con skills / ingesta doc+chunks+FTS / idempotencia doble corrida / ingesta resiliente).
- **build frontend:** ✅ `docker compose build frontend` → exit 0 (lint+build forzados en build stage = ambos verdes).

### Prueba de doble corrida (idempotencia) — DB reseteada a vacío
```
RUN 1 (fresh):
  DM creado: "dm" (PIN por defecto 0000)
  Sistema "Stormlight RPG" (id=3): importado, 6 pregens
  Ingesta sin vectores (proveedor de embeddings no disponible): Ollama embeddings error 404:
    model "nomic-embed-text" not found → doc queda con chunks + FTS.
  doc "Stormlight RPG — Guia Completa": reingerido (62 chunks, docId=2) sin vectores (pendiente reindex)
  Sistema "Dragonbane" (id=4): importado, 2 pregens
  RUN1 EXIT: 0
RUN 2 (idempotencia):
  Sistema "Stormlight RPG" (id=3): ya existía, 6 pregens
  doc "Stormlight RPG — Guia Completa": sin cambios (62 chunks, docId=2)
  Sistema "Dragonbane" (id=4): ya existía, 2 pregens
  RUN2 EXIT: 0
```
Conteos tras DOS corridas (sin crecer):
```
users: 1 | systems: 2 | total base_chars: 8 | game_docs: 1 | doc_chunks: 62 | vec_chunks: 0
  id=3 Stormlight RPG | base_chars=6 attrs=13
  id=4 Dragonbane     | base_chars=2 attrs=8
Pregens Stormlight: Abena(a13,i8,s3) Jomari(a13,i5,s5) Palinor(a13,i6,s3)
                    Talani(a13,i4,s4) Vedd(a13,i4,s4) Zvynda(a13,i12,s5)
```

### Endpoints (vía proxy frontend :3000; backend interno es 3001)
- `GET /api/game-systems?dm_id=2` → Stormlight RPG (id=3, 13 attrs) + Dragonbane (id=4, 8 attrs), sin duplicar. ✅
- `GET /api/base-characters?dm_id=2&game_system_id=3` → 6 pregens (Bridge Nine). ✅
- `GET /api/base-characters?dm_id=2&game_system_id=4` → 2 pregens (Brakka, Sella). ✅
- `GET /api/game-systems/3/docs` → 1 doc "Stormlight RPG — Guia Completa", 62 chunks, content_hash=4d6a12dd, vecEnabled/ftsEnabled=true. ✅
- `POST /api/rag/search {query:"combate iniciativa dado turno", game_system_id:3}` → **HTTP 200**, resultados con heading_path citable (p. ej. "…> 5. Combate > Estructura del Turno") + chunk_id. Sin Ollama/vectores. ✅

### Git / node_modules
`git status --short`: solo los archivos declarados (README.md, backend/Dockerfile, eslint.config.js, package.json, gamePack.js, rag.js, docker-compose.yml, game-packs README/dragonbane/stormlight; nuevos: scripts/, game-packs/docs/, impl report). Grep node_modules → NONE. ✅

---

## Lecciones aplicadas correctamente
- **better-sqlite3 síncrono / `db.transaction`**: confirmado; import y persistencia RAG son síncronos, transaccionales.
- **vec0/FTS con DB de archivo en tests**: `seed-examples.test.js` usa `mkdtempSync` (no `:memory:`) y fija `DB_PATH` antes de importar `db/index.js`.
- **Stub inyectable de embeddings** (`setEmbeddingProvider`): pipeline RAG probado sin red.
- **Lint/test en el contenedor**: todo verificado con `docker compose exec`; nada declarado en verde sin ejecutarlo.
- **No hornear contenido de juego**: `game-packs/` se monta `:ro`; solo `scripts/` se `COPY`ea. Baseline `migrations = []` intacto.

---

## Observaciones (no bloqueantes)
1. **Divergencia menor test vs script en `embedMode`.** El helper `ensureDoc` de `seed-examples.test.js` (líneas 65-70) llama a `ingestDoc` SIN `embedMode: 'resilient'`, mientras el script real (`seed-examples.js` líneas 115-122) sí lo pasa. En consecuencia, el test de idempotencia usa el modo `strict` por defecto, no exactamente la ruta del script. No es bloqueante: (a) hay un test dedicado de resiliencia que cubre el modo sin embeddings, y (b) la doble corrida en vivo demostró el comportamiento resiliente real del script (404 de Ollama → doc+chunks+FTS, exit 0). Sugerencia futura: alinear el helper del test con el `embedMode` del script para que el test refleje 1:1 la llamada de producción.
2. **Puerto en el brief.** El snippet de verificación de la tarea usa `http://localhost:3000/api/...` como si fuera el backend; en realidad el backend es interno (3001) y `:3000` es el proxy nginx del frontend. La verificación se hizo vía el proxy (equivalente y correcto). El README documenta el reindex con `:3000`, consistente con el proxy.
3. **`hybridSearch` (F6) modificado.** Se le añadió degradación a solo-FTS cuando el embed de la query falla y hay FTS. Es un cambio aditivo, declarado y justificado en el reporte; imprescindible para la promesa de F10 (keyword sin Ollama = 200). Cubierto por la verificación en vivo.

---

## Puntos a corregir (si RECHAZADO)
No aplica — APROBADO.

---

## Candidatos para LEARNINGS.md
- **RAG / embeddings:** "Ingesta y retrieval degradan, no fallan, sin proveedor de embeddings." `ingestDoc` con `embedMode:'resilient'` persiste doc+chunks+FTS sin vectores; `hybridSearch` cae a solo-FTS si el embed de la query falla y hay FTS. Un Ollama *alcanzable pero sin el modelo* devuelve **404** (no ECONNREFUSED): la resiliencia debe cubrir ambos. (Verificado en vivo: 404 model not found → seed completó con exit 0.)
- **Arquitectura/seed:** "Contenido de juego = DATOS, no código." Pregens en `game-packs/*.json` (creados por `importGamePack`), guía como `.md` montado `:ro`; solo el script de seed entra a la imagen. Idempotencia por nombre-de-sistema (packs) y content_hash (docs). `migrations = []` se mantiene.
- **Docker:** "Seed necesita dos piezas separadas": `scripts/` se `COPY`ea (código, build context `./backend`), `game-packs/` se **monta** (dato, vive en la raíz del repo, fuera del build context del backend). De ahí el volumen `:ro`.
- **Testing:** al escribir tests que reproducen la lógica de un script CLI, replicar también sus parámetros de llamada (p. ej. `embedMode`) para que el test cubra la ruta exacta de producción, no una equivalente.

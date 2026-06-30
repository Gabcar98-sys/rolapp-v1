# Implementación: F2 — Sistemas de juego data-driven (builder + packs JSON)
Fecha: 2026-06-29
Status: completado

## Archivos creados
### Backend
- `backend/src/routes/gameSystems.js`: CRUD de `game_system_templates` + sub-recursos
  (atributos con type/category/sort_order/is_core/has_max/formula, equipment_slot_templates,
  game_mechanics + game_mechanic_params). Endpoint `GET /:id/export` que delega en el servicio.
  Autorización: solo el DM dueño edita (helpers `requireOwnedSystem`/`requireOwnedMechanic`).
- `backend/src/routes/skills.js`: CRUD de `skill_formats` + `skill_format_fields` + `skills` +
  `skill_field_values`. Las skills exponen sus valores como mapa `{ field_id: value }`. PUT usa
  UPSERT (`ON CONFLICT`) sobre los valores.
- `backend/src/routes/items.js`: idéntico a skills pero para `item_formats`/`item_format_fields`/
  `item_masters`/`item_master_values`, con el flag extra `equippable` en los masters.
- `backend/src/routes/gamePacks.js`: `POST /api/game-packs/import { dm_id, pack }`. El export vive
  en `GET /api/game-systems/:id/export` (registrado en gameSystems.js, según pidió la spec).
- `backend/src/services/gamePack.js`: `exportGameSystem(db, id)` → game pack JSON versionado
  (`pack_version: "1.0"`) con attributes, skill_formats (fields + skills+values por NOMBRE),
  item_formats (idem + equippable), equipment_slots, mechanics (+params), base_characters
  (opcional) y docs (solo metadatos title/path; el .md se ingiere en F6).
  `importGamePack(db, dmId, pack)` → valida (versión soportada + campos requeridos) y crea TODO
  en una `db.transaction`. Mapea nombres→ids (skills/items referencian campos por nombre).
  Devuelve el game_system_id; ante error la transacción revierte.
- `backend/src/services/gamePack.test.js`: tests con `node --test` y DB `:memory:`.

### Frontend
- `frontend/src/components/DMMaster/GameSystemPanel.jsx`: builder visual. Lista/crea/elimina
  sistemas, importa pack (`<input type=file>` → lee en cliente → POST import) y exporta
  (descarga Blob). Editor por pestañas: Atributos (toggles is_core/has_max + campo formula),
  Equipo (slots), Mecánicas (+params), y embebe SkillsPanel/ItemsPanel scopeados al sistema.
- `frontend/src/components/DMMaster/SkillsPanel.jsx`: CRUD de formatos de skill (campos
  parametrizables) + skills con sus valores.
- `frontend/src/components/DMMaster/ItemsPanel.jsx`: idem para objetos (+ checkbox equippable).

### Packs de ejemplo (datos, no seeds)
- `game-packs/stormlight.json`: completo — 13 atributos (6 core + recursos con has_max/formula +
  defensas + combate) y las 15 skills del seed M021 (con attribute/tasks), más armas, slots y
  mecánicas. Portado del seed M021 / catálogo v0.
- `game-packs/dragonbane.json`: reducido pero válido — 6 atributos core + HP/WP, 6 skills,
  equipo con peso y mecánica de Carga.
- `game-packs/README.md`: documenta el formato del pack y cómo importar/exportar (UI + curl).

## Archivos modificados
- `backend/src/index.js`: registra los routers `/api/game-systems`, `/api/skills`, `/api/items`,
  `/api/game-packs` (sin socket — F2 es CRUD puro, como anticipó el líder).
- `frontend/src/lib/api.js`: añadidos endpoints de gameSystems/attributes/slots/mechanics(+params)/
  skill-formats+skills/item-formats+items/importGamePack/exportGameSystem.
- `frontend/src/pages/Lobby.jsx`: import de GameSystemPanel, botón "🎲 Sistemas de juego" (solo DM)
  y nueva vista `view === 'systems'`. CABLEADO real — la vista es navegable desde el lobby.

## Tests escritos
- `backend/src/services/gamePack.test.js` (7 tests): import crea sistema y devuelve id;
  round-trip import→export preserva estructura (incl. referencias por nombre y equippable);
  reimportar un export produce el mismo objeto (idempotencia estructural, deepEqual);
  rechaza pack_version no soportada; rechaza pack sin name; **import transaccional** (un valor
  que apunta a un campo inexistente aborta y no deja basura: 0 sistemas/atributos/formatos);
  export lanza si el sistema no existe.

## Resultado de verificación (Docker — canónico)
- lint backend:  ✅ `docker compose exec backend npm run lint` → exit 0
- test backend:  ✅ `docker compose exec backend npm test` → 21/21 pass (7 nuevos + 14 previos)
- lint+build frontend: ✅ `docker compose build frontend` → `RUN npm run lint` y `RUN npm run build`
  pasan; 74 módulos transformados, build OK.
- health: ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`
- Smoke backend (node fetch vía :3001 en contenedor): importar stormlight.json → 201, list muestra
  "Stormlight RPG" con attribute_count 13, full = 13 attrs / 3 slots / 2 mechanics (params OK),
  formato con 15 skills, export round-trip (attrs y skills coinciden, attribute preservado),
  pack inválido → 400, crear sistema con dm inexistente → 403.
- Smoke e2e (vía nginx :3000 / frontend:80): health OK, importar dragonbane.json → 201,
  export → 8 attrs / 6 skills / mecánica "Carga". Confirmado que el proxy `/api` funciona.

## Lecciones aplicadas
- "Routers que emiten por socket → factory": F2 NO necesita socket, así que los routers son
  `export default router` simples (no factory), como indicó el líder.
- "better-sqlite3 síncrono" + "prepared statements siempre": todo el acceso es síncrono con
  prepared statements; el import usa `db.transaction(fn)()`.
- "Una feature de frontend no está terminada hasta estar cableada": GameSystemPanel está montado
  en Lobby con botón navegable; SkillsPanel/ItemsPanel se renderizan dentro de las pestañas del
  panel. Sin componentes huérfanos.
- "Cero estilos inline / cero window.innerWidth": solo clases Tailwind + tokens; responsive con
  `md:`. La constante `inputCls` es una cadena de clases Tailwind reutilizada, no un objeto de
  estilos inline.
- "ESLint frontend necesita eslint-plugin-react": ya estaba resuelto (deuda técnica de F5 cerrada);
  el lint del frontend corre limpio.

## Decisiones tomadas
- **Sin dependencias nuevas.** Todo con lo ya instalado (express, better-sqlite3, node:test).
- **Valores de skill/item por field_id en la API runtime, por NOMBRE en el pack.** Internamente
  los endpoints usan `{ field_id: value }` (estable y barato); el pack usa nombres de campo para
  ser portable entre instalaciones. El servicio traduce en ambos sentidos.
- **`docs` solo metadatos** (title/path) en import y export, como pide la spec; el contenido .md y
  su embedding se hacen en F6.
- **Smoke con `node --input-type=module` dentro del contenedor**: no hay Node en el host ni curl en
  la imagen backend; tampoco game-packs está dentro de la imagen (es data dir). Inyecté el JSON del
  pack leyéndolo en el host y pasando el script por stdin; el e2e vía :3000 se corre desde el
  contenedor backend contra `http://frontend:80`.
- Ubicación de docs del proyecto: están en `.claude/docs/` (architecture/conventions/verification)
  y `.claude/CHECKPOINTS.md` / `.claude/LEARNINGS.md`, no en la raíz. Lo anoto por si la instrucción
  asumía rutas en la raíz.

## Candidatos para LEARNINGS.md
- **Smoke de endpoints sin curl ni Node en el host:** la imagen backend no trae curl y el host no
  tiene Node. Patrón que funcionó: `MSYS_NO_PATHCONV=1 docker compose exec -T backend node
  --input-type=module < script.mjs`, usando `globalThis.fetch` (Node 18+). Para e2e vía el proxy,
  apuntar a `http://frontend:80/api` desde el contenedor backend (misma red de compose). Inyectar
  archivos de `game-packs/` leyéndolos en el host (no están dentro de la imagen).
- **Packs portables = referencias por nombre, no por id:** el game pack referencia atributos y
  campos por `name`; el importador mapea nombre→id en la transacción. Mantener esta convención en
  features que extiendan el formato (F3 personajes, F6 docs) para que los packs sigan siendo
  compartibles entre instalaciones.

## Bloqueantes
Ninguno.

# Implementación: F3 — Personajes

Fecha: 2026-06-29
Status: completado

## Resumen
CRUD de personajes de jugador con ficha completa dinámica (atributos según el game
system, estado, skills del catálogo + manuales, inventario, equipo por slots),
pregens del DM (`base_characters`) con creación de personaje a partir de un pregen,
y vínculo a sesión. Todo cableado y navegable desde Lobby y SessionView.

## Archivos creados

### Backend
- `backend/src/routes/characters.js`: router factory `createCharactersRouter(io)`
  (emite por socket al editar fichas en sesión, patrón de LEARNINGS). Endpoints:
  - `GET /?user_id=` (mis personajes, ficha completa); `GET /session/:sessionId`;
    `GET /:id` (ficha: datos + `templateAttrs` join `attribute_templates` con
    type/category/is_core/has_max/formula/max_value + `skillLinks` join `skills` con
    rank + `skills` manuales + `inventory` + `equipment` join slots/items con values).
  - `POST /`, `PATCH /:id`, `DELETE /:id` (el borrado limpia `session_characters`
    en transacción antes de borrar — ver Decisiones).
  - `PUT /:id/attributes` (upsert de value + max_value).
  - `POST/DELETE /:id/skill-links[/:skillId]` (enlace catálogo con rank, idempotente).
  - `POST/DELETE /:id/skills[/:skillId]` (skills manuales; source manual|dm_assigned).
  - `POST/PUT/DELETE /:id/inventory[/:itemId]`.
  - `POST /:id/equipment` (respeta `max_items` del slot → 409 si lleno) y `DELETE /:id/equipment/:equipId`.
  - `POST/DELETE /:id/sessions/:sessionId` (vincular/desvincular vía `session_characters`).
  - Exporta `getCharacterFull` para reutilizarlo en baseCharacters.
  - Autorización: dueño siempre; DM si el personaje está vinculado a una de SUS sesiones.
- `backend/src/routes/baseCharacters.js`: CRUD de `base_characters` + attrs (reemplazo
  del set), inventario, skill-links con rank, y `POST /:id/adopt` (crea un `character`
  copiando attrs ligados a plantilla / inventario / skills con rank, transaccional).
- `backend/src/routes/characters.test.js`: 11 tests (node:test, DB `:memory:`).

### Frontend
- `frontend/src/components/Character/CharacterSheet.jsx`: ficha reutilizable (tabs
  atributos/estado/skills/equipo/inventario). Atributos agrupados por category,
  is_core destacados (★), has_max como valor/máx. Usada en MyCharacters y SessionView.
- `frontend/src/pages/MyCharacters.jsx`: lista/crea (sistema o pregen)/elimina; abre la ficha.
- `frontend/src/components/DMMaster/BaseCharactersPanel.jsx`: el DM gestiona pregens
  (crear, atributos del sistema, inventario, skills del catálogo).
- `frontend/src/components/Session/SessionCharactersPanel.jsx`: en sesión, el jugador
  elige qué personaje lleva (vincula vía `session_characters`) y edita su ficha; el DM
  ve/gestiona los de la sesión. Sincroniza con `characters:list_updated`/`characters:updated`.

## Archivos modificados
- `backend/src/index.js`: registra `createCharactersRouter(io)` en `/api/characters`
  (después de instanciar io) y `baseCharactersRouter` en `/api/base-characters`.
- `backend/src/routes/sessions.js`: añade `POST /:id/characters` { character_id, user_id }
  (vincula personaje a sesión, emite `characters:list_updated`).
- `frontend/src/lib/api.js`: endpoints de characters/baseCharacters/equip/skills/inventory/sesión.
- `frontend/src/pages/Lobby.jsx`: acceso "Mis personajes" (todos) y "Personajes base" (DM);
  vistas `characters` y `base-characters`.
- `frontend/src/pages/SessionView.jsx`: pestaña ⚔️ con `SessionCharactersPanel` (todos).

## Tests escritos
- `backend/src/routes/characters.test.js` (11): crear personaje (+400), set de atributo
  (upsert value/max) (+403 extraño), equipar respetando slot (+409 lleno), desequipar y
  reequipar, enlazar skill con rank, vincular a sesión (+emit socket), borrar personaje
  vinculado a sesión, crear-desde-pregen (copia attrs/inventario/skills, transaccional) (+404).

## Resultado de verificación (Docker, entorno canónico)
- lint backend:  ✅ `docker compose exec backend npm run lint` (0 errores)
- lint+build frontend: ✅ `docker compose build frontend` (RUN npm run lint && RUN npm run build, exit 0)
- test backend:  ✅ 32 pasando (31 previos + 11 de F3; 0 fallos) vía `docker compose exec backend npm test`
- Manual / e2e:  ✅ smoke vía :3000 — crear sistema, crear personaje, setear HP 8/12 y
  Fuerza 3, añadir inventario, equipar en slot (2º item → 409), enlazar skill (rank 2),
  vincular a sesión (`POST /sessions/:id/characters`), listar `GET /characters/session/:id`,
  crear pregen + adoptar (copió Fuerza=5, skill rank 3, inventario). Datos de smoke borrados.

## Lecciones aplicadas
- "Routers que emiten por socket → factory `createXRouter(io)`": characters es factory,
  montado tras instanciar io.
- "Una feature de frontend no está terminada hasta que sus componentes estén cableados":
  CharacterSheet, MyCharacters, BaseCharactersPanel y SessionCharactersPanel quedan
  importados y alcanzables (Lobby + SessionView).
- "Cero estilos inline, cero window.innerWidth": la barra de estado (HP) usa clases
  Tailwind literales en pasos de 10% (BAR_WIDTHS) en vez de `style={{width}}`.
- better-sqlite3 síncrono + prepared statements + `db.transaction` para adopt y delete.

## Decisiones tomadas
- **Borrado de personaje vinculado a sesión:** `session_characters.character_id` no tiene
  `ON DELETE` en el schema; con `foreign_keys=ON` un DELETE de `characters` fallaba (500
  FK). En vez de migrar el schema (fuera de scope de F3 y reservado a F1), el handler
  `DELETE /:id` borra primero las filas de `session_characters` dentro de una transacción.
  Detectado y corregido durante el smoke; añadido test que lo cubre.
- **Skill-links con rank:** el v0 no usaba rank en `character_skill_links`/`base_character_skill_links`;
  el schema v1 sí lo tiene. Se expone en endpoints (rank opcional, default 0) y se copia en adopt.
- **Sin legacy:** se omitió todo el camino `character_attribute_values`/`campaign_attribute_definitions`
  del v0 (excluido del schema v1); solo `character_template_attr_values`.
- **`canEdit` en frontend:** el backend valida permisos; `canEdit` solo decide mostrar
  controles (jugador edita el suyo; DM edita los de su sesión).
- No se instalaron dependencias nuevas.

## Candidatos para LEARNINGS.md
- **FK sin ON DELETE en tablas puente → limpiar en el handler.** `session_characters`
  referencia `characters(id)` sin `ON DELETE CASCADE`; con `foreign_keys=ON`, borrar el
  padre lanza `SqliteError: FOREIGN KEY constraint failed` (500). Al borrar una entidad
  con hijos en una tabla puente sin cascade, eliminar primero las filas puente en la misma
  transacción. (Categoría: Base de datos / SQLite.)
- **Anchos dinámicos sin inline = clases Tailwind literales bucketizadas.** Para una barra
  de progreso (HP) sin `style={{width}}`, mapear el porcentaje a un set fijo de clases
  `w-*` escritas completas (para que el JIT de Tailwind las incluya). (Categoría: Frontend.)

## Bloqueantes
Ninguno.

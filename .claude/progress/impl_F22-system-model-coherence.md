# Implementación: F22 — Coherencia del modelo sistema↔campaña↔sesión
Fecha: 2026-07-22
Status: completado

## Resumen (2 líneas)
La IA ahora resuelve el sistema de juego desde la CAMPAÑA (con los personajes como fallback),
la sesión expone el nombre real del sistema, el Dashboard avisa que sin campaña no hay IA de
reglas, y se eliminó el campo legacy `campaigns.game_system` (TEXT) con migración idempotente M003.

## Archivos creados
- `backend/src/db/migrations.test.js`: tests de la migración M003 — idempotencia (aplicar dos
  veces sobre una DB con la columna no lanza y deja la tabla igual) + que la DB cargada
  (schema + migraciones) ya no tiene `campaigns.game_system` y registró M003.

## Archivos modificados
- `frontend/src/components/AI/AIPanel.jsx`:
  - Nuevo helper puro exportado `resolveSessionGameSystems({ session, characters })` → devuelve
    `{ systems: [{id,name}], defaultId }`. Resuelve el sistema desde la campaña primero
    (`session.campaign_game_system_id`, nombre desde `campaign_game_system_name` o `Sistema {id}`)
    y añade los sistemas de los personajes deduplicados por id como fallback/complemento.
  - `useEffect` de resolución: ahora hace `Promise.all([api.getSession, api.listSessionCharacters])`
    y usa el helper para poblar `systems` + `setGameSystemId(defaultId)`. Se conserva
    streaming/presets/topics/selector `mode==='system'` intactos. Guard `cancelled` para evitar
    setState tras desmontar. El mensaje "No hay sistema de juego asociado a esta sesión"
    (en `runFreeAsk`, gated por `!gameSystemId`) ahora solo aparece si NO hay sistema por
    ninguna vía (campaña ni personajes).
  - Copy del hint del modo Sistema actualizado a "Esta sesión no tiene sistema de juego.
    Asígnale una campaña con sistema para consultar sus reglas." (antes decía "vincula un
    personaje…", incoherente con el modelo canónico).
- `backend/src/routes/sessions.js`: añadido `gs.name AS campaign_game_system_name` + el
  `LEFT JOIN game_system_templates gs ON gs.id = c.game_system_id` en `GET /:id` (requerido) y
  también en el listado `GET /` (aditivo, JOIN 1:1 → no infla `COUNT(sm.user_id)`). Solo se
  AÑADE la columna; el resto del shape queda igual.
- `backend/src/db/index.js`: refactor mínimo — el array de migraciones se exporta como
  `MIGRATIONS` y cada fn recibe `db` por parámetro (antes cerraba sobre el `db` del módulo),
  para poder ejercitarlas en tests sobre una DB aislada. Comportamiento idéntico. Añadida
  migración `M003_drop_campaigns_game_system` (idempotente: `DROP COLUMN` solo si el PRAGMA
  la encuentra).
- `backend/src/db/schema.sql`: eliminada la columna `game_system TEXT NOT NULL DEFAULT ''` de
  `campaigns` (instalaciones nuevas ya no la crean) + comentario explicando la decisión.
- `frontend/src/pages/DashboardPage.jsx`: texto de ayuda muted bajo el formulario "Nueva
  sesión": "El sistema de juego se hereda de la campaña. Una sesión sin campaña (con sistema
  asignado) no tendrá IA de reglas ni validación de personajes por sistema." (solo copy;
  cero cambios de lógica de creación). Tokens Tailwind, sin estilos inline ni emojis.
- `backend/src/routes/sessions.test.js`: 2 tests nuevos — `GET /:id` devuelve
  `campaign_game_system_id` + `campaign_game_system_name` cuando hay campaña con sistema, y
  NULL en ambos cuando la sesión no tiene campaña.
- `frontend/src/components/Session/session.test.jsx`: import de `resolveSessionGameSystems` +
  6 tests del helper (solo campaña; campaña sin nombre → `Sistema {id}`; solo personajes con
  dedup; ambos con campaña primero como default; ninguno → `{ systems:[], defaultId:'' }`;
  sin argumentos degrada sin lanzar).
- `.claude/feature_list.json`: F22 → `in_progress` (por instrucción explícita del líder; NO
  se marca `done`).

## Firma / casos del helper
`resolveSessionGameSystems({ session, characters = [] } = {}) → { systems: [{id,name}], defaultId }`
- Campaña con sistema: `systems = [{campaña}]`, `defaultId = String(campaña.id)`.
- Campaña sin nombre: nombre `Sistema {id}`.
- Sin campaña, con personajes: deriva de personajes (dedup por id), default = primer personaje.
- Ambos: campaña primero (y como default) + sistemas extra de personajes sin duplicar.
- Nada: `{ systems: [], defaultId: '' }`. Sin args: igual, sin lanzar.

## Legacy `campaigns.game_system` (TEXT): ELIMINADO
Decisión: **eliminado** (rama "100% seguro y barato"). Evidencia recogida antes de tocar:
- `rg --pcre2 'game_system(?!_id|_name|_template|s)\b'` en backend/frontend/game-packs → solo
  aparece en `schema.sql` (la definición) y en un comentario de `rag.js:458` (concepto, no la
  columna). Cero lecturas/escrituras reales.
- `rg --pcre2 '\.game_system(?![_a-zA-Z])'` en backend/frontend → cero accesos a la propiedad.
- Los tests insertan en `campaigns` usando `game_system_id`, nunca la columna TEXT.
- `SELECT c.*` de `campaigns.js` la arrastraba pero ningún consumidor la usa.
- better-sqlite3 ^11.8.1 → SQLite moderno con soporte `ALTER TABLE DROP COLUMN`.
Mecanismo: migración idempotente `M003_drop_campaigns_game_system` (patrón M001/M002 con guard
PRAGMA) + `schema.sql` actualizado. Cubre el upgrade real del founder (DB existente CON la
columna → M003 la elimina) vía el test de idempotencia en DB aislada, y el fresh install
(schema sin la columna → M003 es no-op registrado) vía el test de la DB cargada.

## Resultado de verificación
Comandos exactos (entorno canónico Docker):
- `docker compose build backend` → exit 0
- `docker compose run --rm --no-deps backend npm run lint` → exit 0
- `docker compose run --rm --no-deps backend npm test` → 148 tests, 147 pass, 0 fail, 1 skip
  (el skip es preexistente; antes de F22 eran 144 → +4 nuevos: 2 sessions + 2 migrations)
- `docker compose build frontend` → exit 0 (lint + build forzados en el build stage)
- `docker build --target build -t rolapp-fe-test ./frontend && docker run --rm rolapp-fe-test npm test`
  → 85 pass / 7 files (antes 79 → +6 del helper). Imagen temporal borrada con `docker rmi`.
- Sin `node_modules` residual en `backend/` ni `frontend/` (verificado antes y después).

Checklist:
- lint backend:  ✅
- build frontend (lint+build): ✅
- test backend:  ✅ 147 pass / 0 fail / 1 skip (preexistente)
- test frontend: ✅ 85 pass
- Manual / e2e: No aplica (verificación por tests; runtime IA es del founder)

## Lecciones aplicadas
- "vitest del frontend no tiene jsdom → testea helpers puros" (F20): extraje
  `resolveSessionGameSystems` como helper puro exportado y lo testeé directamente, sin simular
  clics.
- "el backend de compose NO monta src/ → reconstruir antes de verificar" (F21):
  `docker compose build backend` ANTES de lint/test; los 148 tests corren sobre el código nuevo.
- "extender componente compartido = props opcionales retrocompatibles" (F17): la firma de
  `AIPanel(sessionId, user, campaignId)` no cambió; los datos extra (getSession) se obtienen
  dentro del componente, no vía props nuevas.
- "correr tests frontend en Docker sin ensuciar el host" (F20): patrón build stage + `docker rmi`.
- "migraciones idempotentes con guard PRAGMA" (SQLite/F1): M003 verifica con PRAGMA antes de DROP.

## Decisiones tomadas
- Añadí `campaign_game_system_name` también al listado `GET /` (era opcional): JOIN 1:1, riesgo
  nulo, y deja el listado coherente con el detalle por si una vista futura muestra el sistema.
- Refactoricé las migraciones a `export const MIGRATIONS` con fns `(db) => …` para poder testear
  la idempotencia real de M003 sobre una DB aislada (en vez de duplicar la lógica en el test).
  Comportamiento de M001/M002 sin cambios.
- Actualicé el copy del hint del modo Sistema del AIPanel para alinearlo con el modelo (campaña
  como vía principal); no rompe tests (nadie asertaba esa cadena).
- NO renombré `characters.game_system_template_id` (fuera de alcance; solo documentado en el modelo).
- NO toqué `docs/API.md` (regla: solo backend/frontend/game-packs). Queda como nota: el shape de
  `GET /api/sessions/:id` ahora incluye `campaign_game_system_name` si se quiere documentar.
- Sin dependencias nuevas (`npm install`).

## Candidatos para LEARNINGS.md
- **DROP COLUMN legacy con migración idempotente es viable en better-sqlite3 11.x** siempre que
  (1) se confirme por `rg --pcre2` con look-ahead que ni la columna ni la propiedad tienen
  consumidores, (2) el guard PRAGMA haga el DROP condicional y (3) se cubran ambos caminos:
  upgrade (DB con la columna, en DB aislada) y fresh install (schema sin la columna → no-op).
- **Para testear la idempotencia real de una migración**, exporta el array de migraciones con
  fns que reciben `db` por parámetro; así el test ejercita la fn REAL sobre una DB aislada en
  vez de duplicar la lógica del ALTER.
- **`rg` (ripgrep) no soporta look-ahead por defecto**: usar `rg --pcre2` para distinguir
  `game_system` (legacy) de `game_system_id`/`_name`/`_template`.

## Bloqueantes
Ninguno.

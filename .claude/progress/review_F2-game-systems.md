# Revisión: F2 — Sistemas de juego data-driven (builder + packs JSON)
Fecha: 2026-06-29
Veredicto: APROBADO

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa EN EL CONTENEDOR (`docker compose exec backend npm run lint` → exit 0, 0 errores 0 warnings)
- [x] Lint + build frontend pasan vía `docker compose build frontend` (stages `RUN npm run lint` y `RUN npm run build` ejecutados, imagen construida)
- [x] No hay `console.log` de debug olvidados en los archivos nuevos (el único `console.log` del proyecto es el del arranque en index.js, intencional)
- [x] No hay código comentado sin explicación
- [x] `better-sqlite3` usado de forma síncrona — sin async/await sobre sus métodos en ningún archivo nuevo
- [x] Prepared statements en todo el acceso a datos; los nombres de tabla interpolados en gamePack.js provienen de objetos `cfg` literales del propio código (no de input), los valores siempre van parametrizados
- [x] Import de pack transaccional (`db.transaction(fn)()`) — revierte ante pack inválido (verificado por test y por smoke)
- [x] `db/index.js` migrations sigue VACÍO (`const migrations = []`); los packs viven como ARCHIVOS en `game-packs/`, NO como seeds en migraciones
- [x] Game pack JSON versionado (`pack_version: "1.0"`), export↔import coherente (round-trip deepEqual confirmado)
- [x] Frontend solo Tailwind + tokens — CERO `const s = {…}`, CERO `style={{…}}`, CERO `window.innerWidth`/`useWindowWidth` (grep sin coincidencias en DMMaster). `inputCls` es cadena de clases Tailwind reutilizada, no objeto de estilos
- [x] Responsive con breakpoints (`md:`); mobile-first
- [x] Componentes cableados, no huérfanos: GameSystemPanel importado y montado en Lobby.jsx (solo DM, `view === 'systems'`); SkillsPanel/ItemsPanel renderizados dentro de las pestañas de GameSystemPanel
- [x] Autorización DM en CRUD: `requireOwnedSystem`/`requireOwnedMechanic`/`requireOwnedFormat` validan dueño; create exige `role = 'dm'`; import exige DM válido
- [x] Routers registrados en index.js (`/api/game-systems`, `/api/skills`, `/api/items`, `/api/game-packs`)
- [x] Validación de input al inicio de los handlers (400 con mensaje claro)
- [x] Nombres descriptivos en inglés
- [x] Tests existen y cubren round-trip + pack inválido + transaccionalidad (21/21 pass, 7 nuevos)
- [x] Reporte impl_F2-game-systems.md presente
- [x] Reporte review_F2-game-systems.md escrito (este archivo)

## Resultado de verificación (Docker — canónico, ejecutado literalmente)
- `docker compose up -d --build`: ✅ ambas imágenes construidas y contenedores arriba
- lint backend: ✅ `docker compose exec backend npm run lint` → exit 0 (0 errores, 0 warnings)
- test backend: ✅ `docker compose exec backend npm test` → `# pass 21 / # fail 0` (incl. los 7 de gamePack)
- build frontend: ✅ `docker compose build frontend` → stages lint y build ejecutados, `naming to rolapp-v1-frontend:latest` OK
- health: ✅ `curl http://localhost:3000/api/health` → `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`
- Smoke (importar stormlight.json, listar, exportar) vía backend en contenedor:
  - import → 201, game_system_id asignado, name "Stormlight RPG"
  - list `/api/game-systems` → 200, Stormlight con `attribute_count` 13
  - detail → 13 atributos / 3 slots / 2 mecánicas (mecánica 0 con 1 param)
  - export `/api/game-systems/:id/export` → 200, `pack_version 1.0`, 13 attrs, 1 skill_format con 15 skills; skill de ejemplo "Agility" con `values.attribute = "Speed"` (referencia por NOMBRE preservada)
  - round-trip (reimport del export → re-export) → deepEqual `true`
  - pack inválido (`pack_version 9.9`) → 400 "pack_version no soportada: 9.9"
  - crear sistema con dm inexistente → 403 "Solo un DM puede crear sistemas de juego"
- Scope: ✅ `git status` muestra exactamente los archivos declarados; sin ediciones fuera de scope

## Lecciones aplicadas correctamente
- "Routers que emiten por socket → factory": F2 es CRUD puro sin socket; routers exportados como `export default router` simple. Correcto.
- "better-sqlite3 síncrono" + "prepared statements siempre": cumplido en todos los archivos; import usa `db.transaction(fn)()`.
- "Una feature de frontend no está terminada hasta estar cableada": GameSystemPanel montado y navegable desde Lobby (botón solo DM); SkillsPanel/ItemsPanel embebidos en pestañas. Sin huérfanos (grep confirmado).
- "Cero estilos inline / cero window.innerWidth": cumplido (grep sin coincidencias).
- "ESLint frontend necesita eslint-plugin-react": el lint corre limpio; los `eslint-disable-next-line react-hooks/exhaustive-deps` apuntan a una regla de un plugin registrado (no rompen, según la lección de F5).
- "El lint/test debe correr en Docker": verificado en el entorno canónico, no "en teoría".

## Puntos a corregir (si RECHAZADO)
N/A — APROBADO.

## Observaciones (no bloqueantes)
1. **Interpolación de nombres de tabla en gamePack.js** (`serializeFormats`/`importFormats` arman SQL con `${cfg.formatsTable}` etc.). No es inyección: los valores de `cfg` son literales hardcodeados en el propio servicio, nunca input del usuario, y los datos siempre van por placeholders `?`. Patrón aceptable de reuso DRY skill/item; se deja anotado por claridad para futuros mantenedores.
2. **`base_character_attrs.attribute_template_id`** no se rellena en el import (queda NULL; la columna es nullable). El export tampoco lo lee y la idempotencia del round-trip no se ve afectada. Si F3 (personajes) requiere ligar atributos de base_characters a sus templates por id, habrá que mapearlos entonces.
3. **Endpoint de export bajo `/api/game-systems/:id/export`** (en gameSystems.js) y el import bajo `/api/game-packs/import` (en gamePacks.js). Asimetría deliberada y documentada en el reporte/spec; coherente con el round-trip verificado.
4. **`PUT`/CRUD de skills e items** no fueron expuestos por la UI (la UI usa create/delete y recrear). Los endpoints PUT existen y están testeados indirectamente vía round-trip; no bloquea la feature.
5. El smoke se corrió contra `:3001` dentro del contenedor backend (no hay Node ni curl en el host); health y proxy `/api` confirmados vía `:3000`.

## Candidatos para LEARNINGS.md
- **Packs portables = referencias por nombre, no por id** (ya propuesto por el implementer): el pack referencia atributos y campos de skill/item por `name`; el importador mapea nombre→id dentro de la transacción. Mantener la convención en F3/F6 para que los packs sigan siendo compartibles entre instalaciones. Recomiendo promover esta lección a la categoría "Arquitectura" o "Base de datos".
- **Import data-driven con reuso skill/item:** interpolar nombres de tabla desde un objeto `cfg` literal (nunca input) es un patrón DRY válido para CRUD/serialización paralelos, siempre que los valores sigan parametrizados. Útil como nota de testing/arquitectura para evitar falsos positivos de "SQL injection" en revisiones.
- **Smoke de endpoints sin curl ni Node en el host** (ya propuesto por el implementer): usar `docker cp` del script + pack al contenedor y `docker compose exec -T backend node <script>`, apuntando a `http://localhost:3001` desde dentro. Nota adicional para Git Bash en Windows: prefijar con `MSYS_NO_PATHCONV=1` y usar `//script.mjs` para evitar que la conversión de rutas POSIX mangle el path absoluto del script.

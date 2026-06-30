# Revisión: F3 — Personajes (ficha dinámica por game system)
Fecha: 2026-06-30
Veredicto: APROBADO

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa en el contenedor (`docker compose exec backend npm run lint`) — 0 errores, 0 warnings.
- [x] Lint + build frontend pasan vía `docker compose build frontend` (forzados en build stage; imagen construida OK).
- [x] No hay `console.log` de debug en el código nuevo (solo el log intencional de arranque en `index.js`, preexistente).
- [x] `better-sqlite3` usado de forma síncrona: cero `async`/`await`/`.then()` sobre sus métodos en `characters.js` y `baseCharacters.js` (grep vacío).
- [x] Prepared statements en todo el acceso a datos; cero interpolación de valores en SQL (los `${parts.join(', ')}` son listas de columnas fijas, no input).
- [x] `db.transaction` usado en: borrado de personaje (limpia `session_characters`), upsert de atributos, `adopt` (crear-desde-pregen) y reemplazo de attrs del pregen.
- [x] `session_events` tratado como append-only (los vínculos a sesión usan `logEvent` → solo INSERT).
- [x] Frontend: estilos solo Tailwind + tokens. Cero `const s = {…}`, cero `style={{}}` (grep vacío en `frontend/src`).
- [x] Frontend: cero `window.innerWidth` / `useWindowWidth` (grep vacío). Responsive con breakpoints (`md:`/`lg:`).
- [x] Ficha dinámica: atributos renderizados según el game system (agrupados por `category`, `is_core` con ★, `has_max` como valor/máx, `type` boolean/number/text). Nada hardcodeado.
- [x] Nombres descriptivos en inglés; un componente por archivo; routers delgados.
- [x] Tests existen y pasan: 11 nuevos (caso feliz + error en cada flujo clave).
- [x] Respeta la estructura de `architecture.md` (routes/ , components/ , pages/ , lib/api.js).
- [x] No se instalaron dependencias nuevas.
- [x] Routers nuevos registrados en `index.js` (`/api/characters` factory tras instanciar io; `/api/base-characters`).
- [x] Reportes de progreso: `impl_F3-characters.md` presente; este reporte de review escrito.
- [x] Componentes cableados, no huérfanos (ver sección dedicada).
- [x] Autorización correcta (ver sección dedicada).
- [x] FK fix verificado (ver sección dedicada).
- [x] Scope: solo se tocaron los archivos declarados en el reporte (git status coincide exactamente).

## Resultado de verificación (Docker — canónico, ejecutado literalmente)
- `docker compose up -d --build`: ✅ ambas imágenes construidas y contenedores arriba (frontend build = lint + build forzados en build stage → frontend lint+build en verde).
- `docker compose exec backend npm run lint`: ✅ 0 errores, 0 warnings.
- `docker compose exec backend npm test`: ✅ **32 tests, 0 fallos** (31 previos + 11 de F3, según el desglose del archivo `characters.test.js`).
- `docker compose build frontend`: ✅ build OK (incluido en el `up --build`).
- `curl http://localhost:3000/api/health`: ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.
- Smoke e2e vía API (script node contra el backend, datos limpiados al final):
  - Crear sistema + atributos (HP has_max, Fuerza) + slot (max_items=1) + items + skill: ✅
  - `POST /characters` (en game system): ✅ 201
  - `PUT /:id/attributes` HP=8/12, Fuerza=3 (upsert con max_value): ✅ 200
  - `POST /:id/inventory`: ✅ 201
  - `POST /:id/equipment` (equipar): ✅ 201; segundo item en slot lleno: ✅ **409 "El slot está lleno"**
  - `POST /:id/skill-links` con rank 2: ✅ 201, rank persistido
  - `POST /:id/sessions/:sessionId` (vincular): ✅ 201; `GET /characters/session/:id`: ✅ count=1
  - `POST /base-characters/:id/adopt`: ✅ 201, copió Fuerza=5, inventario(1), skill rank 3 (transaccional)

## Componentes cableados (no huérfanos)
- `CharacterSheet` → importado y usado por `MyCharacters.jsx` y `SessionCharactersPanel.jsx`.
- `MyCharacters` → importado en `Lobby.jsx`, montado en la vista `characters` (botón "⚔️ Mis personajes", visible para todos).
- `BaseCharactersPanel` → importado en `Lobby.jsx`, montado en la vista `base-characters` (botón "🧙 Personajes base", solo DM).
- `SessionCharactersPanel` → importado en `SessionView.jsx`, montado en la pestaña ⚔️ `characters` (todos).
- Todos los flujos de usuario quedan alcanzables. Lección de F5 (componentes huérfanos) aplicada correctamente.

## Autorización (verificada en código)
- Dueño edita siempre su personaje; DM gestiona los vinculados a SUS sesiones (`requireEditable` con join `session_characters`→`sessions.dm_id`).
- `DELETE /characters/:id` restringido al dueño (403 si no).
- Vincular/desvincular a sesión: dueño del personaje o DM de la sesión.
- `base-characters`: solo el DM dueño edita (`requireOwnedBase`); `adopt` de pregen no público restringido a su DM.
- En frontend `canEdit` solo decide mostrar controles; el backend valida de verdad. Correcto.

## FK fix declarado (verificado)
- `schema.sql` línea 61: `session_characters.character_id INTEGER NOT NULL REFERENCES characters(id)` — **sin `ON DELETE CASCADE`**. Premisa de la decisión confirmada.
- `DELETE /characters/:id` borra primero las filas de `session_characters` y luego el personaje dentro de un `db.transaction` (líneas 202-205).
- Test `'DELETE /:id borra un personaje aunque esté vinculado a una sesión'` lo cubre y pasa; el smoke también vinculó y luego borró sin error.
- `character_equipment` sí tiene `ON DELETE CASCADE` y `UNIQUE(character_id, slot_id, item_id)`, coherente con el manejo de 409 al equipar.

## Lecciones aplicadas correctamente
- "Routers que emiten por socket → factory `createXRouter(io)`": `createCharactersRouter(io)` montado tras instanciar io. ✅
- "Una feature de frontend no está terminada hasta que sus componentes estén cableados": todos montados y accesibles. ✅
- "Cero estilos inline, cero window.innerWidth": barra de estado (HP) usa `BAR_WIDTHS` (clases Tailwind literales bucketizadas), sin `style`. ✅
- "better-sqlite3 síncrono + prepared statements + transacciones": ✅
- `session_events` append-only: ✅

## Observaciones (no bloqueantes)
1. `SessionCharactersPanel` declara la prop `session` en su firma (`{ sessionId, session, user }`) pero `SessionView` no la pasa y el cuerpo no la usa. Prop muerta inofensiva; conviene eliminarla de la firma para evitar confusión. No rompe lint ni runtime.
2. Existen dos caminos para vincular personaje a sesión con lógica casi idéntica: `POST /api/characters/:id/sessions/:sessionId` (router de characters, usado por la UI) y `POST /api/sessions/:id/characters` (router de sessions, declarado en el reporte). Ambos funcionan y emiten `characters:list_updated`; la duplicación es menor pero podría unificarse en un servicio compartido en una iteración futura.
3. `getCharacterFull` se invoca por cada fila en los listados (`GET /` y `GET /session/:id`), haciendo N×6 queries. Para el tamaño de mesa esperado (pocos personajes) es irrelevante; anotar por si crece.
4. El borrado de personaje confía en `ON DELETE CASCADE` para las tablas hijas (attrs, skills, inventario, equipment) y limpia `session_characters` a mano; verificado que esas hijas sí cascadean en el schema. Correcto, pero deja el patrón "una tabla puente sin cascade" como deuda de schema (reservada a F1).

## Candidatos para LEARNINGS.md
- **FK sin ON DELETE en tablas puente → limpiar en el handler dentro de la transacción.** `session_characters` referencia `characters(id)` sin `ON DELETE CASCADE`; con `foreign_keys=ON`, borrar el padre lanza `FOREIGN KEY constraint failed`. Al borrar una entidad con hijos en una tabla puente sin cascade, eliminar primero las filas puente en la misma transacción. (Categoría: Base de datos / SQLite.)
- **Anchos dinámicos sin inline = clases Tailwind literales bucketizadas.** Para una barra de progreso sin `style={{width}}`, mapear el porcentaje a un set fijo de clases `w-*` escritas completas para que el JIT de Tailwind las incluya en el build. (Categoría: Frontend.)

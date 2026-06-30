# Implementación: F8a — Coherencia de sistema de juego campaña ↔ personaje
Fecha: 2026-06-30
Status: completado

## Comportamiento actual observado (antes de tocar nada)
- **Vínculo personaje ↔ sesión:** NO había ninguna validación de sistema de juego.
  Existen DOS endpoints que insertan en `session_characters`, ambos solo validaban
  permisos (dueño o DM):
  - `POST /api/sessions/:id/characters` (en `routes/sessions.js`) — el que usa el
    frontend vía `api.addCharacterToSession`.
  - `POST /api/characters/:id/sessions/:sessionId` (en `routes/characters.js`) — endpoint
    alterno `api.linkCharacterToSession`, también funcional.
- **Creación de campaña:** el esquema ya tenía `campaigns.game_system_id`, pero el
  router `campaigns.js` NO lo aceptaba ni lo devolvía, y NO existía edición (PUT/PATCH).
  Además, **no había ninguna UI para crear campañas** en el frontend: el Lobby solo
  permitía elegir una campaña ya existente al crear una sesión.
- `GET /api/sessions` y `GET /api/sessions/:id` devolvían `campaign_name` pero no el
  `game_system_id` de la campaña, así que el frontend no podía filtrar personajes.

## Archivos creados
- `backend/src/services/gameSystemCoherence.js`: helper `checkCharacterFitsSession(sessionId, characterId)`.
  Centraliza la regla para no duplicarla en los dos endpoints. Devuelve `{ ok: true }`
  o `{ ok: false, error }`. Aplica compatibilidad hacia atrás: sesión sin campaña o
  campaña sin `game_system_id` → permite cualquier personaje. better-sqlite3 síncrono.
- `backend/src/routes/campaigns.test.js`: tests del router de campañas (POST con/ sin
  `game_system_id`, GET con `game_system_name`, PUT edita, PUT 403 a otro DM).

## Archivos modificados
- `backend/src/routes/campaigns.js`:
  - POST acepta y guarda `game_system_id` (opcional, NULL si vacío).
  - Nuevo `PUT /api/campaigns/:id` (edición mínima: name/description/game_system_id;
    solo el DM dueño, 403 en otro caso).
  - GET (lista y :id) ahora hacen `LEFT JOIN game_system_templates` y devuelven
    `game_system_name` además del `game_system_id`.
- `backend/src/routes/sessions.js`:
  - Import de `checkCharacterFitsSession`; validación antes del INSERT en
    `POST /:id/characters` → responde **422** si no coincide.
  - Las queries de `GET /` y `GET /:id` ahora exponen `campaign_game_system_id`
    (para que el frontend filtre).
- `backend/src/routes/characters.js`:
  - Import de `checkCharacterFitsSession`; misma validación 422 en el endpoint
    alterno `POST /:id/sessions/:sessionId`.
- `frontend/src/lib/api.js`:
  - `createCampaign(name, dmId, description, gameSystemId)` — firma ampliada,
    compatible hacia atrás (4º arg opcional).
  - Nuevo `updateCampaign(id, dmId, fields)`.
- `frontend/src/pages/Lobby.jsx`:
  - Nueva card "Nueva campaña" (solo DM) con selector de game system (alimentado por
    `api.listGameSystems`). Llama a `api.createCampaign` con el `game_system_id`.
  - Carga de `gameSystems`; recarga de campañas tras crear una.
  - El selector de campaña al crear sesión ahora muestra el sistema entre paréntesis.
- `frontend/src/pages/SessionView.jsx`:
  - Pasa la prop `session` a `SessionCharactersPanel` (antes solo recibía `sessionId`,
    por eso no podía filtrar).
- `frontend/src/components/Session/SessionCharactersPanel.jsx`:
  - Filtra los personajes "llevables" por `session.campaign_game_system_id` cuando la
    campaña define sistema; si no, sin filtro (compatibilidad hacia atrás).
  - Aviso claro cuando el jugador tiene personajes pero ninguno compatible.
  - El manejo del error 422 del backend ya estaba cubierto por el `catch` existente
    de `bringCharacter`, que muestra el mensaje al usuario.

## Tests escritos
- `backend/src/routes/campaigns.test.js`: 5 tests (game_system_id en POST/GET, NULL,
  PUT edita, PUT 403).
- `backend/src/routes/sessions.test.js` (ampliado): coincide→201, no coincide→422 (y
  no inserta), campaña sin sistema→201, sesión sin campaña→201. Se añadió limpieza de
  `session_characters`, `characters` y `game_system_templates` al `beforeEach`.
- `backend/src/routes/characters.test.js` (ampliado): endpoint alterno
  `POST /:id/sessions/:sessionId` → 422 si no coincide (y no inserta), 201 si coincide.
  Se añadió `DELETE FROM campaigns` al `beforeEach` (tras `sessions`, antes de
  `game_system_templates`, por las FKs).

## Resultado de verificación (Docker — canónico)
- `docker compose up -d --build`: ✅ (frontend build = lint + build forzados en build stage → ✅)
- `docker compose exec backend npm run lint`: ✅ 0 errores
- `docker compose exec backend npm test`: ✅ 64 tests, 63 pass, 1 skip
  (el skip es el test pre-existente de RAG "vec/FTS activos", ajeno a F8a; 0 fail)
- `docker compose build frontend`: ✅ (incluido en el build de arriba)
- `curl http://localhost:3000/api/health`: `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`

### Smoke vía :3000 (curl + respuestas)
- Crear game system A (id 12) y B (id 13): 201.
- Campaña con `game_system_id=12`: devuelve `"game_system_id":12,"game_system_name":"Smoke A"`.
- Sesión en esa campaña (id 11). Personaje PjA en sistema A (id 6), PjB en sistema B (id 7).
- `POST /sessions/11/characters` con PjA → **HTTP 201** `{"ok":true,...}`.
- `POST /sessions/11/characters` con PjB → **HTTP 422** `{"error":"El personaje no pertenece al sistema de juego de la campaña"}`.
- `POST /characters/7/sessions/11` (endpoint alterno) con PjB → **HTTP 422**.
- `PUT /campaigns/4` por el DM dueño → 200 (cambia el sistema); por otro DM → **403**.

## Lecciones aplicadas
- "better-sqlite3 es síncrono" (DB/SQLite): el helper usa `db.prepare(...).get(...)` directo, sin async.
- "Prepared statements siempre" (conventions): toda la validación y el PUT usan prepared statements.
- "Una feature de frontend no está terminada hasta que sus componentes estén cableados"
  (Frontend): detecté que `SessionCharactersPanel` recibía `session` en su firma pero
  `SessionView` nunca se lo pasaba → lo cablé. El selector de game system se montó en
  una card visible del Lobby, no quedó huérfano.
- "El lint/test debe poder correr en Docker" + "No declarar checkpoint en verde sin
  ejecutarlo" (Proceso): todo se verificó dentro del contenedor, no en teoría.

## Decisiones tomadas
- **Helper compartido en `services/`** en vez de duplicar la regla: hay dos endpoints
  que insertan en `session_characters`. Centralizar evita divergencia.
- **Validé los DOS endpoints** (sessions.js y characters.js), aunque el frontend solo
  usa el de sessions.js, para que la regla no tenga puerta trasera.
- **Código 422** (Unprocessable Entity) según indicación del líder, no 409/400.
- **PUT (no PATCH)** para editar campaña, por consistencia con `updateCampaign`/`updateGameSystem`
  ya existentes en `api.js` que usan PUT.
- **Añadí UI de creación de campaña**: no existía. Era requisito del paso 4 ("selector
  de game system en la creación de campaña"), imposible sin un formulario de campaña.
- **`campaign_game_system_id` en las queries de sesión**: forma mínima de llevar el
  sistema de la campaña al frontend sin un fetch extra. El objeto `session` que viaja
  al `SessionView` proviene de `listSessions`/`join`, que ya lo incluyen.
- No instalé dependencias nuevas.

## Candidatos para LEARNINGS.md
- **Dos rutas insertan en `session_characters`** (`POST /sessions/:id/characters` y
  `POST /characters/:id/sessions/:sessionId`). Cualquier regla de negocio sobre el
  vínculo personaje↔sesión debe aplicarse en AMBAS o centralizarse en un service, o
  queda una puerta trasera. (Categoría: Backend / Arquitectura.)
- **El `beforeEach` de los tests con `:memory:` y `foreign_keys=ON` exige orden de
  borrado coherente con las FKs:** borrar `campaigns` después de `sessions`
  (sessions.campaign_id → campaigns) y antes de `game_system_templates`/`users`.
  (Categoría: Testing.)

## Bloqueantes
Ninguno.

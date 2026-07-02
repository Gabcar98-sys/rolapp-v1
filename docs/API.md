# RolApp v1.0 — Referencia de API

> Backend Express en `:3001`, servido tras el proxy nginx en `http://localhost:3000/api/*`.
> Realtime por Socket.io en el mismo origen (`/socket.io`).

## Convenciones

- **Auth**: es red local, sin JWT. Las acciones llevan el identificador del usuario en el
  body o query (`dm_id` / `user_id`). Las acciones de DM verifican que ese `dm_id` sea el
  dueño del recurso; si no, responden **403**.
- **Respuestas**: éxito → JSON con el recurso (`{ data }` o `{ <recurso> }`); error →
  `{ "error": "mensaje" }` con el código HTTP correspondiente (400 validación, 401 auth,
  403 no autorizado, 404 no existe, 409 conflicto, 422 regla de negocio, 503 IA no disponible).
- **`:id`** y similares son parámetros de ruta. `?x=` son query params.

---

## Salud y estado

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/health` | Estado del servicio: versión, `vecEnabled`/`ftsEnabled` (retrieval) y `ai` (motor configurado). No sondea Ollama. |
| GET | `/api/ai/status` | Sondea si el LLM y los embeddings responden; incluye `provider`, `model` y `toolsEnabled`. Usado por el AIPanel para el badge de estado. |

---

## Autenticación — `/api/auth`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/register` | Crea usuario. Body: `{ username, pin, role: 'dm'\|'player' }`. PIN con hash SHA-256. |
| POST | `/api/auth/login` | Inicia sesión. Body: `{ username, pin }`. Devuelve el usuario público (id, username, role). |

---

## Campañas — `/api/campaigns`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/campaigns?dm_id=` | Lista las campañas de un DM (con su sistema de juego). |
| GET | `/api/campaigns/:id` | Detalle de una campaña. |
| POST | `/api/campaigns` | Crea campaña. Body: `{ name, dm_id, description?, game_system_id? }`. |
| PUT | `/api/campaigns/:id` | Edita campaña (incl. `game_system_id`). Solo el DM dueño (403 si no). |

> El `game_system_id` de la campaña se usa para validar la **coherencia** con los personajes (ver `/api/sessions/:id/characters`).

---

## Sistemas de juego — `/api/game-systems`

Sistema de juego configurable (atributos, slots de equipo, mecánicas). Todo edición del DM dueño.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/game-systems?dm_id=` | Lista sistemas de juego de un DM. |
| GET | `/api/game-systems/:id` | Detalle completo (atributos, slots, mecánicas). |
| GET | `/api/game-systems/:id/export` | Exporta el sistema como **game pack JSON** (para compartir/importar). |
| POST | `/api/game-systems/:id` *(POST `/`)* | Crea sistema. Body: `{ dm_id, name, description? }`. |
| PUT | `/api/game-systems/:id` | Edita nombre/descripción. |
| DELETE | `/api/game-systems/:id` | Elimina el sistema (cascada a sus atributos, etc.). |
| **Atributos** | | |
| GET | `/api/game-systems/:id/attributes` | Lista atributos del sistema (type, category, `is_core`, `has_max`, `formula`). |
| POST | `/api/game-systems/:id/attributes` | Crea atributo. |
| PUT | `/api/game-systems/:id/attributes/:attrId` | Edita atributo. |
| DELETE | `/api/game-systems/:id/attributes/:attrId` | Elimina atributo. |
| **Slots de equipo** | | |
| GET | `/api/game-systems/:id/equipment-slots` | Lista slots de equipo. |
| POST | `/api/game-systems/:id/equipment-slots` | Crea slot (`name`, `slot_key`, `max_items`). |
| PUT | `/api/game-systems/:id/equipment-slots/:slotId` | Edita slot. |
| DELETE | `/api/game-systems/:id/equipment-slots/:slotId` | Elimina slot. |
| **Mecánicas** | | |
| GET | `/api/game-systems/:id/mechanics` | Lista mecánicas (+ sus parámetros). |
| POST | `/api/game-systems/:id/mechanics` | Crea mecánica (`name`, `mechanic_type`, `affects`). |
| PUT | `/api/game-systems/:id/mechanics/:mechId` | Edita mecánica. |
| DELETE | `/api/game-systems/:id/mechanics/:mechId` | Elimina mecánica. |
| POST | `/api/game-systems/:id/mechanics/:mechId/params` | Añade parámetro a la mecánica. |
| PUT | `/api/game-systems/:id/mechanics/:mechId/params/:paramId` | Edita parámetro. |
| DELETE | `/api/game-systems/:id/mechanics/:mechId/params/:paramId` | Elimina parámetro. |

### Game packs — `/api/game-packs`

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/game-packs/import` | Importa un pack JSON completo (crea el sistema + atributos, formatos, skills, items, slots, mecánicas y personajes base) en una transacción. Body: `{ dm_id, pack }`. El export está en `/api/game-systems/:id/export`. |

---

## Formatos de habilidad y habilidades — `/api/skills`

Formatos = campos parametrizables; habilidades = entradas del catálogo con valores.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/skills/formats?dm_id=&game_system_id=` | Lista formatos de habilidad. |
| GET | `/api/skills/formats/:id` | Detalle de un formato (con sus campos). |
| POST | `/api/skills/formats` | Crea formato. |
| PUT | `/api/skills/formats/:id` | Edita formato. |
| DELETE | `/api/skills/formats/:id` | Elimina formato. |
| POST | `/api/skills/formats/:id/fields` | Añade un campo al formato. |
| DELETE | `/api/skills/formats/:formatId/fields/:fieldId` | Elimina un campo. |
| GET | `/api/skills?...` | Lista habilidades (filtrable por formato/sistema). |
| GET | `/api/skills/:id` | Detalle de una habilidad (con sus valores). |
| POST | `/api/skills` | Crea habilidad con sus valores de campo. |
| PUT | `/api/skills/:id` | Edita habilidad. |
| DELETE | `/api/skills/:id` | Elimina habilidad. |

---

## Items maestros — `/api/items`

Mismo patrón que skills (formatos + entidades).

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/items/formats` · GET `/api/items/formats/:id` | Lista / detalle de formatos de item. |
| POST | `/api/items/formats` · PUT `/api/items/formats/:id` · DELETE `/api/items/formats/:id` | CRUD de formatos. |
| POST | `/api/items/formats/:id/fields` · DELETE `/api/items/formats/:formatId/fields/:fieldId` | Campos del formato. |
| GET | `/api/items` · GET `/api/items/:id` | Lista / detalle de items. |
| POST | `/api/items` · PUT `/api/items/:id` · DELETE `/api/items/:id` | CRUD de items con sus valores. |

---

## Personajes — `/api/characters`

Ficha dinámica según el sistema de juego. El dueño edita el suyo; el DM ve los de su sesión.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/characters?user_id=` | Lista los personajes de un usuario ("Mis personajes"). |
| GET | `/api/characters/session/:sessionId` | Personajes vinculados a una sesión. |
| GET | `/api/characters/:id` | Ficha completa: atributos + skills (con rank) + inventario + equipo. |
| POST | `/api/characters` | Crea personaje. Body: `{ user_id, name, game_system_template_id }`. |
| PATCH | `/api/characters/:id` | Edita datos básicos (nombre, etc.). |
| DELETE | `/api/characters/:id` | Elimina personaje (limpia vínculos a sesión). |
| PUT | `/api/characters/:id/attributes` | Actualiza valores de atributos (y máximos). |
| POST | `/api/characters/:id/skill-links` | Enlaza una habilidad del catálogo (con `rank`). |
| DELETE | `/api/characters/:id/skill-links/:skillId` | Quita una habilidad enlazada. |
| POST | `/api/characters/:id/skills` | Añade una habilidad manual (texto libre). |
| DELETE | `/api/characters/:id/skills/:skillId` | Elimina una habilidad manual. |
| POST | `/api/characters/:id/inventory` | Añade ítem al inventario. |
| PUT | `/api/characters/:id/inventory/:itemId` | Edita ítem del inventario. |
| DELETE | `/api/characters/:id/inventory/:itemId` | Elimina ítem del inventario. |
| POST | `/api/characters/:id/equipment` | Equipa un item en un slot (409 si el slot está lleno). |
| DELETE | `/api/characters/:id/equipment/:equipId` | Desequipa. |
| POST | `/api/characters/:id/sessions/:sessionId` | Vincula el personaje a una sesión (equivale a `/sessions/:id/characters`). |
| DELETE | `/api/characters/:id/sessions/:sessionId` | Desvincula el personaje de una sesión. |

### Personajes base / pregens — `/api/base-characters`

Plantillas del DM por sistema de juego (los jugadores pueden "adoptarlas").

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/base-characters?dm_id=` | Lista los pregens de un DM. |
| GET | `/api/base-characters/:id` | Detalle de un pregen. |
| POST | `/api/base-characters` · PUT `/api/base-characters/:id` · DELETE `/api/base-characters/:id` | CRUD de pregens. |
| PUT | `/api/base-characters/:id/attrs` | Actualiza sus atributos. |
| POST | `/api/base-characters/:id/inventory` · DELETE `/api/base-characters/:id/inventory/:itemId` | Inventario del pregen. |
| POST | `/api/base-characters/:id/skill-links` · DELETE `/api/base-characters/:id/skill-links/:skillId` | Skills del pregen. |
| POST | `/api/base-characters/:id/adopt` | Crea un personaje de jugador **a partir del pregen** (copia attrs/inventario/skills, transaccional). |

---

## Sesiones — `/api/sessions`

Ciclo de vida de la sesión. Acciones de DM validan al dueño.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sessions?status=active\|closed` | Lista sesiones por estado (con campaña y conteo de miembros). |
| GET | `/api/sessions/:id` | Detalle (miembros + personajes). |
| POST | `/api/sessions` | Crea sesión activa. Body: `{ name, dm_id, campaign_id?, prep_id? }`. |
| PATCH | `/api/sessions/:id/close` | Cierra la sesión (status `closed`). Genera el **snapshot de estadísticas**. Solo DM dueño. |
| PATCH | `/api/sessions/:id/reset` | Limpia el canvas de la sesión. Solo DM dueño. |
| POST | `/api/sessions/:id/members` | Une un usuario como miembro (idempotente). Body: `{ user_id }`. |
| POST | `/api/sessions/:id/characters` | Vincula un personaje. **422** si el sistema del personaje no coincide con el de la campaña. |
| GET | `/api/sessions/:id/events` | Log de eventos de la sesión (append-only). |
| POST | `/api/sessions/:id/events` | Registra/dispara un evento (planificación/NPC). Se emite por socket. Append-only. |

### Canvas — `/api/canvas`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/canvas/:sessionId` | Estado del canvas (imagen compartida + snapshot tldraw). |
| PATCH | `/api/canvas/:sessionId` | Fija la imagen de fondo. Body: `{ dm_id, image_url }`. Solo DM. |

---

## Planificación de sesión

### Preparaciones — `/api/session-preps`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/session-preps?dm_id=&campaign_id=` | Lista preparaciones. |
| GET | `/api/session-preps/:id` | Jerarquía completa: ubicaciones → sub-ubicaciones → eventos (+ ramas) + enlaces. |
| POST | `/api/session-preps` | Crea preparación. |
| PUT | `/api/session-preps/:id` | Edita preparación. |
| DELETE | `/api/session-preps/:id` | Elimina preparación (cascada). |

### Ubicaciones — `/api/locations` · Sub-ubicaciones — `/api/sub-locations`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/locations?prep_id=` | Lista ubicaciones de una prep. |
| POST/PUT/DELETE | `/api/locations` · `/api/locations/:id` | CRUD de ubicaciones. |
| GET | `/api/sub-locations?location_id=` | Lista sub-ubicaciones. |
| POST/PUT/DELETE | `/api/sub-locations` · `/api/sub-locations/:id` | CRUD de sub-ubicaciones. |

### Plantillas de evento y grafo — `/api/event-templates`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/event-templates?dm_id=&campaign_id=&prep_id=` | Lista eventos (con jerarquía/ramas). |
| POST | `/api/event-templates` | Crea evento (categoría, ubicación/sub, rama, etc.). |
| PUT | `/api/event-templates/:id` | Edita evento (usado por el editor visual y la edición en sesión). Solo DM. |
| DELETE | `/api/event-templates/:id` | Elimina evento. |
| POST | `/api/event-templates/links` | Crea un enlace entre dos eventos (`from_event_id → to_event_id`, `label`) — aristas del grafo. |
| DELETE | `/api/event-templates/links/:id` | Elimina un enlace. |

### NPCs — `/api/npcs`

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/npcs?dm_id=&game_system_id=` | Lista NPCs del DM. |
| GET | `/api/npcs/:id` | Detalle (con quests e inventario). |
| POST/PUT/DELETE | `/api/npcs` · `/api/npcs/:id` | CRUD de NPCs. |
| POST | `/api/npcs/:id/quests` · DELETE `/api/npcs/:id/quests/:qid` | Quests del NPC. |
| POST | `/api/npcs/:id/inventory` · DELETE `/api/npcs/:id/inventory/:iid` | Inventario del NPC. |
| POST | `/api/npcs/:id/campaigns` · DELETE `/api/npcs/:id/campaigns/:cid` | Vincula/desvincula el NPC a campañas. |

---

## IA / RAG — `/api/ai`, `/api/rag`, docs

IA híbrida (Ollama local o API externa). Degrada con **503** si el motor no está disponible.

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/ai/status` | Estado del motor de IA (provider, model, `toolsEnabled`, si responde). |
| POST | `/api/rag/search` | Búsqueda híbrida (vector + FTS5 con RRF) sobre los docs de un sistema. Body: `{ query, game_system_id, k? }`. Devuelve chunks citados. |
| POST | `/api/ai/ask` | Q&A de reglas con contexto citado. Body: `{ query, game_system_id, session_id? }`. Respuesta `{ answer, sources }`. *(También por socket con streaming.)* |
| POST | `/api/ai/assist-planning` | Sugerencias de planeación apoyadas en reglas + estado. |
| **Docs (para el RAG)** | | |
| GET | `/api/game-systems/:id/docs` | Lista los documentos `.md` de un sistema (con nº de chunks / estado). |
| POST | `/api/game-systems/:id/docs` | Ingiere un doc (chunking + FTS + embeddings si hay motor). Body: `{ title, content }`. |
| POST | `/api/game-systems/:id/docs/:docId/reindex` | Reingiere/reindexa un doc (genera embeddings pendientes cuando Ollama está arriba). |
| DELETE | `/api/game-systems/:id/docs/:docId` | Elimina un doc y sus chunks/vectores. |

---

## Estadísticas — derivadas del log

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sessions/:id/stats` | Estadísticas de la sesión (duración, eventos por categoría, participación, etc.). Devuelve el snapshot si existe, o las calcula al vuelo. |
| POST | `/api/sessions/:id/stats` | Fuerza el (re)cálculo y guarda el snapshot. |
| GET | `/api/campaigns/:id/stats` | Estadísticas agregadas de la campaña. |
| GET | `/api/characters/:id/stats` | Estadísticas del personaje (skills, atributos, participación). |

---

## Resumen de sesión (IA)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/api/sessions/:id/summary` | Devuelve el resumen guardado de la sesión (si existe). |
| POST | `/api/sessions/:id/summary` | Genera el resumen con IA (a partir de eventos + notas + personajes) y lo guarda. |

---

## Eventos de Socket.io (realtime)

Mismo origen, namespace por sesión: los clientes se unen a la room `session:<id>`.

### Sesión (presencia y eventos)
| Dirección | Evento | Payload |
|-----------|--------|---------|
| cliente → servidor | `session:join` | `{ sessionId, user }` — une el socket a la room. |
| cliente → servidor | `session:leave` | `{ sessionId, user }` |
| cliente → servidor | `session:fire_event` | `{ sessionId, actor_id?, type, payload }` — dispara un evento (append-only). |
| servidor → cliente | `session:users` | `{ users }` — lista de conectados (presencia). |
| servidor → cliente | `session:event_fired` | `{ event }` — evento disparado. |
| servidor → cliente | `session:error` | `{ message }` |

### Chat
| Dirección | Evento | Payload |
|-----------|--------|---------|
| cliente → servidor | `chat:history` | `{ sessionId }` → responde `chat:history` `{ messages }`. |
| cliente → servidor | `chat:message` | `{ sessionId, from, body, to? }` (privado si `to`). |
| servidor → cliente | `chat:message` | `{ message }` — mensaje difundido a la room (o al destinatario). |

### Canvas
| Dirección | Evento | Payload |
|-----------|--------|---------|
| cliente → servidor | `canvas:set_image` | `{ sessionId, imageUrl }` (solo DM). |
| cliente → servidor | `canvas:update` | `{ sessionId, document, version }` — snapshot de tldraw (dibujo libre). |
| cliente → servidor | `canvas:request_snapshot` | `{ sessionId }` → responde `canvas:updated`. |
| servidor → cliente | `canvas:image_changed` | `{ imageUrl }` |
| servidor → cliente | `canvas:updated` | `{ document, version }` — snapshot actual del canvas. |

### IA (streaming)
| Dirección | Evento | Payload |
|-----------|--------|---------|
| cliente → servidor | `ai:ask` | `{ requestId, query, gameSystemId, history? }` — Q&A de reglas con streaming. |
| cliente → servidor | `ai:assist_planning` | `{ requestId, sessionId?, gameSystemId?, prompt, history? }` |
| servidor → cliente | `ai:token` | `{ requestId, token }` — token en vivo. |
| servidor → cliente | `ai:answer_done` | `{ requestId, answer, sources }` — respuesta final + citas. |
| servidor → cliente | `ai:error` | `{ requestId, error }` |

> El helper de cliente `streamAiAsk()` en `frontend/src/lib/socket.js` enruta estos eventos por `requestId`.

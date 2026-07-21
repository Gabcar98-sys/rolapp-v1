# Scout F16 — Gestor de NPCs (inventario solo-lectura)

> Fecha: 2026-07-20. Rama: `master`. Feature `F16-npcs` está `pending` en `feature_list.json:147`.
> Objetivo: medir cuánto de F16 ya existe para no reimplementar. NO se tocó código de la app.

## (a) Requisito → estado → evidencia

### Backend
| Requisito | Estado | Evidencia |
|---|---|---|
| Router `/api/npcs` CRUD (dm_id, game_system_id opcional) | **hecho** | `backend/src/routes/npcs.js:24-131` — GET list (filtra por dm_id + game_system_id opcional, incluye quest_count/inventory_count), GET :id (con quests+inventory+campaigns), POST, PUT, DELETE |
| Montado en `index.js` | **hecho** | `backend/src/index.js:23` (import) y `:67` (`app.use('/api/npcs', npcsRouter)`) |
| `/api/npcs/:id/quests` (título, descripción, reward) | **hecho** (POST+DELETE) | `npcs.js:136-164`. Solo crea/borra; NO hay PUT de edición de quest (el requisito no lo pide explícito) |
| `/api/npcs/:id/inventory` (nombre, cantidad, descripción, costo) | **hecho** (POST+DELETE) | `npcs.js:169-199`. Campo `item_name`, `quantity`, `description`, `cost`. Sin PUT |
| `/api/npcs/:id/campaigns` (asociar/desasociar) | **hecho** | `npcs.js:204-230` — POST idempotente (`INSERT OR IGNORE`) + DELETE `/:cid`. Tabla se llama `npc_campaign_links` |
| Autorización por dm_id (ownership) | **hecho** | helper `getOwnedNpc()` `npcs.js:14-19`; POST valida rol `dm` `:79` |
| Tests `npcs.test.js` | **FALTA** | No existe ni `backend/src/routes/npcs.test.js` ni ningún `*npc*.test.js`. Único gap real del backend |

### Schema (`backend/src/db/schema.sql`)
| Tabla | Estado | Evidencia / columnas |
|---|---|---|
| `npcs` | **hecho, salvo disposición** | `schema.sql:414-422`: id, dm_id, game_system_id (FK opcional), name, description, avatar_icon (default 🧑), created_at |
| `npc_quests` | **hecho** | `schema.sql:430-437`: id, npc_id, title, description, reward, created_at |
| `npc_inventory` | **hecho** | `schema.sql:439-447`: id, npc_id, item_name, quantity, description, cost, created_at |
| `npc_campaign_links` | **hecho** | `schema.sql:424-428`: (npc_id, campaign_id) PK, ambos ON DELETE CASCADE |
| Columna de disposición/actitud | **FALTA** | Ver sección (b) |

### Frontend
| Requisito | Estado | Evidencia |
|---|---|---|
| Página NPCs existe y está ruteada | **parcial (PLACEHOLDER)** | `frontend/src/pages/NpcsPage.jsx:6-19` es un stub: "El gestor de NPCs llega próximamente". Cableada en `App.jsx:13,62-63` y en nav DM `navItems.js:21` (id `npcs`, icon `users`). Todo el andamiaje de ruta/nav está; falta el contenido real |
| Layout maestro-detalle (lista+filtro por sistema+crear / tabs Info·Quests·Inventario·Campañas) | **FALTA** | Nada de esto en el placeholder |
| Tarjetas avatar-glifo (inicial, NO emoji) | **FALTA** (y hay conflicto) | El mockup usa inicial (`NPCs.dc.html:30`), pero backend/api guardan `avatar_icon` con **emoji** por defecto (`🧑`). La página deberá derivar la inicial del `name`, ignorando el emoji |
| Badge de disposición | **FALTA** (bloqueado por schema) | Ver (b) |
| Cliente API (`api.js`) para sub-recursos | **parcial** | `frontend/src/lib/api.js:117-125` solo tiene `listNpcs`, `getNpc`, `createNpc`, `deleteNpc`. **Faltan**: `updateNpc` (PUT), y todos los métodos de quests/inventory/campaigns |

### Integración PlanningPanel
| Requisito | Estado | Evidencia |
|---|---|---|
| Modal de evento NPC selecciona NPCs del catálogo (no texto libre) | **hecho** | `frontend/src/components/Session/PlanningPanel.jsx:114-119` carga `api.listNpcs(user.id)`; el `<select>` del modal (`:571-582`) lista NPCs reales por `avatar_icon + name`; dispara con `npc_id` + `npc_name` (`:177-189`). Ya NO es texto libre |

### Mockup handoff
- **hecho**: existe `.claude/design_handoff_rolapp/NPCs.dc.html`. Muestra: grid de tarjetas NPC (auto-fill minmax 320px), cada una con glifo cuadrado de inicial + color por disposición, nombre + **badge de disposición** (Aliado verde / Neutral ámbar / Hostil naranja), línea "rol · ubicación", y descripción. Header con botón "Nuevo NPC". Es vista de **lista/grid**, no muestra el detalle con tabs.

## (b) Pregunta abierta del líder: ¿existe campo de disposición Aliado/Neutral/Hostil?

**NO.** La tabla `npcs` (`schema.sql:414-422`) no tiene ninguna columna de disposición/actitud/relación. El router `npcs.js` tampoco la lee ni escribe. Sin embargo el **mockup la asume como pieza central** del diseño de tarjeta (`NPCs.dc.html:32,45-54`: badge coloreado + el color del glifo se deriva de la disposición) e incluye además `role` y `loc` (ubicación) que tampoco existen en schema.

Decisión pendiente para el líder: para cumplir el mockup hay que **añadir la columna `disposition`** a `npcs` (p.ej. `TEXT NOT NULL DEFAULT 'Neutral' CHECK(disposition IN ('Aliado','Neutral','Hostil'))`) y propagarla en POST/PUT del router + payload del GET. Los campos `role`/`loc` del mockup son opcionales/decorativos; se pueden mapear a `description` o dejarse fuera del MVP.

## (c) Esfuerzo restante: **MEDIO** (sesgado a frontend)

Backend prácticamente completo; el trabajo es sobre todo UI + un pequeño delta de schema/API.

Falta concretamente:
1. **Schema**: añadir columna `disposition` a `npcs` (+ CHECK). Cambio de 1 línea + su reflejo en `SELECT`/INSERT/UPDATE de `npcs.js` (POST `:82-86`, PUT `:98-118`).
2. **API client** (`frontend/src/lib/api.js`): añadir `updateNpc`, `createNpcQuest`/`deleteNpcQuest`, `createNpcInventory`/`deleteNpcInventory`, `linkNpcCampaign`/`unlinkNpcCampaign`. (~7 métodos, triviales; los endpoints ya existen.)
3. **Frontend — reemplazar el placeholder** `NpcsPage.jsx` por el gestor maestro-detalle: lista/grid con filtro por sistema + crear (según mockup), panel de detalle con tabs Información / Quests / Inventario / Campañas. Es el grueso del esfuerzo.
4. **Tarjeta**: glifo con **inicial derivada del name** (no emoji) + badge de disposición con los 3 colores del mockup.
5. **Tests backend**: crear `backend/src/routes/npcs.test.js` (único gap de backend) cubriendo CRUD + sub-recursos + ownership 403/404.

NO hace falta reimplementar: router CRUD, sub-recursos backend, montaje en index, integración PlanningPanel, ruteo/nav de la página — ya están.

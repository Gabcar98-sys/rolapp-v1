# Scout F18 — Sesión en vivo (frontend) + gap de notas

> Autor: scout (solo-lectura). Fecha: 2026-07-20. NO se tocó código ni se corrió Docker.
> Base: lectura del código real del frontend de sesión + `sockets/` + `routes/` + mockups 15-17.
> Complementa (no repite) `ai_audit.md` (backend de IA). Foco: FRONTEND de la sesión y notas.

---

## (a) Pieza de F18 → estado → evidencia

| Pieza de F18 | Estado | Evidencia (archivo:línea) |
|---|---|---|
| **(1) Notas — tabla DB** | EXISTE | `backend/src/db/schema.sql:458-467` (`session_notes`: session_id, dm_id, title, body, event_type, is_public, created_at) |
| **(1) Notas — router `/api/notes`** | FALTA | No hay `routes/notes.js` en `backend/src/routes/`; no montado en `index.js` |
| **(1) Notas — socket `notes:updated`** | FALTA | No se emite en ningún `sockets/*.js` |
| **(1) Notas — panel frontend** | FALTA | No hay componente de notas; SessionView solo tiene tabs players/characters/chat/ai/planning (`SessionView.jsx:81-87`) |
| **(2) Tabs personaje: Atributos** | EXISTE | `CharacterSheet.jsx:125-237` (`AttributesTab`, editable, agrupado por category, is_core ★, has_max valor/máx) |
| **(2) Tabs personaje: Estado (HP/voluntad)** | PARCIAL | `CharacterSheet.jsx:240-272` (`StatusTab`) muestra barra %, pero es **solo lectura** (no editable máx/actual, no "dot tracker") |
| **(2) Tabs personaje: Habilidades** | EXISTE | `CharacterSheet.jsx:275-447` (`SkillsTab`, catálogo + manuales) |
| **(2) Tabs personaje: Equipamiento (slots)** | EXISTE | `CharacterSheet.jsx:450-565` (`EquipmentTab`, slots del sistema) |
| **(2) Tabs personaje: Inventario** | EXISTE | `CharacterSheet.jsx:568-639` (`InventoryTab`) |
| **(2) Sync socket `characters:updated`** | EXISTE (ambos lados) | Backend emite en `routes/characters.js:112`; frontend escucha en `SessionCharactersPanel.jsx:38-42` (recarga lista; NO recarga la ficha abierta) |
| **(3) Toolbar DM: Cambiar mapa** | PARCIAL | Hoy es un `<input>` de URL de fondo dentro del `<main>` (`SessionView.jsx:161-177`), no un botón de toolbar |
| **(3) Toolbar DM: Nuevo Evento** | PARCIAL | Vive dentro del tab Planificación (`PlanningPanel.jsx`, FireButton por evento del prep); no hay botón "Nuevo Evento" suelto en toolbar |
| **(3) Toolbar DM: Nuevo Evento NPC** | EXISTE | `PlanningPanel.jsx:428-437` (botón + modal NPC con catálogo F16), pero dentro del tab, no en toolbar |
| **(3) Toolbar: Reset / Finalizar / Salir** | EXISTE | `SessionView.jsx:116-152` (Reset 🔄, Finalizar ✔ solo DM; Salir todos) — en el header, con emojis |
| **(4) AIPanel: pregunta libre + streaming + citas + follow-ups + resumen** | EXISTE | `AIPanel.jsx` completo (streaming ▍, fuentes con score, regenerar, "Nueva conversación", debug retrieval, generar resumen) |
| **(4) AIPanel: modos Sesión/Sistema** | FALTA | AIPanel solo hace pregunta libre de reglas |
| **(4) AIPanel: presets sesión (Resumen/Cronología/Estado/Inventarios/Pregunta libre)** | FALTA | — |
| **(4) AIPanel: topics sistema (core/habilidades/items/NPCs)** | FALTA | — |
| **(4) AIPanel: checkbox "incluir sesiones anteriores"** | FALTA | — |
| **(5) Restyle a tokens del handoff (tabs de iconos línea)** | FALTA | SessionView/AIPanel/CharacterSheet/PlanningPanel usan tokens v0 (`bg-ink-700`, `text-gold`, `border-ink-line`) + **emojis** en tabs y botones. `Icon.jsx` (iconos línea) existe pero NO se usa aquí |

Nota de montaje: `App.jsx:34-38` confirma que `SessionView` se renderiza **fuera del AppShell** (pantalla completa), como sugiere el enunciado. Se entra desde Dashboard → `onEnterSession`.

---

## (b) Qué se reutiliza vs. qué hay que construir

### Se reutiliza casi tal cual (grandes ahorros)
- **`CharacterSheet.jsx`**: ya tiene los 5 tabs pedidos (Atributos/Estado/Skills/Equipo/Inventario) con lógica de sistema de juego, permisos `canEdit`, y todos los endpoints de `api.js` (getCharacter, setCharacterAttributes, link/unlink skill, equip/unequip, inventory CRUD). F18 punto (2) es **mayormente restyle** + hacer editable el StatusTab + que la ficha abierta reaccione a `characters:updated`.
- **`AIPanel.jsx`**: todo el motor de UI de IA (streaming, citas, follow-ups, regenerar, debug, badge, resumen) se conserva. F18 punto (4) envuelve esto con un selector de modo/preset y despacha distintas queries/eventos socket.
- **`PlanningPanel.jsx`**: el modal NPC (con catálogo F16) y el disparo de eventos con participantes ya existen; la toolbar solo necesita **exponer disparadores** (mover/replicar botones a la barra superior). OJO `EventFlowGraph` recibe prop `compact` (`PlanningPanel.jsx:502`).
- **`streamAiAsk` (`socket.js:14-38`)**: patrón de streaming por `requestId` reutilizable para presets.
- **Tokens del handoff** ya definidos en `tailwind.config.js` (accent/surface/line/title/sub/cat.*) + `Icon.jsx` (set de iconos línea) — el restyle tiene los materiales listos.
- **`characters:updated`**: backend ya lo emite (characters.js:112); solo falta que **la ficha activa** (no solo la lista) recargue al recibirlo.

### Hay que construir
- **Backend notas**: `routes/notes.js` como factory `createNotesRouter(io)` — CRUD (session_id, title, body, event_type, is_public), `is_public=0` visible solo al DM, emite `notes:updated` al room de la sesión. Montar en `index.js` tras `io`. (Único backend "de verdad" de F18; ver ai_audit §4.3.)
- **Backend IA (menor, ver ai_audit §4-5)**: helper `streamSessionPreset` (o `ai:ask` con `preset`), propagar `sectionType` por socket para topics, y `GET /api/campaigns/:id/summaries` para "incluir sesiones anteriores".
- **Frontend NotesPanel**: nuevo tab/panel con lista + form (título/body/event_type/pública), sync `notes:updated`, visibilidad DM/jugador.
- **Frontend AIPanel v2**: selector modo (Sesión/Sistema), botones de preset/topic, checkbox sesiones anteriores; despacho al backend según preset.
- **Frontend toolbar DM**: barra bajo el header con "Cambiar mapa" (reusar el input de fondo como botón/modal), "Nuevo Evento", "Nuevo Evento NPC".
- **Restyle**: migrar SessionView + los 4 paneles de `ink-*/gold/emoji` a `surface/line/accent/title` + `<Icon>` (tabs de iconos línea como en mockups 15-17).
- **StatusTab editable**: convertir de solo-lectura a dot-tracker con máx/actual editables (F18 punto 2).

---

## (c) Riesgos / regresiones a vigilar

- **[ALTO] Romper el streaming/citas/follow-ups al reescribir AIPanel.** Envolver, NO reescribir: conservar `runAsk`/`streamAiAsk`/estado de conversación intactos y solo añadir la capa de modo/preset encima (mismo riesgo que señala ai_audit §5).
- **[ALTO] Romper el canvas (tldraw) al reordenar el layout para la toolbar.** `CanvasBoard` vive en `<main>` con `min-h-0 flex-1` (`SessionView.jsx:157-160`); insertar una toolbar arriba debe respetar ese flex o el lienzo colapsa.
- **[MEDIO] Firma `compact` de `EventFlowGraph`** (`PlanningPanel.jsx:502`): al reubicar los disparadores de eventos a la toolbar, no alterar cómo PlanningPanel pasa props al grafo; mantener el editor visual funcionando.
- **[MEDIO] `characters:updated` no recarga la ficha abierta.** `SessionCharactersPanel` recarga solo la *lista* (`:38-42`); si dos usuarios editan la misma ficha, el que la tiene abierta (`CharacterSheet`) no se refresca. F18 debería suscribir la ficha activa al evento (filtrando por `characterId`).
- **[MEDIO] Notas privadas.** `is_public` debe filtrarse tanto en backend (no enviar privadas a jugadores) como en el emit socket (emitir solo al DM o marcar el payload). Riesgo de fuga si se emite crudo al room.
- **[BAJO] Alias v0 se eliminan tras F14-F19** (`tailwind.config.js:63-79`): si el restyle no migra todas las clases `ink-*/gold` de la sesión, al retirar los alias estas vistas se romperán. El restyle de F18 debe ser completo en las vistas de sesión.
- **[BAJO] Tab Planificación es solo-DM** (`SessionView.jsx:86`); al mover eventos a la toolbar mantener ese gating (jugador no ve disparadores).

---

## (d) Estimación de esfuerzo y orden sugerido

Escala relativa (S ≈ medio día, M ≈ 1 día, L ≈ 2 días para el implementer).

| Sub-parte | Esfuerzo | Notas |
|---|---|---|
| Notas (backend router+socket + panel front) | **M** | Backend chico (patrón factory conocido); front nuevo pero simple (lista+form). Dependencia dura del preset "Resumen". |
| Tabs de personaje | **S–M** | Reutiliza CharacterSheet; trabajo = StatusTab editable + sync de ficha activa + restyle. |
| Toolbar DM | **S** | Reubicar/exponer acciones existentes (mapa, evento, NPC) a una barra; poco lógica nueva. |
| AIPanel presets/modos | **M** | Front (modo+preset+checkbox) sobre AIPanel existente + apoyo backend menor (streamSessionPreset, sectionType, /summaries). No motor nuevo. |
| Restyle (todo el panel derecho + header) | **M** | Migrar 4 componentes a tokens handoff + `<Icon>`; mecánico pero amplio. |

**Orden sugerido:**
1. **Notas (backend + panel)** — desbloquea el preset "Resumen" (el resumen ya lee `session_notes`, ai_audit §4.3) y es la única pieza backend real.
2. **Apoyo backend de IA** (streamSessionPreset + sectionType por socket + `/campaigns/:id/summaries`) — pequeño, habilita el punto (4).
3. **AIPanel v2** (modos/presets/checkbox) sobre el AIPanel actual.
4. **Toolbar DM** (exponer acciones existentes).
5. **Tabs de personaje** (StatusTab editable + sync ficha activa).
6. **Restyle final** de todo el panel derecho + header a tokens handoff + iconos línea (hacerlo al final para no re-tematizar componentes que aún cambian de estructura).

> Regla clave: F18 es **UI + un endpoint de notas + apoyo IA menor**, no motor de IA nuevo. La mayor parte del valor (ficha con 5 tabs, streaming, modal NPC, resumen) YA existe y se reutiliza.

# RolApp v1.0 — Plan de Arquitectura

> Reinicio limpio (repo nuevo) conservando el motor de sesión y planificación.
> Objetivos: UI moderna mobile-first, juegos **100% configurables** (in-app + JSON),
> RAG/IA rehecho con vectores de verdad, estadísticas y mejor info por sesión.

---

## 0. Principios de diseño

1. **Local-first.** Se hostea en la máquina del DM (`docker compose up`), jugadores entran por LAN. Sin internet obligatorio en mesa.
2. **Cero contenido de juego hardcodeado.** La estructura es genérica; el contenido de cada juego vive como **dato** (DB + packs JSON), nunca como migración ni catálogo `.js`.
3. **Mobile-first real.** Los jugadores usan el celular en la mesa; el DM usa pantalla grande. Dos experiencias, un mismo sistema de diseño.
4. **El motor de planificación es el activo.** Se porta tal cual (grafo de eventos con ramas/enlaces, prep por ubicaciones). Es lo que diferencia la app.
5. **La IA accede a datos estructurados, no a volcados de texto.** RAG bien hecho + acceso a estado de sesión/personajes/reglas como contexto consultable.

---

## 1. Qué se porta vs. qué se reescribe

| Pieza | Decisión | Nota |
|-------|----------|------|
| Esquema de datos | **Portar y consolidar** | Hoy son 32 migraciones ad-hoc. En el repo nuevo se parte de un `schema.sql` limpio y consolidado (ver §4). |
| Motor de sesión (lifecycle, members, `session_events` append-only, sockets) | **Portar** | Funciona y gusta. |
| Planificación: `session_preps` → locations → sub_locations → eventos + `event_links` (grafo) + participantes + NPCs | **Portar** | Es el núcleo de valor. |
| Canvas (tldraw), chat, presencia | **Portar** (limpiando sockets) | |
| Sistema genérico: game systems, atributos, formatos de skill/item, slots, mecánicas | **Portar la estructura** | Sin los seeds. |
| Catálogos `stormlightCatalog.js`, `dragonbaneCatalog.js`, pregens Bridge Nine (M021–M032) | **Eliminar como código** → convertir en **packs JSON de ejemplo** importables | |
| `ragHelper.js` (coseno en memoria, carpetas hardcodeadas) | **Reescribir** (§5) | |
| UI (estilos inline, hacks de `innerWidth`) | **Reescribir** con Tailwind + design system (§6) | |
| Estadísticas | **Nuevo** (§7) | |

---

## 2. Stack v1.0

- **Frontend:** React + Vite + **Tailwind CSS** + tokens de diseño. Router. Estado con Zustand o Context (ligero). Mobile-first.
- **Backend:** Node + Express + Socket.io (igual que hoy; sirve bien para LAN).
- **DB:** SQLite con `better-sqlite3` (síncrono) + extensión **`sqlite-vec`** para búsqueda vectorial.
- **Embeddings:** Ollama local (`nomic-embed-text`) por defecto; opción API (`EMBED_PROVIDER`).
- **LLM:** Ollama local u API externa (`AI_PROVIDER`), igual que hoy.
- **Contenedor:** Docker + docker-compose (frontend nginx proxya `/api` y `/socket.io`).

---

## 3. Modelo de "cualquier juego" (Game System como dato)

Un **Game System** es la unidad configurable. Contiene todo lo que define un juego:

- **Atributos** (`attribute_templates`): nombre, tipo, categoría, `is_core`, `has_max`, `formula`.
- **Formatos de skill / item**: campos parametrizables (`*_format_fields`) + entidades (`skills`, `item_masters`) con sus valores.
- **Slots de equipo** (`equipment_slot_templates`).
- **Mecánicas** (`game_mechanics` + params).
- **Personajes base / pregens** (`base_characters`).
- **Documentos** (`game_docs`): los `.md` de reglas/lore que alimentan el RAG (§5).

### 3.1 Builder in-app
Editor visual por sección (atributos, skills, items, slots, mecánicas, docs). Es esencialmente lo que ya existe en `GameSystemPanel`, pero rediseñado y completo.

### 3.2 Game Packs (JSON) — importar/exportar
Formato versionado para definir un juego entero en un archivo, compartirlo o partir de uno base.

```jsonc
{
  "pack_version": "1.0",
  "name": "Dragonbane",
  "description": "...",
  "attributes": [
    { "name": "Fuerza", "type": "number", "category": "core", "is_core": true, "has_max": false, "formula": "" }
  ],
  "skill_formats": [
    { "name": "Habilidades", "fields": [{ "name": "attribute", "type": "text" }],
      "skills": [{ "name": "Atletismo", "values": { "attribute": "Fuerza" } }] }
  ],
  "item_formats": [ /* idem */ ],
  "equipment_slots": [{ "name": "Mano derecha", "slot_key": "right_hand", "max_items": 1 }],
  "mechanics": [{ "name": "Carga", "type": "inventory_weight", "affects": "inventory", "params": [...] }],
  "base_characters": [ /* pregens opcionales */ ],
  "docs": [{ "title": "Reglas core", "path": "dragonbane/01-core.md" }]
}
```

- **Importar:** valida el schema, crea el game system y todas sus entidades en una transacción, e **indexa los docs** en el vector store.
- **Exportar:** serializa un game system existente a este JSON.
- **Packs de ejemplo:** Stormlight, Dragonbane (migrados desde los catálogos actuales) se incluyen en `/game-packs/` como **archivos**, y se ofrecen como "importar ejemplo" — no se siembran en migraciones.

---

## 4. Esquema de datos (consolidado)

Se parte de un `schema.sql` limpio que reúne todo lo que hoy está disperso en migraciones. Bloques:

- **Identidad/sesión:** `users`, `campaigns`, `sessions`, `session_members`, `session_characters`, `session_events`, `messages`, `canvas_state`.
- **Game systems:** `game_system_templates`, `attribute_templates`, `skill_formats`/`skill_format_fields`/`skills`/`skill_field_values`, `item_formats`/`item_format_fields`/`item_masters`/`item_master_values`, `equipment_slot_templates`, `game_mechanics`/`game_mechanic_params`, `base_characters`(+attrs/inventory/skill_links).
- **Personajes:** `characters`, `character_template_attr_values`, `character_skill_links`, `character_inventory`, `character_equipment`.
- **Planificación:** `session_preps`, `locations`, `sub_locations`, `event_templates` (con `parent_event_id`, `branch_label`, `sub_location_id`), `event_links`, `event_participants`, `npcs`(+quests/inventory/campaign_links).
- **Post-sesión:** `session_notes`, `session_summaries`, `session_stats` (nuevo, §7).
- **RAG:** `game_docs`, `doc_chunks` + tabla virtual `vec_chunks` de `sqlite-vec` (§5).

> El sistema de migraciones se mantiene (tabla `_migrations`) pero arranca vacío: el baseline es el schema consolidado, y a partir de v1.0 las migraciones vuelven a ser solo cambios estructurales reales.

---

## 5. RAG / IA — rediseño (el cambio grande)

**Problemas del RAG actual:** carpetas `'Dragonbane'`/`'Stormlight'` hardcodeadas; embeddings como JSON en texto; similitud coseno O(n) en JS en memoria; chunking ingenuo por headings; el LLM recibe texto plano sin estructura.

### 5.1 Almacenamiento vectorial
- Tablas `game_docs` (doc por game system) y `doc_chunks` (texto + metadatos).
- Tabla virtual **`vec_chunks`** con `sqlite-vec` para KNN real en SQL: `SELECT ... FROM vec_chunks WHERE embedding MATCH ? ORDER BY distance LIMIT k`.
- **Scoping por game system** vía metadato/filtro (no por carpeta). Cualquier juego importado se indexa igual.

### 5.2 Ingesta y chunking
- Pipeline al importar/editar docs: parsear Markdown respetando jerarquía (H1>H2>H3), chunks con solape y tamaño objetivo (~300–500 tokens), **metadatos**: `game_system_id`, `doc_title`, `heading_path`, `section_type` (regla/lore/tabla/stat).
- Reindexado incremental por `mtime`/hash (ya existe la idea; se conserva).

### 5.3 Recuperación (mejor acceso para el modelo)
- **Híbrida:** vector (sqlite-vec) + keyword (FTS5/BM25), fusionadas (RRF).
- **Filtros por metadato:** game system, tipo de sección.
- **Re-ranking** opcional y de-dup por `heading_path`.
- Devolver chunks con su `heading_path` y fuente, para citar.

### 5.4 Contexto estructurado / herramientas
En lugar de un volcado de texto, el LLM recibe contexto estructurado y/o **tools** que puede consultar:
- `retrieve_rules(query, game_system)` → chunks citados.
- `get_character(id)` / `get_session_state()` → fichas y estado actuales.
- `get_event_history(session)` → línea de tiempo de eventos disparados.
- `get_stats(scope)` → estadísticas (§7).

**Casos de uso v1.0:** (a) asistente de planificación (sugerir eventos/encuentros con base en reglas + estado), (b) consultas de reglas citadas, (c) resumen de sesión al cerrar, (d) narración de estadísticas.

---

## 6. UI — Tailwind + sistema de diseño, mobile-first

- **Tokens:** colores (mantener identidad oscura dorada `#c9a84c`/azules), espaciado, tipografía, radios — como variables Tailwind.
- **Librería de componentes propia:** Button, Card, Tab, Modal, Sheet (bottom-sheet móvil), Field, Badge, Accordion, etc. Reemplaza los `const s = {...}` inline.
- **Layouts diferenciados:**
  - **Jugador (móvil):** ficha de personaje, inventario, skills, estado, chat — bottom-sheet / tabs grandes, gestos.
  - **DM (escritorio/tablet):** consola con canvas + panel de planificación (grafo), eventos, NPCs, IA.
- **Sin hacks de `innerWidth`:** breakpoints reales de Tailwind + container queries donde aplique.
- Referencias visuales ya disponibles: `.claude/CapturasFigma/*` y `.claude/VisualCelular/*`.

---

## 7. Estadísticas (nuevo)

Derivar de lo que ya se registra (`session_events` append-only + personajes + eventos disparados). Game-agnóstico por defecto, con extensiones por juego.

- **Por sesión:** duración, nº de eventos por categoría, encuentros, NPCs introducidos, participación por jugador, notas creadas.
- **Por campaña:** sesiones jugadas, progresión de atributos `is_core` por personaje en el tiempo, eventos acumulados, ubicaciones visitadas.
- **Por personaje:** evolución de skills (rank) y atributos, ítems adquiridos, eventos en los que participó.
- **Snapshot al cerrar sesión** en `session_stats` (para historial y para que la IA lo narre).
- Visualización: tarjetas + gráficos simples (sparklines/barras) en historial de sesión y vista de campaña.

---

## 8. Roadmap por fases

| Fase | Entregable | Depende de |
|------|-----------|-----------|
| **F0 — Andamiaje** | Repo nuevo, Vite+Tailwind+tokens, Express+Socket.io, SQLite+sqlite-vec, docker-compose, auth (DM/player PIN). | — |
| **F1 — Schema consolidado** | `schema.sql` limpio (§4) + sistema de migraciones reiniciado. | F0 |
| **F2 — Game systems data-driven** | Builder in-app (atributos/skills/items/slots/mecánicas) + import/export de packs JSON + packs de ejemplo migrados. | F1 |
| **F3 — Personajes** | Mis personajes, pregens/base characters, fichas dinámicas por game system, inventario/equipo/skills. | F2 |
| **F4 — Motor de sesión** | Lifecycle, members, presencia, canvas, chat, `session_events`. (Port) | F1 |
| **F5 — Planificación** | Preps, ubicaciones, **grafo de eventos** con ramas/enlaces, disparo con participantes, NPCs. (Port) | F4 |
| **F6 — RAG/IA** | sqlite-vec, ingesta/chunking, retrieval híbrido, contexto/tools, resumen de sesión. | F2, F4 |
| **F7 — Estadísticas** | Derivación + `session_stats` + visualización en historial/campaña. | F4, F5 |
| **F8 — Pulido UI mobile** | Layouts jugador/DM finales, bottom-sheets, gestos, accesibilidad, distribución. | todas |

Orden sugerido de construcción: F0 → F1 → F2 → F4 → F5 → F3 → F6 → F7 → F8 (el motor de sesión/planificación temprano para validar el port; personajes y RAG después).

---

## 9. Riesgos / decisiones abiertas

- **`sqlite-vec` en Docker:** verificar carga de la extensión con `better-sqlite3` en la imagen (Alpine vs Debian). Plan B: `vectorlite` o índice en memoria si falla.
- **Migrar packs de ejemplo:** escribir un script único que lea los catálogos `.js` actuales y emita los JSON de `Stormlight`/`Dragonbane` (one-shot, fuera del runtime).
- **Estado global frontend:** elegir entre Context vs Zustand antes de F3.
- **Tamaño del grafo de eventos en móvil:** el `EventFlowGraph` es DM-only y de escritorio; definir su versión móvil o limitarlo a tablet+.
- **i18n:** hoy hay mezcla ES/EN en datos. Decidir si v1.0 es ES-only o bilingüe a nivel de dato.

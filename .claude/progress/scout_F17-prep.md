# Scout F17 — Rediseño de "Preparar Sesión"

> Inventario solo-lectura: qué existe ya vs. lo que pide el handoff (Preparar Sesion.dc.html + pantallazos 11-13).
> Objetivo: preparar un spec preciso para implementar después. NO se tocó código.

Fecha: 2026-07-20 · Scout de solo-lectura.

---

## Resumen ejecutivo

- El **backend está completo** para el layout objetivo salvo un endpoint de **reordenar eventos** (subir/bajar).
- El **grafo objetivo ya vive casi entero** en `EventFlowGraph.jsx` (drag con pointer events, aristas SVG, enlaces con etiqueta crear/borrar, categorías). Le faltan: **curvas Bézier**, **zoom +/-/reset**, **fondo de puntos**, **tokens nuevos** (hoy usa tokens v0 + emojis) y **borde de categoría** en el nodo seleccionado.
- La **página ya existe y está cableada** (`PrepPage.jsx` en `App.jsx` como `page='prep'`, DM-only, en `navItems`), pero es la versión provisional (sin rail 62px, sin panel de ubicaciones 266px, sin toggle Lista/Grafo unificado con el diseño del handoff).
- Los **4 colores de categoría del handoff YA están en `tailwind.config.js`** (`cat.combat/social/explore/discovery`) y F15 ya definió el patrón de listas estáticas de clases (`catalogClasses.js`). Falta **mapear las 8 categorías v1 → 4 colores**.
- Esfuerzo estimado: **MEDIO-ALTO** (todo frontend; backend casi listo). La lógica del grafo se reutiliza; el trabajo real es re-maquetar 3 zonas (rail/panel/main) a los tokens + añadir Bézier/zoom/fondo + reorder.

---

## (a) Tabla: pieza del layout → estado → evidencia

Leyenda estado: ✅ existe · 🟡 parcial (hay base, falta adaptar) · ❌ falta

### Estructura general

| Pieza del layout | Estado | Evidencia (archivo:línea) |
|---|---|---|
| Página "Preparar Sesión" montada en AppShell | ✅ | `frontend/src/App.jsx:7,42,50-51` (`page='prep'`, DM-only) |
| Ítem en el sidebar (nav) | ✅ | `frontend/src/components/layout/navItems.js:15` (`{id:'prep', icon:'map'}`) |
| Componente de página `PrepPage` | 🟡 provisional | `frontend/src/pages/PrepPage.jsx:9-25` (usa `PageHeader` + `SessionPrepPanel`/`EventTemplatePanel`; comentario línea 8: "El rediseño completo … llega en F17") |
| Selector de preparaciones (vista de entrada) | 🟡 | `frontend/src/components/DMMaster/SessionPrepPanel.jsx` (funciona; estilo v0: `text-gold`, emoji 🗑 línea 92) |

### Rail de iconos 62px + panel de ubicaciones 266px

| Pieza del layout | Estado | Evidencia |
|---|---|---|
| Rail de iconos 62px (réplica del sidebar solo-iconos) | ❌ | No existe rail compacto. El sidebar actual es 236px con labels (`Sidebar.jsx:31`). Token `rail:#17140F` ya definido (`tailwind.config.js:11`). Mockup: `Preparar Sesion.dc.html:26-38` |
| Panel de ubicaciones 266px (contenedor) | ❌ | No existe. Hoy las ubicaciones se editan en la vista "Lista" de `EventTemplatePanel` como tarjetas apiladas (`EventTemplatePanel.jsx:307-354`). Mockup: `Preparar Sesion.dc.html:41-87` |
| Árbol colapsable con chevron rotatorio | ❌ | La vista lista NO colapsa; render plano de `Card` por ubicación. Mockup: `Preparar Sesion.dc.html:54` (`transform:rotate(chev)`) + estado `expanded` (script línea 215) |
| Badges de conteo por ubicación | 🟡 | Conteo existe en datos (`sub.events.length`) y el prep trae `event_count` (`sessionPreps.js:14`), pero no hay badge-píldora por ubicación en la UI. Mockup: `Preparar Sesion.dc.html:64,295-297` |
| Ítem seleccionado con inset terracota | ❌ | No hay estado "ubicación seleccionada". Mockup: `Preparar Sesion.dc.html:293` (`box-shadow:inset 3px 0 0 #CE6A3A`) |
| Sección "Sin ubicación" con borde punteado | 🟡 | Existe "Eventos sin ubicación" como `Card` (`EventTemplatePanel.jsx:357-369`) pero sin el tratamiento de borde punteado/selección. Mockup: `Preparar Sesion.dc.html:79-85` |
| Crear ubicación / sub-ubicación inline | ✅ lógica / 🟡 UI | Lógica lista: `EventTemplatePanel.jsx:63-87` (`addLocation`/`addSubLocation`) + `api.createLocation/createSubLocation` (`api.js:75,84`). Falta el look inline del handoff (botón "+" en cabecera, "+ Sub-ubicación" bajo el árbol) |
| Renombrar ubicación/sub inline (lápiz en hover) | ❌ UI (backend ✅) | Backend `PUT /locations/:id` y `/sub-locations/:id` existen (`locations.js:54`, `subLocations.js:67`) pero **no hay método en `api.js`** ni UI de rename. Mockup muestra icono lápiz en la fila (`Preparar Sesion.dc.html:66`) |

### Main + toolbar 60px

| Pieza del layout | Estado | Evidencia |
|---|---|---|
| Toolbar 60px | 🟡 | Hay una barra de cabecera en `EventTemplatePanel.jsx:233-257` con toggle + volver, pero no es el toolbar 60px del handoff (breadcrumb, contador, +Evento a la derecha) |
| Breadcrumb "Preparaciones / nombre" | 🟡 | Botón "← Volver" + `h2` con nombre (`EventTemplatePanel.jsx:234-255`). Mockup: `Preparar Sesion.dc.html:93-100` |
| Contador de eventos | ✅ dato | `EventFlowGraph.jsx:258-260` ("{n} eventos"); `SessionPrepPanel` lo muestra por prep. Falta ubicarlo en el toolbar |
| Toggle segmentado Lista/Grafo | 🟡 | Existe como dos `Button` (`EventTemplatePanel.jsx:239-252`, emojis 🕸/☰). El handoff quiere un segmented control con fondo `#2A251F` (mockup `:103-112`) |
| Botón "+Evento" | ✅ | `EventFlowGraph.jsx:243` + `EventTemplatePanel` modales. Falta estilo/posición handoff |

### Vista Lista

| Pieza del layout | Estado | Evidencia |
|---|---|---|
| Columna centrada 820px | ❌ | La lista actual es full-width apilada. Mockup: `Preparar Sesion.dc.html:123` (`max-width:820px`) |
| Kicker uppercase + H1 Newsreader (nombre de ubicación) | ❌ | No hay encabezado por-ubicación seleccionada. Mockup: `:124-128` |
| Tarjeta de evento con barra de categoría 4px | 🟡 | Hay franja de color, pero como borde-izquierdo `w-1 border-l-2` (`EventTemplatePanel.jsx:187`, `EventFlowGraph.jsx:365`), no barra 4px con color de fondo. Mockup: `:141` (`width:4px;background:{bar}`) |
| Badge pill de categoría | 🟡 | Existe badge (`rounded border px-1.5`, `EventTemplatePanel.jsx:194`) pero con colores v1 (Tailwind `text-red-400` etc.), no pill `border-radius:20px` con `catBg`/`catText`. Mockup: `:145` |
| Etiqueta de enlace narrativo en la tarjeta | ❌ | Los enlaces se listan aparte (`EventTemplatePanel.jsx:372-398`), no como etiqueta con icono-cadena dentro de la tarjeta. Mockup: `:146-148` |
| Acciones al hover: subir / bajar / editar / eliminar | 🟡 | editar+eliminar existen; **subir/bajar NO** (no hay reorder). Aparece en el pantallazo 11 (flechas ↑↓). Mockup: `:152-157` |
| Estado vacío punteado con CTA | 🟡 | Hay estado vacío (texto), sin caja punteada + botón "Añadir el primero". Mockup: `:130-136` |

### Vista Grafo

| Pieza del layout | Estado | Evidencia |
|---|---|---|
| Fondo de puntos radial | ❌ | Hoy fondo liso `bg-ink-900` (`EventFlowGraph.jsx:266`). Mockup: `:167` (`radial-gradient … background-size:26px`) |
| Nodos 186px arrastrables (pointer events, delta/scale) | 🟡 | Drag por pointer events ✅ (`EventFlowGraph.jsx:91-124`), pero nodo 190px sin corrección por `scale` (el mockup divide el delta por `scale`, script `:284`). Ancho a 186px |
| Aristas Bézier SVG | ❌ (hoy rectas) | Aristas con `<line>` recto (`EventFlowGraph.jsx:317-325`). El handoff usa `path` con curva cúbica `C` (mockup `edgePath`, script `:273-277`) |
| Sólida gris = misma ubicación (rama) | 🟡 | Hoy la rama es `stroke-ink-600` con flecha (`EventFlowGraph.jsx:322`). El handoff: gris `#5A5348`, sin flecha, curva. Semántica de "misma ubicación" hoy = rama parent (ok) |
| Punteada terracota + etiqueta-píldora = enlace | 🟡 | Enlace hoy `stroke-gold` sólido con `<text>` (`EventFlowGraph.jsx:322,326-336`). Handoff: terracota `#CE6A3A` **punteada** (`dasharray 5 4`) + etiqueta como **píldora** div (mockup `:174-176`) |
| Crear / eliminar enlaces con etiqueta | ✅ | Crear: seleccionar 2 nodos → modal etiqueta (`EventFlowGraph.jsx:127-157`, `confirmLink`). Eliminar: clic en etiqueta (`:159-167,332`). Confirmado en pantallazos 12-13 |
| Nodo seleccionado con borde de categoría + sombra | 🟡 | Hoy seleccionado = `border-gold ring` (`EventFlowGraph.jsx:361-363`) y solo marca el nodo "origen del enlace", no un `selectedEvent`. Handoff: borde = `cat.bar` + `boxShadow node` (mockup `:354-355`; token `shadow-node` ya existe `tailwind.config.js:92`) |
| Leyenda sticky | 🟡 | Hay leyenda estática al pie (`EventFlowGraph.jsx:412-423`), no caja sticky flotante. Mockup: `:192-196` |
| Zoom +/-/reset (0.6–1.5, paso 0.15) | ❌ | No hay zoom en `EventFlowGraph` (solo scroll del contenedor). Handoff: 3 botones sticky + `transform:scale` con clamp 0.6-1.5 (mockup `:198-203`, script `:384-386`) |

### Categorías / tokens

| Pieza del layout | Estado | Evidencia |
|---|---|---|
| 4 colores de categoría del handoff en tokens | ✅ | `tailwind.config.js:56-62` (`cat.combat/social/explore/discovery` con `text/bg/bar` idénticos al mockup `CAT` script `:254-259`) |
| Patrón de clases estáticas por categoría (JIT-safe) | ✅ base | `frontend/src/components/ui/catalogClasses.js:10-37` (F15: `GLYPH_CLASSES`/`BADGE_CLASSES` con clases literales `bg-cat-*`) |
| Mapeo 8 categorías v1 → 4 colores handoff | ❌ | Hoy `lib/planning.js:3-25`: 8 categorías (`general,combate,exploración,interacción,trampa,recompensa,historia,NPC`) con **Tailwind genérico** (`text-red-400`…), NO los tokens `cat-*`. Falta la tabla de mapeo a los 4 colores |
| Cero emojis / tokens nuevos en componentes de planificación | ❌ | `EventFlowGraph.jsx` y `EventTemplatePanel.jsx` usan tokens v0 (`gold`, `ink-*`, `gray-*`) y emojis (🔗📋✏️🗑📌⌥🕸☰). Deben migrar (lección F13: cero emojis, tokens del handoff) |

---

## (b) Backend: qué ya sirve y qué faltaría

### YA sirve (CRUD completo, con auth DM y permisos por dueño del prep)

| Dominio | Endpoints | Archivo |
|---|---|---|
| Preparaciones | GET (lista con `event_count` + `campaign_name`), GET/:id (jerarquía completa), POST, PUT, DELETE (cascade) | `backend/src/routes/sessionPreps.js` |
| Ubicaciones | GET (por prep), POST, PUT (name/desc), DELETE (cascade) | `backend/src/routes/locations.js` |
| Sub-ubicaciones | GET (por location), POST, PUT (name/desc), DELETE (cascade) | `backend/src/routes/subLocations.js` |
| Eventos | GET (filtros dm/campaign/prep, ordenado por `order_index`), POST (raíz/sub/rama + participantes), PUT (title/desc/category/sub_location_id/**order_index**/branch_label/participants), DELETE (cascade ramas+enlaces) | `backend/src/routes/eventTemplates.js` |
| Enlaces | POST `/links` (from,to,label; 400 self-link, 409 duplicado), DELETE `/links/:id` | `backend/src/routes/eventTemplates.js:62-114` |
| Jerarquía | `getPrepHierarchy(prepId)` → `{prep, locations[sub_locations[events[branches]]], freeEvents, eventLinks}` | `backend/src/services/planning.js` |

- **Orden ya soportado en el modelo**: `event_templates.order_index` existe y se autocalcula al crear (`eventTemplates.js:27-56`) y se ordena en las lecturas. `locations`/`sub_locations` también tienen `order_index`.
- Tests de planificación existentes: `backend/src/routes/planning.test.js` (F5: 14 casos).

### Faltaría para el layout objetivo

1. **Reordenar eventos (subir/bajar) — el único gap real.** El handoff (y el pantallazo 11) piden flechas ↑↓ por tarjeta. Backend: `PUT /event-templates/:id` ya acepta `order_index`, así que **puede resolverse sin endpoint nuevo** haciendo 2 PUT (swap de `order_index` entre vecinos) desde el frontend. Alternativa más limpia: endpoint dedicado `POST /event-templates/:id/reorder {direction}` o `PUT /event-templates/reorder {ids[]}`. **Recomendación**: swap con los PUT existentes (evita backend nuevo; consistente con "componer sobre lo existente").
2. **Métodos faltantes en `api.js`** (el backend ya expone todo; falta el cliente):
   - `updateLocation(id, dmId, {name})` y `updateSubLocation(id, dmId, {name})` → para renombrar inline (backend PUT ya existe).
   - (Si se usa el swap) reusar `updateEventTemplate(id, dmId, {order_index})` — ya existe (`api.js:102`).
   - Métodos actuales de planificación en `api.js:62-114`: `listPreps, getPrep, createPrep, deletePrep, createLocation, deleteLocation, createSubLocation, deleteSubLocation, listEventTemplates, createEventTemplate, updateEventTemplate, deleteEventTemplate, createEventLink, deleteEventLink`.
3. **Sin migración de schema**: nada nuevo en DB. Todas las tablas (`session_preps, locations, sub_locations, event_templates, event_links, event_participants`) existen desde F1.
4. (Opcional) `updatePrep` en `api.js` si se quiere renombrar el prep desde la nueva pantalla (backend `PUT /session-preps/:id` ya existe).

---

## (c) Cuánto del grafo objetivo cubre `EventFlowGraph` hoy

`frontend/src/components/DMMaster/EventFlowGraph.jsx` (503 líneas) es **reutilizable en un ~55-60%** de la lógica; la maqueta hay que re-hacerla.

**Ya cubierto (reutilizable casi tal cual):**
- Aplanado de la jerarquía + cálculo de aristas (ramas + enlaces) — `lib/planning.js:48-129` (`flattenPrepEvents`, `computeGraphLayout`) y `EventFlowGraph.jsx:31-64`.
- **Drag de nodos con pointer events** (`onPointerDown` + listeners `pointermove/up`, umbral de 3px para distinguir clic de arrastre) — `EventFlowGraph.jsx:88-124`.
- **Crear enlace** (selección de 2 nodos → modal de etiqueta → `api.createEventLink`) y **eliminar enlace** (clic en la etiqueta) — `:126-167`.
- **Crear/editar/eliminar evento** con modal (título, categoría, sub-ubicación, descripción) — `:169-226,446-500`.
- Render de nodos vía `foreignObject` (evita estilos inline de posición: usa atributos `x/y` de SVG — cumple "cero estilos inline").

**Falta para cumplir el mockup (trabajo neto del grafo):**
1. **Curvas Bézier** en vez de `<line>` rectas → portar `edgePath` (cúbica vertical, script del mockup `:273-277`).
2. **Zoom +/-/reset** (estado `scale`, clamp 0.6-1.5 paso 0.15, `transform:scale` en el lienzo) — no existe hoy; el drag debe **dividir el delta por `scale`** (`:284`).
3. **Fondo de puntos radial** (contenedor).
4. **Estilo de aristas por tipo**: rama = gris `#5A5348` **sólida sin flecha**; enlace = terracota **punteada** (`dasharray 5 4`) con etiqueta como **píldora div** (no `<text>`).
5. **Selección de nodo** (`selectedEvent`) con **borde = color de categoría** (`cat.bar`) + `shadow-node` — hoy solo se resalta el "origen de enlace".
6. **Nodo 186px** con **barra superior 4px** de color (hoy franja lateral) + badge pill + nombre de ubicación con icono.
7. **Migrar tokens** (v0 `gold/ink/gray` → `accent/surface/line/cat-*`) y **quitar emojis** (usar `Icon.jsx`).
8. **Leyenda sticky** flotante (hoy pie estático).

> Nota de arquitectura: el `EventFlowGraph` compacto se usa también dentro de la sesión (`PlanningPanel`/`SessionView`, prop `compact`). Conviene **no romper esa firma**: extender el componente (o extraer un `EventGraphCanvas` compartido) en vez de reescribir en sitio, para que F18 (sesión en vivo) siga funcionando.

---

## (d) Estimación de esfuerzo: MEDIO-ALTO

Todo el peso es **frontend**; el backend está listo salvo el gap de reorder (resoluble con PUT existentes).

**Desglose de lo que falta (orden sugerido de implementación):**

1. **Mapeo de categorías (bajo).** Añadir a `lib/planning.js` (o un `lib/eventCategories.js`) la tabla 8-categorías-v1 → 4-colores-handoff, con listas de clases estáticas al estilo `catalogClasses.js` (JIT-safe). Devolver `{label, barClass, badgeClass}`.
2. **`api.js` (bajo).** Añadir `updateLocation`, `updateSubLocation` (y opcional `updatePrep`). Reusar `updateEventTemplate` para el swap de orden.
3. **Layout shell de la pantalla (medio).** Nueva estructura en `PrepPage.jsx`: rail 62px (réplica solo-iconos del sidebar, reusando `Icon` + `navItems`) + panel de ubicaciones 266px + main con toolbar 60px. Estado local: `selectedLoc`, `view` (lista/grafo), `expanded` por ubicación. Ojo: la pantalla del handoff **reemplaza** el sidebar 236px por el rail 62px → decidir si `PrepPage` se renderiza fuera del `AppShell` (como `SessionView`) o si el AppShell colapsa su sidebar en esta ruta. **Recomendación**: renderizar full-bleed como `SessionView` (App.jsx) para replicar el rail; consultar al líder.
4. **Panel de ubicaciones (medio).** Árbol colapsable (chevron), badges de conteo, fila seleccionada con inset terracota, sección "Sin ubicación" punteada, crear ubicación/sub inline + rename con lápiz. Reusar la lógica de `EventTemplatePanel` (addLocation/addSubLocation/remove*).
5. **Vista Lista (medio).** Columna 820px, kicker+H1 por ubicación seleccionada, tarjetas con barra 4px + badge pill + etiqueta de enlace + acciones hover (↑↓✎🗑), estado vacío punteado. El ↑↓ = swap de `order_index`.
6. **Vista Grafo (alto).** Evolucionar `EventFlowGraph` (o extraer canvas compartido): Bézier, zoom, fondo de puntos, aristas por tipo, selección con borde de categoría, nodo 186px, leyenda sticky, tokens + sin emojis.
7. **Selector de preparaciones como entrada (bajo-medio).** Re-tematizar `SessionPrepPanel` a tokens nuevos (quitar 🗑) como vista previa; el breadcrumb "← Preparaciones" vuelve a él.
8. **Verificación (según CHECKPOINTS):** `docker compose build frontend` (lint+build), tests (añadir a `pages.test.jsx` smoke de la página; opcional test de swap de orden en `planning.test.js`), smoke: crear prep → ubicaciones/sub → eventos → enlaces en Lista y Grafo, zoom, reorder.

**Riesgos / decisiones a confirmar con el líder:**
- ¿`PrepPage` full-bleed (fuera del AppShell, con rail propio 62px) vs. dentro del shell? El handoff claramente muestra rail 62px, no el sidebar 236px.
- Reorder por swap de PUT vs. endpoint dedicado (recomiendo swap).
- No romper la firma `compact` de `EventFlowGraph` usada por `PlanningPanel` (F8b) para no regresionar la edición del grafo en sesión.
- El drag actual **descarta** posiciones al recargar (`EventFlowGraph.jsx:68-74`): las posiciones del grafo son efímeras (no se persisten). El handoff tampoco persiste (posición en estado local). OK mantener efímero salvo que el founder pida persistencia.

---

## Archivos clave (referencia rápida, rutas absolutas)

Backend:
- `C:\Users\gabri\dev\rolapp-v1\backend\src\routes\sessionPreps.js`
- `C:\Users\gabri\dev\rolapp-v1\backend\src\routes\locations.js`
- `C:\Users\gabri\dev\rolapp-v1\backend\src\routes\subLocations.js`
- `C:\Users\gabri\dev\rolapp-v1\backend\src\routes\eventTemplates.js`
- `C:\Users\gabri\dev\rolapp-v1\backend\src\services\planning.js`
- `C:\Users\gabri\dev\rolapp-v1\backend\src\routes\planning.test.js`

Frontend:
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\pages\PrepPage.jsx` (página actual, provisional)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\DMMaster\EventFlowGraph.jsx` (grafo — núcleo reutilizable)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\DMMaster\EventTemplatePanel.jsx` (editor lista/grafo actual)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\DMMaster\SessionPrepPanel.jsx` (selector de preps)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\lib\planning.js` (categorías + layout del grafo)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\lib\api.js` (métodos de planificación, líneas 62-114)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\ui\catalogClasses.js` (patrón clases estáticas por categoría, F15)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\ui\Icon.jsx` (set de iconos SVG de línea)
- `C:\Users\gabri\dev\rolapp-v1\frontend\src\components\layout\navItems.js` / `Sidebar.jsx` (referencia para el rail 62px)
- `C:\Users\gabri\dev\rolapp-v1\frontend\tailwind.config.js` (tokens; `cat.*` líneas 56-62)

Diseño:
- `C:\Users\gabri\dev\rolapp-v1\.claude\design_handoff_rolapp\Preparar Sesion.dc.html` (mockup + lógica de referencia)
- `C:\Users\gabri\dev\rolapp-v1\.claude\1.0_Front\11.PNG` (lista v0), `12.PNG` (grafo), `13.PNG` (crear enlace con etiqueta)

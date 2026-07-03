# Handoff: RolApp — App de apoyo para juegos de rol y mesa

## Overview
RolApp es una herramienta para másters (DM) y jugadores de rol de mesa. Gestiona campañas, sesiones, sistema de juego (atributos, habilidades, personajes base), inventario de items, NPCs y la preparación de sesiones (ubicaciones + eventos, en vista lista y grafo). Este paquete contiene el rediseño visual completo de la app: se reemplazó el look anterior (navy oscuro + azul + emojis, estética "IA") por una dirección **modo oscuro cálido, editorial y minimalista, sin emojis**.

El usuario principal de la app es el **DM en laptop**; los jugadores usan móvil (esta entrega cubre las pantallas de escritorio del DM).

## About the Design Files
Los archivos de este bundle son **referencias de diseño creadas en HTML** — prototipos que muestran el aspecto y el comportamiento deseados, **no código de producción para copiar tal cual**. Están escritos como "Design Components" (`.dc.html`), un formato de prototipado; **no debes portar ese runtime**.

La tarea es **recrear estos diseños en el entorno del codebase real** (React, Vue, Svelte, etc.) usando sus patrones y librerías establecidos. Si aún no hay entorno, elige el framework más apropiado e impleméntalos ahí. Toma de los HTML el layout, los colores, la tipografía y las interacciones; ignora la mecánica de `.dc.html` (`<x-dc>`, `<sc-for>`, `renderVals()`, `dc-import`).

## Fidelity
**Alta fidelidad (hifi).** Colores, tipografía, espaciados e interacciones son finales. Recrea la UI de forma fiel al píxel usando las librerías y patrones del codebase. Los datos son de ejemplo ("La Cripta de Vhalmar") — sustitúyelos por datos reales del backend.

## Design Tokens

### Colores
| Rol | Hex |
|---|---|
| Fondo app | `#1B1815` |
| Fondo rail/nav lateral | `#17140F` / `#201D18` |
| Superficie (tarjetas, paneles) | `#221E19` / `#262119` |
| Superficie hover | `#26221C` / `#282420` |
| Borde sutil | `#2E2A24` / `#2A2620` |
| Borde hover/activo | `#4A4237` / `#35302A` |
| Texto principal | `#ECE6DB` |
| Texto títulos (serif) | `#F4EFE6` / `#F1ECE2` |
| Texto secundario | `#B4AB9D` |
| Texto terciario / labels | `#8A8175` |
| Texto muted (uppercase labels) | `#6E6659` / `#7C7468` |
| **Acento primario (terracota)** | `#CE6A3A` |
| Acento hover | `#D97C4E` |
| Acento sobre oscuro (texto/iconos) | `#E08A5C` |
| Acento tinte de fondo (selección nav) | `#33251C` / `#2F2820` |
| Peligro / eliminar | `#E4785E` (texto), `#3A231F` (fondo hover) |

### Colores de categoría (eventos, habilidades, items, atributos)
Cada categoría = { text (claro), bg (tinte oscuro), bar (medio) }:
| Categoría | text | bg | bar |
|---|---|---|---|
| Combate / Ataque | `#E79B72` | `#38241B` | `#D2703F` |
| Social / Apoyo | `#CFA0BF` | `#312330` | `#9E7890` |
| Exploración / Defensa | `#9DC08B` | `#22301E` | `#7C9668` |
| Descubrimiento / Pasiva | `#DBB55F` | `#332B17` | `#C9A24A` |
| (Carisma / extra) | `#A9AEC9` | `#2A2A33` | — |

### Tipografía
- **Serif (títulos, cifras destacadas):** `Newsreader` (Google Fonts). Pesos 400/500/600. Usada en H1 (32px/600), títulos de tarjeta (18–21px/600), cifras de métricas (38px/600), nombres de ubicación.
- **Sans (UI, cuerpo, labels):** `Hanken Grotesk` (Google Fonts). Pesos 400/500/600/700.
- Labels de sección: 10–11px, weight 700, `letter-spacing:1.2–1.4px`, `text-transform:uppercase`, color muted.
- Cuerpo: 13.5–14.5px, line-height ~1.5.
- Cifras: `font-variant-numeric: tabular-nums`.

### Espaciado, radios y sombras
- Radios: tarjetas/paneles `13–14px`; botones e inputs `9–10px`; iconos-chip `9–13px`; badges/píldoras `20px` (pill); celdas de icono en botones `7–8px`.
- Padding de contenido principal: `34px 40px 60px`, con `max-width` de 900–1080px.
- Gap de grids de tarjetas: `16–18px`.
- Sombra hover de tarjeta: `0 6px 20px rgba(0,0,0,.28)`.
- Sombra de nodo seleccionado (grafo): `0 10px 26px rgba(0,0,0,.5)`.
- Transiciones: `border-color .15s, box-shadow .15s`; chevrons `transform .15s`.

## Estructura global (layout compartido)

Todas las pantallas siguen el patrón **sidebar fijo + main scrollable**:
```
[ Sidebar 236px ] [ main flex:1, overflow-y:auto ]
```
Excepción: **Preparar Sesión** usa un **rail de iconos compacto (62px)** + un **panel de ubicaciones (266px)** + main, porque necesita más espacio horizontal.

### Sidebar (componente compartido — `Sidebar.dc.html`)
- Ancho 236px, fondo `#201D18`, borde derecho `#2E2A24`.
- Cabecera: logo (cubo isométrico en cuadrado terracota `#CE6A3A` 30px, radio 8px) + wordmark "RolApp" en Newsreader 20px/600.
- Bloque de usuario: avatar circular 38px terracota con inicial "D", nombre "DM1" (14px/600), rol "Dungeon Master" (12px muted).
- Grupos de navegación con encabezados uppercase muted ("Principal", "Historial").
- Ítems de nav: icono de línea 18px + label 13.5px, padding `8px 12px`, margin `1px 10px`, radio 9px.
  - Idle: color `#ACA396`, weight 500.
  - Hover: color `#F1ECE2`, fondo `#282420`.
  - **Activo**: color `#E08A5C`, fondo `#33251C`, weight 600, indicador `box-shadow: inset 3px 0 0 #CE6A3A`.
- Pie: "Cerrar Sesión" en tono peligro (`#C0796E`, hover fondo `#2E2020`/texto `#E4785E`), separado por borde superior.
- Orden de ítems: Dashboard, Campañas, Preparar Sesión, Habilidades, Personajes Base, Bases de Atributos, Personajes, Items, NPCs — luego (Historial) Sesiones Finalizadas.

## Screens / Views

### 1. Dashboard (`Dashboard.dc.html`)
- **Propósito:** vista de aterrizaje; resumen y crear nueva sesión.
- **Layout:** H1 "Panel" + subtítulo. Fila de 4 tarjetas de métrica (`grid-template-columns:repeat(4,1fr)`, gap 16px). Bloque "Nueva sesión" (input nombre + 2 selects + botón "Crear"). Fila de 2 paneles (`1fr 1fr`, gap 18px): "Sesiones activas" y "Sesiones recientes".
- **Tarjeta de métrica:** icono de línea coloreado + label 12.5px muted arriba; cifra Newsreader 38px/600 abajo. Métricas: Campañas activas (3), Sesiones activas (1), Sesiones finalizadas (12), Total jugadores (7).
- **Sesión activa (fila):** punto de estado verde (`#7C9668`, con halo `box-shadow:0 0 0 3px #22301E`) + título + subtítulo (campaña · nº jugadores) + link "Reanudar →" en acento.
- **Botón primario:** fondo `#CE6A3A`, texto `#1B1815`, weight 700, radio 10px, hover `#D97C4E`.

### 2. Campañas (`Campanas.dc.html`)
- **Propósito:** listar campañas.
- **Layout:** header con título + botón "Nueva campaña". Grid `repeat(auto-fill,minmax(320px,1fr))`, gap 18px.
- **Tarjeta:** franja superior de 6px con color de acento propio de la campaña; badge de estado (Activa=verde, Pausada=neutral) + sistema; nombre Newsreader 21px; descripción; pie con stats (Jugadores, Sesiones en Newsreader 19px) + link "Abrir →".

### 3. Preparar Sesión (`Preparar Sesion.dc.html`) — pantalla estrella
- **Propósito:** el DM organiza ubicaciones y los eventos que ocurren en ellas; dos vistas.
- **Layout:** rail iconos 62px + panel ubicaciones 266px + main. Main tiene toolbar (60px) con breadcrumb, contador de eventos, **toggle segmentado Lista/Grafo**, y botón "Evento".
- **Panel de ubicaciones:** árbol de dos niveles (ubicación padre → sub-ubicaciones), colapsable con chevron que rota 90°. Cada sub-ubicación: pin + nombre + badge de conteo. Ítem seleccionado: fondo `#2F2820`, `inset 3px 0 0 #CE6A3A`, badge en acento sólido. Sección "Sin ubicación" separada por borde punteado.
- **Vista Lista:** columna centrada (max-width 820px). Encabezado: kicker de ubicación padre (uppercase acento) + H1 nombre (Newsreader 30px) + subtítulo. Tarjetas de evento: barra de color de categoría a la izquierda (4px), título + badge de categoría + (opcional) etiqueta de enlace narrativo con icono de cadena, descripción; acciones al hover (subir/bajar/editar/eliminar). Estado vacío con borde punteado + CTA.
- **Vista Grafo:** lienzo con fondo de puntos (`radial-gradient(#2E2A22 1.2px,transparent) 26px`). Nodos de evento **arrastrables** (pointer events, 186px, franja de categoría arriba). Aristas SVG con curva Bézier: **sólidas grises** (`#5A5348`) = misma ubicación; **punteadas terracota** (`#CE6A3A`, `dash 5 4`) = enlace narrativo, con etiqueta-píldora en el punto medio. Nodo seleccionado: borde en color de categoría + sombra elevada. Leyenda (sticky abajo-izq) y controles de zoom +/−/reset (sticky abajo-der).
- **Categorías de evento:** Combate, Social, Exploración, Descubrimiento (ver tokens).

### 4. Habilidades (`Habilidades.dc.html`)
- **Propósito:** catálogo de habilidades del sistema.
- **Layout:** header + barra de búsqueda (con icono lupa) + chips de filtro por tipo (Todas/Ataque/Defensa/Apoyo/Pasiva; activo con borde+fondo acento). Tabla en panel: columnas `2fr 1fr 1fr 90px` (Habilidad / Tipo / Coste / acciones).
- **Fila:** icono-glifo cuadrado 34px coloreado por tipo + nombre + descripción truncada; badge de tipo (pill coloreada); coste (ej "2 PA"); acciones editar/eliminar al hover.

### 5. Personajes Base (`PersonajesBase.dc.html`)
- **Propósito:** plantillas/arquetipos (clases) reutilizables.
- **Layout:** grid `repeat(auto-fill,minmax(300px,1fr))`, gap 18px.
- **Tarjeta:** icono-glifo 46px coloreado + nombre (Newsreader 19px) + rol. Barras de atributo (Fuerza/Destreza/Mente/Vitalidad): label + barra de progreso (track `#2A2620`, relleno color de la plantilla) + valor. Chips de habilidades asociadas en el pie (pills `#2A2620`).

### 6. Bases de Atributos (`BasesDeAtributos.dc.html`)
- **Propósito:** definir los atributos fundamentales del sistema.
- **Layout:** lista vertical (max-width 900px), gap 12px.
- **Fila:** cuadro de abreviatura 44px coloreado (FUE/DES/MEN/VIT/CAR) + nombre (Newsreader 18px) + badge de rango ("rango 1–10") + descripción; acciones editar/eliminar. Atributos ejemplo: Fuerza, Destreza, Mente, Vitalidad, Carisma.

### 7. Items (`Items.dc.html`)
- **Propósito:** inventario global de objetos.
- **Layout:** grid `repeat(auto-fill,minmax(230px,1fr))`, gap 16px.
- **Tarjeta:** punto de rareza en esquina sup-der (Común gris, Raro verde, Épico morado, Legendario dorado; con halo) + icono-glifo 44px + nombre + "tipo · rareza" + descripción + valor en oro (dorado `#DBB55F` con icono moneda).

### 8. NPCs (`NPCs.dc.html`)
- **Propósito:** fichas de personajes no jugadores.
- **Layout:** grid `repeat(auto-fill,minmax(320px,1fr))`, gap 16px.
- **Tarjeta (horizontal):** avatar-glifo 52px con inicial + nombre (Newsreader 18px) + badge de disposición (Aliado=verde / Neutral=dorado / Hostil=naranja) + "rol · ubicación" + descripción.

### 9. Personajes (`Personajes.dc.html`)
- **Propósito:** personajes de jugadores (instancias de plantillas).
- **Layout:** grid `repeat(auto-fill,minmax(340px,1fr))`, gap 18px.
- **Tarjeta:** avatar-glifo 54px + nombre (Newsreader 19px) + "plantilla · Nivel N · jugador". Barras PV (verde) y EXP (terracota). Pie con 4 stats (FUE/DES/MEN/VIT) en cuadrícula `repeat(4,1fr)` separada por bordes, cifra Newsreader 18px + label uppercase.

### 10. Sesiones Finalizadas (`SesionesFinalizadas.dc.html`)
- **Propósito:** historial cronológico de sesiones cerradas.
- **Layout:** timeline vertical (max-width 920px). Línea vertical `#2E2A24` a la izquierda; cada entrada con punto (borde en color) + tarjeta: título (Newsreader 18px) + fecha; resumen; pie con metadatos (duración con icono reloj, nº jugadores, campaña) + link "Ver resumen →".

## Interactions & Behavior
- **Navegación:** el sidebar enlaza a cada pantalla; el ítem de la pantalla actual queda en estado activo (acento + barra izquierda). En Preparar Sesión el rail de 62px replica los enlaces con solo iconos.
- **Preparar Sesión → toggle Lista/Grafo:** control segmentado; el botón activo tiene fondo `#3A342C` y sombra sutil, el inactivo es transparente con texto muted.
- **Árbol de ubicaciones:** click en la ubicación padre colapsa/expande (chevron rota 0↔90°). Click en sub-ubicación la selecciona y filtra los eventos del main.
- **Grafo — arrastrar nodos:** `pointerdown` en un nodo captura el offset y mueve con `pointermove` (dividiendo el delta por el `scale` actual para respetar el zoom); `pointerup` suelta. Al arrastrar, ese nodo queda seleccionado. Las aristas se recalculan en vivo (curva Bézier vertical entre centros de nodos).
- **Zoom del grafo:** botones +/− ajustan `scale` en pasos de 0.15 (límites 0.6–1.5); reset vuelve a 1. El `scale` se aplica como `transform: scale()` con `transform-origin: 0 0` al lienzo.
- **Hover states:** tarjetas suben borde a `#4A4237` + sombra; filas de tabla/lista cambian fondo; acciones de fila (editar/eliminar/reordenar) aparecen al hover del contenedor.
- **Estados vacíos:** contenedor con borde punteado, icono, texto muted y CTA (ver vista Lista).

## State Management
Variables de estado necesarias (por pantalla o globales según arquitectura):
- **Global:** ruta/pantalla activa (para el estado activo del sidebar); usuario actual (rol DM/jugador).
- **Preparar Sesión:** `view` ('lista' | 'grafo'), `selectedLoc` (id de sub-ubicación o 'none'), `selectedEvent` (id | null), `expanded` (mapa id-padre → bool), `scale` (número), `nodePos` (mapa id-evento → {x,y}).
- **Datos (desde backend):** campañas, sesiones (activas/recientes/finalizadas), ubicaciones (árbol padre/hijo), eventos (con categoría, ubicación y enlaces narrativos), habilidades, personajes base, atributos, items (con rareza), NPCs (con disposición), personajes de jugador (PV, EXP, stats).

## Assets
- **Iconografía:** iconos de **línea SVG dibujados inline** (stroke, 1.6–1.8px), estilo consistente tipo "feather/lucide". No se usan emojis (decisión de diseño clave). En una implementación real, sustituir por una librería de iconos de línea (p. ej. Lucide) manteniendo el grosor fino.
- **Glifos:** los cuadros de icono de habilidades/items/atributos usan caracteres unicode (⚔ ⛨ ✚ ◈ ➹ ❖ ✦ ⚗) como placeholder — sustituibles por iconos reales de la librería.
- **Fuentes:** Newsreader y Hanken Grotesk desde Google Fonts.
- **Sin imágenes rasterizadas.** Los avatares son iniciales/glifos sobre color; conectar con imágenes reales de personaje si el backend las provee.

## Files
Prototipos HTML incluidos en este bundle (referencia de diseño):
- `Sidebar.dc.html` — navegación lateral compartida
- `Dashboard.dc.html`
- `Campanas.dc.html`
- `Preparar Sesion.dc.html` — vistas Lista + Grafo
- `Habilidades.dc.html`
- `PersonajesBase.dc.html`
- `BasesDeAtributos.dc.html`
- `Items.dc.html`
- `NPCs.dc.html`
- `Personajes.dc.html`
- `SesionesFinalizadas.dc.html`

> Nota: son "Design Components" (`.dc.html`). Extrae de ellos estilos, layout e interacciones; **no** portes el runtime del prototipo (`<x-dc>`, `<sc-for>`, `renderVals()`, `dc-import`). Recréalos con los patrones del codebase destino.

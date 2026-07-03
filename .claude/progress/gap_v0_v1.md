# Análisis de brechas v0 → v1 + handoff de diseño (2026-07-02)

> Fuentes: inventario del frontend v1 (Explore), inventario funcional de la v0
> (`C:\Users\gabri\OneDrive\Escritorio\RolApp`), pantallazos `.claude/1.0_Front/`,
> handoff `.claude/design_handoff_rolapp/README.md`.

## Petición del founder
1. Rediseñar la UI según el handoff (`design_handoff_rolapp`) — modo oscuro cálido,
   terracota `#CE6A3A`, Newsreader + Hanken Grotesk, sidebar 236px, sin emojis.
2. Recuperar las funcionalidades de la v0 que la v1 perdió.

## Estado actual v1 (resumen)
- Navegación por estado (App.jsx): Login → Lobby (hub con sub-vistas) → SessionView.
- Tokens navy+dorado (`gold #c9a84c`, `ink`), Inter, emojis como iconos.
- Funcional: sesiones/campañas (crudo), canvas tldraw sync, chat, AIPanel (pregunta libre
  + streaming + citas), PlanningPanel (prep/disparados/editar grafo), builder de sistemas
  (atributos/slots + SkillsPanel + ItemsPanel embebidos), pregens, MyCharacters (ficha
  dinámica con tabs), historial con stats.

## Brechas funcionales (v0 tenía, v1 no)
| # | Brecha | Detalle |
|---|--------|---------|
| 1 | Gestor de NPCs | CRUD maestro-detalle: info, quests (título/desc/reward), inventario (item/cantidad/costo), vínculo a campañas. Backend `/api/npcs/*` completo. |
| 2 | Notas de sesión | CRUD notas (título, body, tipo, pública/privada) + sync socket + visibles en historial. Backend `/api/notes`. |
| 3 | Tabs de sesión en vivo | Inventario, Habilidades, Equipamiento (slots), Estado (dot tracker HP/WP), Atributos — por personaje, editables, sync en tiempo real. |
| 4 | Toolbar de sesión | Cambiar mapa, Nuevo Evento, Nuevo Evento NPC, Reset, Finalizar (v1 tiene parte dentro de PlanningPanel). |
| 5 | Asistente IA — presets | Modos Sesión/Sistema; presets: Resumen, Cronología, Estado de personajes, Inventarios, Pregunta libre; topics de sistema; checkbox "incluir sesiones anteriores". |
| 6 | Historial: búsqueda + detalle | Búsqueda por texto, filtro por campaña, detalle con tabs: Notas / Eventos / Resumen / IA. |
| 7 | Dashboard | Métricas (campañas activas, sesiones activas/finalizadas, jugadores) + crear sesión (nombre+campaña+prep) + listas activas/recientes. |
| 8 | Habilidades: bulk import | Importación masiva JSON con auto-creación de campos + búsqueda + paginación (50). |
| 9 | Mecánicas de sistema | Tab Mecánicas en el builder (tipo, affect, parámetros dinámicos). Backend `/api/game-systems/:id/mechanics*`. |
| 10 | Personajes (vista DM) | Página con todos los personajes de todos los jugadores. |
| 11 | Atributos dinámicos en sesión | Crear atributos ad-hoc durante la sesión. |

## Brecha visual (handoff)
- AppShell: sidebar fijo 236px (grupos Principal/Historial, activo terracota con inset bar,
  pie Cerrar Sesión) + main scrollable. Preparar Sesión: rail 62px + panel ubicaciones 266px.
- Tokens: fondo `#1B1815`, superficies `#221E19/#262119`, bordes `#2E2A24`, texto `#ECE6DB`,
  acento `#CE6A3A` (hover `#D97C4E`), colores de categoría (combate/social/exploración/descubrimiento).
- Tipografía: Newsreader (títulos/cifras), Hanken Grotesk (UI). Sin emojis → iconos SVG de línea inline.
- 10 pantallas hifi: Dashboard, Campañas, Preparar Sesión (lista+grafo drag/zoom/enlaces),
  Habilidades, Personajes Base, Bases de Atributos, Personajes, Items, NPCs, Sesiones Finalizadas.

## Backlog derivado (F13–F19)
Ver `feature_list.json`. Orden: base de diseño → páginas núcleo → catálogos → NPCs →
prep rediseñada → sesión en vivo completa → detalle de historial.

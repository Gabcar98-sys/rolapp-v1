# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.

---

## Sesión actual (2026-07-02)

Petición del founder: (1) rediseño visual completo según `.claude/design_handoff_rolapp/`
(modo oscuro cálido, terracota, Newsreader/Hanken Grotesk, sidebar 236px, sin emojis) y
(2) recuperar funcionalidades de la v0 que la v1 perdió.

Análisis de brechas completado → `.claude/progress/gap_v0_v1.md`.
Backlog nuevo registrado: **F13–F19** en `feature_list.json`.

## Feature en progreso

**F13-design-foundation** — lanzada al implementer. Tokens + tipografías + AppShell
sidebar 236px + iconos SVG de línea + restyle de componentes ui/ + Login.

## Orden del backlog
F13 (base de diseño) → F14 (Dashboard/Campañas/Historial) → F15 (catálogos: Habilidades
con bulk import, Items, Bases de Atributos con Mecánicas, Personajes Base, Personajes) →
F16 (NPCs completos) → F17 (Preparar Sesión rediseñada) → F18 (sesión en vivo completa:
notas, tabs por personaje, toolbar, presets IA) → F19 (detalle de historial).

## Deuda menor
- Reindexar vectores del RAG cuando Ollama esté arriba (`docker compose --profile ai up` + bootstrap + reindex).

## Preguntas abiertas
- ¿Disposición (Aliado/Neutral/Hostil) de NPCs: existe en schema v1 o se agrega en F16? (el implementer de F16 debe verificar el schema antes).

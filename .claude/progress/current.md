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

**F15-catalog-pages** — Habilidades (bulk import JSON), Items, Bases de Atributos
(con Mecánicas), Personajes Base, Personajes.

## Cerradas esta sesión
- **F13-design-foundation** — APROBADA, commit `476a07d`. AppShell + tokens + iconos.
- **F14-pages-core** — APROBADA, commit `6b9c2c3`. Dashboard/Campañas/Historial
  rediseñadas; listados backend enriquecidos; lecciones F14 en LEARNINGS.md.

## Orden del backlog
F13 (base de diseño) → F14 (Dashboard/Campañas/Historial) → F15 (catálogos: Habilidades
con bulk import, Items, Bases de Atributos con Mecánicas, Personajes Base, Personajes) →
F16 (NPCs completos) → F17 (Preparar Sesión rediseñada) → F18 (sesión en vivo completa:
notas, tabs por personaje, toolbar, presets IA) → F19 (detalle de historial).

## Deuda menor
- Reindexar vectores del RAG cuando Ollama esté arriba (`docker compose --profile ai up` + bootstrap + reindex).

## Preguntas abiertas
- ¿Disposición (Aliado/Neutral/Hostil) de NPCs: existe en schema v1 o se agrega en F16? (el implementer de F16 debe verificar el schema antes).
- **Eliminar campaña (F14, para el founder):** no existe `DELETE /api/campaigns/:id` ni política de borrado (FK sessions→campaigns sin ON DELETE). Opciones: (a) archivado en vez de borrado, (b) DELETE bloqueado si tiene sesiones, (c) cascade. El implementer dejó solo Abrir/Editar; decidir antes de implementarlo.

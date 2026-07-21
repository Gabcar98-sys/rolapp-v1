# Implementación: F16 — Gestor de NPCs
Fecha: 2026-07-20
Status: completado

## Resumen
Partiendo del inventario del scout (`scout_F16-npcs.md`), el backend CRUD + sub-recursos ya
existían y **no se reescribieron**. El trabajo fue: (1) añadir la columna `disposition` al
schema + migración idempotente y reflejarla en POST/PUT; (2) completar el cliente API con
`updateNpc` y los métodos de sub-recursos; (3) reemplazar el placeholder `NpcsPage.jsx` por el
gestor maestro-detalle real según el mockup `NPCs.dc.html`; (4) crear los tests backend que
faltaban. Verificado en Docker (lint/test backend, build/test frontend) — todo en verde.

## Decisión clave: `disposition`
- Valores **en inglés en código** (`'ally' | 'neutral' | 'hostile'`), default `'neutral'`,
  con `CHECK`. La UI traduce a Aliado/Neutral/Hostil (helper `dispositionLabel`).
  Se descartó guardar las etiquetas en español en la DB para no acoplar datos a idioma de UI.
- Baseline en `schema.sql` (instalaciones nuevas) + migración idempotente
  `M001_npcs_disposition` en `db/index.js` (verifica con `PRAGMA table_info(npcs)` antes de
  `ALTER TABLE`, lección SQLite/F1). Confirmado: la migración aplicó sobre la DB persistida
  del volumen ("Migración aplicada: M001_npcs_disposition") y `PRAGMA` muestra la columna.
- POST/PUT normalizan la disposición (`normalizeDisposition`): valor inválido → `'neutral'`
  (defensa además del CHECK).
- `role`/`loc` del mockup: **NO** se añadieron columnas. La tarjeta muestra `game_system_name`
  en su lugar (tolerante: si no hay sistema, se omite). Scope ajustado.

## Archivos creados
- `backend/src/routes/npcs.test.js`: 10 tests (CRUD npc con disposición+400/403/404, quests
  crear/borrar+400/403, inventory crear con numéricos, campaigns asociar idempotente/GET/
  desasociar, listado con conteos + 400 sin dm_id).

## Archivos modificados
- `backend/src/db/schema.sql`: columna `disposition TEXT NOT NULL DEFAULT 'neutral' CHECK(...)`
  en `npcs` (baseline para instalaciones nuevas).
- `backend/src/db/index.js`: migración idempotente `M001_npcs_disposition` (PRAGMA-guard +
  ALTER TABLE) en el array `migrations`.
- `backend/src/routes/npcs.js`: acepta `disposition` en POST y PUT con `normalizeDisposition`;
  helper `DISPOSITIONS`/`normalizeDisposition`. No se tocó nada más del router.
- `frontend/src/lib/api.js`: `createNpc(dmId, fields)` (firma cambiada a objeto de campos; no
  tenía llamadores previos), + `updateNpc`, `createNpcQuest`/`deleteNpcQuest`,
  `createNpcItem`/`deleteNpcItem`, `linkNpcCampaign`/`unlinkNpcCampaign`.
- `frontend/src/lib/catalog.js`: helpers puros `DISPOSITIONS`, `dispositionIndex`,
  `dispositionLabel` (fallback neutral).
- `frontend/src/components/ui/catalogClasses.js`: `NPC_GLYPH_CLASSES`/`NPC_BADGE_CLASSES`
  (clases LITERALES por disposición, índice estable — lección F14).
- `frontend/src/pages/NpcsPage.jsx`: reemplazo total del placeholder por el gestor
  maestro-detalle (grid con búsqueda + filtro por sistema + crear; detalle con tabs
  Información / Quests / Inventario / Campañas; glifo de inicial no-emoji + badge de
  disposición; solo DM). Estilos solo Tailwind + tokens, cero inline, cero window.innerWidth.
- `frontend/src/App.jsx`: `<NpcsPage user={user} />` (el placeholder no recibía `user`; la
  página real lo necesita — cableado imprescindible, lección F5).
- `frontend/src/lib/catalog.test.js`: 4 tests nuevos para los helpers de disposición.
- `frontend/src/pages/pages.test.jsx`: `<NpcsPage user={dm} />` (el smoke SSR ya no puede
  montar la página sin `user`; alineado con las demás páginas DM del arreglo).
- `.claude/feature_list.json`: F16-npcs `pending` → `in_progress`.

## Tests escritos
- `backend/src/routes/npcs.test.js` (10): CRUD + quests + inventory + campaign-links + errores
  400/403/404, siguiendo el patrón `invoke()` de `skills.test.js`. Añadí los `DELETE FROM` de
  `npc_campaign_links`/`npc_inventory`/`npc_quests`/`npcs`/`campaigns`/`users` al `beforeEach`
  (lección Testing sobre tablas puente).
- `frontend/src/lib/catalog.test.js` (+4): mapeo estable de disposición, fallback neutral,
  etiquetas en español, no-desborde de paleta.

## Resultado de verificación (entorno canónico Docker)
Reconstruí el backend (`docker compose up -d --build backend`) para verificar contra el código
nuevo (lección: backend baked sin volumen de src).

- lint:  ✅ `docker compose exec backend npm run lint` → exit 0, sin warnings.
- build: ✅ `docker compose build frontend` → exit 0 (fuerza `npm run lint` + `npm run build`).
- test backend: ✅ **126 pass / 0 fail / 1 skipped** (127 total; +10 de F16; el skip es
  preexistente) — `docker compose exec backend npm test`.
- test frontend: ✅ **58/58** en 5 archivos (catalog 21, planning 4, metrics 13, navItems 4,
  pages 16). Comando exacto:
  `docker build --target build -t rolapp-frontend-test ./frontend && docker run --rm rolapp-frontend-test npm test`
  (imagen efímera `rolapp-frontend-test` eliminada tras el run).
- Migración / schema: ✅ log del backend "Migración aplicada: M001_npcs_disposition";
  `PRAGMA table_info(npcs)` incluye `disposition TEXT NOTNULL default 'neutral'`; smoke confirmó
  que el `CHECK` rechaza valores inválidos y que `'hostile'` persiste.

## Higiene Docker
- Sin `node_modules` residual en `frontend/`/`backend/` antes de buildear (lección F8b).
- Imagen de test efímera borrada tras el run.

## Lecciones aplicadas
- **"Verificar migraciones con PRAGMA" (SQLite/F1):** migración idempotente con guard
  `PRAGMA table_info` antes de `ALTER TABLE`; verificada en el contenedor, no leyendo el .sql.
- **"Colores dinámicos: listas estáticas + índice estable" (F14):** disposición → clase por
  `NPC_GLYPH_CLASSES[dispositionIndex(...)]`, clases literales. Cero `bg-${x}`, cero inline.
- **"Componentes cableados y accesibles" (F5):** pasé `user` a `NpcsPage` en `App.jsx`; sin eso
  la página crasheaba (undefined `user.id`), como reveló el smoke SSR.
- **"Tablas puente en el DELETE del beforeEach" (Testing/F14):** el `beforeEach` de
  `npcs.test.js` limpia `npc_campaign_links` y demás.
- **"Lint/test en el entorno canónico" (F4/Proceso):** todos los verdes salen de comandos
  ejecutados en Docker; reconstruí backend y frontend.

## Decisiones tomadas
- `createNpc` en `api.js` pasó de `(dmId, name, description, avatarIcon)` a `(dmId, fields)`
  para soportar `disposition`/`game_system_id` sin una lista posicional frágil. No había
  llamadores previos (grep en `.jsx` → 0), así que no rompe nada.
- La tarjeta muestra `game_system_name` en la línea secundaria (en vez de `role · loc` del
  mockup, que no tienen columna). Degradación tolerante.
- Sin dependencias nuevas. Sin endpoints nuevos.

## Candidatos para LEARNINGS.md (el líder decide)
- **Un placeholder que se promueve a página real puede romper tests de smoke existentes.**
  `pages.test.jsx` montaba `<NpcsPage/>` sin `user` porque era un stub; al volverse funcional,
  el SSR crasheó. Al reemplazar un placeholder por una página con props requeridas, buscar sus
  render-smoke y actualizarlos junto con el cableado en `App.jsx`.
- **Disposición/enums de dominio: guardar el valor canónico en inglés + CHECK, traducir en UI.**
  Evita acoplar la DB al idioma de presentación y permite badges/colores por índice estable.

## Bloqueantes
Ninguno. F16 está implementada, cableada, navegable y verde en lint/build/test backend+frontend.
```
```

## Brechas abiertas / notas para el reviewer
- No hay PUT de edición de quest/objeto individual (el backend solo expone crear/borrar; el
  requisito de F16 no lo pide). La UI refleja esa capacidad: crear + eliminar.
- `avatar_icon` sigue guardándose (default emoji 🧑) pero la UI **no** lo muestra: el glifo se
  deriva de la inicial del nombre (requisito "inicial, NO emoji"). El campo queda en el modelo
  para compatibilidad con `PlanningPanel`, que sí lo usa en su `<select>`.

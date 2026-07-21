# Revisión: F16 — Gestor de NPCs
Fecha: 2026-07-20
Revisor: reviewer (independiente)
Veredicto: **APROBADO**

## Resultado de verificación (Docker, comandos exactos, exit codes reales)
| Comando | Resultado |
|---|---|
| `docker compose exec backend npm run lint` | ✅ exit 0, sin warnings |
| `docker compose exec backend npm test` | ✅ 127 total → **126 pass / 0 fail / 1 skipped** (skip preexistente), exit 0 |
| `docker compose exec backend node --test src/routes/npcs.test.js` | ✅ **10 pass / 0 fail** |
| `docker build --no-cache --target build ./frontend` (fuerza lint+build) | ✅ exit 0, build completo |
| `docker run --rm rolapp-frontend-test npm test` (vitest) | ✅ **58/58** en 5 archivos (catalog 21, planning 4, metrics 13, navItems 4, pages 16), exit 0 |

Nota: reconstruí el frontend con `--no-cache` para descartar caché previa a los cambios de F16;
lint+build corrieron contra el código real. Imagen efímera `rolapp-frontend-test` eliminada.

## Migración `disposition`
- ✅ Columna presente en el contenedor: `PRAGMA table_info(npcs)` → `disposition TEXT NOT NULL DEFAULT 'neutral'` (cid 7).
- ✅ Registrada en `_migrations`: `{id:1, name:'M001_npcs_disposition'}`.
- ✅ Idempotente por partida doble: el loop salta si el nombre está en `_migrations` (`index.js:93`),
  y la fn hace guard `PRAGMA table_info` antes del `ALTER` (`index.js:82-83`). Aplicada en transacción síncrona.
- ✅ Reflejada en `schema.sql:421-422` como baseline para instalaciones nuevas, con `CHECK(disposition IN ('ally','neutral','hostile'))`.

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa en contenedor (exit 0)
- [x] Lint + build frontend pasan vía build stage (no-cache, exit 0)
- [x] Sin código comentado sin explicación (los `//` son cabeceras de sección que explican el *por qué*)
- [x] Sin `console.log` de debug (0 en NpcsPage y en backend nuevo)
- [x] better-sqlite3 síncrono — 0 `async`/`await`/`.then()` sobre db en `npcs.js`
- [x] Prepared statements — INSERT/UPDATE con `db.prepare(...)`, sin interpolar valores
- [x] `session_events` NO tocado (append-only respetado)
- [x] Frontend sin `const s = {…}` ni `style={{`
- [x] Frontend sin `window.innerWidth` / `useWindowWidth`
- [x] Sin clases Tailwind interpoladas (`bg-${x}`) — colores por lista literal + índice estable (F14)
- [x] Nombres en inglés; componentes/funciones con una responsabilidad
- [x] Tests nuevos existen (`npcs.test.js` 10 + `catalog.test.js` +4) y pasan
- [x] Cubren caso feliz + error (400/403/404 en 11 aserciones)
- [x] Respeta estructura (routes/services/db/lib/pages/components/ui)
- [x] Sin dependencias nuevas
- [x] Migración documentada (schema + `db/index.js` + reporte)
- [x] Rutas REST ya existentes; api.js sigue convención
- [x] Reporte del implementer presente (`impl_F16-npcs.md`)
- [x] Reporte del reviewer presente (este archivo)

## Scope
- ✅ Archivos modificados == declarados: `feature_list.json` (pending→in_progress, permitido),
  `db/index.js`, `db/schema.sql`, `routes/npcs.js`, `App.jsx`, `catalogClasses.js`, `lib/api.js`,
  `lib/catalog.js`, `lib/catalog.test.js`, `NpcsPage.jsx`, `pages.test.jsx`; creado `routes/npcs.test.js`.
- ✅ `App.jsx` (pasar `user`) y `pages.test.jsx` (smoke con `user={dm}`) son consecuencia legítima de
  promover el placeholder a página funcional que requiere `user.id` (lección F5). No es scope creep.
- ✅ `npcs.js` solo cambió para `disposition` (helper `normalizeDisposition`, POST/PUT); el router CRUD,
  sub-recursos, montaje y la integración PlanningPanel quedaron intactos. No hubo reescritura.
- Observación no bloqueante: apareció `scout_F18-live.md` sin trackear en `.claude/progress/` — no es
  código ni de F16; ajeno a esta revisión, sin impacto en el veredicto.

## Frontend maestro-detalle
- ✅ `NpcsPage.jsx` ya no es placeholder (774 líneas). Grid con búsqueda + filtro por sistema + crear;
  detalle con tabs Información / Quests / Inventario / Campañas (`TABS`, `NpcsPage.jsx:190-195`).
- ✅ Tarjetas con glifo-inicial (`initialGlyph(npc.name)` → primera letra en mayúscula, fallback '?'),
  NO emoji (grep de rangos emoji → 0 coincidencias). Badge de disposición con clases literales.
- ✅ Cableada: `App.jsx` renderiza `<NpcsPage user={user} />`; nav DM ya la ruteaba (id `npcs`).
- ✅ `api.js`: `updateNpc`, `createNpcQuest`/`deleteNpcQuest`, `createNpcItem`/`deleteNpcItem`,
  `linkNpcCampaign`/`unlinkNpcCampaign` siguen la convención `request(...)` existente.

## Lecciones aplicadas correctamente
- **SQLite/F1 (PRAGMA antes de ALTER):** ✅ guard idempotente verificado en contenedor con PRAGMA.
- **F14 (clases literales + índice estable):** ✅ `NPC_GLYPH_CLASSES`/`NPC_BADGE_CLASSES` literales,
  selección por `dispositionIndex` con fallback neutral. Sin interpolación.
- **F5 (componentes cableados):** ✅ `user` propagado a `NpcsPage`; smoke SSR actualizado.
- **Testing/F14 (bridge tables en beforeEach):** ✅ `beforeEach` limpia `npc_campaign_links`,
  `npc_inventory`, `npc_quests`, `npcs`, `campaigns`, `users`.
- **Proceso/F4 (verificar en Docker):** ✅ todos los verdes reproducidos en contenedor por el reviewer.

## Observaciones (no bloqueantes)
- `avatar_icon` (default 🧑) persiste en el modelo pero la UI de NPCs no lo muestra; se mantiene por
  compatibilidad con el `<select>` de PlanningPanel. Decisión razonable y documentada.
- No hay PUT de edición individual de quest/objeto (solo crear/borrar); el requisito de F16 no lo pide.
- `role`/`loc` del mockup no se añadieron como columnas; la tarjeta muestra `game_system_name`.
  Degradación tolerante, declarada.

## Candidatos para LEARNINGS.md (el líder decide)
- **Promover un placeholder a página real puede romper tests de smoke SSR existentes.** Si el stub se
  montaba sin props y la página real requiere `user`, actualizar `App.jsx` + los render-smoke juntos.
- **Enums de dominio: guardar el valor canónico en inglés + CHECK, traducir en la UI.** Desacopla la DB
  del idioma de presentación y habilita badges/colores por índice estable.

## Puntos a corregir
Ninguno. Feature lista para cerrarse.

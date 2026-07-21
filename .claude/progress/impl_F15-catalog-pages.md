# Implementación: F15 — Páginas de catálogo (Habilidades, Items, Bases de Atributos, Personajes Base, Personajes)
Fecha: 2026-07-20
Status: completado

## Resumen (qué encontré vs. qué corregí)

El código de F15 ya estaba **completo y commiteado** en `d894c3b` (fuera del flujo del
harness): las 5 páginas, el bulk import y el backend cubren TODO el alcance de la feature.
Verifiqué cada página contra la descripción de F15, contra los mockups del handoff
(`.claude/design_handoff_rolapp/*.dc.html`) y contra los endpoints reales del backend.

**Encontré una sola brecha real** y la tapé con un cambio quirúrgico de 1 línea:
- `App.jsx` no le pasaba `onNavigate` a `AttributesPage`, así que el enlace
  "Gestionar en Personajes Base" del tab *Personajes base* (que está condicionado a
  `onNavigate && …`) **nunca se renderizaba** → capacidad codificada pero inalcanzable
  (viola la lección "no dejar componentes/flujos huérfanos"). Corregido pasando `setPage`.

Todo lo demás ya funcionaba y **no lo toqué** (instrucción: cambios mínimos).

### Verificaciones de completitud realizadas
- **Cableado en AppShell:** las 5 páginas están importadas y montadas en `App.jsx`
  (`skills`, `base-characters`, `attributes`, `characters`, `items`) y son navegables desde
  `navItems.js` (grupo PRINCIPAL del DM; el jugador ve `characters` como "Mis Personajes").
- **Backend real:** confirmé por lectura de rutas y por smoke HTTP en Docker que las páginas
  consumen endpoints existentes. Mecánicas se cablea a `gameSystems.js`
  (`/:id/mechanics` + `/params`) tal como confirmó el líder — NO se crearon rutas nuevas.
- **Schema:** `skill_field_values` e `item_master_values` tienen `UNIQUE(...)` que respalda
  el `ON CONFLICT` del import; `item_masters.equippable` existe; `game_mechanics` /
  `game_mechanic_params` con sus CHECK. Nada que migrar.
- **Lección Tailwind (F14):** las clases dinámicas (glifos, badges, barras, punto de rareza)
  se resuelven con listas ESTÁTICAS literales (`catalogClasses.js`) + índice estable
  (`lib/catalog.js`). Cero `bg-${x}`, cero estilos inline. Verificado.
- **Lección ESLint hooks (F5):** los `eslint-disable-next-line react-hooks/exhaustive-deps`
  son seguros porque `eslint.config.js` registra `eslint-plugin-react-hooks` con reglas en
  `'warn'`. Lint pasa sin error.

## Estado por página

- **Habilidades (`SkillsPage.jsx`) — completo.** Filtro por sistema, formatos agrupados,
  tabla con búsqueda + chips de tipo + paginación 50, editor de campos (text/number/boolean),
  CRUD con campos dinámicos y **bulk import JSON** (archivo o pegado, validación en cliente
  `parseBulkSkillsText`, auto-creación de campos con tipo detectado y reporte
  importadas/omitidas/campos-creados). Navegable. Sin cambios.
- **Items (`ItemsPage.jsx`) — completo.** Formatos agrupados por sistema, búsqueda,
  paginación 50, flag **equippable**, campos dinámicos, grid de tarjetas con **punto de
  rareza** (índice estable por valor). Navegable. Sin cambios.
- **Bases de Atributos + Mecánicas (`AttributesPage.jsx`) — brecha tapada.** Lista de
  sistemas + detalle con tabs Atributos / Personajes base / Slots de Equipamiento /
  **Mecánicas** (CRUD con tipo, affects y parámetros dinámicos, todo contra
  `api.createMechanic/deleteMechanic/createMechanicParam/deleteMechanicParam`) / Documentos.
  Conserva import/export de packs. **Corregí** el paso de `onNavigate` desde `App.jsx`.
  Navegable.
- **Personajes Base (`BaseCharactersPage.jsx`) — completo.** Grid de tarjetas con glifo,
  barras de atributos y chips de habilidades + contadores; editor con tabs
  Atributos / Inventario / Habilidades. La "adopción de plantilla" es una acción de personaje
  personal y vive (correctamente) en la página Personajes; el catálogo de plantillas expone
  crear/editar/eliminar. Navegable. Sin cambios.
- **Personajes (`CharactersPage.jsx`) — completo.** Vista DM = todos los personajes con su
  dueño (`listAllCharacters` → `GET /characters?dm_id=`); vista jugador = los suyos. Tarjetas
  con barras **PV/EXP** y **4 stats core** (degradación elegante si el sistema no las define),
  ficha, estadísticas, eliminar y **adoptar plantilla** (`adoptBaseCharacter`). Navegable.
  Sin cambios.

## Archivos tocados por mí en esta pasada
- `frontend/src/App.jsx`: paso `onNavigate={setPage}` a `<AttributesPage>` para que el enlace
  "Gestionar en Personajes Base" del tab *Personajes base* sea alcanzable (era un flujo
  huérfano). Cambio de 1 línea.

## Tests escritos
No escribí tests nuevos: la lógica pura de F15 ya está cubierta y mi cambio es puro cableado
de props (sin lógica nueva testeable). Tests existentes relevantes:
- `frontend/src/lib/catalog.test.js` (17): glifos/acentos estables, filtros, paginación,
  agrupación por sistema, validación del bulk import, barras PV/EXP, coreStats, degradaciones.
- `backend/src/routes/skills.test.js` (4): bulk-import (reutiliza campo por nombre, crea
  faltantes, omite duplicados, reporte) + validación de estructura.
- `backend/src/routes/characters.test.js`: incluye `GET /?dm_id=` (vista DM devuelve todos con
  dueño) y adopción transaccional de pregen.

## Resultado de verificación (entorno canónico Docker)
Reconstruí el backend (`docker compose up -d --build backend`) porque su imagen tenía 2
semanas y NO incluía el código de F15 (backend baked, sin volumen de `src`).

- lint:  ✅ `docker compose exec backend npm run lint` → exit 0 (sin warnings).
- build: ✅ `docker compose build frontend` → exit 0 (fuerza `npm run lint` + `npm run build`;
  incluye mi cambio de `App.jsx`). Solo el aviso benigno de chunk >500 kB (tldraw), no es error.
- test backend: ✅ **116 pass / 0 fail / 1 skipped** (117 total; el skip es preexistente de F14)
  — `docker compose exec backend npm test`.
- test frontend: ✅ **54/54** en 5 archivos (catalog 17, planning 4, metrics 13, navItems 4,
  pages 16) — comando exacto:
  `docker build --target build -t rolapp-frontend-test ./frontend && docker run --rm rolapp-frontend-test npm test`
  (imagen efímera `rolapp-frontend-test` eliminada tras el run, igual que en F14).
- Manual / e2e: ✅ frontend responde `200` en `http://localhost:3000`; `/api/health` OK
  (`vecEnabled:true`, `ftsEnabled:true`). Smoke de endpoints F15: `GET /skills/formats`,
  `GET /items/formats` → `{formats:[]}` para DM nuevo; `GET /characters?dm_id=` devuelve todos
  los personajes con `username` + ficha completa (attrs/skills/inventario/equipo);
  `POST /skills/bulk-import` sin `format_id` → 400 con mensaje claro.

## Higiene Docker
- Sin `node_modules` residual en `frontend/` ni `backend/` antes de buildear (lección F8b).
- `.dockerignore` presente en ambos servicios. Imagen de test efímera borrada.

## Lecciones aplicadas
- **"Colores dinámicos: listas de clases estáticas + índice estable" (F14):** confirmé que
  `catalogClasses.js` (GLYPH/BADGE/BAR_FILL/RARITY_DOT) usa clases literales elegidas por
  índice de `lib/catalog.js`. Cero interpolación, cero inline. No hubo que corregir nada.
- **"Componentes cableados y accesibles" (F5):** la brecha que tapé es exactamente este caso
  (flujo condicionado a un prop que no se pasaba → inalcanzable).
- **"Lint/test en el entorno canónico" (F4/Proceso):** todos los verdes vienen de comandos
  ejecutados en Docker; reconstruí el backend para no verificar contra una imagen vieja.

## Decisiones tomadas
- **No añadir botón "adoptar" en `BaseCharactersPage`.** El backend `adopt` crea un personaje
  personal del usuario; el flujo natural (y ya implementado) vive en `CharactersPage`
  ("Desde plantilla"). Añadirlo en el catálogo de plantillas del DM sería redundante y podría
  confundir (el DM no "adopta" su propio catálogo). Lo dejo como está; si el founder prefiere
  un atajo también desde la tarjeta de plantilla, es trivial de añadir.
- Sin dependencias nuevas. Sin migraciones. Sin endpoints nuevos.

## Candidatos para LEARNINGS.md (el líder decide)
- **Backend baked sin volumen de `src`: reconstruir la imagen antes de verificar.** El
  contenedor `backend` no monta `./backend/src`; una imagen vieja verifica contra código
  desactualizado y da falsos verdes/rojos. Antes de `npm run lint`/`npm test` en el backend,
  correr `docker compose up -d --build backend` si el código cambió desde el último build.
- **Código introducido fuera del harness debe re-verificarse en Docker, no fiarse del commit.**
  F15 llegó por un commit externo; el valor del implementer aquí fue auditar completitud +
  cableado + correr la verificación canónica, no reescribir.

## Bloqueantes
Ninguno. F15 está funcionalmente completa, cableada, navegable y verde en lint/build/test.

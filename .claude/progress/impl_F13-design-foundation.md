# Implementación: F13 — Base de diseño + AppShell (tokens, tipografías, sidebar, iconos)
Fecha: 2026-07-02
Status: completado

## Archivos creados
- `frontend/src/components/ui/Icon.jsx`: set de 22 iconos de línea SVG inline (estilo lucide/feather, stroke 1.6-1.8, fill none): dashboard, book, map, skills, id-card, sliders, user, users, cube, clock, logout, plus, edit, trash, chevron-right, chevron-down, search, pin, link, x, check, arrow-right. Exporta `ICON_NAMES` para validación en tests. Sin dependencias nuevas.
- `frontend/src/components/ui/Logo.jsx`: logo cubo isométrico en cuadrado terracota 30px/radio 8px (compartido por Sidebar y Login).
- `frontend/src/components/layout/navItems.js`: configuración pura de navegación por rol (DM: 9 secciones + Historial; jugador: Dashboard, Mis Personajes, Sesiones Finalizadas). Separada para poder testearla.
- `frontend/src/components/layout/Sidebar.jsx`: sidebar fijo 236px fiel a `Sidebar.dc.html` — logo+wordmark Newsreader 20/600, bloque usuario (avatar 38px con inicial, nombre 14/600, rol 12 muted), grupos PRINCIPAL/HISTORIAL (labels 10px/700 uppercase tracking 1.3), ítems 13.5px con icono 18px, activo `text-accent-text bg-accent-tint` + `shadow-[inset_3px_0_0_#CE6A3A]`, pie "Cerrar Sesión" en tono peligro con borde superior.
- `frontend/src/components/layout/AppShell.jsx`: layout global `[sidebar 236px | main flex-1 overflow-y-auto]`.
- `frontend/src/components/layout/Page.jsx`: contenedor estándar de página (max-w 1080px, padding 34/40/60 en md+, reducido en móvil).
- `frontend/src/components/layout/PageHeader.jsx`: H1 Newsreader 32px/600 + subtítulo.
- `frontend/src/pages/DashboardPage.jsx`: placeholder de F14 — conserva la funcionalidad del Lobby v0 (crear campaña/sesión para DM, listar/unirse a sesiones activas), sin emojis.
- `frontend/src/pages/HistoryPage.jsx`: Sesiones Finalizadas — historial de cerradas + stats de sesión/campaña (F7), restilizado base.
- `frontend/src/pages/PrepPage.jsx`: envuelve SessionPrepPanel/EventTemplatePanel (rediseño completo en F17).
- `frontend/src/pages/SkillsPage.jsx`: envuelve SkillsPanel standalone.
- `frontend/src/pages/ItemsPage.jsx`: envuelve ItemsPanel standalone.
- `frontend/src/pages/BaseCharactersPage.jsx`: envuelve BaseCharactersPanel.
- `frontend/src/pages/AttributesPage.jsx`: envuelve GameSystemPanel (builder de sistemas).
- `frontend/src/pages/CharactersPage.jsx`: envuelve MyCharacters (sin onBack; navegación vía sidebar).
- `frontend/src/pages/NpcsPage.jsx`: placeholder limpio "próximamente" (gestor completo en F16).
- `frontend/src/pages/CampaignsPage.jsx`: placeholder limpio (página completa en F14).
- `frontend/src/components/layout/navItems.test.js`: 4 tests — orden/ids del sidebar DM, sidebar reducido de jugador, iconos existentes en el set, labels sin emojis, ids únicos.
- `frontend/src/pages/pages.test.jsx`: 13 tests — smoke SSR (renderToStaticMarkup, sin efectos) de las 10 páginas dentro del AppShell, sidebar completo del DM, sidebar reducido del jugador sin secciones DM, Login sin emojis.

## Archivos modificados
- `frontend/tailwind.config.js`: paleta navy/dorado reemplazada por los tokens del handoff (bg/rail/nav/surface/hover/line/title/sub/faint/muted/idle/accent/danger + colores de categoría `cat-*`), fuentes `sans` Hanken Grotesk y `serif` Newsreader, radios card 13px / btn 9px / pill 20px, sombras card/node. Alias temporales v0 (`gold`, `ink-*`, `danger` DEFAULT, `success`) remapeados a tonos cálidos equivalentes para que las vistas de F14-F19 compilen y no desentonen; se eliminarán al terminar el rediseño.
- `frontend/index.html`: Google Fonts (Newsreader 400-600 + Hanken Grotesk 400-700) con preconnect; degradan a fuentes de sistema sin internet.
- `frontend/src/styles/index.css`: body con `bg-bg font-sans text-ink`; utilidad `.num` (tabular-nums) — además existe la utilidad nativa `tabular-nums` de Tailwind.
- `frontend/src/App.jsx`: enrutado por estado con AppShell + página activa; guard de páginas DM-only para jugadores; SessionView sigue fuera del shell; logout resetea a dashboard.
- `frontend/src/pages/Login.jsx`: restilizado a tokens nuevos (tarjeta sobre #1B1815, logo+wordmark, inputs oscuros, botón terracota); rol "Jugador"/"Dungeon Master" sin emojis.
- `frontend/src/components/ui/Button.jsx`: primary accent/texto bg/w700/rounded-btn hover accentHover; secondary surface+borde hover accent; danger tonos peligro; ghost.
- `frontend/src/components/ui/Card.jsx`: surface + line + rounded-card, prop `hoverable` (borde line-hover + shadow-card).
- `frontend/src/components/ui/Tabs.jsx`: activo accent-text + borde accent; badge pill accent (sin emoji).
- `frontend/src/components/ui/Modal.jsx`: surface/line/rounded-card, título serif, cierre con `<Icon name="x">` (adiós ✕).
- `frontend/src/components/ui/Sheet.jsx`: idem Modal, tokens nuevos + Icon x.
- `.claude/feature_list.json`: F13 → in_progress.

## Archivos eliminados
- `frontend/src/pages/Lobby.jsx`: reemplazado por AppShell + páginas (su lógica vive ahora en DashboardPage y HistoryPage). Sin referencias huérfanas (verificado con grep).

## Tests escritos
- `frontend/src/components/layout/navItems.test.js` (4 tests): contrato de navegación por rol.
- `frontend/src/pages/pages.test.jsx` (13 tests): render SSR de cada sección dentro del shell + sidebar por rol + Login sin emojis. Detectaría cualquier error de import/render en las 10 páginas.

## Resultado de verificación (comandos exactos en entorno canónico Docker)
- lint (frontend): ✅ — forzado en `docker compose build frontend` (RUN npm run lint), exit 0.
- build: ✅ — `docker compose build frontend` exit 0, imagen `rolapp-v1-frontend` generada.
- test: ✅ 21 pasando (3 archivos: planning 4 + navItems 4 + pages 13) — ejecutado en contenedor efímero: `docker build --target build -t rolapp-frontend-test ./frontend && docker run --rm rolapp-frontend-test npm test` (imagen de test eliminada después).
- backend: no tocado (0 archivos); `GET /api/health` → `{"status":"ok","vecEnabled":true,"ftsEnabled":true,...}` tras `docker compose up -d`.
- Manual / e2e: ✅ parcial —
  - `docker compose up -d` OK; frontend `http://localhost:3000` → 200 con el index nuevo (fonts).
  - Register/login (`smoke_f13`) → 200 con user; PIN inválido → 401.
  - CSS compilado servido incluye `#CE6A3A`, `Newsreader` y `Hanken Grotesk`.
  - Render de cada sección del sidebar: cubierto por los 13 tests SSR (no dispongo de browser para click-through visual; el reviewer puede hacer el smoke visual en `http://localhost:3000`).
- Higiene: sin `node_modules` residual en `frontend/`; grep de emojis en shell/layout/ui/Login/páginas nuevas = 0; grep de `style={{` en archivos nuevos/tocados = 0.

## Lecciones aplicadas
- "Cero estilos inline, cero window.innerWidth": todo con clases Tailwind + tokens; valores puntuales con clases arbitrarias (`w-[236px]`, `shadow-[inset_3px_0_0_#CE6A3A]`).
- "Una feature de frontend no está terminada hasta que sus componentes estén cableados": AppShell/Sidebar/Icon/páginas montados desde App.jsx; Lobby.jsx eliminado para no dejar huérfanos.
- "Cada servicio con imagen Docker necesita .dockerignore" + "no correr npm en el dir montado": los tests corrieron en contenedor efímero desde el build stage; verificado 0 node_modules residual.
- "No declarar un checkpoint en verde sin ejecutarlo": todos los comandos de arriba se ejecutaron literalmente (Docker Desktop estaba apagado; lo arranqué y esperé al daemon antes de verificar).
- "El lint/test debe poder correr en el entorno canónico": lint via build stage; tests via imagen build.

## Decisiones tomadas
- Alias v0 (`gold`, `ink-*`) remapeados a equivalentes cálidos del handoff (no a los navy originales) para que las vistas internas aún no rediseñadas no desentonen dentro del shell nuevo. Se retiran al cerrar F14-F19.
- `Campañas` (sección requerida en el sidebar DM pero sin página hasta F14) muestra un placeholder limpio; la creación de campañas sigue disponible en el Dashboard (funcionalidad v0 preservada).
- Fuentes por Google Fonts CDN según la spec de la feature; con la app offline degradan al fallback del sistema (ver "Candidatos para LEARNINGS").
- Test de render por SSR (`react-dom/server`, ya disponible) en lugar de añadir jsdom/Testing Library: cero dependencias nuevas y cubre errores de import/render de cada página (los efectos no corren en SSR, así que no hay fetches).
- Emojis eliminados también en DashboardPage/HistoryPage (aunque son "vistas viejas", las reescribí como archivos nuevos y no tenía sentido portar los emojis).
- Sin dependencias npm nuevas.

## Candidatos para LEARNINGS.md
- El sidebar 236px es fijo también en móvil: el handoff solo cubre escritorio del DM ("los jugadores usan móvil" pero esta entrega es desktop). Queda como pregunta abierta para el líder si F14+ debe definir el patrón responsive del shell (p. ej. colapsar a rail o bottom-nav en <md), porque la convención del proyecto es mobile-first.
- Google Fonts vía CDN contradice parcialmente el principio local-first ("sin internet obligatorio en mesa"): funciona con fallback, pero si se quiere fidelidad tipográfica offline habría que self-hostear los woff2. Decisión pendiente del founder.
- Patrón útil: smoke de render de páginas React con `renderToStaticMarkup` en vitest (entorno node, sin jsdom) — barato y caza errores de cableado/imports.

## Bloqueantes
Ninguno. (Docker Desktop estaba apagado al iniciar la verificación; se arrancó y se esperó al daemon — no requirió decisión.)

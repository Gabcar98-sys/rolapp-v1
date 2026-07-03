# Revisión: F13 — Base de diseño + AppShell (tokens, tipografías, sidebar, iconos)
Fecha: 2026-07-02
Veredicto: APROBADO

## Checklist CHECKPOINTS.md (cada ítem verificado ejecutando el comando, no por el reporte)

### Build y lint
- [x] Lint + build frontend: `docker compose build frontend` → exit 0 (lint y build forzados en el build stage; capas verificadas contra el contenido actual del árbol).
- [x] Lint backend: **no aplica** — backend con 0 archivos tocados (verificado con `git status --porcelain` y `git diff --name-only`: solo frontend + .claude).
- [x] Sin código comentado sin explicación (revisión manual de los archivos del alcance).
- [x] Sin `console.log` de debug: `grep -rn "console\." <archivos del alcance>` → 0 resultados.

### Código y patrones del proyecto
- [x] better-sqlite3 / prepared statements / session_events: **no aplica** (feature 100% frontend, backend intacto).
- [x] Cero estilos inline: `grep -rn "style={{" frontend/src/components/layout frontend/src/components/ui frontend/src/pages/*Page.jsx Login.jsx App.jsx` → 0 resultados.
- [x] Cero `window.innerWidth`: único match es un comentario preexistente en `SessionView.jsx` (fuera de alcance) que explica por qué NO se usa.
- [x] Cero emojis en el alcance (shell/layout/ui/Login/páginas nuevas): grep de rangos unicode de emoji → 0 resultados. Los emojis restantes viven solo en vistas viejas (ChatPanel, MyCharacters, PlanningPanel, paneles de Stats) cuyo restyle está asignado a F14-F19 — conforme a la descripción de F13 ("cero emojis en shell").
- [x] Nombres descriptivos en inglés; módulos con responsabilidad única (navItems.js = config pura, Sidebar = presentación, AppShell = layout, Icon = set de iconos).
- [x] Sin dependencias circulares detectadas (jerarquía App → AppShell → Sidebar → Icon/Logo/navItems).

### Tests
- [x] Ejecutados en contenedor efímero: `docker build --target build -t rolapp-frontend-review ./frontend && docker run --rm rolapp-frontend-review npm test` → **21/21 pasando** (planning 4 + navItems 4 + pages 13). Imagen de review eliminada después.
- [x] Caso feliz: render SSR de las 10 páginas dentro del AppShell + sidebar completo DM.
- [x] Casos negativos: jugador NO ve secciones DM; labels sin emojis; ids únicos; iconos existentes en el set; Login sin emojis.

### Arquitectura
- [x] Estructura respetada (`components/layout/`, `components/ui/`, `pages/`).
- [x] Cero dependencias npm nuevas: `git diff HEAD -- frontend/package.json frontend/package-lock.json` → vacío.
- [x] Sin cambios de esquema ni endpoints.

### Fidelidad al handoff (.claude/design_handoff_rolapp/README.md)
- [x] Tokens en `tailwind.config.js`: bg #1B1815, nav #201D18, rail #17140F, surface #221E19/#262119, line #2E2A24/#2A2620/#4A4237, título #F4EFE6, acento #CE6A3A/#D97C4E/#E08A5C/#33251C, peligro #E4785E/#3A231F, colores de categoría `cat-*` — todos coinciden con la tabla del handoff.
- [x] Fuentes: `index.html` carga Google Fonts (Newsreader 400-600 con eje óptico, Hanken Grotesk 400-700) con preconnect y fallback de sistema; `font-sans`/`font-serif` mapeadas en Tailwind.
- [x] Sidebar fiel a Sidebar.dc.html: 236px, bg-nav, borde derecho line, logo cubo terracota 30px + wordmark Newsreader 20/600, avatar 38px con inicial, grupos PRINCIPAL/HISTORIAL uppercase muted 10px/700/tracking 1.3, ítems 13.5px icono 18px radio 9px, idle #ACA396 w500, activo #E08A5C + #33251C + `inset 3px 0 0 #CE6A3A` w600, pie "Cerrar Sesión" #C0796E con hover #2E2020/#E4785E y borde superior. Orden de ítems = orden del handoff.
- [x] Navegación: 9 secciones DM + Historial; jugador reducido (Dashboard, Mis Personajes, Sesiones Finalizadas). Guard DM-only en App.jsx.
- [x] Radios (card 13px, btn 9px, pill 20px) y sombras (card, node) definidos como tokens.

### Cableado (grep de imports)
- [x] AppShell importado y montado en `App.jsx`; Sidebar en AppShell; Icon en Sidebar/CampaignsPage/NpcsPage; Logo en Sidebar/Login. Nada huérfano.
- [x] `Lobby.jsx` eliminado sin imports rotos (los matches restantes de "Lobby" son texto/comentarios en vistas viejas).

### Smoke (stack levantado)
- [x] `docker compose up -d` OK; frontend `http://localhost:3000` → HTTP 200 con el index nuevo (link de Google Fonts presente).
- [x] `GET /api/health` (vía proxy nginx :3000) → `{"status":"ok","vecEnabled":true,"ftsEnabled":true,...}`. Nota: el backend no publica :3001 al host; el smoke correcto es por :3000.
- [x] Login con PIN inválido → 401 `{"error":"Usuario o PIN incorrecto"}` (backend operativo).
- [x] CSS compilado servido contiene `#CE6A3A`, `Newsreader` y `Hanken Grotesk`.
- [x] Render de Login y de las 10 secciones: cubierto por los 13 tests SSR (sin browser disponible para click-through; recomendado smoke visual del founder en http://localhost:3000).

### Higiene y scope
- [x] Sin `node_modules` residual en `frontend/` del host.
- [x] Scope: `git status` coincide 1:1 con los archivos declarados en el reporte del implementer (frontend + .claude; `.claude/1.0_Front/` y `design_handoff_rolapp/` son material del founder, previos a la feature).
- [x] Reporte del implementer existe: `.claude/progress/impl_F13-design-foundation.md`.

## Resultado de verificación
- lint (frontend, en contenedor): OK — exit 0
- build (docker compose build frontend): OK — exit 0
- test (contenedor efímero build stage): OK — 21 tests, 3 archivos
- smoke: frontend 200, health ok, 401 en credenciales inválidas, tokens/fuentes en el CSS servido

## Lecciones aplicadas correctamente
- "Cero estilos inline, cero window.innerWidth" — verificado por grep.
- "Componentes cableados y accesibles" — verificado por grep de imports; Lobby eliminado sin huérfanos.
- ".dockerignore / no correr npm en dir montado" — tests en contenedor efímero; 0 node_modules residual.
- "No declarar checkpoint en verde sin ejecutarlo" — todos los comandos del reporte fueron reproducibles.

## Puntos a corregir
Ninguno (aprobado).

## Observaciones (no bloqueantes)
1. `MyCharacters.jsx:147` conserva un botón/texto "← Lobby" (con flecha unicode) referenciando una pantalla que ya no existe; corregir cuando F14-F19 rediseñe esa vista.
2. Los alias v0 (`gold`, `ink-*`, `danger.DEFAULT`, `success`) en tailwind.config.js están bien documentados como temporales; el líder debería registrar su eliminación como tarea explícita de F19 para que no se fosilicen.
3. El sidebar de 236px es fijo también en viewports móviles. El handoff solo cubre escritorio del DM, así que no bloquea F13, pero contradice la convención mobile-first del proyecto: F14+ debe definir el patrón responsive del shell.

## Candidatos para LEARNINGS.md (coincido con el implementer)
- Google Fonts vía CDN vs principio local-first (decisión pendiente del founder: self-hostear woff2 si se quiere fidelidad offline).
- Patrón barato de smoke de páginas React con `renderToStaticMarkup` en vitest entorno node (sin jsdom): caza errores de imports/cableado sin dependencias nuevas.
- El backend no expone :3001 al host; los smokes REST deben ir por el proxy nginx en :3000 (me costó un intento fallido en esta revisión).

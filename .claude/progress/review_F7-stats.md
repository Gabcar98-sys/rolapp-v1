# Revisión: F7 — Estadísticas derivadas
Fecha: 2026-06-30
Veredicto: APROBADO

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa en el contenedor (`docker compose exec backend npm run lint`): 0 errores, 0 warnings.
- [x] Lint + build frontend pasan vía `docker compose build frontend` (ambas imágenes buildearon OK).
- [x] No hay código comentado sin explicación; comentarios explican el *por qué*.
- [x] No hay `console.log` de debug. El único `console.error` (sessions.js close) es logging intencional del fallo del snapshot.
- [x] `better-sqlite3` usado de forma **síncrona** (sin async/await sobre `db.prepare().get()/.all()/.run()`).
- [x] **Prepared statements** en todas las queries; cero interpolación de valores en SQL.
- [x] `session_events` tratado como **append-only**: el servicio solo hace SELECT; el snapshot escribe en `session_stats`, nunca toca el log.
- [x] Frontend: estilos **solo** Tailwind + tokens. Cero `style={{…}}` / `const s = {…}` (grep en Stats/, Lobby.jsx, MyCharacters.jsx → 0).
- [x] Frontend: responsive con breakpoints (`sm: md: lg:`). Cero `window.innerWidth`/`useWindowWidth` (grep en todo `frontend/src` → 0).
- [x] Nombres descriptivos en inglés; funciones con una sola responsabilidad.
- [x] Tests existen y cubren caso feliz + caso de error (payload corrupto, sesión sin eventos, personaje inexistente).
- [x] Respeta estructura: servicio en `services/`, router en `routes/` montado en `index.js`, componentes de dominio en `components/Stats/`, API en `lib/api.js`.
- [x] Sin dependencias nuevas (ningún `package.json` modificado — verificado con `git diff --stat`).
- [x] `session_stats` ya existía en `schema.sql` (UNIQUE en `session_id`, `payload TEXT`, `generated_at`); no requirió migración nueva.
- [x] Endpoints nuevos siguen convención REST (`GET /api/sessions/:id/stats`, `/campaigns/:id/stats`, `/characters/:id/stats`).
- [x] Componentes cableados, no huérfanos (grep de imports confirma los 3 paneles montados y alcanzables).
- [x] Reportes de progress escritos (impl_F7-stats.md presente; este review).
- [x] Lección técnica no trivial propuesta para LEARNINGS.md (purga de tabla hija en beforeEach; gráficos sin inline-style).

## Resultado de verificación (Docker — canónico)
- lint backend (`docker compose exec backend npm run lint`): ✅ 0 errores, 0 warnings.
- build frontend (`docker compose build frontend`, lint+build forzados en build stage): ✅ imagen construida.
- build backend: ✅ imagen construida.
- test backend (`docker compose exec backend npm test`): ✅ 53 tests, **52 pass, 1 skip** (pre-existente: rag vec/FTS), 0 fail.
- `curl http://localhost:3000/api/health`: ✅ `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.
- 404: ✅ `GET /sessions/999999/stats`, `/campaigns/999999/stats`, `/characters/999999/stats` → 404 todos.
- Smoke vía :3000 (DM → campaña → sesión → 3 eventos exploration/combate/general+NPC):
  - `GET /sessions/:id/stats` antes de cerrar: ✅ `source:"live"`, event_count 4 (incluye session_start), encounters 1, npcs_introduced 1, all_hands_events 3, events_by_category {exploration,combate,general}.
  - `PATCH /sessions/:id/close` → ✅ `{ok:true}`; `GET` de nuevo: `source:"snapshot"`, `generated_at` puesto, incluye `session_end` (5 eventos), duration_seconds 1.
  - `GET /campaigns/:id/stats`: ✅ sessions_played 1, sessions_closed 1, encounters 1, locations_visited ["Kholinar","Camino"].

## Verificación de scope
Archivos modificados/creados coinciden con el reporte del implementer:
- Creados: `backend/src/services/stats.js`, `backend/src/routes/stats.js`, `backend/src/services/stats.test.js`, `frontend/src/components/Stats/` (BarChart, Sparkline, StatTile, statUtils, SessionStatsPanel, CampaignStatsPanel, CharacterStatsPanel).
- Modificados: `backend/src/index.js`, `backend/src/routes/sessions.js`, `backend/src/routes/sessions.test.js`, `frontend/src/lib/api.js`, `frontend/src/pages/Lobby.jsx`, `frontend/src/pages/MyCharacters.jsx`.
- Adicional no declarado en la sección de archivos: `.claude/feature_list.json` (archivo de tracking del harness, no es código de feature). No bloqueante.

## Lecciones aplicadas correctamente
- "better-sqlite3 síncrono": ✅ todo el servicio usa `.get()/.all()/.run()` sin async/await.
- "session_events append-only": ✅ solo SELECT sobre el log; la escritura va a `session_stats`.
- "Una feature de frontend no está terminada hasta que esté cableada": ✅ los 3 paneles están importados y renderizados (Lobby → 📊 Historial accesible a TODOS; MyCharacters → 📊 por personaje). Grep confirma cero huérfanos.
- "Cero estilos inline / window.innerWidth": ✅ BarChart usa clases `w-n/12` literales (detectables por el JIT de Tailwind), Sparkline es SVG con viewBox. Grep limpio.
- "Routers que emiten por socket → factory": ✅ stats NO emite por socket → router plano montado en `/api` (patrón rag), correctamente justificado.
- "Lint/test en Docker": ✅ verificación corrida íntegra en contenedores.

## Puntos a corregir (si RECHAZADO)
N/A — APROBADO.

## Observaciones (no bloqueantes)
1. **Detección de encuentros por heurística regex** sobre el texto de categoría (`combat|combate|encuentro|…`). Funciona porque las categorías son texto libre de `event_templates`, pero es frágil: una categoría "encuentro social" contaría como encuentro de combate. Documentado por el implementer; aceptable para v1.0. Si se formaliza una categoría de combate canónica, conviene revisar `isEncounterCategory`.
2. **`core_progress` reporta el valor ACTUAL** de los atributos `is_core`, no una progresión temporal real (el esquema no guarda histórico por sesión). El nombre "progresión"/"Atributos clave por personaje" podría inducir a error; la decisión está bien documentada y es razonable dada la ausencia de snapshots por sesión.
3. **`POST /api/sessions/:id/stats`** (regenerar snapshot) no estaba en el objetivo explícito de F7. Es barato, está protegido (solo DM dueño) y tiene utilidad clara (refrescar tras añadir notas). No bloqueante; alcance aceptable.
4. **`.claude/feature_list.json`** quedó modificado sin mención en la sección "Archivos" del reporte. Es tracking del harness, no código; señalo para limpieza de scope futura.
5. La participación por personaje y `character_count` salen 0 en el smoke porque no se vincularon personajes a la sesión; los tests unitarios sí cubren el caso con personajes (charA con 1 evento, Shallan con 0), así que la ruta está verificada.

## Candidatos para LEARNINGS.md
- **(Testing / SQLite)** Persistir al cerrar una sesión obliga a actualizar la limpieza de tests existentes: `saveSessionStats` en `PATCH /:id/close` inserta en `session_stats` (FK → `sessions`). El `beforeEach` de `sessions.test.js` debía purgar `session_stats` ANTES de `sessions` (orden hijo→padre) para no romper con `SQLITE_CONSTRAINT_FOREIGNKEY`. Regla general: cuando una feature añade una escritura a una tabla hija dentro de un flujo ya testeado, purga esa hija en los `beforeEach` que limpian la tabla padre.
- **(Frontend / Tailwind)** Gráficos de barras sin librería respetando "cero estilos inline": mapear el ancho a clases `w-n/12`/`w-full` por buckets (en vez de `style={{ width }}`) mantiene el checkpoint en verde. Los nombres de clase deben aparecer como literales completos en el código para que el JIT de Tailwind los emita (no requiere safelist). Trade-off: resolución de 1/12.
- **(Backend / Arquitectura)** Confirmado el criterio "router que NO emite por socket → router plano montado en `/api`" (stats sigue el patrón rag, no la factory de sessions). Útil como contraparte explícita de la lección "routers con socket → factory".

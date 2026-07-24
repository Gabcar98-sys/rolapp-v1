# LEARNINGS — Memoria acumulada del harness

> Este archivo es la memoria viva del equipo de agentes.
> Se construye con cada feature. Nunca se borra — solo se agrega.
>
> **Para agentes:** lee este archivo antes de tomar cualquier decisión técnica.
> Si una lección aplica a lo que estás a punto de hacer, síguela.
> Si vas a contradecirla, explícalo en tu reporte y espera aprobación del founder.
>
> **Para el founder:** este archivo es tuyo también. Puedes agregar lecciones manualmente.

---

## Cómo está organizado

Las lecciones se agrupan por categoría. Cada entrada tiene:
- **Contexto:** en qué feature o situación se aprendió.
- **Lección:** qué se aprendió, concreto y accionable.
- **Por qué importa:** consecuencia de ignorarla.

---

## Categorías

- [Stack y plataformas](#stack-y-plataformas)
- [Base de datos / SQLite](#base-de-datos--sqlite)
- [RAG / embeddings / sqlite-vec](#rag--embeddings--sqlite-vec)
- [Backend / Express / Socket.io](#backend--express--socketio)
- [Frontend / React / Tailwind](#frontend--react--tailwind)
- [Arquitectura](#arquitectura)
- [Testing](#testing)
- [Docker / infraestructura](#docker--infraestructura)
- [Proceso y flujo de trabajo](#proceso-y-flujo-de-trabajo)

---

## Stack y plataformas

### El proyecto corre con Docker; Node local es opcional
- **Contexto:** entorno del founder (Windows, sin Node en PATH, Docker presente).
- **Lección:** El camino canónico de ejecución es `docker compose up`. No asumas que hay Node local. Cualquier instrucción de verificación debe poder correrse dentro de contenedores.
- **Por qué importa:** Comandos que asumen `node`/`npm` en el host fallan en la máquina del founder.

### El repo vive fuera de OneDrive
- **Contexto:** la v0 estaba en OneDrive\Escritorio; node_modules sincronizando causaba problemas.
- **Lección:** El repo v1.0 vive en `C:\Users\gabri\dev\rolapp-v1`. No lo muevas a OneDrive ni generes artefactos pesados sincronizables fuera del repo.
- **Por qué importa:** OneDrive sincronizando node_modules causa lentitud, locks y corrupción.

---

## Base de datos / SQLite

### better-sqlite3 es síncrono
- **Contexto:** acceso a datos en todo el backend.
- **Lección:** `better-sqlite3` es **síncrono**. NO uses async/await ni `.then()` con sus métodos. Usa `db.prepare(...).get()/.all()/.run()` directo, y `db.transaction(fn)` para atomicidad.
- **Por qué importa:** Envolverlo en async añade complejidad inútil y oculta errores; las transacciones síncronas son más simples y seguras.

### Verificar migraciones consolidadas con PRAGMA en el contenedor, no leyendo el .sql
- **Contexto:** F1, consolidar 31 migraciones de la v0 en un solo schema.sql.
- **Lección:** Al consolidar columnas que en la v0 venían de migraciones (`ALTER TABLE`), confirma con `PRAGMA table_info(tabla)` dentro del contenedor que cada columna quedó en el baseline. Leer el .sql no basta. En un mismo `db.exec` con varios CREATE TABLE, SQLite tolera FKs hacia tablas declaradas más abajo, así que el orden de bloques puede priorizar legibilidad.
- **Por qué importa:** Una columna migrada que se olvida en el baseline rompe queries de features posteriores de forma silenciosa.

### Eliminar una columna legacy: `DROP COLUMN` idempotente con guard PRAGMA + actualizar schema.sql
- **Contexto:** F22, quitar el campo muerto `campaigns.game_system` (TEXT).
- **Lección:** `ALTER TABLE … DROP COLUMN` funciona en better-sqlite3 11.x. Antes de eliminar: (1) confirma CERO consumidores reales con `rg --pcre2 'game_system(?!_id|_name|_template|s)\b'` (ripgrep necesita `--pcre2` para look-ahead) y `rg --pcre2 '\.game_system(?![_a-zA-Z])'`; (2) migración idempotente que hace el DROP solo si `PRAGMA table_info` encuentra la columna; (3) elimina también la columna de `schema.sql` (fresh install) y comenta el porqué. Cubre AMBOS caminos en tests: upgrade (DB aislada CON la columna → drop → reejecutar no-op) y fresh install (schema sin la columna → M00x no-op pero registrada en `_migrations`).
- **Por qué importa:** Sin el guard, reejecutar la migración lanza; sin tocar schema.sql, las instalaciones nuevas recrean la columna muerta; sin cubrir ambos caminos, el upgrade real del founder queda sin verificar.

---

## RAG / embeddings / sqlite-vec

### Concisión en modelos pequeños: cláusula de estilo compartida, en positivo, temperatura baja
- **Contexto:** F26, la IA (qwen2.5:3b) divagaba (preámbulos + cierres de cortesía) pese al anti-alucinación de F21.
- **Lección:** Para respuestas directas, concatena UNA cláusula de estilo compartida a todos los system prompts, redactada en POSITIVO — "abre con la respuesta, ve al grano, cierra al completar" — en vez de prohibir frases ("no digas 'espero que te ayude'"), que en modelos chicos las prima. Combínalo con temperatura baja para la tarea factual (rules a 0.2). Testeable con `assert.match` de las frases presentes (no `doesNotMatch`). Mete el default de temperatura por tarea como fallback de `numEnv('AI_TEMPERATURE', taskDefault)` para no romper el test de precedencia de env.
- **Por qué importa:** El mismo modelo local pasa de un párrafo con relleno a una respuesta de una línea con cita, sin tocar retrieval ni el modelo.

### Los docs de reglas son contenido compartido: ingerir por NOMBRE de sistema, no por el del DM
- **Contexto:** F23, los MDs de Stormlight/Dragonbane no llegaban a todos los DMs.
- **Lección:** Cada DM tiene su propia copia del game_system (misma `name`, distinto `dm_id`). El seed histórico ingería docs solo en el sistema del `--dm` objetivo → los demás DMs quedaban sin reglas. Ingerir por nombre: `SELECT id FROM game_system_templates WHERE name = ?` y `ensureDoc` en CADA sistema. (Nota de modelo pendiente: los game systems son per-DM; el founder quiere que sean para todos — evaluar hacerlos globales/compartidos, no duplicados.)
- **Por qué importa:** Con varios DMs, la IA respondía "sin contenido" para unos y bien para otros, sin causa evidente.

### Un doc ya ingerido SIN Ollama queda con chunks pero sin vectores: hay que REINDEXAR, no reingerir
- **Contexto:** F23, la guía de Stormlight (ingerida en F10 sin Ollama) tenía 62 chunks con embedding NULL.
- **Lección:** `ingestDoc` salta el trabajo si el `content_hash` coincide ("sin cambios") → reingerir el MISMO contenido NUNCA genera vectores. Para cerrar la brecha hay que **reindexar** explícitamente (`POST /api/game-systems/:id/docs/:docId/reindex`), que re-embebe sin re-chunkear. Tras encender Ollama, conviene un chequeo "chunks sin vector" y reindexar esos docs.
- **Por qué importa:** El doc parece ingerido pero el retrieval vectorial no lo ve; degrada a solo-FTS de forma silenciosa.

### Negar una frase en un system prompt puede primarla en modelos pequeños
- **Contexto:** F21, quitar el lenguaje doc-céntrico de los prompts de sesión/resumen para que la IA deje de responder "no hay documento".
- **Lección:** No prohíbas literalmente una frase (`Nunca menciones "documentos cargados"`): (1) reintroduce en el prompt justo el texto a evitar y (2) con un modelo pequeño la negación puede *primar* lo prohibido. Formula el alcance en POSITIVO ("tu única fuente es el contexto de la sesión"). Además, endurecer la abstención ("REGLA CRÍTICA… es preferible abstenerse") hace que un modelo 3B sobre-abstenga y recite frases enlatadas; prefiere tono natural + anti-alucinación acotado a afirmaciones factuales.
- **Por qué importa:** Un prompt bienintencionado pero mal formulado produce justo la respuesta robótica que se quería eliminar.

### La tabla virtual vec0 no puede vivir en schema.sql
- **Contexto:** F1, al consolidar el esquema con la tabla de vectores de sqlite-vec.
- **Lección:** La tabla virtual `vec0` solo existe **tras** `sqliteVec.load(db)`. Patrón: aplicar `schema.sql` primero y luego crear `vec_chunks` con `CREATE VIRTUAL TABLE IF NOT EXISTS … vec0(…, embedding FLOAT[768])` dentro de un try/catch que degrade `vecEnabled` sin romper el arranque. nomic-embed-text = 768 dims. vec0 genera 4 tablas sombra (`vec_chunks_*`) que aparecen en `sqlite_master` — no las cuentes como tablas de aplicación.
- **Por qué importa:** Ponerla en `schema.sql` rompe el arranque cuando la extensión no cargó, y descuadra los conteos de tablas en verificaciones.

---

## Backend / Express / Socket.io

### Routers que emiten por socket → factory `createXRouter(io)`
- **Contexto:** F4, endpoints REST (sessions, canvas) que además emiten eventos por Socket.io.
- **Lección:** Para que un router REST pueda emitir por socket sin imports circulares, expórtalo como factory `export default function createSessionsRouter(io) { ... }` y créalo en `index.js` DESPUÉS de instanciar `io`, montándolo con `app.use('/api/sessions', createSessionsRouter(io))`.
- **Por qué importa:** Importar `io` directamente desde los routers genera ciclos de import y acoplamiento; la factory mantiene el router testeable y desacoplado.

### session_events es append-only
- **Contexto:** modelo de eventos de sesión heredado de la v0.
- **Lección:** El log `session_events` solo recibe INSERT. Nunca UPDATE ni DELETE. El estado se deriva reproduciendo el log.
- **Por qué importa:** Mutar el log rompe la reproducción de estado, el historial y las estadísticas derivadas.

---

## Frontend / React / Tailwind

### Cero estilos inline, cero window.innerWidth
- **Contexto:** la v0 usaba `const s = {…}` en cada componente y hacks de `useWindowWidth`.
- **Lección:** Estilos solo con clases Tailwind + tokens definidos en `tailwind.config.js`. Responsive con breakpoints (`md:`, `lg:`), no midiendo el ancho en JS.
- **Por qué importa:** Los estilos inline duplicados eran el principal dolor de mantenimiento de la v0; medir el ancho en JS re-renderiza de más y no es responsive real.

### Una feature de frontend no está terminada hasta que sus componentes estén cableados y accesibles
- **Contexto:** F5, primera ronda: `PlanningPanel`/`SessionPrepPanel`/`EventTemplatePanel` quedaron definidos pero nunca importados; `SessionView` no se modificó → la planificación era inaccesible desde la UI.
- **Lección:** Crear un componente no es "implementarlo". El implementer debe montarlo en la jerarquía (importado, renderizado, con ruta/tab/acceso navegable) y dejar el flujo de usuario alcanzable. El reviewer hace `grep` de imports para detectar componentes huérfanos.
- **Por qué importa:** Componentes huérfanos pasan lint/build pero la feature no existe para el usuario; es un falso "completado".

### Directiva eslint-disable que referencia un plugin no registrado = error fatal en ESLint 9
- **Contexto:** F5, `eslint-disable-next-line react-hooks/exhaustive-deps` sin tener `eslint-plugin-react-hooks` registrado.
- **Lección:** En ESLint 9 (flat config), una directiva que apunta a una regla de un plugin no registrado es ERROR fatal, no warning, y rompe el build. Para proyectos React, registra `eslint-plugin-react-hooks` con sus reglas en `'warn'` (no rompe el build y aporta valor). No uses disables hacia reglas que el config no conoce.
- **Por qué importa:** Un disable "inofensivo" tumba `docker compose build frontend` entero.

### El flat config de ESLint del frontend necesita eslint-plugin-react (jsx-uses-vars)
- **Contexto:** F4, el lint del frontend emitió 12 warnings falsos `no-unused-vars` sobre imports usados solo como componentes JSX.
- **Lección:** Con flat config de ESLint 9 + JSX, `no-unused-vars` marca como sin usar los componentes que solo aparecen en JSX. Falta la regla `react/jsx-uses-vars` de `eslint-plugin-react`. La próxima feature que toque frontend debe añadir `eslint-plugin-react` y habilitar `react/jsx-uses-vars` (o usar su config recomendada) para eliminar los falsos positivos.
- **Por qué importa:** El ruido de warnings falsos puede ocultar warnings reales y erosiona la confianza en el checkpoint de lint.

### Dos vistas de los mismos datos deben derivar de la MISMA fuente (grafo vs lista)
- **Contexto:** F24, la pestaña Flujo (grafo) pintaba los eventos sueltos enlazados pero la pestaña Prep (lista) los perdía.
- **Lección:** Cuando dos vistas renderizan el mismo conjunto de entidades por caminos distintos, es fácil que una rama olvide un subconjunto (aquí: la rama `hasLinks` de la lista ignoraba `freeEvents`). Extrae el cálculo a un helper puro compartido y haz que ambas vistas (y todas las ramas de render) lo consuman. Al arreglar una vista que "pierde" datos, revisa que TODAS las ramas (`hasLinks` vs `!hasLinks`) cubran el mismo conjunto.
- **Por qué importa:** El bug pasa build/lint/tests unitarios y solo se ve USANDO la app; divergencias entre vistas erosionan la confianza en la feature.

### Colores dinámicos por entidad: lista de clases estáticas + índice estable, nunca clases interpoladas
- **Contexto:** F14, franja de acento por campaña y puntos del timeline con color derivado del id.
- **Lección:** El JIT de Tailwind solo genera clases que aparecen LITERALES en el código. Para colorear por entidad: define una lista estática de juegos de clases (`const ACCENTS = ['bg-cat-combat', …]`) y elige con un índice estable (hash del id). Ni `style={{}}` (prohibido) ni template strings tipo `bg-${color}` (el JIT no las ve).
- **Por qué importa:** Las clases interpoladas compilan pero no existen en el CSS final; el bug aparece solo en el build de producción.

### `style={{}}` inline SÍ se permite para geometría computada en runtime (no es estilo decorativo)
- **Contexto:** F17, grafo de eventos: posición de nodos arrastrados, `transform: scale` del zoom, posición de píldoras de enlace.
- **Lección:** La prohibición de estilos inline (`const s = {…}`) es contra estilos DECORATIVOS (colores, spacing, tipografía, bordes) que deben ser clases Tailwind + tokens. Un valor GEOMÉTRICO computado en runtime (`transform: translate(347px,122px)`, `scale(1.15)`, `top/left` de un nodo arrastrable) NO se puede expresar como clase estática y `style={{}}` es la vía correcta. Regla para el reviewer: acepta `style=` si es puramente posición/geometría calculada; rechaza si es decoración disfrazada.
- **Por qué importa:** Un rechazo automático por "estilo inline" sobre geometría dinámica bloquea features de canvas/drag/zoom legítimas; y al revés, colar decoración en `style` evade el sistema de diseño.

### Extender un componente compartido = props opcionales retrocompatibles, nunca romper la firma existente
- **Contexto:** F17 extendió `EventFlowGraph` (Bézier, zoom, fondo de puntos, aristas por tipo) que `PlanningPanel` (F8b) ya usa embebido en la sesión con la prop `compact`.
- **Lección:** Cuando amplíes un componente que ya tiene consumidores, añade lo nuevo tras **props opcionales con default** que preserven el comportamiento previo; verifica con `grep` todos los consumidores y confirma que su uso no cambia. El reviewer hace grep de la prop/firma en riesgo (`compact`) y confirma cero regresión en el consumidor existente.
- **Por qué importa:** Cambiar la firma de un componente compartido rompe silenciosamente otras vistas (aquí, la sesión en vivo) que pasan build/lint pero fallan en runtime.

### Vistas de trabajo intensivo van full-bleed (rail 62px propio) fuera del AppShell de 236px
- **Contexto:** F17 (Preparar Sesión) y F4/F18 (SessionView): pantallas-lienzo que necesitan todo el ancho.
- **Lección:** El AppShell con sidebar 236px es para las páginas de navegación (Dashboard, catálogos…). Las pantallas de trabajo intensivo (planificación, sesión en vivo) van **full-bleed con su propio rail de iconos 62px** (réplica solo-iconos del sidebar), como ya hace `SessionView`. No colapses el sidebar 236px para esto; monta la vista full-bleed en `App.jsx`.
- **Por qué importa:** Mantiene consistencia entre las pantallas-lienzo del handoff y evita hacks de layout para exprimir ancho dentro del shell.

---

## Arquitectura

> Aún no hay lecciones en esta categoría.

---

## Testing

### El runner de vitest del frontend no tiene jsdom: testea helpers puros, no clics
- **Contexto:** F20, cubrir la lógica del modal de evento rápido en `session.test.jsx`.
- **Lección:** Los tests de frontend montan con `renderToStaticMarkup` (SSR, sin efectos ni DOM interactivo); no hay `jsdom` ni testing-library. Para cubrir lógica load-bearing de handlers, **extrae un helper puro exportado** (p. ej. `buildQuickEventPayload({...})`) y testéalo directamente, en vez de simular clics. Añadir jsdom/testing-library mete dependencias pesadas y arriesga el build context de Docker; no lo hagas solo para un test.
- **Por qué importa:** Intentar simular interacción con el runner actual falla o obliga a deps nuevas; el helper puro cubre la lógica real sin coste.

### Correr los tests del frontend en Docker sin ensuciar el host
- **Contexto:** F20, verificar vitest en el entorno canónico (el Dockerfile del frontend solo tiene stage lint+build, no test).
- **Lección:** Patrón sin `npm install` en el dir montado (que deja `node_modules` residual y envenena el build context): `docker build --target build -t tmp ./frontend` + `docker run --rm tmp npm test`, y al terminar `docker rmi tmp`. Vitest está disponible en el build stage (deps instaladas sin `--omit=dev`).
- **Por qué importa:** Reproduce el checkpoint de tests en el entorno canónico sin dejar artefactos del host que rompan `docker compose build frontend` después.

### Seed de datos demo idempotente = reset por MARCADOR, no por id
- **Contexto:** F25, dejar UNA sesión demo limpia y reejecutable.
- **Lección:** Para un estado demo idempotente, borra por marcador único (nombre de prep/sesión, tripleta dm_id+game_system_id+nombre de NPC) y recrea, en vez de intentar upsert de un grafo complejo. Ojo: los `event_templates` SUELTOS del prep tienen FK a `prep_id` SIN cascade (como en routes/sessionPreps.js) → bórralos por `prep_id` ANTES de la prep (locations/sub_locations sí cascadean). `session_events` es append-only en operación normal; un `DELETE FROM` masivo solo es válido como reset explícito sancionado por el founder.
- **Por qué importa:** Reejecutar el seed deja siempre el mismo estado limpio sin duplicar prep/eventos/NPCs ni tocar datos ajenos.

### Para testear la idempotencia real de una migración, expón las funciones de migración
- **Contexto:** F22, verificar que M003 (`DROP COLUMN`) es idempotente y que M001/M002 no cambiaron.
- **Lección:** Exporta el array de migraciones (`export const MIGRATIONS = [[name, (db) => …], …]`) con funciones que reciben `db` por parámetro (en vez de cerrar sobre el `db` del módulo). Así el test ejercita la **función REAL** sobre una DB `better-sqlite3(':memory:')` aislada: aplica dos veces y asserta que no lanza y que el estado (PRAGMA table_info) no cambia. Cubre además el fresh install verificando que la DB cargada (schema+migraciones) tiene el estado final y que la migración quedó registrada en `_migrations`.
- **Por qué importa:** Duplicar el `ALTER` en el test no prueba la migración real; exponer la fn permite testear el código que de verdad corre en producción y evita regresiones al refactorizar el runner.

### Al insertar en tablas puente en tests, actualizar el DELETE del beforeEach compartido
- **Contexto:** F14, tests nuevos insertaban en `session_members` y `session_summaries`; las FKs rompieron la limpieza de tests vecinos.
- **Lección:** Si un test nuevo inserta en una tabla puente (session_members, session_summaries, etc.), añade su `DELETE FROM` al `beforeEach` del archivo. El síntoma de olvidarlo es engañoso: `hookFailed` en tests AJENOS, no en el tuyo.
- **Por qué importa:** El fallo aparece en tests que no tocaste y se pierde tiempo buscando en el lugar equivocado.

---

## Docker / infraestructura

### Cada servicio con imagen Docker necesita .dockerignore (node_modules del host envenena el build context)
- **Contexto:** F8b, `docker compose build frontend` falló porque el implementer dejó un `frontend/node_modules` residual (de correr vitest en el dir montado); sin `.dockerignore` entró al build context y un symlink de Windows (`.bin/acorn`) abortó el build con "invalid file request".
- **Lección:** `backend/` y `frontend/` tienen `.dockerignore` (node_modules, dist, data, .git). No corras `npm install`/`vitest` directamente en el directorio del proyecto montado si vas a buildear la imagen después; usa `docker compose exec`/build stage. Si aparece un node_modules residual, bórralo antes de verificar el build.
- **Por qué importa:** El build context sin filtrar arrastra artefactos del host; en Windows los symlinks de `.bin` rompen el `COPY . .` del Dockerfile.

### SPA en nginx: index.html con no-cache, assets hasheados con immutable (o el navegador sirve builds viejos)
- **Contexto:** F27, el founder tuvo que hard-refrescar 2 veces (copy de IA, ficha de personaje) porque el navegador servía un bundle viejo tras el deploy.
- **Lección:** En el `nginx.conf` del frontend, sirve `index.html` con `Cache-Control: no-cache` (que el navegador revalide siempre) y `/assets/*` (nombres con hash de Vite) con `public, max-age=31536000, immutable`. Así, tras cada deploy el navegador toma el index.html nuevo → los chunks nuevos, sin hard-refresh. OJO: nginx NO hereda `add_header` del server en un `location` que tenga su propio `add_header`; pon el header en cada bloque que lo necesite. Verifica con `curl -I` real (index → no-cache, asset → immutable). Sin esto, el síntoma engaña: parece bug de código pero es caché del navegador.
- **Por qué importa:** Un cambio desplegado y verificado en el bundle servido igual se ve 'roto' en el navegador del usuario; el arreglo de código correcto se percibe como no aplicado.

### nginx da 504 en `/api/ai/ask` con el LLM local en CPU; el streaming por socket sí funciona
- **Contexto:** F23, verificar el answer end-to-end del LLM local (qwen2.5:3b en CPU es lento).
- **Lección:** El `/api/ai/ask` (REST, no streaming) puede superar el `proxy_read_timeout` de nginx → 504, aunque la generación funcione. El AIPanel usa **streaming por socket.io** (tokens incrementales), que NO sufre este timeout, así que el usuario está bien. Para verificar por REST, pégale al backend directo (`docker compose exec backend` → `curl localhost:3001`) o sube el timeout del proxy; el retrieval (`/api/rag/search`) es la prueba rápida y determinista.
- **Por qué importa:** Un 504 en `/ai/ask` puede leerse como "la IA está rota" cuando en realidad es timeout de proxy; el camino real (socket) funciona.

### El servicio `backend` de compose NO monta `src/` como volumen: reconstruir antes de verificar
- **Contexto:** F21, verificar cambios en `services/ai.js`; el primer `docker compose run backend npm test` corrió código VIEJO.
- **Lección:** El servicio `backend` del compose solo monta `./data` y `./game-packs`, NO `src/` (el código va horneado en la imagen). Tras cambiar backend, **reconstruye** (`docker compose build backend`) ANTES de `docker compose run --rm --no-deps backend npm test`, o correrás la versión anterior. Síntoma engañoso: los tests muestran nombres/asserts viejos y "pasan" sobre el código previo.
- **Por qué importa:** Un checkpoint puede darse por verde sobre código que no es el que cambiaste; el fallo real queda oculto hasta runtime.

### Prueba que la imagen está al día por HASH, no por timestamp ni por "cache hit"
- **Contexto:** F22, se afirmó "la imagen es de hace 2h pero el cache-hit prueba que está al día" — razonamiento flojo que el founder corrigió (el código había cambiado hacía minutos).
- **Lección:** El `CreatedSince` de `docker images` NO es fiable como "última vez que se buildeó" (BuildKit puede fijar timestamps deterministas). Y aunque un cache-hit de `docker compose build` normalmente implica fuente idéntico, no lo des por probado: **compara hashes host↔imagen** de los archivos que cambiaste — `sha256sum backend/src/<f>` vs `docker compose run --rm --no-deps backend sha256sum src/<f>`. Si coinciden, la imagen contiene el código actual y los tests son válidos; si no, `docker compose build` (o `--no-cache`) y re-verifica. Ojo con CRLF/LF: el working tree en Windows está en LF (el COPY los preserva), así que los hashes deben coincidir.
- **Por qué importa:** Confiar en el timestamp o en el cache-hit sin probar currency puede validar los tests contra una imagen vieja; el hash es la prueba objetiva de que corriste el código actual.

### El lint/test debe poder correr en el entorno canónico (Docker), no "en teoría"
- **Contexto:** F4, `docker compose exec backend npm run lint` falló con `eslint: not found`.
- **Lección:** Si la imagen usa `npm install --omit=dev`, las devDependencies (eslint, etc.) no existen en el contenedor. Decisiones de la v1.0: (1) el backend instala TODAS las deps (`npm install` sin `--omit=dev`) y hace `COPY eslint.config.js ./` para que lint/test corran con `docker compose exec backend …`; (2) el frontend (imagen final = nginx, sin Node) fuerza lint y build en su build stage (`RUN npm run lint && RUN npm run build`), así `docker compose build frontend` = lint+build verificados.
- **Por qué importa:** Sin esto, "lint ✅" es irreproducible y un checkpoint del harness queda imposible de cumplir en la máquina del founder (sin Node local).

---

## Proceso y flujo de trabajo

### No declarar un checkpoint en verde sin ejecutarlo en el entorno donde se exige
- **Contexto:** F4, el reporte del implementer afirmó "lint ✅" sin que fuera reproducible en el contenedor.
- **Lección:** El implementer no marca un checkpoint como verde sin correr el comando exacto en el entorno canónico (Docker). El reviewer ejecuta literalmente cada comando del checklist; no se fía del reporte.
- **Por qué importa:** Un checkpoint declarado en verde pero irreproducible esconde bloqueantes hasta la revisión, desperdiciando una iteración completa.

---

## Formato para agregar una lección

```markdown
### [Título corto de la lección]
- **Contexto:** [qué estabas haciendo cuando lo descubriste]
- **Lección:** [qué hacer o qué evitar — concreto y accionable]
- **Por qué importa:** [qué pasa si se ignora]
```

---

## Historial de cambios

<!-- El líder y el consultor registran aquí cada vez que agregan una lección -->
<!-- Formato: [fecha] — [agente] agregó lección "[título]" en categoría [categoría] -->
- 2026-06-29 — founder sembró lecciones iniciales del stack al portar el harness desde la v0.
- 2026-06-29 — líder agregó "La tabla virtual vec0 no puede vivir en schema.sql" (RAG/sqlite-vec) y "Verificar migraciones consolidadas con PRAGMA" (SQLite) tras cerrar F1.
- 2026-06-29 — líder agregó tras cerrar F4: "Routers que emiten por socket → factory" (Backend), "El lint/test debe poder correr en Docker" (Docker/infra), "ESLint frontend necesita eslint-plugin-react" (Frontend), "No declarar un checkpoint en verde sin ejecutarlo" (Proceso).
- 2026-06-29 — líder agregó tras cerrar F5: "Una feature de frontend no está terminada hasta que sus componentes estén cableados" (Frontend) y "Directiva eslint-disable a plugin no registrado = error fatal en ESLint 9" (Frontend).
- 2026-06-29 — líder agregó tras cerrar F8b: "Cada servicio con imagen Docker necesita .dockerignore" (Docker/infra).
- 2026-07-02 — líder agregó tras cerrar F14: "Colores dinámicos por entidad: lista de clases estáticas + índice estable" (Frontend) y "Al insertar en tablas puente en tests, actualizar el DELETE del beforeEach" (Testing).
- 2026-07-20 — líder agregó tras cerrar F17 (sesión autónoma): "`style={{}}` inline SÍ se permite para geometría computada", "Extender un componente compartido = props opcionales retrocompatibles" y "Vistas de trabajo intensivo van full-bleed (rail 62px)" — las tres en Frontend.
- 2026-07-22 — líder agregó tras cerrar F20: "El runner de vitest del frontend no tiene jsdom: testea helpers puros" y "Correr los tests del frontend en Docker sin ensuciar el host" — ambas en Testing.
- 2026-07-22 — líder agregó tras cerrar F21: "Negar una frase en un system prompt puede primarla en modelos pequeños" (RAG/embeddings) y "El servicio backend de compose NO monta src/: reconstruir antes de verificar" (Docker/infra).
- 2026-07-22 — líder agregó tras cerrar F22: "Eliminar una columna legacy: DROP COLUMN idempotente con guard PRAGMA + actualizar schema.sql" (Base de datos/SQLite) y "Para testear la idempotencia real de una migración, exporta el array de migraciones con fns que reciben db" (Testing).
- 2026-07-22 — líder agregó "Prueba que la imagen está al día por HASH, no por timestamp ni por cache hit" (Docker/infra) + checkpoint y criterio de rechazo en CHECKPOINTS.md, a pedido del founder tras detectar razonamiento flojo sobre la vigencia de la imagen.
- 2026-07-22 — líder agregó tras cerrar F23: "Los docs de reglas son contenido compartido: ingerir por NOMBRE de sistema" y "Un doc ingerido sin Ollama queda sin vectores: reindexar" (RAG), y "nginx da 504 en /api/ai/ask con LLM CPU; el streaming por socket sí funciona" (Docker/infra).
- 2026-07-22 — líder agregó tras cerrar F25 "Seed de datos demo idempotente = reset por marcador" (Testing); tras F26 "Concisión en modelos pequeños: cláusula compartida en positivo + temp baja" (RAG); tras F27 "SPA en nginx: index.html no-cache, assets immutable" (Docker/infra).

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

---

## RAG / embeddings / sqlite-vec

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

---

## Arquitectura

> Aún no hay lecciones en esta categoría.

---

## Testing

> Aún no hay lecciones en esta categoría.

---

## Docker / infraestructura

### Cada servicio con imagen Docker necesita .dockerignore (node_modules del host envenena el build context)
- **Contexto:** F8b, `docker compose build frontend` falló porque el implementer dejó un `frontend/node_modules` residual (de correr vitest en el dir montado); sin `.dockerignore` entró al build context y un symlink de Windows (`.bin/acorn`) abortó el build con "invalid file request".
- **Lección:** `backend/` y `frontend/` tienen `.dockerignore` (node_modules, dist, data, .git). No corras `npm install`/`vitest` directamente en el directorio del proyecto montado si vas a buildear la imagen después; usa `docker compose exec`/build stage. Si aparece un node_modules residual, bórralo antes de verificar el build.
- **Por qué importa:** El build context sin filtrar arrastra artefactos del host; en Windows los symlinks de `.bin` rompen el `COPY . .` del Dockerfile.

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

# Revisión: F8b — Editor visual del grafo de eventos + edición de flujo en sesión
Fecha: 2026-06-30
Reviewer: reviewer (independiente)
Veredicto: **RECHAZADO**

> Rechazo NARROW y de fácil corrección: **el código de F8b es correcto y pasa todo en
> limpio** (lint 0 / vitest 4-4 / build OK / backend 66-pass). El rechazo es por un
> **artefacto residual dejado en el working tree** que rompe el comando canónico
> `docker compose build frontend` y ensucia el repo fuera del scope declarado.

---

## Checklist CHECKPOINTS.md

- [x] Lint backend pasa en el contenedor: `docker compose exec backend npm run lint` → 0 errores.
- [ ] **Lint + build frontend vía `docker compose build frontend`** → **FALLA** en el estado
      entregado (ver Resultado de verificación). En COPIA LIMPIA del source pasa (lint 0 + build OK).
- [x] No se declaró "lint ✅" sin ejecutarlo (lo ejecuté literalmente en Docker).
- [x] No hay código comentado sin explicación.
- [x] No hay `console.log` de debug.
- [x] `better-sqlite3` síncrono (backend sin cambios de código; PUT/POST/DELETE ya síncronos con prepared statements).
- [x] Prepared statements (`db.prepare(...)`), sin concatenación de SQL.
- [x] `session_events` append-only (el disparo sigue siendo INSERT vía `firePlanningEvent`; no se toca el log).
- [x] Frontend: estilos SOLO Tailwind. Cero `const s = {…}` / `style={{…}}` en los 3 archivos F8b (grep sin matches).
- [x] Frontend: cero `window.innerWidth` / `useWindowWidth` (grep sin matches; el posicionamiento usa geometría SVG `x`/`y` en `<foreignObject>`).
- [x] Nombres descriptivos en inglés; funciones puras (`flattenPrepEvents`, `computeGraphLayout`) con una responsabilidad.
- [x] Sin dependencias nuevas (package.json = react, react-dom, socket.io-client; sin reactflow/dagre/d3/cytoscape). CONFIRMADO.
- [x] Tests existen y cubren caso feliz + error (PUT: 200 / 403 / 404; layout: capas / ciclo / arista inválida).
- [x] Componentes cableados sin huérfanos: `EventFlowGraph` importado y renderizado en `EventTemplatePanel.jsx` (Lobby, línea 7/265) y en `PlanningPanel.jsx` (sesión, línea 8/495).
- [x] Endpoint REST existente y correcto (ver abajo).
- [x] Reporte del implementer presente (`impl_F8b-visual-planner.md`).
- [ ] **Archivos fuera del scope declarado**: `frontend/package-lock.json` (untracked) + `frontend/node_modules/` no declarados.

---

## Resultado de verificación (Docker — canónico, ejecutado literalmente)

- **lint backend:** ✅ `docker compose exec backend npm run lint` → 0 errores (exit 0).
- **test backend:** ✅ `docker compose exec backend npm test` → 67 tests, **66 pass / 0 fail / 1 skip**
  (el skip es el test RAG preexistente, ajeno a F8b). Los 3 PUT nuevos pasan.
- **lint + build frontend:** ❌ `docker compose up -d --build` / `docker compose build frontend` →
  **FALLA** en:
  ```
  [frontend internal] load build context
  transferring context: 127.49MB
  ERROR: invalid file request node_modules/.bin/acorn
  target frontend: failed to solve: invalid file request node_modules/.bin/acorn
  ```
- **build/lint/test frontend en COPIA LIMPIA (sin el node_modules residual):** ✅
  Contenedor efímero `node:22-bookworm-slim` con `npm install` limpio sobre `frontend/src`+config:
  - lint → 0 errores (exit 0)
  - vitest → **4/4 pass** (`src/lib/planning.test.js`)
  - build → OK (87 módulos transformados, `dist` generado)
- **health (contenedores del build previo, aún arriba):** ✅ `GET /api/health` →
  `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.

### Causa raíz del fallo del build canónico
1. El working tree contiene `frontend/node_modules/` (304 entradas, fechado hoy 19:16) generado
   por la corrida de vitest del implementer, y un `frontend/package-lock.json` **untracked**.
2. NO existe `.dockerignore` (ni en raíz ni en `frontend/`). El `Dockerfile` del frontend hace
   `COPY package.json ./` → `RUN npm install` → `COPY . .`, de modo que **hace su propia instalación**;
   el `node_modules` del host no debería estar en el contexto, pero al no haber `.dockerignore` se
   arrastra al build context (127 MB).
3. Ese `node_modules` incluye el symlink de Windows `node_modules/.bin/acorn → ../acorn/bin/acorn`,
   que el cargador de contexto de Docker rechaza (`invalid file request`), **abortando el build**.
4. `backend/node_modules` NO existe en el host, por eso el backend sí buildea. El problema es
   exclusivo del frontend y lo introdujo esta feature.

El reporte del implementer afirma que `docker compose build frontend` pasó (lint 0 + build OK).
En el estado entregado del working tree eso **no es reproducible**: la corrida canónica falla por
el artefacto residual. (Incumple la lección de proceso "No declarar un checkpoint en verde sin
ejecutarlo en el entorno donde se exige".)

---

## Verificación del endpoint de edición (punto crítico del encargo)

**El PUT SÍ existe** y es correcto — NO es rechazo por este motivo.
- `backend/src/routes/eventTemplates.js` líneas 200–258: `router.put('/:id', ...)`.
- Autorización por dueño: línea 214 `if (String(tmpl.dm_id) !== String(dm_id)) return res.status(403)`.
- 404 si no existe (línea 213); 400 si no hay nada que actualizar (línea 244).
- Actualización dinámica de campos + reemplazo de participantes dentro de `db.transaction(...)` síncrono, prepared statements.
- El cliente `api.updateEventTemplate(id, dmId, fields)` (`frontend/src/lib/api.js` líneas 102–103)
  mapea correctamente a `PUT /api/event-templates/:id` con `{ dm_id, ...fields }`.
- El `git status` no muestra `eventTemplates.js` modificado porque el endpoint ya venía de F5;
  el implementer solo añadió tests (POST/PUT/DELETE ya existían). Correcto.
- Tests que lo cubren (backend, verdes): 200 (feliz), 403 (otro DM), 404 (inexistente).

---

## Lecciones aplicadas correctamente

- **"Cero estilos inline / cero window.innerWidth"** — aplicada. Grep sin matches; posicionamiento
  resuelto con `<foreignObject x y>` (geometría SVG) y colores con utilidades `stroke-*`/`fill-*`.
- **"Una feature de frontend no está terminada hasta que sus componentes estén cableados"** — aplicada.
  `EventFlowGraph` montado y alcanzable en Lobby (constructor) y en sesión (pestaña 🕸 Editar).
- **"eslint-disable a plugin no registrado = error fatal"** — respetada. Sin disables nuevos;
  `reloadPrep` memoizado con `useCallback` y añadido a las deps del efecto.
- **"El lint/test debe correr en Docker"** — el implementer lo hizo, PERO dejó residuos del
  contenedor efímero de vitest sin limpiar (lo que causó el fallo). Ver rechazo.
- **"better-sqlite3 síncrono" / "prepared statements" / "session_events append-only"** — respetadas.

---

## Puntos a corregir (para reenvío)

1. **Eliminar el artefacto residual que rompe el build canónico** (bloqueante):
   - Borrar `frontend/node_modules/` del working tree.
   - Borrar el `frontend/package-lock.json` untracked (fuera de scope; no formaba parte de F8b).
   - Verificar que `docker compose build frontend` completa (lint + build) tras la limpieza.
2. **Recomendado (para que el fallo no reincida):** añadir `frontend/.dockerignore` con
   `node_modules`, `dist`. Sin él, cualquier `node_modules` en el host (p. ej. de una futura
   corrida de vitest) volverá a inflar/romper el build context. *Nota:* esto tocaría un archivo
   nuevo fuera del scope actual; queda a criterio del líder si se hace en este reenvío o en una
   tarea de infra aparte. La corrección #1 basta para desbloquear F8b.

> Tras la corrección #1, y confirmando `docker compose build frontend` en verde, el resto del
> checklist ya está satisfecho: este trabajo aprobaría.

---

## Observaciones (no bloqueantes)

- `computeGraphLayout` es un layout por capas correcto y testeado (BFS desde indegree 0, tope
  anti-ciclos, ignora aristas a nodos inexistentes). Solución propia ligera, sin `reactflow`/`dagre`.
  Cumple la regla del founder de evitar dependencias pesadas.
- La posición arrastrada es local/efímera (`useState` + `pointer events`); no se persiste ni toca
  el schema. Coherente con lo permitido.
- En modo grafo, la creación de ubicaciones/sub-ubicaciones/ramas se delega a la vista de lista;
  la UI lo comunica con un enlace explícito. Decisión razonable de alcance.
- El `<foreignObject>` con `<div>` interior es ampliamente soportado; el arrastre usa
  `pointermove`/`pointerup` globales limpiados en el cleanup del efecto (sin fugas).

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)

- **Docker/infra — Falta `.dockerignore` en el frontend: un `node_modules` residual en el host rompe
  `docker compose build frontend`.** Contexto: F8b dejó `frontend/node_modules` (de una corrida de
  vitest en contenedor efímero) y sin `.dockerignore` se arrastró al build context; el symlink
  Windows `.bin/acorn` disparó `invalid file request` y abortó el build. Lección: (1) añadir
  `frontend/.dockerignore` (`node_modules`, `dist`); (2) todo agente que genere `node_modules` en el
  host para tests debe limpiarlo antes de reportar; (3) el comando de verificación canónico debe
  correrse DESPUÉS de esa limpieza. Por qué importa: sin `.dockerignore`, el checkpoint canónico de
  build es frágil y falla por un artefacto de test, no por el código.
- **Proceso — Verificar el estado ENTREGADO, no solo el código.** El código de F8b pasa todo en
  limpio, pero el working tree entregado rompía la verificación canónica. Reafirma "no declarar un
  checkpoint en verde sin ejecutarlo en el entorno donde se exige": debe ejecutarse sobre el árbol
  tal como se entrega, con sus residuos incluidos.
- **Testing/frontend — Correr vitest en contenedor efímero deja huella.** El patrón
  `docker run --rm -v frontend:/app node ... npm install && vitest` funciona, pero materializa
  `node_modules`/`package-lock.json` en el host. Alternativa más limpia: montar el source en un
  subdirectorio o copiar a un tmp antes de instalar, de modo que el repo nunca se ensucie.

---

## Resolución del líder (2026-06-29)

El único bloqueante era de higiene de build (no de código). Corregido por el founder/líder (infra):
- Eliminados `frontend/node_modules`, `frontend/package-lock.json` y equivalentes residuales del backend.
- Añadidos `frontend/.dockerignore` y `backend/.dockerignore` (ignoran node_modules/dist/data/.git) para que el build context nunca arrastre el node_modules del host.
- Re-verificado: `docker compose build frontend` → EXIT 0, "Image rolapp-v1-frontend Built".

Con el código ya validado en copia limpia por el reviewer (lint 0, vitest 4/4, backend 66 pass, PUT con auth DM), F8b queda **APROBADO** y se cierra.

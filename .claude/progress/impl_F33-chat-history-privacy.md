# Implementación: F33 — Fix de privacidad del historial de chat (+ 2 remates)
Fecha: 2026-07-31
Status: completado

## Archivos creados
- `backend/src/sockets/chat.test.js`: 8 tests del handler `chat:history` con el patrón de
  `io`/`socket` falsos de `canvas.test.js`/`session.test.js` (siembra directa en DB `:memory:`).
- `frontend/src/components/ui/modal.test.jsx`: 5 tests SSR (patrón F20, sin jsdom) de los
  atributos de diálogo del Modal y de que el markup visible no cambió.

## Archivos modificados
- `backend/src/sockets/chat.js`: **el fix**. El historial ya no filtra los susurros ajenos.
- `frontend/src/components/ui/Modal.jsx`: portado el patrón EXACTO de `Sheet.jsx` (useEffect
  con listener de `keydown` que solo vive mientras `open` + `role="dialog"` / `aria-modal="true"`
  / `aria-label`). Firma (`open, onClose, title, children`) y markup visible intactos.
- `frontend/nginx.conf`: `proxy_read_timeout 300s;` + `proxy_send_timeout 300s;` **solo** en
  `location /api/`. Bloque `/socket.io/` y headers de caché de F27 sin tocar (diff = +6 líneas).
- `.claude/feature_list.json`: F33 `pending` → `in_progress` (instrucción explícita del líder;
  no la marco `done`).

## La query final

Un tronco común (literal del módulo, cero concatenación de datos del cliente) y **dos**
prepared statements que comparten columnas, `ORDER BY` y `LIMIT 200`:

```
HISTORY_SELECT = SELECT m.id, m.session_id, m.from_user_id, m.to_user_id, m.body, m.created_at,
                        u.username AS from_username
                 FROM messages m
                 JOIN users u ON m.from_user_id = u.id
                 WHERE m.session_id = ?
HISTORY_TAIL   = ORDER BY m.created_at ASC, m.id ASC
                 LIMIT 200

getHistoryForUser = HISTORY_SELECT + " AND (m.to_user_id IS NULL OR m.to_user_id = ? OR m.from_user_id = ?) " + HISTORY_TAIL
getPublicHistory  = HISTORY_SELECT + " AND m.to_user_id IS NULL " + HISTORY_TAIL
```

Selección de statement en el handler: `viewerId(socket)` lee **`socket.data.userId`** (lo fija
`session:join`), NUNCA el payload; devuelve `null` si no es un entero > 0. Con identidad →
`getHistoryForUser.all(id, userId, userId)`; sin identidad (espectador de la vista TV de F31,
que entra por `session:spectate` y a propósito no tiene `userId`) → `getPublicHistory.all(id)`.
El evento, su nombre y la forma del payload (`{ messages }`) no cambian → **frontend intacto**.

Decisión: dos statements en vez de uno solo con `null` bindeado. Con `?` = NULL la comparación
`m.to_user_id = NULL` es NULL (falsy) y "funcionaría", pero depender de esa semántica para una
**garantía de privacidad** es frágil de leer y de revisar; el statement público-only es
explícito y no puede degradar a fuga por un binding inesperado.

## Tests escritos
- `backend/src/sockets/chat.test.js` (8): siembra 4 usuarios, 2 sesiones y 3 mensajes
  (público, privado A→B, privado C→D) con `created_at` explícito y creciente.
  1. B (destinatario) recibe público + A→B y **NO** C→D.
  2. A (emisor) recibe público + A→B y **NO** C→D (rama `from_user_id`).
  3. C y D ven su susurro y no el de A→B (cada pareja aislada).
  4. Socket **sin `userId`** (espectador TV): **solo** el público; asserta además
     `to_user_id === null` en todo lo devuelto.
  5. Caso de error: `socket.data.userId` inservible (`0`, `-3`, `NaN`, `'abc'`, `null`,
     `undefined`) degrada a solo-público, nunca a fuga.
  6. Contrato: payload exactamente `{ messages }`, las 7 columnas de siempre (incl.
     `from_username` del JOIN) y orden ascendente por `created_at` e `id`.
  7. Sigue acotado a la sesión pedida (mensaje de otra mesa no se cuela).
  8. Sesión inexistente / id no numérico → lista vacía, y sigue respondiendo (no se rompe
     el contrato de "siempre responde").
  `beforeEach` limpia `messages, session_events, session_members, sessions, users` — lección
  F14 aplicada (`messages` es puente hacia `sessions`/`users`).
- `frontend/src/components/ui/modal.test.jsx` (5): `role`/`aria-modal`/`aria-label` presentes;
  sin título usa etiqueta de respaldo y no pinta cabecera; `open={false}` renderiza `''`;
  markup visible conservado (clases del backdrop y del panel, título, botón `aria-label="Cerrar"`,
  icono SVG, hijos); y contraste con `Sheet` para probar que es el MISMO patrón.
  El listener de Escape no es testeable con el runner actual (SSR sin jsdom, los efectos no
  corren) — se verifica lo observable en markup + paridad con Sheet.

## Validación por MUTACIÓN de los tests (prueba de que muerden)
Se restauró temporalmente el comportamiento previo al fix (`SELECT … WHERE m.session_id = ?`
sin filtro), se reconstruyó la imagen y se corrió `node --test src/sockets/chat.test.js`:

```
not ok 1 - chat:history  el destinatario ve el público y el suyo, NO el susurro ajeno
not ok 2 - chat:history  el emisor del susurro también lo ve (from_user_id)
not ok 3 - chat:history  cada pareja ve solo su susurro (C ve el suyo, no el de A->B)
not ok 4 - chat:history  un socket SIN userId (espectador de la vista TV) solo ve el público
not ok 5 - chat:history  ignora un userId inservible en socket.data (0, NaN, negativo)
ok  6 - chat:history  el contrato del payload y el orden no cambian
not ok 7 - chat:history  sigue acotado a la sesión pedida
ok  8 - chat:history  responde con lista vacía ante una sesión inexistente o id no numérico
# tests 8  # pass 2  # fail 6
```
Mutación revertida, imagen reconstruida y hash re-verificado (vuelve a `ddae48ad…`).

## Resultado de verificación (Docker, ejecutado de verdad)

### Vigencia de la imagen por HASH host↔imagen (lección F22)
```
$ sha256sum backend/src/sockets/chat.js backend/src/sockets/chat.test.js
ddae48adcbb4a42b397897e0f3535a66f3b0470c405a82ec76197a892dcac044 *backend/src/sockets/chat.js
fab94899d8add4f45d2208a02d925d1fb353e5cce276993b888faa7d685da8be *backend/src/sockets/chat.test.js

$ docker compose run --rm --no-deps backend sha256sum src/sockets/chat.js src/sockets/chat.test.js
ddae48adcbb4a42b397897e0f3535a66f3b0470c405a82ec76197a892dcac044  src/sockets/chat.js
fab94899d8add4f45d2208a02d925d1fb353e5cce276993b888faa7d685da8be  src/sockets/chat.test.js
```
Y tras revertir la mutación y reconstruir, el hash del contenedor **en ejecución**:
```
$ docker compose exec backend sha256sum src/sockets/chat.js
ddae48adcbb4a42b397897e0f3535a66f3b0470c405a82ec76197a892dcac044  src/sockets/chat.js
```
→ el backend desplegado corre el código del fix.

### Backend
- `docker compose build backend` → `Image rolapp-v1-backend Built` ✅
- `docker compose run --rm --no-deps backend npm run lint` → **exit 0** ✅
- `docker compose run --rm --no-deps backend npm test` →
  `# tests 173  # pass 172  # fail 0  # skipped 1` ✅
  (165 en F31 → **+8** míos; el 1 skip es preexistente). Los 8 nuevos, nominalmente:
  `ok 161 … ok 168 chat:history …`, y `grep -c "^not ok"` = **0**.

### Frontend (tag propio, sin `docker compose build frontend`)
- `docker build --target build -t tmp-f33 ./frontend` → **exit 0** (el stage corre
  `npm run lint && npm run build`; `✓ built in 4.46s`) ✅
- `docker run --rm tmp-f33 npm test` → **exit 0**, `Test Files 13 passed (13)`,
  `Tests 145 passed (145)` (140 en F32/F31 → **+5** míos, `src/components/ui/modal.test.jsx (5 tests)`) ✅
- `docker rmi tmp-f33` → eliminada. Host **sin** `node_modules` en `frontend/` ni `backend/`
  (comprobado antes y después). ✅

### curl -I real tras recrear el contenedor (punto 3)
`docker compose up -d --build frontend` (recreó también `backend`, que dependía de la imagen
nueva → el fix de privacidad quedó desplegado):
```
$ curl -sI http://localhost:3000/
HTTP/1.1 200 OK
Cache-Control: no-cache                                   ← F27 intacto

$ curl -sI http://localhost:3000/assets/index-C4wxQxFb.js
HTTP/1.1 200 OK
Cache-Control: public, max-age=31536000, immutable        ← F27 intacto

$ curl -sI http://localhost:3000/api/health
HTTP/1.1 200 OK
$ curl -s  http://localhost:3000/api/health
{"status":"ok","version":"1.0.0","vecEnabled":true,"ftsEnabled":true,"ai":{"provider":"ollama","model":"qwen2.5:3b"}}
```
Config desplegada dentro del contenedor (`grep -A9 'location /api/' /etc/nginx/conf.d/default.conf`)
muestra `proxy_read_timeout 300s;` y `proxy_send_timeout 300s;`. Bloque `/socket.io/` sin cambios.

**AVISO al líder:** ejecuté `docker compose up -d --build frontend` al final, como se me pidió,
para poder hacer el `curl -I` real. Eso **recreó frontend y backend** y, por tanto, la imagen del
frontend horneó también el `frontend/src/pages/MyCharacters.jsx` que el implementer de **F35**
tenía modificado en el working tree en ese momento (lint+build pasaron con él dentro, así que
nada quedó roto, pero el contenedor desplegado incluye trabajo de F35 a medio hacer). Si F35
sigue editando, habrá que volver a recrear el frontend al cerrarla.

## Lecciones aplicadas
- **F22 — vigencia por HASH host↔imagen**: `sha256sum` de los dos archivos backend antes de
  correr lint/tests, y otra vez tras revertir la mutación y contra el contenedor en ejecución.
- **F21 — el servicio `backend` no monta `src/`**: `docker compose build backend` ANTES de cada
  corrida de tests (tres veces: fix, mutación, revert).
- **F14 — `DELETE FROM` de tablas puente en el `beforeEach`**: `messages` (además de
  `session_events`, `session_members`, `sessions`, `users`) para no romper tests vecinos por FK.
- **F20 — vitest del frontend sin jsdom**: el test del Modal es SSR sobre markup observable +
  contraste con Sheet; no simulo el `keydown` ni añado testing-library/jsdom.
- **F20 — vitest en Docker sin ensuciar el host**: `docker build --target build -t tmp-f33` +
  `docker run --rm` + `docker rmi`; cero `npm install` en el directorio montado.
- **F30 — validar el test por mutación**: los tests se probaron contra el código roto para
  demostrar que fallan (6 de 8 en rojo), no solo contra el arreglado.
- **F17 — extender un componente compartido sin romper la firma**: el Modal se amplía solo con
  atributos ARIA y un efecto; `grep` de los 22 usos confirma que todos pasan `open`/`onClose`/
  `title`/`children` y ninguno depende del markup interno.
- **F27 — headers de caché de nginx**: verificados con `curl -I` real tras el rebuild.

## Decisiones tomadas
1. **Dos prepared statements** (identificado / público-only) en vez de uno con `NULL` bindeado
   — razón arriba: legibilidad y que la garantía de privacidad no dependa de la semántica de
   NULL en SQL. Los fragmentos compartidos son literales del módulo (no entra nada del cliente
   por concatenación); los datos siguen yendo por parámetros.
2. **El handler sigue respondiendo siempre**, incluso con `sessionId` inválido (lista vacía).
   No añadí un `return` temprano para no cambiar el contrato que ya consume `ChatPanel`.
3. **`viewerId()` endurece la identidad**: exige entero > 0. Un `socket.data.userId` corrupto
   degrada a solo-público (fail-closed), nunca a fuga.
4. **`aria-label={title || 'Diálogo'}`** en el Modal: como su cabecera es condicional (Sheet
   siempre la pinta), sin el respaldo un modal sin título quedaría sin nombre accesible.
   Verificado: los 22 consumidores actuales pasan `title`, así que el respaldo no altera nada hoy.
5. **`300s`** en ambos timeouts del proxy (lo pedido), solo en `location /api/`.
6. **Cero dependencias nuevas, cero endpoints, cero cambios de esquema.** `session_events`
   no se toca. `better-sqlite3` usado de forma síncrona.

## Candidatos para LEARNINGS.md
- **Backend / Socket.io — la identidad del solicitante sale del socket, nunca del payload.**
  Contexto: F33, `chat:history` mandaba todos los susurros de la mesa a cualquiera. Lección: en
  un handler de socket, todo filtro de autorización/visibilidad debe leer la identidad de
  `socket.data` (la fija el `join` autenticado), jamás de los argumentos del evento, que el
  cliente controla. Y el caso "socket sin identidad" (espectador, aún no unido) debe ser
  **fail-closed**: devolver solo lo público, no todo. Por qué importa: un handler "de solo
  lectura" filtra datos privados sin dejar rastro, y el emit en vivo bien resuelto da falsa
  sensación de seguridad — el historial es el segundo camino a los mismos datos.
- **Testing — dos caminos a los mismos datos = dos superficies de autorización.** Hermana de la
  lección F24 (grafo vs lista): si el dato viaja por *emit en vivo* y por *historial*, ambos
  necesitan el mismo filtro y ambos necesitan test. Aquí el emit estaba bien desde F4 y el
  historial nunca se revisó.

## Bloqueantes
Ninguno. Cero fallos ajenos de F35 durante la verificación (su cambio en `MyCharacters.jsx`
pasó lint+build dentro de mi imagen temporal).

## Pendiente de comprobación manual del founder
Abrir la sesión demo con dos cuentas, susurrar entre DM y un jugador, y confirmar desde una
tercera cuenta que al recargar el chat ya NO aparece ese susurro (antes bastaba recargar).

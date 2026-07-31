# Revisión: F33 — Fix de privacidad del historial de chat (+ 2 remates)
Fecha: 2026-07-31
Revisor: reviewer (independiente)
Base de comparación: 34f051c feat(F31)
Veredicto: **APROBADO**

---

## Alcance revisado (solo F33)

| Archivo | Estado | Dentro del alcance declarado |
|---|---|---|
| backend/src/sockets/chat.js | M | Sí |
| backend/src/sockets/chat.test.js | nuevo | Sí |
| frontend/src/components/ui/Modal.jsx | M | Sí (remate A) |
| frontend/src/components/ui/modal.test.jsx | nuevo | Sí (remate A) |
| frontend/nginx.conf | M | Sí (remate B) |

git status --short + git diff --stat 34f051c: **cero archivos de F33 fuera de esa lista**.
No hay solape con los archivos de F35 (revisados aparte).

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint backend EN EL CONTENEDOR: "docker compose run --rm --no-deps backend npm run lint" -> exit 0.
- [x] Lint + build frontend vía "docker compose build frontend" -> exit 0 (Image rolapp-v1-frontend Built).
- [x] Ningún checkpoint declarado en verde sin ejecutarlo: todos los comandos se reejecutaron en esta revisión.
- [x] No hay código comentado sin explicación (los comentarios nuevos justifican el porqué del doble statement).
- [x] Cero console.log / debugger de debug (grep en los 5 archivos -> exit 1).

### Código y patrones del proyecto
- [x] better-sqlite3 **síncrono**: getHistoryForUser.all(...) / getPublicHistory.all(...) directos. Grep de "await db." y de ".prepare(...).then" -> exit 1.
- [x] **Prepared statements**: los dos statements se componen con fragmentos LITERALES del módulo (HISTORY_SELECT / HISTORY_TAIL); todo dato del cliente entra por "?". Cero concatenación de datos.
- [x] session_events append-only: chat.js no lo toca. El único DELETE FROM session_events está en el beforeEach del test sobre DB :memory: (mismo patrón que session.test.js).
- [x] Frontend: cero estilos inline (style={{ , const s = {) y cero window.innerWidth en Modal.
- [x] Nombres descriptivos en inglés (getHistoryForUser, getPublicHistory, viewerId); una responsabilidad por función.
- [x] Sin dependencias circulares (no hay imports nuevos en backend).

### Tests
- [x] **Vigencia de la imagen por HASH** (criterio de rechazo automático) tras "docker compose build backend":
      host chat.js -> ddae48adcbb4a42b397897e0f3535a66f3b0470c405a82ec76197a892dcac044
      imagen chat.js -> ddae48adcbb4a42b397897e0f3535a66f3b0470c405a82ec76197a892dcac044  (idénticos)
      host/imagen chat.test.js -> fab94899d8add4f45d2208a02d925d1fb353e5cce276993b888faa7d685da8be (idénticos)
      contenedor EN EJECUCIÓN (docker compose exec backend sha256sum src/sockets/chat.js) -> mismo hash: el backend desplegado corre el fix.
- [x] Test por módulo público nuevo: 8 tests de chat:history, nominados ok 161 ... ok 168.
- [x] Todos pasan: backend "# tests 173 # pass 172 # fail 0 # skipped 1" (el skip es preexistente); grep -c "^not ok" = 0.
- [x] Caso feliz + casos de error: fuga entre parejas, espectador sin identidad, userId inservible (0, -3, NaN, 'abc', null, undefined), sesión inexistente, id no numérico.

### Arquitectura
- [x] Respeta la estructura (backend/src/sockets/, frontend/src/components/ui/).
- [x] **Cero dependencias nuevas**, cero endpoints nuevos, cero cambios de esquema.
- [x] No hay migraciones ni cambios de schema que documentar.

### Learnings
- [x] Propuso 2 lecciones (identidad desde socket.data; dos caminos a los mismos datos = dos superficies de autorización).

### Reporte
- [x] .claude/progress/impl_F33-chat-history-privacy.md existe y lista los archivos tocados.
- [x] Este .claude/progress/review_F33-chat-history-privacy.md.

---

## Verificación independiente de los 5 puntos pedidos

### 1) El bug de privacidad está cerrado de verdad

Query final leída línea a línea. Dos prepared statements sobre un tronco literal común:
- identificado: AND (m.to_user_id IS NULL OR m.to_user_id = ? OR m.from_user_id = ?)
- sin identidad: AND m.to_user_id IS NULL

Puede B recibir un privado entre C y D por ALGÚN camino:
- Por chat:history: NO. El filtro se parametriza con viewerId(socket), que lee **solo** socket.data?.userId y exige entero > 0. El ÚNICO input del cliente en el handler es sessionId, que va como parámetro y solo acota la mesa.
- Auditoría exhaustiva de la cadena de identidad: grep -rn "socket\.data\." backend/src -> la ÚNICA escritura de socket.data.userId en todo el backend es sockets/session.js:53, dentro de session:join, y previa validación de que el usuario existe en la DB. session:spectate (F31) NO la fija a propósito. No existe ningún camino por el que el payload de chat:history alcance el filtro.
- Por el emit en vivo: el bucle sigue exigiendo s.data.userId === fromId || s.data.userId === toId; un espectador tiene undefined y nunca coincide.
- Fail-closed sin identidad: verificado en código, en test (ok 164, que además asserta to_user_id === null en todo lo devuelto) y EN VIVO contra el backend desplegado (punto 5).

### 2) El emit en vivo no se rompió

git diff 34f051c -- backend/src/sockets/chat.js: el bloque de chat:message (persistencia + reparto a emisor/destinatario + broadcast del público) es byte a byte el mismo. El diff solo toca la zona del historial.

### 3) El contrato no cambió

- Mismo evento (chat:history de ida y de vuelta), mismo payload { messages }, mismas 7 columnas, mismo ORDER BY m.created_at ASC, m.id ASC, mismo LIMIT 200 (en HISTORY_TAIL, compartido por los dos statements).
- git diff --quiet 34f051c -- frontend/src/components/Chat/ChatPanel.jsx -> **ChatPanel.jsx IDÉNTICO a 34f051c**. El frontend no se tocó, como exigía la feature.

### 4) Modal: patrón de Sheet portado sin regresión

- Modal.jsx y Sheet.jsx comparados lado a lado: mismo useEffect con guard "if (!open) return undefined", mismo listener keydown con cleanup, mismos role="dialog" + aria-modal="true" + aria-label={title || fallback}.
- Firma intacta ({ open, onClose, title, children }); el markup visible (backdrop, panel, cabecera condicional, botón aria-label="Cerrar", Icon name="x") no cambia: solo se añaden atributos ARIA.
- Grep de consumidores: 20 usos de <Modal en 13 archivos. Barrido de props pasadas: solo open (20), onClose (20), title (20). CERO props desconocidas y CERO consumidores que dependan del markup interno. Regresión: ninguna.

### 5) nginx.conf verificado con curl -I REAL

- Config desplegada: sha256sum frontend/nginx.conf (host) == /etc/nginx/conf.d/default.conf (contenedor en ejecución) -> 508a7c688fe70c788e29b39f597c4c95cc3968153ff12a661b67548f71456066 en ambos.
- proxy_read_timeout 300s y proxy_send_timeout 300s SOLO dentro de location /api/ (verificado sobre el archivo desplegado).
- Bloque /socket.io/ INTACTO (diff vs 34f051c sin cambios; contenido desplegado confirmado).
- Headers de F27 medidos de verdad contra http://localhost:3000:
    /                                 -> HTTP/1.1 200 OK + Cache-Control: no-cache
    /index.html                       -> Cache-Control: no-cache
    /assets/TldrawCanvas-SRMYyJoa.js  -> Cache-Control: public, max-age=31536000, immutable
    /api/health                       -> HTTP/1.1 200 OK + {"status":"ok",...}
- Sonda EN VIVO por socket.io (polling EIO=4 a través de nginx, socket SIN identidad, sin session:join y sin escrituras): respondió 42["chat:history", {messages: ...}] con claves del payload = messages, columnas = body,created_at,from_user_id,from_username,id,session_id,to_user_id, orden ascendente = true y **privados recibidos = 0**. Prueba además que el bloque /socket.io/ sigue funcionando tras el cambio de timeouts.
  Nota: la sesión demo (id 17) no tiene mensajes privados, así que la sonda prueba el contrato y el camino fail-closed, no la fuga; la prueba de la fuga son los 8 tests unitarios sobre el código con hash verificado. Intenté insertar un privado temporal en la DB real para una prueba e2e completa y el sistema de permisos lo bloqueó (correcto: un revisor no debe mutar datos del founder). Queda la comprobación manual del founder ya anotada en el reporte del implementer.

---

## Resultado de verificación (comandos reejecutados por el revisor)

| Comando | Resultado |
|---|---|
| docker compose build backend | OK (Image rolapp-v1-backend Built) |
| hash host vs imagen de chat.js / chat.test.js | OK idénticos (ddae48ad... / fab94899...) |
| docker compose run --rm --no-deps backend npm run lint | OK exit 0 |
| docker compose run --rm --no-deps backend npm test | OK "# tests 173 # pass 172 # fail 0 # skipped 1", not ok = 0 |
| docker compose build frontend | OK exit 0 (lint + build forzados en el stage) |
| docker build --target build -t tmp-rev3335 ./frontend + docker run --rm tmp-rev3335 npm test | OK "Test Files 16 passed (16)" / "Tests 162 passed (162)" (incluye modal.test.jsx 5 tests) |
| docker rmi tmp-rev3335 | OK eliminada |
| curl -I de /, /index.html, /assets/<hash>.js, /api/health | OK (ver punto 5) |
| Host sin node_modules antes y después | OK frontend/node_modules y backend/node_modules no existen |

- lint:  OK
- build: OK
- test:  OK backend 173 (8 nuevos de F33) / frontend 162 (5 nuevos de F33)

---

## Lecciones aplicadas correctamente

- F22 (vigencia por HASH): aplicada y REVERIFICADA por mí; los hashes coinciden host, imagen y contenedor en ejecución.
- F21 (el servicio backend no monta src/): rebuild antes de cada corrida; confirmado.
- F14 (DELETE FROM de tablas puente en el beforeEach): messages incluido junto a session_events, session_members, sessions, users; ningún test vecino se rompió (173 verdes).
- F20 (vitest sin jsdom): el test del Modal es SSR sobre markup observable + paridad con Sheet; no se simulan clics ni se añadió jsdom.
- F20 (Docker sin ensuciar el host): patrón --target build + --rm + rmi; host limpio.
- F17 (extender un componente compartido sin romper la firma): verificado con grep de los 20 consumidores.
- F27 (headers de caché): reverificados con curl -I real por mí.
- F30 (validar el test por mutación): el implementer documentó 6/8 en rojo contra el código roto; coherente con el diseño de los tests que leí.

---

## Puntos a corregir

Ninguno bloqueante.

---

## Observaciones (no bloqueantes)

1. Riesgo de ORDEN latente entre chat:history y session:join. React ejecuta los efectos de los HIJOS antes que los del padre. Hoy no se dispara porque SessionView arranca con activeTab='players' y ChatPanel no está montado en t=0, pero si alguien pusiera el chat como pestaña inicial, ChatPanel emitiría chat:history ANTES de que SessionView emita session:join: con el nuevo fail-closed el usuario legítimo vería SOLO los públicos, en silencio. Candidato a backlog: reemitir el historial tras el ack del join (por ejemplo al recibir session:users).
2. La cadena de identidad no es más fuerte que session:join. socket.data.userId sale del user.id que manda el cliente, sin token de autenticación. Es el modelo preexistente de toda la app (canvas.js confía en lo mismo para el gating del DM) y F33 no lo empeora, pero mientras siga así un cliente malicioso puede unirse como otro usuario y leer sus susurros. Merece entrada de backlog si el founder quiere privacidad real y no solo frente a clientes honestos.
3. chat:message sigue tomando "from" del payload (remitente suplantable). Preexistente, fuera del alcance de F33.
4. El reporte del implementer dice "22 usos" del Modal; el conteo real es 20 en 13 archivos. Inexactitud cosmética; la conclusión (cero regresión) es correcta.
5. Ningún test asserta explícitamente el LIMIT 200 (sí las columnas y el orden). Barato de añadir si se quiere blindar el contrato entero.
6. Los contenedores en ejecución vienen del "up -d --build" que hizo el implementer a mitad de sesión (horneó trabajo de F35 aún en curso). Yo reconstruí ambas imágenes pero NO recreé los contenedores. Tras commitear las dos features conviene "docker compose up -d --build".

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)

1. Backend/Socket.io: la identidad del solicitante sale de socket.data, nunca del payload; y sin identidad, fail-closed. (Propuesta del implementer; la suscribo y añado el método de revisión: grep -rn "socket\.data\." en todo el backend para enumerar las ESCRITURAS de la identidad y probar que el cliente no puede alcanzarlas por otra vía.)
2. Testing: dos caminos a los mismos datos = dos superficies de autorización (emit en vivo vs historial). Hermana de la lección F24 (grafo vs lista).
3. Frontend/React: el efecto del HIJO corre ANTES que el del padre, ojo al volver fail-closed un handler. Cuando un handler pasa a depender de un estado que fija otro evento (aquí session:join), cualquier consumidor que emita desde el efecto de un componente hijo puede adelantarse y recibir la respuesta degradada EN SILENCIO. Al endurecer un handler, revisa quién lo emite y en qué orden se montan.

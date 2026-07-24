# Implementación: F27 — nginx cache headers (no más hard-refresh)
Fecha: 2026-07-23
Status: completado

## Alcance
Solo config de nginx del frontend. CERO código de app, CERO cambios en Dockerfile ni docker-compose.yml.

## Archivo de config tocado
- `frontend/nginx.conf`: el `frontend/Dockerfile` hace `COPY nginx.conf /etc/nginx/conf.d/default.conf`
  en la imagen final (nginx:alpine). Es el único `.conf` de la imagen servida.

## Diff conceptual (bloques añadidos)
Se añadieron dos `location` nuevos y un `add_header` en el fallback; se conservó TODO lo existente
(SPA fallback, proxy `/api`, proxy `/socket.io` con Upgrade/Connection, listen/root/index).

- **`location /assets/`** (NUEVO): `add_header Cache-Control "public, max-age=31536000, immutable";`
  + `try_files $uri =404;` — los assets de Vite llevan hash en el nombre, así que son cacheables
  para siempre.
- **`location = /index.html`** (NUEVO): `add_header Cache-Control "no-cache";` — cubre el acceso
  directo a `/index.html`; el navegador revalida siempre y no sirve un bundle viejo.
- **`location /`** (MODIFICADO): se añadió `add_header Cache-Control "no-cache";` ANTES del
  `try_files $uri $uri/ /index.html;` existente (que se conservó intacto). Doble red de seguridad:
  la raíz `/` y el fallback del SPA sirven index.html revalidado sin depender de que el redirect
  interno vuelva a resolver en `= /index.html`.

Nota sobre herencia de `add_header` (punto 3 del encargo): nginx NO hereda los `add_header` de un
scope superior cuando el `location` define los suyos. Por eso cada `location` relevante lleva
explícitamente el header que le toca (assets → immutable; index/fallback → no-cache). Verificado que
la respuesta de `/` trae UN solo `Cache-Control` (no duplicado): al resolver el redirect interno en
`= /index.html`, solo aplica el header de ese bloque.

## Verificación (entorno canónico Docker)
- `docker compose build frontend` → **exit 0** (lint + build del frontend forzados en el build stage).
  El step `COPY nginx.conf` corrió fresco (no cache) → la config nueva está en la imagen.
- `docker compose up -d frontend` → contenedor recreado (Recreated/Started).
- **Vigencia por hash (host == imagen):**
  - host   : `8a1b3e1f20b4368ff595d1b5d18cb12a04afeb77b90a3de3e232f650482d9396`
  - imagen : `8a1b3e1f20b4368ff595d1b5d18cb12a04afeb77b90a3de3e232f650482d9396`
  (coinciden → la config servida es la nueva)
- Sin `frontend/node_modules` residual (no se corrió npm en el dir montado).

### Salida real de los curl -I

1) index.html (raíz) → `no-cache`:
```
$ curl -sI http://localhost:3000/
HTTP/1.1 200 OK
Server: nginx/1.31.3
Content-Type: text/html
Content-Length: 929
Cache-Control: no-cache
Accept-Ranges: bytes
```

2) status de `/`:
```
$ curl -s -o /dev/null -w '%{http_code}' http://localhost:3000/
200
```

3) asset real con hash → `immutable` / max-age largo:
```
$ ASSET=$(curl -s http://localhost:3000/ | grep -o '/assets/[^"]*\.js' | head -1)  # /assets/index-D_sQKvyU.js
$ curl -sI http://localhost:3000/assets/index-D_sQKvyU.js
HTTP/1.1 200 OK
Content-Type: application/javascript
Content-Length: 436941
Cache-Control: public, max-age=31536000, immutable
Accept-Ranges: bytes
```

4) `/api` sigue proxeando al backend (JSON con `ready`):
```
$ curl -s http://localhost:3000/api/ai/status
{"provider":"ollama","model":"qwen2.5:3b","embedProvider":"ollama","toolsEnabled":false,
 "vecEnabled":true,"ftsEnabled":true,"llm":{"ok":true,...},"embeddings":{"ok":true,...},"ready":true}
```

## Resultado de verificación
- lint:  ✅ (forzado en `docker compose build frontend`, exit 0)
- build: ✅ (idem, exit 0)
- test:  No aplica (feature de infra; sin lógica JS testeable)
- Manual / e2e: ✅ (curl -I: index.html→no-cache, asset→immutable, /→200, /api→ready)

## Checklist del encargo
- [x] `index.html` → `Cache-Control: no-cache` (revalida siempre)
- [x] `/assets/*` → `Cache-Control: public, max-age=31536000, immutable`
- [x] SPA fallback `try_files $uri $uri/ /index.html` conservado
- [x] Proxy `/api` conservado (verificado: devuelve JSON con `ready`)
- [x] Proxy `/socket.io` con `proxy_http_version 1.1` + `Upgrade`/`Connection` conservado
- [x] `listen`/`root`/`index` sin cambios
- [x] Sin duplicar headers que rompan (verificado: un solo `Cache-Control` por respuesta)
- [x] Dockerfile y docker-compose.yml sin tocar
- [x] Imagen reconstruida + recreada + vigencia probada por hash
- [x] Sin `node_modules` residual

## Lecciones aplicadas
- **"Prueba que la imagen está al día por HASH"** (Docker/infra): comparé `sha256sum` de
  `frontend/nginx.conf` (host) contra `/etc/nginx/conf.d/default.conf` (imagen) → coinciden, así que
  los curl corren contra la config nueva, no una vieja.
- **"Cada servicio con imagen Docker necesita .dockerignore / no dejar node_modules residual"**:
  no corrí npm en el dir montado; confirmé que no hay `frontend/node_modules`.
- **"El lint/test debe poder correr en Docker"**: usé `docker compose build frontend` como el
  checkpoint canónico de lint+build (no hay Node en el host).

## Decisiones tomadas
- Puse el `no-cache` en DOS sitios (`location = /index.html` y `location /`) a propósito, como red
  de seguridad ante distintas rutas de resolución de nginx (acceso directo a `/index.html`, raíz `/`,
  y rutas del SPA). Verificado con curl que NO produce header duplicado (nginx aplica solo el
  `add_header` del location final que resuelve la respuesta).
- Añadí `try_files $uri =404;` dentro de `location /assets/` para que un asset inexistente devuelva
  404 y no caiga al fallback del SPA (que le daría 200 con HTML y el header immutable equivocado).
- Sin dependencias nuevas.

## Candidatos para LEARNINGS.md (el líder decide)
- **SPA en nginx: index.html no-cache + /assets/ immutable, y el `add_header` no se hereda.** Para
  una SPA con assets hasheados por Vite: `location = /index.html` (y el fallback `location /`) con
  `Cache-Control: no-cache`, y `location /assets/` con `public, max-age=31536000, immutable`. Recordar
  que un `location` con `add_header` propio NO hereda los de scopes superiores, y que un redirect
  interno hace que solo aplique el `add_header` del location que resuelve la respuesta (no se
  duplican). Añadir `try_files $uri =404` en `/assets/` para no servir HTML del SPA como si fuera un
  asset. Verificar SIEMPRE con `curl -I` los headers reales, no solo leer el .conf.

## Bloqueantes
Ninguno.

# Llevar RolApp a internet — diagnóstico y plan

> Pregunta del founder (2026-08-07): *"¿qué tan difícil sería tener una versión completa en
> línea?"* → y tras el primer diagnóstico: *"¿y si lo hacemos sin IA, y el auth en Supabase?
> Seguiría siendo de uso personal para mi mesa, no para hacer suscripciones."*
>
> Este documento planifica esa variante. **Nada está aprobado ni dado de alta en
> `feature_list.json`**; las preguntas abiertas están en la §10.

---

## 1. Respuesta corta

RolApp ya es una app web cliente/servidor con `docker-compose.yml`. Ponerla en un servidor es
una tarde. Lo que la separa de internet no es arquitectura, es **seguridad**: la identidad del
usuario viaja en el body de cada request y el servidor le cree al cliente.

La variante elegida ataca eso por el camino más barato: **quitar la IA generativa** (un tercio
del backend) y **delegar la autenticación en Supabase Auth**, conservando el backend Express,
SQLite y Socket.io tal como están.

---

## 2. Alcance: mesa privada, no producto

| | **Esto** | Lo que NO es |
|---|---|---|
| Quién entra | la mesa del founder, gente conocida | registro público |
| Confianza | usuarios semi-confiables | cero confianza |
| Coste | 5-10 USD/mes (VPS) + dominio | facturación, cuotas, planes |
| Trabajo | ~6 features del tamaño habitual | meses |

Todo lo que se haga aquí sirve igual si algún día se quisiera un producto. Nada hay que
deshacerlo.

---

## 3. Estado actual

### 3.1 Ya resuelto (más de lo que parece)

| Pieza | Dónde | Por qué importa |
|---|---|---|
| Rutas compartibles + sesión persistente + vista espectador | F31 | hay URLs que mandar y un F5 ya no te expulsa |
| Despliegue reproducible | `docker-compose.yml` | el mismo comando en el VPS |
| Cabeceras de caché correctas | `frontend/nginx.conf` (F27) | tras un deploy nadie sirve un bundle viejo |
| **Un solo embudo de red en el cliente** | `frontend/src/lib/api.js:2` | meter el token es **un** cambio, no 358 líneas |
| **Un solo cliente de socket** | `frontend/src/lib/socket.js:4` | ídem para el handshake |
| **Identidad en el socket, no en el mensaje** | `socket.data.userId` (`sockets/session.js:53`), consumido por `canvas.js:35` y `chat.js:37` | el patrón correcto ya existe y está probado (F33) |
| Migraciones idempotentes con guard `PRAGMA` | `db/index.js:68` (M001-M003) | M004 sigue el molde de F22 |

Esas filas son las que hacen que esto sean semanas y no meses.

### 3.2 Los huecos

**🔴 1. La identidad viaja en el body.** [auth.js](../../backend/src/routes/auth.js) hashea el
PIN con SHA-256 **sin sal**, no emite token y no mantiene sesión. Cada endpoint le cree al
cliente:

```js
// backend/src/routes/canvas.js:22
const { dm_id, image_url = null } = req.body ?? {};
if (String(session.dm_id) !== String(dm_id)) return res.status(403)…
```

Ese `403` no protege nada: quien manda el `dm_id` es el atacante. El patrón está en 12 sitios
(`baseCharacters`, `characters` ×4, `gameSystems`, `items` ×3, `skills` ×3) y el resto de
routers directamente no comprueba. El socket está mejor (fija `socket.data.userId` en
`session:join`), pero ese `join` acepta el `user` que le pasa el cliente — mismo problema un
nivel más arriba.

**🔴 2. Sin alcance por usuario.** `api.listSessions()` pide `/sessions?status=active` **sin
decir quién pregunta**: devuelve las sesiones de todo el mundo. Los catálogos son casi
globales porque hoy solo hay un DM.

**🟡 3. Superficie HTTP sin endurecer.** `index.js`: `cors()` abierto, `io` con `origin: '*'`,
sin `helmet`, sin rate limiting, sin límite de body.

**🟡 4. Cero backups.** La base es un archivo (`./data/rolapp.db`) sin ninguna copia.

**🟢 5. No es problema.** No hay subida de archivos (el canvas guarda una `image_url`, no
bytes) → no hace falta object storage. Socket.io en un proceso con rooms por sesión sobra
para esta escala.

---

## 4. Decisión A — quitar la IA generativa, conservar la búsqueda

Medido en el repo:

| | líneas |
|---|---|
| IA/RAG en producción (`ai.js`, `aiTools.js`, `embeddings.js`, `rag.js`, router, socket) | 2.289 |
| sus tests | 1.388 |
| **backend entero sin tests** | **6.802** |

Es **un tercio del backend**. Con ello se van: Ollama, el perfil `ai` del compose,
`ai-bootstrap`, `sqlite-vec`, `doc_chunks`, el `proxy_read_timeout 300s` de nginx, el único
coste variable del proyecto y la razón principal para necesitar rate limiting agresivo.

**Justificación:** según `progress/current.md`, el runtime de IA lleva desde julio en
"pendiente solo del founder" y **nunca corrió en vivo de verdad**; F21 y F26 se gastaron
enteras en afinar el tono de un modelo apenas usado. Es la peor relación valor/mantenimiento
del proyecto.

**Lo que NO se tira: la búsqueda sobre las reglas.** Los 14 MDs ingeridos en F23 valen.
Se conserva `game_docs` + FTS (`ftsEnabled` ya está activo y no necesita Ollama ni vectores):
buscas "regla de sorpresa" y devuelve el pasaje del manual en vez de una respuesta generada.
~90% del valor real con ~10% del código.

Frontera exacta:

| Fuera | Dentro |
|---|---|
| `services/ai.js`, `aiTools.js`, `embeddings.js` | `game_docs`, ingesta y troceado |
| `sockets/ai.js` y el streaming de `lib/socket.js` | `hybridSearch` degradado a FTS puro |
| `AIPanel.jsx`, tab IA de `SessionDetail`, presets | endpoint de búsqueda de reglas |
| `doc_chunks`, `sqlite-vec`, embeddings | `session_summaries` (la tabla; se escriben a mano) |

---

## 5. Decisión B — Supabase **solo** para autenticación

### 5.1 Qué se delega y qué no

Supabase Auth emite el JWT; **el backend Express lo verifica y sigue siendo el dueño de todos
los datos**. No se usa la base de datos de Supabase, ni Realtime, ni RLS, ni storage.

Lo que esto compra: hashing de contraseñas serio, sesiones, refresh de token, reset de
contraseña, verificación de email — es decir, exactamente la parte de "hacer auth" que es
aburrida, arriesgada y fácil de hacer mal. Lo que cuesta: una dependencia externa y el
principio local-first (§7).

**Se descarta migrar todo a Supabase** (Postgres + Realtime + RLS): los 24 routers y las 975
líneas de servicios (`stats`, `gamePack`, `planning`, `skillsImport`) tendrían que mudarse al
cliente o a funciones de Postgres, más políticas RLS para 49 tablas, más migrar los datos
reales (91 habilidades, 136 items, 56 hechizos, la sesión demo). Es la misma lógica cambiada
de casa: una reescritura, no una simplificación.

### 5.2 El núcleo del diseño: el id local sobrevive

`users.id` es `INTEGER PRIMARY KEY AUTOINCREMENT` y está referenciado por **17 claves foráneas**
repartidas por el esquema. Sustituirlo por el `uuid` de Supabase obligaría a tocarlas todas.

**No se sustituye.** El `users` local se queda como está y se le añade el enlace:

```sql
-- M004_supabase_link (idempotente, guard PRAGMA como M003)
ALTER TABLE users ADD COLUMN supabase_uid TEXT UNIQUE;  -- nullable
ALTER TABLE users ADD COLUMN email TEXT;
-- pin_hash pasa a nullable (columna nueva + copia + swap, patrón SQLite)
```

En el primer login, el middleware busca `WHERE supabase_uid = ?`; si no hay fila, la
provisiona. Los usuarios actuales (el founder y sus jugadores: un puñado) se enlazan a mano
por `username`.

**Consecuencia: cero cambios en FKs, cero migración de datos, y `req.user.id` sigue siendo el
entero que los 24 routers ya esperan.** Esto es lo que hace barata la opción.

### 5.3 Verificación del token — claves asimétricas, sin secretos en el backend

Supabase soporta firmar con claves asimétricas (ES256) y publica **solo la clave pública** en
un endpoint JWKS: `https://<project-ref>.supabase.co/auth/v1/jwks`. El backend verifica
contra él y **nunca almacena un secreto** — solo la URL del proyecto. Preferible al `JWT
secret` compartido (HS256) heredado: la rotación de claves no obliga a redesplegar.

```js
// backend/src/middleware/auth.js  (boceto)
import { createRemoteJWKSet, jwtVerify } from 'jose';
const JWKS = createRemoteJWKSet(new URL(`${SUPABASE_URL}/auth/v1/jwks`)); // cachea y rota solo

export async function verifyToken(token) {
  const { payload } = await jwtVerify(token, JWKS, { audience: 'authenticated' });
  return payload.sub;              // uuid de Supabase
}

export async function requireAuth(req, res, next) {
  const token = req.headers.authorization?.slice(7);
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const uid = await verifyToken(token);
    req.user = findOrProvisionUser(uid);   // → { id: INTEGER, username, role }
    next();
  } catch { res.status(401).json({ error: 'Token inválido' }); }
}
```

`jose` es la única dependencia nueva del backend. **Nota:** `verifyToken` es `async` y
`better-sqlite3` es síncrono — no hay conflicto (el await está en el middleware, las queries
siguen síncronas), pero conviene decirlo porque contradice en apariencia la convención de
`architecture.md`.

### 5.4 Socket: autenticar en el handshake, no en el `join`

```js
// backend/src/sockets/index.js
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next();                    // sin token → solo puede espectar (TV)
  try {
    socket.data.userId = findOrProvisionUser(await verifyToken(token)).id;
    next();
  } catch { next(new Error('Token inválido')); }
});
```

`session:join` **deja de aceptar el `user` del payload** (`SessionView.jsx:37`). Los handlers
que ya leen `socket.data.userId` (`canvas.js:35`, `chat.js:37`) no cambian ni una línea: es la
lección de F33 aplicada un nivel más arriba. La vista TV entra sin token y conserva su camino
de solo lectura.

### 5.5 Frontend: dos archivos

- `lib/api.js:2` — el embudo `request()` añade `Authorization: Bearer …`. **Un cambio.**
- `lib/socket.js:4` — `io({ autoConnect: false, auth: (cb) => cb({ token }) })`. Como `auth`
  admite función, se re-evalúa en cada reconexión → token refrescado gratis.
- `pages/Login.jsx` se reescribe contra `@supabase/supabase-js` (email + contraseña).
- **Ninguna otra página se entera.** El refresh del token lo gestiona `supabase-js` solo.

La `anon key` va en el bundle: es correcto y es el diseño de Supabase. La `service_role` key
no aparece en ninguna parte, ni en el frontend ni en el backend.

### 5.6 El PIN se retira

Un solo camino de acceso. Mantener el login por PIN en paralelo sería un bypass de todo lo
anterior. `pin_hash` queda nullable y se elimina en una limpieza posterior.

---

## 6. Hosting

VPS pequeño (Hetzner/DigitalOcean, 5-10 USD/mes) **con volumen persistente** y **Caddy**
delante para TLS automático. Se descarta PaaS con filesystem efímero (Render/Railway gratis,
Vercel): borraría `rolapp.db`. Alternativa aceptable: Cloudflare Tunnel, que evita abrir
puertos.

**SQLite se queda.** Con WAL, en disco persistente, sobra para esta escala. Solo se rompería
al querer dos instancias — cosa que no va a pasar. Migrar a Postgres sería reescribir cada
`db.prepare` de 24 routers y 19 servicios a async por cero beneficio hoy.

---

## 7. ⚠️ Consecuencia arquitectónica que hay que aceptar explícitamente

El principio **nº1 de `architecture.md` es "local-first: nada exige internet en mesa"**.
Supabase Auth lo rompe: sin internet no hay login.

Pero seamos honestos sobre quién lo rompe primero: **si el backend vive en un VPS, la mesa ya
depende de internet para todo**. El principio muere con el hosting, no con Supabase.

Hay que decidir una de estas dos y escribirlo en `architecture.md`:

- **(a)** Retirar el principio nº1. RolApp pasa a ser una app en línea, punto.
- **(b)** Mantener el despliegue LAN por `docker compose` como modo soportado en paralelo —
  lo que obliga a conservar dos caminos de autenticación, justo lo que la §5.6 descarta.

**Recomendación del líder: (a).** La opción (b) duplica la superficie de auth para un caso
—jugar sin internet— que hoy no ocurre.

---

## 8. Desglose en features propuestas

| ID | Feature | Alcance | Riesgo |
|---|---|---|---|
| **F37** | `drop-ai-keep-search` | Retirar generación LLM, embeddings, `sqlite-vec`, `doc_chunks`, Ollama del compose y `AIPanel`. Conservar `game_docs` + búsqueda FTS con su endpoint. −2.289 líneas de producción, −1.388 de tests. | 🟢 bajo |
| **F38** | `supabase-auth` | Proyecto Supabase + M004 (`supabase_uid`, `email`, `pin_hash` nullable) + `jose`/JWKS + `requireAuth` + `io.use()` + `Login.jsx` + los 2 cambios de `lib/`. **Sin tocar aún los routers.** | 🔴 alto |
| **F39** | `identity-from-token` | Barrido de los 24 routers y 5 handlers: identidad desde `req.user`/`socket.data`, nunca del body. **Test de suplantación por router** (mandar un `dm_id` ajeno debe dar 403). | 🔴 alto |
| **F40** | `scoping-por-usuario` | Cada listado filtrado por dueño, empezando por `listSessions`. Política de qué es compartido y qué privado. | 🟡 medio |
| **F41** | `http-hardening` | `helmet`, CORS por lista blanca en Express **y** en Socket.io, rate limiting en `/api/auth`, límite de body. | 🟢 bajo |
| **F42** | `deploy-vps` | Caddy + `docker-compose.prod.yml` + `.env` de producción + backup diario con **restauración probada**. | 🟡 medio |

Notas de ejecución:

- **F37 va primero** y a propósito: cada línea que se borra es una línea que F39 no tiene que
  auditar.
- **F38 y F39 se separan** para que el reviewer valide el mecanismo antes de propagarlo a 29
  archivos.
- **F39 rompe la suite entera.** Los ~160 tests del backend mandan identidad en el body; hay
  que actualizarlos. Contarlo en la estimación, no descubrirlo a mitad.
- Un backup no verificado no es un backup: F42 incluye **restaurar**, no solo generar.

---

## 9. Costes

| Concepto | Coste |
|---|---|
| VPS 2 vCPU / 4 GB con volumen | 5-10 USD/mes |
| Dominio | ~12 USD/año |
| Supabase (solo Auth, uso personal) | **0** — muy por debajo del plan gratuito |
| IA | **0** — eliminada en F37 |

Sin la IA no queda **ningún coste variable**. Ese es el segundo mejor argumento de la §4,
después de las 3.677 líneas.

---

## 10. Qué necesita decidir el founder

1. ¿Se confirma **retirar la IA generativa conservando la búsqueda FTS** (§4)? Es lo único
   que borra funcionalidad; el resto solo cambia cómo se entra.
2. ¿**(a)** retirar el principio local-first o **(b)** mantener el despliegue LAN en paralelo?
   (§7 — recomendación: (a)).
3. ¿Se dan de alta F37-F42, o solo el bloque F37+F38 para empezar?
4. Proveedor de VPS y dominio.

Hasta que eso se responda, nada de esto entra en `feature_list.json`.

---

## 11. Referencias

- [Supabase — JWT Signing Keys](https://supabase.com/docs/guides/auth/signing-keys)
- [Supabase — JSON Web Tokens](https://supabase.com/docs/guides/auth/jwts)
- Contraste con `rolapp-lite`: allí Supabase lleva datos, auth y realtime **porque no hay
  backend**. Aquí solo lleva auth, porque el backend existe, funciona y está testeado.

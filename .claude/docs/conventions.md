# Convenciones de código — RolApp v1.0

> El implementer las sigue al pie de la letra. El reviewer las verifica.

---

## General

- **Idioma:** código (variables, funciones, componentes) en **inglés**; comentarios y reportes en **español**.
- **Módulos:** ESM (`import`/`export`), no CommonJS.
- **Comentarios:** explican el *por qué*, no el *qué*. Sin comentarios que narren código obvio.
- **Sin `console.log` de debug.** Logging intencional vía el logger del proyecto.
- Nombres descriptivos. Una función / un componente = una responsabilidad.

---

## Backend (Node + Express)

- Cada dominio tiene su router en `backend/src/routes/<dominio>.js`, registrado en `index.js`.
- Lógica no trivial → `backend/src/services/`. Los routers quedan delgados.
- **better-sqlite3 síncrono:** `const stmt = db.prepare('…'); stmt.get(id)`. Nunca async/await sobre él.
- **Prepared statements siempre.** Nunca interpolar valores en el SQL.
- Transacciones con `db.transaction(fn)()` para operaciones multi-tabla.
- Respuestas JSON con shape consistente: éxito `{ data }` o `{ <recurso> }`; error `{ error: 'mensaje' }` + código HTTP correcto.
- Validar input al inicio del handler; responder 400 con mensaje claro si falta algo.

---

## Frontend (React + Vite + Tailwind)

- **Estilos solo con Tailwind** + tokens de `tailwind.config.js`. **Prohibido** `const s = {…}` con estilos inline.
- **Responsive con breakpoints** (`sm: md: lg:`). **Prohibido** `window.innerWidth` / `useWindowWidth`.
- Componentes funcionales con hooks. Un componente por archivo.
- UI reutilizable (Button, Card, Modal, Tab, Sheet…) en `components/ui/`; componentes de dominio aparte.
- Llamadas a API centralizadas en `lib/api.js`; socket en `lib/socket.js`.
- Mobile-first: escribe primero el estilo móvil, luego sobreescribe con `md:`/`lg:`.

---

## SQL / esquema

- snake_case para tablas y columnas.
- Toda tabla con `id INTEGER PRIMARY KEY AUTOINCREMENT` salvo tablas puente (PK compuesta).
- Timestamps `created_at INTEGER NOT NULL DEFAULT (unixepoch())`.
- FKs explícitas con `ON DELETE` apropiado.
- Cambios de esquema → migración con nombre `Mxxx_descripcion` en `db/index.js`.

---

## Commits

- Mensajes en español, imperativos: `feat: …`, `fix: …`, `refactor: …`, `chore: …`.
- Un commit por feature lógica cuando sea posible.

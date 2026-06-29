# Checkpoints — criterios de "feature terminada"

> El reviewer usa esta lista como checklist antes de aprobar cualquier feature.
> Una feature solo es `done` cuando **todos** los checkpoints aplicables están en verde.

---

## Checklist obligatorio

### Build y lint
- [ ] Lint backend pasa EN EL CONTENEDOR: `docker compose exec backend npm run lint` (la imagen backend incluye devDependencies a propósito).
- [ ] Lint + build frontend pasan vía `docker compose build frontend` (forzados en el build stage con `RUN npm run lint` y `RUN npm run build`).
- [ ] Prohibido declarar "lint ✅" sin ejecutarlo en el contenedor.
- [ ] No hay código comentado sin explicación de por qué.
- [ ] No hay `console.log` de debug olvidados (sí se permite logging intencional vía el logger del proyecto).

### Código y patrones del proyecto
- [ ] `better-sqlite3` se usa de forma **síncrona** (sin async/await sobre sus métodos).
- [ ] Se usan **prepared statements** (`db.prepare(...)`), no concatenación de SQL.
- [ ] El log `session_events` se trata como **append-only** (nunca UPDATE/DELETE).
- [ ] Frontend: estilos **solo** con clases Tailwind + tokens. Cero `const s = {…}` inline.
- [ ] Frontend: responsive con breakpoints de Tailwind. Cero `window.innerWidth`.
- [ ] Nombres descriptivos en inglés; funciones/módulos con una sola responsabilidad.
- [ ] No hay dependencias circulares entre módulos.

### Tests
- [ ] Existe al menos un test por función/módulo público nuevo no trivial.
- [ ] Todos los tests pasan (`npm test`).
- [ ] Los tests cubren el caso feliz y al menos un caso de error.

### Arquitectura
- [ ] La feature respeta la estructura de carpetas en `.claude/docs/architecture.md`.
- [ ] No se instalaron dependencias nuevas sin documentarlas en el reporte y en `architecture.md`.
- [ ] Si se modificó el esquema o se creó una migración, el cambio está documentado.
- [ ] Si el endpoint es nuevo, la ruta sigue la convención REST del proyecto.

### Learnings
- [ ] Si se tomó una decisión técnica no trivial, se propuso una lección para `.claude/LEARNINGS.md`.

### Reporte
- [ ] El implementer escribió `.claude/progress/impl_<feature-id>.md` con los archivos tocados.
- [ ] El reviewer escribió `.claude/progress/review_<feature-id>.md` con el resultado del checklist.

---

## Criterios de rechazo automático

El reviewer rechaza sin negociación si:
- `npm run lint` o `npm run build` fallan.
- Hay tests en rojo.
- Se modificaron archivos fuera del scope declarado de la feature.
- Falta el reporte del implementer en `.claude/progress/`.
- Hay estilos inline (`const s = {…}`) o `window.innerWidth` en frontend nuevo.
- Se usó async/await sobre `better-sqlite3`.

---

## Qué hace el líder con un rechazo

1. Lee el reporte del reviewer en `.claude/progress/review_<feature-id>.md`.
2. Actualiza `.claude/progress/current.md` con los puntos a corregir.
3. Lanza el implementer nuevamente con las correcciones específicas como contexto.
4. No cierra la feature hasta que el reviewer apruebe.

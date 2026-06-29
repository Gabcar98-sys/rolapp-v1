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

---

## RAG / embeddings / sqlite-vec

> Aún no hay lecciones en esta categoría.

---

## Backend / Express / Socket.io

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

---

## Arquitectura

> Aún no hay lecciones en esta categoría.

---

## Testing

> Aún no hay lecciones en esta categoría.

---

## Docker / infraestructura

> Aún no hay lecciones en esta categoría.

---

## Proceso y flujo de trabajo

> Aún no hay lecciones en esta categoría.

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

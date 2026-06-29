# Mapa del repositorio para agentes — RolApp v1.0

> Lee este archivo primero. Te dice dónde está todo y qué significa cada cosa.
> No te lo aprendas de memoria — úsalo como referencia cuando necesites orientarte.

---

## Estructura del proyecto

```
/
├── backend/                  → Node + Express + Socket.io
│   ├── src/
│   │   ├── index.js          → bootstrap (express + socket.io)
│   │   ├── db/
│   │   │   ├── index.js      → conexión better-sqlite3, carga sqlite-vec, migraciones
│   │   │   └── schema.sql    → esquema consolidado
│   │   ├── routes/           → routers Express (un archivo por dominio)
│   │   ├── services/         → lógica de negocio (RAG, stats, summaries…)
│   │   └── sockets/          → handlers de Socket.io (presencia, canvas, chat, eventos)
│   ├── package.json
│   └── Dockerfile
│
├── frontend/                 → React + Vite + Tailwind
│   ├── src/
│   │   ├── main.jsx
│   │   ├── App.jsx
│   │   ├── pages/            → vistas (Login, Lobby, Session…)
│   │   ├── components/       → componentes UI reutilizables + de dominio
│   │   ├── lib/              → socket.js, api.js, helpers
│   │   └── styles/           → index.css (directivas Tailwind)
│   ├── tailwind.config.js    → tokens de diseño (colores, spacing, breakpoints)
│   ├── vite.config.js        → proxy /api y /socket.io al backend
│   ├── package.json
│   └── Dockerfile
│
├── game-packs/               → packs JSON de juegos (ejemplos importables, NO seeds en código)
│
├── docker-compose.yml
│
└── .claude/
    ├── CLAUDE.md             → Reglas del líder (se carga automáticamente)
    ├── AGENTS.md             → Este archivo — mapa de navegación
    ├── CHECKPOINTS.md        → Criterios de "feature bien terminada"
    ├── LEARNINGS.md          → Lecciones acumuladas del proyecto
    ├── feature_list.json     → Lista de features con su estado actual
    │
    ├── agents/
    │   ├── lider.md          → Orquestador: planifica y coordina (= rol de la sesión principal)
    │   ├── implementer.md    → Desarrollador: escribe código JS y tests
    │   ├── reviewer.md       → Revisor: valida código contra CHECKPOINTS.md
    │   └── consultor.md      → Asesor técnico: recomienda stack, arquitectura
    │
    ├── docs/
    │   ├── architecture.md   → Decisiones técnicas (stack, patrones, modelo de datos)
    │   ├── conventions.md    → Convenciones de código JS/React
    │   └── verification.md   → Cómo demostrar que una feature funciona
    │
    └── progress/
        ├── current.md        → Estado vivo de la sesión activa (el líder lo mantiene)
        ├── history.md        → Bitácora append-only de sesiones cerradas
        ├── impl_*.md         → Reportes del implementer por feature
        └── review_*.md       → Reportes del reviewer por feature
```

---

## LEARNINGS.md — el archivo más importante del harness

`.claude/LEARNINGS.md` es la memoria acumulada del equipo. Contiene lecciones reales
aprendidas durante el desarrollo de este proyecto.

**Cuándo leerlo:** siempre, antes de tomar cualquier decisión técnica o de arquitectura.
**Quién escribe en él:** el líder (al cerrar features), el consultor (al tomar decisiones de stack).
**Regla:** los agentes consultan las lecciones antes de actuar, nunca las ignoran.

---

## Estados de una feature

```
pending → in_progress → done
                     ↘ blocked  (requiere decisión del founder)
```

- Solo puede haber **una** feature en `in_progress` a la vez.
- El implementer cambia `pending` → `in_progress` al empezar.
- El implementer cambia `in_progress` → `done` solo si el reviewer aprueba.
- Si el reviewer rechaza, la feature vuelve a `in_progress` con notas de corrección.

---

## Regla de una feature a la vez

El harness funciona con foco total. No se paralelizan features. Esto es intencional:
- Evita conflictos entre archivos.
- Mantiene el contexto del agente limpio.
- Hace el historial de `.claude/progress/` legible para el founder.

---

## Qué hacer si algo no está claro

1. Busca primero en `.claude/docs/architecture.md`, `.claude/docs/conventions.md` y `.claude/LEARNINGS.md`.
2. Si no está documentado, escribe la pregunta en `.claude/progress/current.md` bajo "Preguntas abiertas".
3. No inventes decisiones de arquitectura — espera al founder.

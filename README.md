# RolApp v1.0

App web local para sesiones de rol en persona. El DM la hostea en su máquina y los
jugadores se conectan por red local desde el celular. Soporta **cualquier juego** vía
sistemas de juego configurables (builder in-app + packs JSON).

> Reinicio limpio de la v0 conservando el motor de sesión y planificación.
> Plan completo: [`docs-plan/v1_plan.md`](docs-plan/v1_plan.md).

## Stack

- **Frontend:** React + Vite + Tailwind CSS (mobile-first)
- **Backend:** Node.js + Express + Socket.io
- **DB:** SQLite (better-sqlite3) + sqlite-vec para búsqueda vectorial
- **IA/RAG:** Ollama local (`nomic-embed-text`) u API externa
- **Contenedor:** Docker + docker-compose

## Levantar (camino canónico — no requiere Node local)

```bash
cp .env.example .env
docker compose up --build
```

- App: http://localhost:3000
- API: proxy interno a backend :3001

Con IA local (descarga el modelo de embeddings la primera vez):

```bash
docker compose --profile ai up --build
docker compose exec ollama ollama pull nomic-embed-text
```

## Desarrollo con Node local (opcional)

```bash
cd backend  && npm install && npm run dev     # :3001
cd frontend && npm install && npm run dev     # :5173 (proxya /api y /socket.io a :3001)
```

## Equipo de agentes

Este repo usa un harness de agentes (líder / implementer / reviewer / consultor) en
`.claude/`. Al abrir Claude Code aquí, la sesión actúa como **líder** y delega el código.
Empieza por `.claude/AGENTS.md`.

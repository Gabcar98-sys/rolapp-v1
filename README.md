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

## IA / RAG (opcional, turnkey)

La IA es **híbrida**: por defecto usa **Ollama local**; se puede cambiar a una **API
externa** solo con variables de entorno, sin tocar código (ver `.env.example`).

### Opción A — IA local con Ollama (por defecto)

```bash
# 1) Levanta la app + el servicio ollama (perfil "ai")
docker compose --profile ai up -d --build

# 2) Descarga los modelos (embeddings + LLM local pequeño). Idempotente.
docker compose --profile ai run --rm ai-bootstrap
#   (equivalente: sh scripts/ai-bootstrap.sh, o docker compose exec ollama ollama pull …)
```

Modelos por defecto: `nomic-embed-text` (embeddings, 768 dims) y `qwen2.5:3b` (LLM).
Sobreescríbelos con `EMBED_MODEL` / `AI_MODEL` en tu `.env` (sin editar código).

### Opción B — API externa

En `.env`: `AI_PROVIDER=api`, `EMBED_PROVIDER=api`, `API_KEY=…`, y opcionalmente
`AI_API_BASE_URL` / `AI_MODEL` / `EMBED_MODEL`. Luego `docker compose up -d --build`.

### Verificar el estado de la IA

```bash
curl -s http://localhost:3000/api/health          # motor configurado + flags vec/fts
curl -s http://localhost:3000/api/ai/status        # sondea si LLM y embeddings responden
```

Sin IA levantada, el panel 🤖 muestra "IA no disponible" y los endpoints degradan con
un error claro (503) — la app no se cae.

## Sembrar sistemas de ejemplo + contenido para la IA

Deja el entorno listo con dos sistemas (Stormlight RPG con los 6 pregens de Bridge Nine y
Dragonbane con 2 pregens) y la guía de Stormlight ingerida para el RAG. Es **idempotente**:

```bash
docker compose up -d --build
docker compose exec backend node scripts/seed-examples.js --dm dm
```

- Crea (si falta) un DM `dm` con **PIN por defecto `0000`** — cámbialo desde la app.
- La ingesta de la guía es **resiliente sin Ollama** (deja doc + chunks + FTS; los vectores
  se generan luego con el endpoint de reindex). Detalles y comando de reindex en
  [`game-packs/README.md`](game-packs/README.md).

## Desarrollo con Node local (opcional)

```bash
cd backend  && npm install && npm run dev     # :3001
cd frontend && npm install && npm run dev     # :5173 (proxya /api y /socket.io a :3001)
```

## Equipo de agentes

Este repo usa un harness de agentes (líder / implementer / reviewer / consultor) en
`.claude/`. Al abrir Claude Code aquí, la sesión actúa como **líder** y delega el código.
Empieza por `.claude/AGENTS.md`.

# Arquitectura — RolApp v1.0

> Decisiones técnicas vigentes. El consultor las mantiene (con aprobación del founder).
> El plan completo de la v1.0 está en `docs-plan/v1_plan.md` (copiado de la v0).

---

## Visión

App web local para sesiones de rol en persona. Se hostea en la máquina del DM
(`docker compose up`); los jugadores entran por LAN desde el celular. Sin internet
obligatorio en mesa. Soporta **cualquier juego** vía sistemas de juego configurables.

---

## Stack

| Capa | Tecnología | Notas |
|------|-----------|-------|
| Frontend | React + Vite + Tailwind CSS | mobile-first, tokens en `tailwind.config.js` |
| Backend | Node.js (ESM) + Express + Socket.io | puerto 3001 |
| DB | SQLite + better-sqlite3 (**síncrono**) | extensión `sqlite-vec` para búsqueda vectorial |
| Embeddings | Ollama `nomic-embed-text` (local) | opción API vía `EMBED_PROVIDER` |
| LLM | Ollama u API externa | `AI_PROVIDER` |
| Realtime | Socket.io | presencia, canvas, chat, eventos |
| Contenedor | Docker + docker-compose | nginx en frontend proxya `/api` y `/socket.io` |

---

## Estructura de carpetas

- `backend/src/index.js` — bootstrap Express + Socket.io.
- `backend/src/db/` — `index.js` (conexión, sqlite-vec, migraciones) + `schema.sql`.
- `backend/src/routes/` — un router por dominio (`auth`, `gameSystems`, `sessions`, …).
- `backend/src/services/` — lógica no trivial (RAG, stats, summaries).
- `backend/src/sockets/` — handlers de Socket.io.
- `frontend/src/pages/` — vistas. `components/` — UI reutilizable + dominio. `lib/` — api/socket. `styles/` — Tailwind.
- `game-packs/` — packs JSON de juegos (importables; NO seeds en código).

---

## Principios

1. **Local-first.** Nada exige internet en mesa.
2. **Cero contenido de juego hardcodeado.** Los juegos son dato (DB + packs JSON), nunca migraciones ni catálogos `.js`.
3. **Mobile-first.** Jugadores en celular; DM en pantalla grande.
4. **El motor de planificación es el activo** (grafo de eventos con ramas/enlaces). Se porta de la v0.
5. **La IA accede a datos estructurados**, no a volcados de texto.

---

## Convenciones de datos clave

- `better-sqlite3` es **síncrono** — sin async/await sobre él.
- `session_events` es **append-only**.
- Migraciones: tabla `_migrations` (name único); baseline = `schema.sql` consolidado.

---

## Decisiones técnicas tomadas

| Fecha | Decisión | Justificación |
|-------|----------|---------------|
| 2026-06-29 | Repo nuevo en `C:\Users\gabri\dev\rolapp-v1`, fuera de OneDrive | Evitar sync de node_modules en OneDrive |
| 2026-06-29 | Mantener React+Vite+Express+Socket.io+SQLite de la v0 | Stack probado para LAN local-first |
| 2026-06-29 | Tailwind + tokens en vez de estilos inline | Sistema de diseño, mobile-first real |
| 2026-06-29 | `sqlite-vec` para vectores (no coseno en memoria) | KNN real en SQL, scoping por game system |
| 2026-06-29 | Juegos data-driven: builder in-app + packs JSON | Soportar cualquier juego sin hardcode |

> Decisiones pendientes: estado global frontend (Context vs Zustand), runner de tests
> (node:test vs vitest), formato exacto del game pack JSON. Se resolverán vía consultor.

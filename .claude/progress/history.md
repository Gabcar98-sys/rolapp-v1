# Historial de sesiones — bitácora append-only

> El líder agrega una entrada al cerrar cada feature. Nunca se edita lo ya escrito.

---

## 2026-06-29 — F0-scaffold (DONE)

Bootstrap del repo v1.0 por el founder. Andamiaje funcional verificado con Docker.

- **Backend:** Express+Socket.io, SQLite (better-sqlite3) + sqlite-vec con degradación elegante, auth DM/player con PIN SHA-256, `/api/health`.
- **Frontend:** React+Vite+Tailwind con tokens (identidad oscura/dorada), login mobile-first funcional, proxy nginx.
- **Infra:** docker-compose (backend+frontend, ollama opcional con profile `ai`), Dockerfiles, .env.example.
- **Harness de agentes** portado desde la v0 y adaptado a JS.
- **Verificación:** build OK, up OK, `vecEnabled:true` (sqlite-vec v0.1.9), register/login/401/frontend OK.
- Commit inicial: f253485.
- Próxima: F1-schema (bajo el harness).

# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.
> Cuando una sesión cierra (feature completada o bloqueada), el líder
> mueve el resumen a `.claude/progress/history.md`.

---

## Sesión actual

Bootstrap del repo v1.0 (founder). Portado el harness de agentes desde la v0 y adaptado a JS/Node/React.

## Feature en progreso

`F0-scaffold` — Andamiaje del repo.

> Excepción al protocolo: F0 lo hace el founder a mano porque el harness no puede
> correr antes de que exista el repo. De `F1` en adelante, el ciclo es
> líder → implementer → reviewer.

## Plan

Crear: backend (Express+Socket.io, SQLite+sqlite-vec, auth PIN), frontend (Vite+Tailwind+tokens, login),
docker-compose, .env.example, README. Levantar con `docker compose up`.

## Estado por feature

Ver `.claude/feature_list.json`. F1 (schema consolidado) es la próxima, ya bajo el harness.

## Preguntas abiertas

- Estado global frontend: Context vs Zustand (resolver antes de F3).
- Runner de tests: `node:test` vs vitest (resolver en F1/F2).
- Carga de `sqlite-vec` en la imagen Docker (Alpine vs Debian) — validar en F0.

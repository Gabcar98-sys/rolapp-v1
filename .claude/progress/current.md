# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.
> Cuando una sesión cierra (feature completada o bloqueada), el líder
> mueve el resumen a `.claude/progress/history.md`.

---

## Sesión actual

Bootstrap del repo v1.0 (founder). Portado el harness de agentes desde la v0 y adaptado a JS/Node/React.

## Feature en progreso

`F2-game-systems` (próxima a lanzar). `F0`, `F1`, `F4`, `F5` cerradas y verificadas.

## Deuda técnica conocida (no bloqueante)
- Frontend ESLint: 12 warnings falsos `no-unused-vars` sobre componentes JSX por faltar
  `eslint-plugin-react` (`react/jsx-uses-vars`). Arreglar en la próxima feature que toque frontend (F5).

> Excepción al protocolo: F0 lo hizo el founder a mano porque el harness no puede
> correr antes de que exista el repo. De `F1` en adelante, el ciclo es
> líder → implementer → reviewer.

## Verificación de F0 (2026-06-29)

- `docker compose build` → backend y frontend compilan (incl. better-sqlite3/sqlite-vec nativos).
- `docker compose up -d` → `/api/health` = `{"status":"ok","vecEnabled":true,"version":"1.0.0"}`.
- `sqlite-vec` v0.1.9 cargado dentro del contenedor.
- Auth: register DM OK, login OK, login con PIN incorrecto → 401, frontend → 200.

## Próximo paso

`F1-schema`: schema.sql consolidado (identidad/sesión, game systems, personajes, planificación,
post-sesión, RAG) + sistema de migraciones reiniciado. Ejecutar vía harness (líder → implementer → reviewer).

## Preguntas abiertas

- Estado global frontend: Context vs Zustand (resolver antes de F3).
- Runner de tests: `node:test` vs vitest (resolver en F1/F2).
- Carga de `sqlite-vec` en la imagen Docker (Alpine vs Debian) — validar en F0.

# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.
> Cuando una sesión cierra (feature completada o bloqueada), el líder
> mueve el resumen a `.claude/progress/history.md`.

---

## Sesión actual

Bootstrap del repo v1.0 (founder). Portado el harness de agentes desde la v0 y adaptado a JS/Node/React.

## Feature en progreso

`F9-ai-activation` (en progreso). Roadmap base F0–F8 COMPLETO (F8a/F8b/F8c cerradas).

## Backlog ampliado por el founder
- **F9-ai-activation**: activar+optimizar IA. Decisión: HÍBRIDO (Ollama local default, API por env) + turnkey + optimización profunda (streaming, prompts/contexto con citas, UX de estado/fuentes). La IA está construida (F6) pero no "en uso" porque falta motor conectado y docs ingeridos.
- **F10-seed-systems**: importar packs Stormlight/Dragonbane, crear personajes base (portar pregens Bridge Nine de la v0), e ingerir la guía STORMLIGHT_RPG_GUIDE.md como doc para el RAG.
Orden: F8c → F9 → F10.

> Nota F8b: el reviewer anterior se cayó por reinicio del proceso; relanzado. RECHAZO por node_modules residual (higiene de build), corregido por el líder (.dockerignore + limpieza), build OK → cerrado.

> Observaciones del founder que motivan F8a/F8b:
> - Coherencia: un personaje solo debería poder usarse en campañas de su mismo game system. Hoy no se valida.
> - El planificador perdió la vista visual de la v0 (EventFlowGraph) y se quiere editar el flujo desde la sesión, no solo en el Lobby.

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

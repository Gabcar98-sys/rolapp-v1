# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.
> Cuando una sesión cierra (feature completada o bloqueada), el líder
> mueve el resumen a `.claude/progress/history.md`.

---

## Sesión actual

Bootstrap del repo v1.0 (founder). Portado el harness de agentes desde la v0 y adaptado a JS/Node/React.

## Feature en progreso

Ninguna en progreso. F0–F11 cerradas y verificadas. El founder pidió parar en F11.

## Pendiente (cuando el founder lo pida)
- **F12-ai-generation-opt**: tool-use real + fallback, prompts endurecidos (citar-o-abstenerse), config por tarea, follow-ups, UX de fuentes con score/regenerar. (Segunda mitad de la optimización de IA.)

## Deuda menor
- Vectores del RAG pendientes de reindex hasta que Ollama esté arriba (`docker compose --profile ai up` + bootstrap + reindex).

## ⚠️ BLOQUEO DE ENTORNO (2026-06-30)
- **C: al 98%** (14 GB libres en 466 GB). El disco estuvo al 100% (752 MB) y dejó el daemon de Docker Desktop en **solo-lectura / corrupto**. `docker version` → server vacío; listar contenedores → 500. **Docker no usable.**
- **F9** está en el working tree (backend/frontend/docker-compose/.env.example/scripts/README): ambas imágenes buildearon y la revisión estática pasó, PERO lint/test de backend NO se ejecutaron (no se pueden crear contenedores). **No commiteado.** Reporte: `impl_F9-ai-activation.md`.
- El stack viejo `rolapp` (v0, desde OneDrive/RolApp) quedó **detenido** pero no se pudo eliminar (`down` falló por daemon read-only). Su `restart: unless-stopped` lo revivía en cada intento.

## Recuperación (requiere al founder)
1. Liberar espacio real en C: (Disk Cleanup, Papelera, %TEMP%, Descargas) — apuntar a bastante más que 14 GB.
2. Reiniciar Docker Desktop del todo (Quit desde la bandeja → reabrir). Si el motor no arranca: Troubleshoot → Restart; en último caso Clean/Purge data (⚠️ borra imágenes/volúmenes; el código está en git, los packs son archivos, y `./data/rolapp.db` es bind-mount del host → sobrevive; solo se re-descargan los modelos de ollama).
3. Ya con Docker sano: `docker compose -f "C:/Users/gabri/OneDrive/Escritorio/RolApp/docker-compose.yml" down` (quita el v0), `docker builder prune -af` + `docker image prune -af` (recupera GB de los ~15 builds de F0–F9).
4. Reanudar: reviewer de F9 (corre lint/test reales) → cerrar/commitear F9 → F10.

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

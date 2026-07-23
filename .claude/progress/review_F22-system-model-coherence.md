# Revisión: F22 — Coherencia del modelo sistema-campaña-sesión
Fecha: 2026-07-22
Veredicto: APROBADO

Revisión INDEPENDIENTE hecha desde cero (se descartó el review parcial previo). No se editó
código. Toda la verificación se ejecutó LITERALMENTE en Docker: imagen backend RECONSTRUIDA
antes de lint/test (el servicio compose NO monta src/ — leccion F21) y tests de frontend vía
build-stage + docker rmi (leccion F20). Foco especial en la migración M003 (idempotencia +
upgrade + fresh install + M001/M002 intactas).

## Nota de scope del working tree (no bloqueante)
git diff --stat HEAD lista 14 archivos; solo estos son de F22:
- backend/src/db/index.js, schema.sql, migrations.test.js (nuevo)
- backend/src/routes/sessions.js, sessions.test.js
- frontend/src/components/AI/AIPanel.jsx, frontend/src/pages/DashboardPage.jsx
- frontend/src/components/Session/session.test.jsx (F22 anadio el bloque resolveSessionGameSystems;
  el bloque buildQuickEventPayload es de F20 preexistente en el mismo archivo)
- .claude/* (permitido)

SessionToolbar.jsx (F20) y ai.js / ai.test.js / ai.presets.test.js (F21) estan en el working
tree sin commitear pero YA fueron aprobados en sus features. NO son scope de F22 ni violacion.

## Checklist CHECKPOINTS.md
- [x] lint backend pasa EN CONTENEDOR: docker compose run --rm --no-deps backend npm run lint -> exit 0
- [x] lint+build frontend pasan: docker compose build frontend -> exit 0 (RUN lint + RUN build)
- [x] No hay codigo comentado sin explicacion (los comentarios de migracion justifican el porque)
- [x] Sin console.log de debug nuevos (solo el log intencional "Migracion aplicada", preexistente)
- [x] better-sqlite3 SINCRONO (db.prepare/.exec/.transaction; cero async/await/.then sobre db)
- [x] Prepared statements en queries con parametros; el DDL de la migracion usa db.exec (DDL no admite bind)
- [x] session_events append-only (F22 no lo toca)
- [x] Frontend: cero estilos inline y cero window.innerWidth en AIPanel.jsx y DashboardPage.jsx (rg)
- [x] Nombres descriptivos en ingles (resolveSessionGameSystems, MIGRATIONS, campaign_game_system_name)
- [x] Respeta la estructura de architecture.md (sin carpetas nuevas, sin deps nuevas)
- [x] Cambio de esquema + migracion M003 documentados (schema.sql comentado, impl_ y este review)
- [x] Tests existen, cubren caso feliz + casos borde/error; todos pasan
- [x] Lecciones tecnicas propuestas para LEARNINGS.md (3 candidatas en impl_)
- [x] Reportes impl_ y review_ escritos

## Requisitos F22 — item por item (verificacion independiente)

### 1. AIPanel resuelve desde la CAMPANA primero, personajes como fallback — PASA
- resolveSessionGameSystems({ session, characters }) es helper PURO EXPORTADO (AIPanel.jsx:61).
  Fuente principal = session.campaign_game_system_id (nombre = campaign_game_system_name o
  "Sistema {id}", AIPanel.jsx:65-71); luego anade sistemas de personajes dedup por id (AIPanel.jsx:75-82).
- useEffect de resolucion: Promise.all([api.getSession, api.listSessionCharacters]) + guard cancelled
  (AIPanel.jsx:124-138). session (con campaign_game_system_id/_name) viene de getSession; characters
  (con game_system_template_id/game_system_name) viene de listSessionCharacters.
- Contrato del fallback VERIFICADO: GET /api/characters/session/:sessionId -> getCharacterFull devuelve
  c.* (incluye game_system_template_id) + gs.name AS game_system_name (characters.js:12,145-151).
- Mensaje "No hay sistema de juego asociado a esta sesion" (AIPanel.jsx:177) gated por !gameSystemId;
  gameSystemId = defaultId es no-vacio si hay sistema por CUALQUIER via -> el mensaje solo sale cuando no
  hay sistema por ninguna. El hint del modo Sistema (AIPanel.jsx:409-414) ahora dice "Asignale una campana
  con sistema" (alineado al modelo canonico).
- Streaming/presets/selector INTACTOS: runStream + streamAiAsk/streamSessionPreset sin cambios;
  SESSION_PRESETS/SYSTEM_TOPICS iguales; select de sistemas (AIPanel.jsx:350-361) intacto.
- Firma retrocompatible: AIPanel({ sessionId, user, campaignId = null }) sin props nuevas (leccion F17).

### 2. Backend expone el nombre del sistema, aditivo, JOIN 1:1 — PASA
- git diff confirma cambio PURAMENTE ADITIVO en sessions.js: se anade gs.name AS campaign_game_system_name
  + LEFT JOIN game_system_templates gs ON gs.id = c.game_system_id en GET /:id (sessions.js:47,51) y GET /
  (sessions.js:22,29). No se quito ni renombro ninguna columna previa; campaign_game_system_id ya existia.
- JOIN 1:1 NO infla el conteo: el join es por gs.id (PRIMARY KEY de game_system_templates) -> a lo sumo una
  fila gs por campana -> estructuralmente imposible multiplicar filas de session_members. GROUP BY s.id
  intacto. Confirmado por el test "GET / ... member_count = 2 (los joins 1:1 no deben inflar el conteo)".

### 3. Migracion M003 + refactor de migraciones — PASA (foco critico)
- M003 (db/index.js:90-94): guard PRAGMA "if (!cols.some(c => c.name === 'game_system')) return;" +
  ALTER TABLE campaigns DROP COLUMN game_system SOLO si existe -> idempotente.
- Idempotencia (UPGRADE): test #8 ejecuta la fn REAL sobre una DB aislada CON la columna: 1a aplicacion
  elimina game_system y conserva game_system_id; 2a aplicacion NO lanza y no cambia nada. PASA. Prueba
  ademas que DROP COLUMN funciona en better-sqlite3 11.x.
- FRESH INSTALL: test #9 confirma que sobre schema.sql (sin la columna) M003 es no-op PERO queda registrada
  en _migrations. Coherente con los logs "Migracion aplicada: M003" en cada import con :memory:.
- schema.sql: campaigns ya NO declara game_system TEXT (schema.sql:31-38), con comentario que explica la
  decision (schema.sql:29-30). game_system_id si presente.
- M001/M002 INTACTAS: git diff de db/index.js muestra que los cuerpos de M001 (PRAGMA npcs.disposition +
  ALTER) y M002 (PRAGMA session_notes.updated_at + ALTER + UPDATE) son IDENTICOS; el unico cambio es
  "(db) =>" por parametro en vez de cerrar sobre el modulo. runMigrations conserva la creacion de
  _migrations, el Set ran, la transaccion {fn(db)+insert} y el log. Comportamiento provablemente igual.
- El refactor "export const MIGRATIONS" habilita el test de idempotencia real (#8) sin duplicar el ALTER.
- Cero consumidores del legacy: rg --pcre2 'game_system(?!_id|_name|_template|s)\b' y
  rg --pcre2 '\.game_system(?![_a-zA-Z])' -> solo aparecen en la propia migracion, su test, el comentario
  de schema.sql y un comentario CONCEPTUAL en rag.js:458 (no la columna). Cero lecturas/escrituras reales.

### 4. DashboardPage: solo texto de ayuda — PASA
- Se anade un <p> con el aviso "El sistema de juego se hereda de la campana" bajo el form Nueva sesion
  (DashboardPage.jsx:231-236). Cero cambios en createSession ni en la logica de creacion (git diff = solo
  +6 lineas de copy). Tokens Tailwind, sin inline, sin emojis.

### 5. Invariantes respetados — PASA
- sessions SIN game_system_id: verificado en schema.sql CREATE TABLE sessions (schema.sql:41-49) — solo
  campaign_id/prep_id. Decision del founder respetada.
- characters.game_system_template_id NO renombrado (schema.sql:292) — solo documentado en el modelo.
- F8a intacta: gameSystemCoherence.js no esta en el diff; los 4 tests de coherencia (422 por sistema
  incompatible, permitir sin campana/sin sistema, vincular si coincide) siguen en verde.

## Resultado de verificacion (ejecutado por el reviewer)
- docker compose build backend -> exit 0
- docker compose run --rm --no-deps backend npm run lint -> exit 0
- docker compose run --rm --no-deps backend npm test -> 148 tests, 147 pass, 0 fail, 1 skipped, exit 0.
  Tests F22 confirmados por nombre: #8 M003 idempotente; #9 DB cargada sin game_system + M003 registrada;
  #71 GET /:id incluye campaign_game_system_id/_name; #72 GET /:id NULL sin campana.
  El unico skip es PREEXISTENTE (RAG): "hybridSearch ... # SKIP vec/FTS activos" — no es de F22.
- docker compose build frontend -> exit 0 (lint + build)
- Tests frontend (build-stage + docker rmi) -> 85 pass / 7 files, exit 0. Los 6 tests del helper
  resolveSessionGameSystems (F22) confirmados por nombre (solo campana; campana sin nombre -> Sistema {id};
  solo personajes con dedup; ambos con campana primero; ninguno -> lista vacia y ""; sin args no lanza).
- Higiene: sin node_modules residual en host antes/despues; imagen temporal rolapp-fe-f22-review borrada.

Resumen:
- lint:  backend OK  |  frontend (lint+build) OK
- build: backend OK  |  frontend OK
- test:  backend OK 147 pass / 0 fail / 1 skip (preexistente)  |  frontend OK 85 pass

## Lecciones aplicadas correctamente
- F20 "vitest sin jsdom -> helpers puros": resolveSessionGameSystems extraido y testeado directo. OK
- F21 "compose backend no monta src/ -> reconstruir antes": build backend antes de lint/test. OK (repetido por el reviewer)
- F17 "extender componente compartido = props opcionales": firma de AIPanel sin cambios. OK
- F20 "tests frontend en Docker sin ensuciar el host": build-stage + docker rmi, sin residuos. OK
- SQLite/F1 "migraciones idempotentes con guard PRAGMA": M003 verifica PRAGMA antes del DROP. OK

## Puntos a corregir (si RECHAZADO)
Ninguno.

## Observaciones (no bloqueantes)
1. Los characters de GET /api/sessions/:id (sessions.js:67-75) NO traen game_system_template_id;
   correctamente el AIPanel usa listSessionCharacters (que si lo trae) para el fallback, no ese array.
   Buen diseno; no hay bug, solo conviene tenerlo presente si algun dia se unifican ambas fuentes.
2. docs/API.md no se actualizo con el nuevo campo campaign_game_system_name (el implementer lo dejo como
   nota deliberada: la regla limita el scope a backend/frontend/game-packs). Queda a criterio del lider.
3. El review previo parcial fue sobrescrito por este (revision independiente completa desde cero).

## Candidatos para LEARNINGS.md (para que el lider evalue)
- DROP COLUMN de un campo legacy via migracion idempotente es viable en better-sqlite3 11.x si (1) se
  confirma con rg --pcre2 (look-ahead) que ni la columna ni la propiedad tienen consumidores reales,
  (2) el guard PRAGMA hace el DROP condicional y (3) se cubren AMBOS caminos: upgrade (DB aislada con la
  columna) y fresh install (schema sin la columna -> no-op registrado).
- Para testear la idempotencia REAL de una migracion, exporta el array (export const MIGRATIONS) con fns
  que reciben db por parametro; el test ejercita la fn real sobre una DB aislada sin duplicar el ALTER.
- Un JOIN es a prueba de inflado de COUNT si la clave de join es la PK de la tabla destino (aqui gs.id):
  el reviewer puede confirmar la seguridad estructuralmente (1:1 por PK), no solo con un test.
- rg no soporta look-ahead por defecto: usar rg --pcre2 para distinguir game_system (legacy) de
  game_system_id / _name / _template.

---
VEREDICTO FINAL: APROBADO. F22 cumple los 5 requisitos y todos los checkpoints aplicables. La IA resuelve
el sistema desde la campana (personajes como fallback) via helper puro testeado; el backend expone
campaign_game_system_name de forma aditiva con JOIN 1:1 seguro; M003 elimina el legacy de forma idempotente
y cubierta en upgrade + fresh install, sin alterar M001/M002; sessions sigue sin game_system_id y F8a queda
intacta. Verificacion completa ejecutada en Docker por el reviewer.

# Implementación: F25 — Sesión demo completa (seed idempotente)

Fecha: 2026-07-23
Status: completado

## Objetivo
Borrar TODAS las sesiones y dejar UNA sesión de prueba COMPLETA para demo (prep completa
con eventos ramificados + eventos sueltos enlazados + NPCs + chat + notas + disparos al log),
con su resumen IA generado. Script idempotente `backend/scripts/seed-demo-session.js`.

## Ids resueltos (por QUERY, no hardcodeados)
- DM: `DM1` (id=3, role=dm) — obligatorio.
- Jugador: `Jugador1` (id=11).
- Campaña: `Honor` (id=3) del DM1, `game_system_id=5` (**Stormlight RPG**, con 7 docs ingeridos
  por F23) — resuelta por la ruta primaria ("campaña 'Honor' del DM con sistema con docs").
- Personajes compatibles (mismo `game_system_template_id=5` que la campaña, F8a):
  `Talani` (id=4, de Jugador1) y `Buenatracio` (id=3, de DM1). Ambos pasan
  `checkCharacterFitsSession` antes de vincularse.
- Pregens del sistema (`base_characters WHERE game_system_id=5`): Abena, Jomari, Palinor,
  Talani, Vedd, Zvynda (ids 17-22) — resueltos/reportados, no se tocan.
- Fallbacks de robustez implementados pero NO disparados: (2) cualquier campaña del DM con
  sistema con docs; (3) crear campaña demo bajo un sistema con docs.

## Archivos creados
- `backend/scripts/seed-demo-session.js`: seed idempotente F25. Resuelve el escenario por
  query, limpia todas las sesiones + dependientes + la prep/NPCs demo previos, reconstruye
  prep + sesión + miembros + personajes + NPCs, dispara eventos al log (planificados/ad-hoc/
  NPC), inserta chat y notas, y genera el resumen IA. Imprime un dump de verificación.

## Archivos modificados
- `.claude/feature_list.json`: F25-demo-session-seed `pending` → `in_progress` (según la
  instrucción del líder; NO se marca `done`).

## Estructura de la prep demo (marcador único: `[DEMO] Asedio de la Torre`)
Ubicaciones (2) › sub-ubicaciones (4) › event_templates (11 = 6 raíz en sub-ubicación +
2 ramas + 3 sueltos):

- **Campamento de Guerra**
  - *Tienda del Brightlord*: "Consejo de guerra" (historia) con 2 RAMAS
    (`branch_label`): "Aceptan el encargo" (interacción) / "Exigen más tropas" (interacción).
  - *Foso de reclutas*: "Inspección de las tropas" (exploración).
- **Las Llanuras Quebradas**
  - *El Abismo*: "El descenso al Abismo" (exploración), "Trampa: puente saboteado" (trampa).
  - *La Torre*: "Emboscada de los Fusionados" (combate), "El corazón de la Torre" (recompensa).

Enlaces con etiqueta (7 en total):
- Flujo principal (5): Aceptan→Inspección [tras el consejo] → Descenso [marchan al frente]
  → Trampa [en el puente] → Emboscada [al cruzar] → Corazón [si toman la puerta].
- **Eventos SUELTOS enlazados** (sub_location_id NULL, 3 eventos, 2 enlaces — ejercitan el
  fix de F24 en vivo): "Emboscada en el camino" (combate) → [huyen] → "Persecución por las
  mesetas" (exploración) → [escapan] → "Refugio en una gruta" (interacción).

Participantes (event_participants) sembrados en varios eventos: PCs (Talani/Buenatracio con
`character_id`), el NPC Amaram y enemigos (Fusionado, Portador de Esquirla).

## NPCs (dm_id=DM1, game_system_id=5; vinculados a la campaña)
- "Brightlord Amaram" (hostile), "Vela la mensajera" (ally), "El Contador" (neutral).
- "El Contador" lleva 1 quest (`npc_quests`: "Deuda de esferas") y 1 item (`npc_inventory`:
  "Bolsa de esferas de diamante").

## Qué se disparó al log (session_events, append-only vía logEvent) — 9 eventos
- **4 planificados** (con `template_id` real + location/sub_location + participantes;
  incluye una RAMA "Aceptan el encargo" y uno con `participant_type='specific'`
  [Talani, Buenatracio]): Consejo de guerra, Aceptan el encargo, El descenso al Abismo,
  Emboscada de los Fusionados.
- **3 ad-hoc** (sin template_id, actor_type='dm'): Tormenta eterna en el horizonte,
  Un puente-hombre cae al abismo, Botín inesperado: una gema corazón.
- **2 de NPC** (actor_type='npc', npc_id/npc_name): Amaram exige la Esquirla (Amaram),
  Vela trae noticias del frente (Vela).
- Además: 6 mensajes de chat (DM1↔Jugador1, broadcast) y 2 notas (1 pública, 1 privada DM).

## Dump de verificación (2ª corrida — idempotente)
```
sesiones_totales: 1
session_id: 17 · prep_id: 5 · campaña 'Honor' / Stormlight RPG · status=active
miembros: 2 · personajes: 2 · npcs_del_dm: 3
ubicaciones: 2 · sub_ubicaciones: 4 · event_templates: 11 · eventos_sueltos: 3
event_links: 7 · links_entre_sueltos: 2 · mensajes: 6 · notas: 2 · eventos_total: 9
Eventos por type: {historia:2, interacción:2, exploración:2, NPC:1, combate:1, recompensa:1}
Eventos por naturaleza: {dm/planificado:4, npc:2, dm/adhoc:3}
session_summaries: body len=982 (no vacío)
npcs con quest: 1 · npcs con item: 1
```
Idempotencia comprobada: 2 corridas seguidas dejan SIEMPRE 1 sola sesión y sin duplicar
prep/eventos/NPCs (el id de sesión/prep incrementa por delete+recreate con AUTOINCREMENT,
que es el comportamiento esperado de un reset limpio).

## Resumen IA generado (pegado)
**Qué pasó:** La sesión arranca en la tienda de Amaram, con un consejo de guerra que expone
el plan para tomar la Torre antes del anochecer. Ahora se encuentran en las Llanuras
Quebradas, bajo una tormenta eterna que acaba de aparecer al este. El grupo aceptó cruzar el
abismo y asaltar la Torre. Después del combate contra los Fusionados, hallaron una gema
corazón aún caliente. Vela les informa de refuerzos parshendi rodeando la Torre por el norte.

**Decisiones clave:** Los personajes decidieron cruzar el abismo para atacar la Torre antes
de que llegue la tormenta. El encuentro con los Fusionados reveló una gema corazón, lo cual
es una recompensa sorprendente. Vela les informó sobre los refuerzos parshendi.

**Hilos abiertos:** (el modelo cerró con los refuerzos parshendi y el destino de la gema /
la posible traición de Amaram como hilos pendientes; el cuerpo completo queda guardado en
`session_summaries`, 982 chars, y es regenerable desde la app.)

> El resumen está bien anclado en los eventos/notas de la sesión (no alucina): menciona la
> tormenta, el consejo, el descenso, el combate con los Fusionados, la gema corazón y el
> aviso de Vela — todos hechos sembrados.

## Comandos + resultado
- `docker compose build backend` → OK (hornea `scripts/`; no se monta como volumen).
- `docker compose up -d backend` → OK (contenedor recreado con la imagen nueva).
- Vigencia por HASH (LEARNINGS): host == imagen para `scripts/seed-demo-session.js`
  (`4dd8852f…97e`) → los tests/ejecución corren el código actual.
- `docker compose exec -T backend npm run lint` → ✅ exit 0, sin errores ni warnings.
- `docker compose exec -T backend node scripts/seed-demo-session.js` → ✅ (2 corridas).
- `docker compose ps` → backend/frontend/ollama **Up**. Sin `node_modules` residual en host.

## Resultado de verificación
- lint:  ✅ (contenedor)
- build: ✅ (imagen backend reconstruida)
- test:  No aplica — el entregable es un script de seed operativo, no lógica nueva de app.
  Verificación real = ejecución idempotente en la DB del stack + queries independientes
  (todas en verde). No se añadieron tests unitarios porque el script es un utilitario
  one-shot de datos (patrón `seed-examples.js`, que tampoco tiene tests).
- Manual / e2e (datos): ✅ 1 sesión activa explorable en la app (Prep/Flujo/Disparados/
  chat/NPCs/resumen). Frontend Up en `http://localhost:3000`.

## Lecciones aplicadas
- **"El servicio backend de compose NO monta src/scripts → reconstruir antes de verificar"**:
  reconstruí `docker compose build backend` + `up -d` antes de ejecutar.
- **"Prueba que la imagen está al día por HASH"**: comparé sha256 host↔imagen del script
  antes de correrlo.
- **"better-sqlite3 es síncrono"**: todo el acceso a datos es síncrono con prepared
  statements y `db.transaction(fn)()`; lo único async es `summarizeSession` (LLM por red).
- **F24 (eventos sueltos enlazados)**: sembré 3 eventos sueltos con 2 enlaces para que la
  demo ejercite en vivo la pestaña Prep + Flujo.
- **F8a (coherencia de sistema)**: personajes validados con `checkCharacterFitsSession`.
- **Patrón de borrado de prep (routes/sessionPreps.js)**: los event_templates SUELTOS tienen
  FK a prep sin cascade → se borran por `prep_id` ANTES de la prep (locations/sub_locations
  sí cascadean).

## Decisiones tomadas (no documentadas)
- **Borrado de `session_events`**: es append-only en operación normal, pero el founder pidió
  explícitamente "borrar TODAS las sesiones y sus dependientes". El `DELETE FROM
  session_events` es esa acción de reset sancionada, no una mutación del log en curso. Se
  documenta en el propio script.
- **No se registran eventos `session_start`/`character_joined`** en el log: se insertan
  `session_members`/`session_characters` directo, para que el log contenga solo los eventos
  narrativos (planificados/ad-hoc/NPC) y el resumen IA quede limpio (getEventHistory no
  filtra `character_joined`).
- **Marcadores de idempotencia**: prep y sesión usan el mismo nombre `[DEMO] Asedio de la
  Torre`; los NPCs demo se identifican por (dm_id, game_system_id, nombre). Solo se borran
  esos, nunca prep/NPCs ajenos.
- **Sin dependencias nuevas** (`npm install`): ninguna.

## Candidatos para LEARNINGS.md (el líder decide)
- **Seed de datos demo idempotente = reset por marcador, no por id**: para dejar UN estado
  demo limpio y reejecutable, borra por marcador único (nombre de prep/sesión, tripleta de
  NPC) en vez de por id; y recuerda que los event_templates sueltos del prep se borran por
  `prep_id` aparte (su FK a prep no es cascade, igual que en routes/sessionPreps.js).
- **El resumen IA local (qwen2.5:3b) sí produce un resumen anclado y usable** cuando el
  contexto son eventos + notas estructurados; conviene sembrar notas (una pública, una
  privada) porque enriquecen notablemente el "Qué pasó / Hilos abiertos".

## Bloqueantes
Ninguno.

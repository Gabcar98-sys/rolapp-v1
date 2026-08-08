# Estado de sesión activa

> El líder mantiene este archivo actualizado durante cada sesión.

---

## Sesión actual (2026-08-07) — "continúa con las tareas que tenías a medias"

Petición del founder: retomar los hilos abiertos. El líder hizo el protocolo de arranque y
encontró **las dos features `in_progress`** que el aviso del 2026-08-07 ya señalaba como
violación de la regla "una a la vez". Estado real de cada una:

- **F36-mycharacters-orphan — IMPLEMENTADA, faltaba la revisión.** Existe
  `impl_F36-mycharacters-orphan.md` con tabla de paridad de 30 capacidades y verificación en
  Docker (157/157). El **borrado ya está commiteado** por el auto-commiteador del entorno
  (`5953b44 refactor: remove MyCharacters component…`), fuera del flujo del harness; en el
  working tree quedan los 2 archivos modificados de la feature (`designDebt.test.js` y un
  comentario en `CharacterSheet.jsx`). → **reviewer lanzado** (`review_F36-*.md`).
- **F34-stormlight-catalog — A MEDIAS, sin reporte.** `game-packs/stormlight.json` está
  modificado en el working tree (+173/-22) por una corrida anterior que murió sin dejar
  `impl_F34-*.md`: añadió el field `category` a las 21 skills legacy y **3 skill_formats
  nuevos** (Caminos Heroicos 6, Talentos 90, Acciones 20). **Falta todo lo demás**: los items
  siguen en 2 (Espada larga, Maza pesada), no hay seed para Stormlight y no hay tests.
  → **implementer lanzado** con encargo explícito de AUDITAR primero ese trabajo huérfano
  contra las fuentes (`03-talentos-y-paths.md`, `02-acciones.md`) antes de construir encima.

Los dos van **en paralelo por ser disjuntos**: F36 solo toca `frontend/`, F34 solo
`game-packs/stormlight.json` + `backend/scripts/`. Cada agente usa su propio tag de imagen
para no competir por el build. Al cerrar F36 se sanea la violación de protocolo.

### F36 — DONE + APROBADA + COMMITEADA (`c67ebfa`)

Reviewer independiente APROBADO (`review_F36-mycharacters-orphan.md`). Rehízo la tabla de
paridad por su cuenta sobre el **render completo** de `CharactersPage.jsx` contra
`git show 5953b44^:…MyCharacters.jsx`: **cero capacidades perdidas** (`adoptBaseCharacter`
resultó idéntico línea a línea). El único riesgo real lo encontró él y lo cerró **bajando al
backend**: `CharactersPage:319` condiciona el botón de eliminar a `isOwner`, donde el huérfano
lo mostraba siempre — si el endpoint no devolviera `user_id`, la capacidad desaparecería sin
romper lint, build ni tests. Verificó `characters.js:126-139` → `getCharacterFull` → `SELECT c.*`:
el campo llega, la capacidad se conserva. 157/157 tests, 4/4 hashes host↔imagen y los archivos
borrados ausentes dentro de la imagen. El commit se hizo **con rutas explícitas** para no
arrastrar el `game-packs/stormlight.json` de F34, que sigue en curso.

Observaciones no bloqueantes anotadas como deuda (ver abajo). **Queda F34 como único hilo
`in_progress` → protocolo saneado.**

### F34 — DONE + APROBADA + SEMBRADA EN LA DB REAL

`impl_F34-stormlight-catalog.md`. Stormlight pasa de **21 skills / 2 items** a **135 / 90**
(Dragonbane tiene 91 / 136 → asimetría cerrada).

- **Auditoría del trabajo huérfano: limpio.** El implementer contrastó las 3 secciones que
  venían del working tree contra las fuentes por **diferencia simétrica en ambas direcciones**:
  cero en talentos (90 nombres únicos, 103 apariciones porque 9 talentos salen en 2-3 caminos)
  y cero en acciones. Conservado íntegro, nada que corregir. **Corrección al líder: el brief
  decía "Acciones 20" y son 18** — mi conteo con `awk` metió en ese grupo los 2 items de
  "Armas" que venían después. El dato bueno es el de la fuente.
- **Items**: "Armas" 2→14 (4 fields aditivos; los 2 legacy byte a byte intactos) + **nuevo
  `item_format` "Equipo"** con 76 (6 armaduras + 70 de las 9 secciones de equipo del MD 06).
  Segundo formato en vez de inflar "Armas" porque el nombre legacy es estrecho y no se puede
  renombrar, y los fields son genuinamente distintos (`damage` vs `deflect/cost/weight`).
- **Seed generalizado, no duplicado**: la lógica se extrae a `scripts/seed-catalog.js`
  parametrizado por pack; `seed-dragonbane-catalog.js` queda como wrapper de 26 líneas y
  `seed-stormlight-catalog.js` es su gemelo. La prueba objetiva de la retrocompatibilidad es
  que **`seed-dragonbane-catalog.test.js` pasa sin editar una línea**.
- backend lint exit 0 + **182 tests** (181 pass / 1 skip preexistente / 0 fail), vigencia por
  hash de los 5 archivos, los 2 asserts críticos (idempotencia y alcance a los 2 sistemas)
  validados **por mutación**. Cero frontend, cero `backend/src`, cero migraciones.
- Hallazgos anotados y NO corregidos (decisión del founder): `Thievery`/`Survival` divergen del
  MD en su atributo gobernante; el pack legacy tiene 21 skills donde el MD lista 18; la
  `description` del formato dice "Las 15 habilidades" y hay 21; y `Espada larga`/`Maza pesada`
  conviven con sus equivalentes `Longsword`/`Hammer` (no se pueden borrar).

**Reviewer independiente APROBADO** (`review_F34-stormlight-catalog.md`), sin puntos
bloqueantes. Rehízo por su cuenta los 4 riesgos que le marcó el líder:
- **El riesgo grande NO se materializa.** El implementer afirmaba "cero coste de frontend" para
  el `item_format` nuevo; el reviewer lo probó **leyendo los tres consumidores**: `ItemsPage` →
  `FormatGroups` mapea todos los formatos del grupo, `CharacterSheet.EquipmentTab` (584-597)
  agrega los items de TODOS los formatos, y el endpoint de equipar hace
  `SELECT id FROM item_masters WHERE id = ?` sin atarlo a un formato. Los 76 items son visibles
  y equipables. **Matiz que corrige al implementer:** `ItemsPage` NO tiene chips de filtro (eso
  es solo `SkillsPage`), así que el argumento del "chip por `category`" vale para
  Talentos/Acciones, no para Items.
- **Retrocompatibilidad probada más fuerte que "el test viejo pasa":** mutó `seed-catalog.js` en
  un contenedor efímero y el test de Dragonbane de F28/F29 se puso **ROJO** → cubre de verdad el
  módulo compartido; y su `sha256` coincide con el que registró F29 (no se editó).
- Confirmado el conflicto 20 vs 18 acciones a favor de la fuente (18), legacy `JSON.stringify`-
  idéntico a HEAD, pregens byte a byte y **cero colisiones de nombre entre formatos** (los 135
  nombres son únicos globalmente: el first-wins de `skill_links` ni llega a desempatar).

**Runtime ejecutado por el líder (2026-08-07), no solo tests.** Stack recreado
(`docker compose up -d --build`) y `docker compose exec backend node scripts/seed-stormlight-catalog.js`:

```
Seed catálogo Stormlight RPG — 2 sistema(s)
  sistema id=3 (dm 2): +114 skills (+453 valores), +88 items (+342 valores)
  sistema id=5 (dm 3): +114 skills (+453 valores), +88 items (+342 valores)
2ª corrida: +0 / +0 en ambos   ← idempotencia probada sobre la DB REAL
```

Estado verificado en la DB real: **Stormlight 3 y 5 → 135 skills / 90 items cada uno**
(Acciones 18 / Caminos Heroicos 6 / Stormlight Skills 21 / Talentos 90; Armas 14 / Equipo 76),
**Dragonbane 4 y 6 intactos en 91 / 136**, los 2 items legacy con exactamente 4 valores, y los
**6 pregens del Puente Nueve con todos sus `skill_links` apuntando a "Stormlight Skills"**
(3/5/3/4/4/5), ninguno derivado a un talento. Smoke: frontend 200 y `/api/health` con
`vecEnabled` y `ftsEnabled` true. **La asimetría de catálogo entre los dos sistemas queda cerrada.**

## Sesión actual (2026-08-07) — exploración: "¿qué tan difícil sería tenerla en línea?"

Pregunta conceptual del founder (no es una feature). El líder respondió con lectura directa
y redactó **`.claude/docs/online_deployment.md`**: diagnóstico + decisiones propuestas +
desglose en F37-F42. **Nada aprobado ni dado de alta en `feature_list.json`** — el documento
termina con 4 preguntas para el founder (§10).

Resumen del diagnóstico: el obstáculo no es arquitectura sino **seguridad**. La identidad del
usuario viaja en el body (`canvas.js:22` y ~12 sitios más), el PIN se hashea con SHA-256 sin
sal (`auth.js:8`) y no hay tokens. A favor: F31 ya dio rutas/persistencia/espectador,
`api.js:2` es un embudo único donde meter el token, y el patrón correcto de identidad ya
existe en el socket (`socket.data.userId`, lección de F33).

⚠️ **Aviso de protocolo:** hay **dos** features en `in_progress` a la vez —
`F34-stormlight-catalog` y `F36-mycharacters-orphan` — lo que viola la regla de una a la vez.
No bloquea esta tarea (es documentación), pero hay que sanearlo antes de abrir F37.

**Iteración 2 del founder:** *"¿y si lo hacemos sin IA, y el auth y backend en Supabase?
Sigue siendo de uso personal para mi mesa"*. El líder evaluó y **separó las dos decisiones**,
que el founder venía juntando: (1) quitar la IA → **sí**, son 2.289 líneas de producción +
1.388 de tests = un tercio del backend, y elimina el único coste variable; (2) mover TODO a
Supabase → **no**, es reescritura (los 24 routers + 975 líneas de servicios se mudan de casa,
no desaparecen). Tercera opción propuesta y elegida por el founder: **Supabase SOLO para
auth**, backend Express + SQLite + Socket.io intactos.

`online_deployment.md` reescrito sobre esa variante. Claves del diseño:
- **`users.id` INTEGER no se toca** (17 FKs dependen de él): se añade `supabase_uid TEXT UNIQUE`
  vía M004 → cero migración de datos, `req.user.id` sigue siendo el entero que esperan los routers.
- Verificación por **JWKS asimétrico** (`jose` + `createRemoteJWKSet`) → el backend nunca guarda
  un secreto.
- Socket autenticado en el **handshake** (`io.use()`), no en `session:join`.
- Frontend: solo `api.js:2`, `socket.js:4` y `Login.jsx`.
- ⚠️ **Rompe el principio nº1 de `architecture.md` (local-first)** — pero lo rompe el hosting en
  VPS antes que Supabase. Decisión (a) retirar el principio vs (b) mantener LAN en paralelo →
  pendiente del founder (§7 del doc).

Backlog propuesto: **F37** drop-ai-keep-search → **F38** supabase-auth → **F39**
identity-from-token → **F40** scoping → **F41** hardening → **F42** deploy-vps.
**Sigue sin darse de alta nada en `feature_list.json`**: 4 preguntas abiertas en §10.

---

## Sesión actual (2026-07-20) — autónoma

Petición del founder: (1) completar las features que faltan para poder **llevar una
sesión de rol completa** (F15→F19) y (2) **mejorar y dejar funcionando la IA para todo**.
Instrucción: trabajar solo; el founder revisa después.

El líder orquesta; no escribe código. Ciclo por feature: implementer → reviewer → cierre.

## Hallazgo de arranque

- **F15-catalog-pages** quedó `in_progress`. Su código se commiteó en `d894c3b`
  ("bulk skills import…") **fuera del flujo del harness**: sin `impl_F15` ni `review_F15`,
  sin aprobación del reviewer. El commit incluye TODO el alcance de F15
  (5 páginas de catálogo + bulk import + backend), +4140 líneas.
- Backend de **Mecánicas SÍ existe** (`gameSystems.js` GET/POST `/:id/mechanics` + tablas
  `game_mechanics`/`game_mechanic_params`). El frontend `AttributesPage` (+1047) debe cablearse a eso.
- **`npcs.js` ya existe** en backend → F16 podría estar parcialmente hecho (verificar al llegar).

## Sesión actual (2026-07-22) — feedback del founder post-backlog

El founder reportó 3 asuntos tras revisar la app (con un diagrama del modelo de sistema de
juego). Diagnóstico hecho por el líder con lectura directa (los subagentes murieron por
límite de sesión, no por el repo). Consolidado:

1. **Modelo de sistema de juego** — falta que la sesión resuelva su sistema vía campaña de
   forma consistente (la IA lo saca de los personajes, AIPanel.jsx:94) + campo legacy
   `campaigns.game_system` muerto. **Decisión del founder: sistema SIEMPRE vía campaña**
   (no se agrega game_system_id a sessions). Modelo canónico → `.claude/docs/game_system_model.md`.
2. **Disparar eventos** — backend ya soporta ad-hoc (POST /events sin template_id); falta el
   modal de "evento rápido" en la toolbar (hoy 'Nuevo Evento' solo abre Planificación).
3. **IA robótica ('no hay documento')** — cláusula NO_HALLUCINATION única y agresiva (ai.js:315)
   pegada a todos los prompts + modelo 3b que sobre-obedece + retrieval flaco (docs solo FTS).

Backlog nuevo (aprobado por el founder, hacer los 4): **F20** evento rápido → **F21** tono IA →
**F22** coherencia del modelo. **F23 (doc del modelo) ya hecho por el líder** (game_system_model.md).

## Sesión actual (2026-07-23) — retomar F28 (tras cambio de cuenta)

El founder retoma la sesión ("seguir con lo que tenías"). Estado consolidado por el líder:
**F0–F27 done y commiteadas** (el lote "haz todo" F23+F24+F25 + F26 + F27, todo cerrado).
Único hilo abierto = **F28-dragonbane-catalog** (`in_progress` en el backlog pero SIN trabajo
iniciado: no había `impl_F28` ni `review_F28`; la única línea sin commitear era el marcado
`in_progress` en feature_list.json). Es la continuación directa de "cargar información".

- **F28-dragonbane-catalog — DONE + APROBADA** (reviewer independiente, ejecutado en Docker).
  Dragonbane: 6 skills/2 items → **35 habilidades + 61 items**. game-packs/dragonbane.json como
  fuente de verdad (fields attribute/category/type/notes + fields de arma/equipo, aditivos; legacy
  Espada/Antorcha y 6 skills preservadas; mapeo FUE→Fuerza/AGI→Destreza/INT→Inteligencia/CAR→Carisma).
  Seed dedicado idempotente `backend/scripts/seed-dragonbane-catalog.js` (por NOMBRE de sistema →
  systems 4 y 6, todos los DMs, SIN Ollama) + test 6 casos. lint 0 + 158 tests (157/1 skip/0 fail),
  vigencia por hash. Lección nueva en LEARNINGS (Arquitectura: enriquecer catálogo existente ≠ importar pack).
  Commit pendiente en este cierre. **PENDIENTE solo del founder (runtime, no código):** correr
  `docker compose exec backend node scripts/seed-dragonbane-catalog.js` contra la DB real (no requiere
  Ollama) y ver las páginas Habilidades/Items de Dragonbane pobladas.
- **F29-dragonbane-magic — EN CURSO.** El founder pidió (2026-07-23) que quede COMPLETA la info de los
  MDs en el catálogo. Dos huecos: (1) magia sin estructurar, (2) items parciales (F28 metió 61 de muchos).
  Scout del líder: NO hay concepto 'spell' en el schema → representar la magia como NUEVO `skill_format`
  'Magia' con campos dinámicos (escuela/rango/prerequisito/requisito/tiempo/alcance/duracion; efecto en
  description) y ~50 hechizos (4 escuelas + trucos) desde `DRAGONBANE_MAGIA_DETALLADA.md`; + completar los
  items restantes del MD de equipo. Patrón F28 (dragonbane.json fuente de verdad + seed idempotente por
  NOMBRE de sistema, sin Ollama). FUERA: bestiario (ya en RAG; NPCs son otro concepto).
  **DONE + APROBADA** (reviewer independiente en Docker): skill_format 'Magia' con **56 hechizos**
  (filtrable por escuela) + items **61→136**; seed reutilizado (genérico por formato) + 2 tests.
  lint 0 + 160 tests (159/1 skip/0 fail), vigencia por hash. Lección nueva en LEARNINGS (Arquitectura:
  seed genérico-por-formato absorbe formatos nuevos data-only). Sembrado en DB real (líder). Commit en
  este cierre. Follow-on documentado: escuelas como skills en 'Habilidades' (no hecho, opcional).

- **F30-charsheet-iscore-zero — DONE + APROBADA** (reviewer independiente, 2ª pasada, en Docker).
  El `0` fantasma de la ficha murió: helper `coreMarker` con `Boolean(...)` + ternario en
  `has_max` + el footgun DERIVADO (`hasNumericMax` heredaba el entero y lo propagaba a
  `useDots`). Re-barrido completo: no queda ningún guard `&&` con bandera entera. 97/97 tests
  en Docker, validados POR MUTACIÓN, vigencia por hash. Commiteada. Lección nueva en LEARNINGS.
  **Contexto histórico de la 2ª iteración:** Bug reportado en vivo por el founder (pantallazo,
  incógnito → NO caché): la ficha pinta un '0' pegado a los atributos no-core. Causa: guards `{intFlag &&
  <span/>}` con enteros 0/1 de SQLite (is_core, has_max) → React pinta el 0 literal. Fix (frontend puro,
  helper coreMarker + Boolean): is_core en 189/330 OK, pero el reviewer RECHAZÓ por un 3er caso sin barrer
  (has_max en línea 381, pestaña Estado). Implementer rematando esa línea + test has_max=0. Corre EN
  PARALELO con F29 (disjunto: F30 solo frontend). Al cerrar → rebuild frontend para el founder.

## Sesión actual (2026-07-30) — "continúa + revisa + explora la vista TV"

Petición del founder (se va, no pregunto nada): (1) **continuar los cambios necesarios**
= cerrar F30; (2) **revisar código y usabilidad y hacer los cambios que considere**, esos
**SIN COMMITEAR**, con un resumen escrito; (3) **explorar dejar la app "más en línea" y con
interfaces más gráficas** → **vista de sesión para el televisor** que vean los jugadores.

Plan del líder:
- **F30** → 2ª revisión (el implementer ya remató `has_max`:381 y el derivado `hasNumericMax`).
  Si aprueba: `done` + **commit** (es el "cambio necesario").
- **F31-tv-session-view** (NUEVO, sin commit) → la cabeza del pedido. Diseño completo en
  `.claude/docs/tv_view_and_online.md`. Tres huecos que impiden "estar en línea": cero
  persistencia (F5 te saca de la sesión), cero rutas (nada que compartir) y cero vista de
  espectador. Se resuelven juntos: rutas por hash + localStorage + `session:spectate`
  (socket que solo hace join, sin presencia ni log) + `pages/TvView.jsx`.
- **F32-ui-debt-cleanup** (NUEVO, sin commit) → deuda visual v0 (ChatPanel/CanvasBoard/
  StatTile) + **código muerto confirmado por el líder**: `GameSystemPanel.jsx` y
  `BaseCharactersPanel.jsx` son huérfanos (0 imports en `src/`), superseded por
  `AttributesPage`/`BaseCharactersPage`.

Estado del lote (2026-07-30):
- **F30 — DONE + APROBADA + COMMITEADA** (`569c698`). Ver más abajo.
- **F31-tv-session-view — IMPLEMENTADA, en revisión.** `impl_F31-tv-session-view.md`.
  Rutas por hash + persistencia + `session:spectate` + `pages/TvView.jsx` + `PartyVitals`
  (reusado en `SessionCharactersPanel`) + botón "Modo TV". backend 164 pass/1 skip,
  frontend 140 pass, vigencia por hash. **Sin commitear** (orden del founder).
- **F32-ui-debt-cleanup — IMPLEMENTADA, en revisión.** `impl_F32-ui-debt-cleanup.md`.
  ChatPanel/CanvasBoard a tokens del handoff, últimos 3 emojis fuera, hora en los mensajes,
  y **1.610 líneas de código muerto borradas** (4 paneles de `DMMaster/` huérfanos, con
  paridad verificada contra las páginas nuevas). Los alias `gold`/`ink` de Tailwind NO se
  pudieron retirar: siguen con consumidores en `MyCharacters`, `Stats/*` y `Sparkline`.
  **Sin commitear.**
### 🏁 Cierre del lote (2026-07-30) — 5 features, todas commiteadas

| Commit | Feature |
|---|---|
| `569c698` | **F30** — el `0` fantasma de la ficha (4 casos, no 1) |
| `2232ff9` | **F32** — restyle chat/canvas + 1.610 líneas de código muerto fuera |
| `34f051c` | **F31** — vista TV + rutas por hash + sesión persistente |
| `8476ded` | **F33** — fuga de privados en `chat:history` + Modal/Escape + timeout nginx |
| `ecfc21c` | **F35** — retirada de la paleta v0 de Tailwind + guard anti-regresión |

Stack recreado con `docker compose up -d --build` y smoke en verde: frontend 200,
`/api/health` 200 (`vecEnabled` y `ftsEnabled` true), `Cache-Control: no-cache` en la raíz,
y `#/tv/17` pintando la sesión demo sin login. **Pendientes: F34 (catálogo de Stormlight) y
F36 (¿borrar `MyCharacters.jsx`? — requiere decisión del founder).**

Lecciones nuevas en LEARNINGS: el footgun del entero 0/1 en guards JSX (F30), el falso
negativo de `grep -P` por locale y el test-guard para regresiones que no rompen el build
(F35), y filtrar por identidad tomándola del socket y no del payload (F33).

**Contexto histórico del lote (por si hace falta reconstruir el porqué):**

- **F33-chat-history-privacy — cerrada.** Era: Bug de privacidad real (ver
  abajo) + 2 remates pequeños (Escape/`role=dialog` en `Modal.jsx`, `proxy_read_timeout`
  del `/api/` en nginx que causa el 504 documentado de `/api/ai/ask`).
  **Se lanzó el implementer y murió al arrancar por límite de uso de la cuenta** (sin tocar
  ningún archivo; working tree limpio). La entrada del backlog lleva el fix exacto.
- **F34-stormlight-catalog — PENDIENTE.** Catálogo asimétrico (ver abajo).
- **F35-last-v0-debt — PENDIENTE.** Cierra lo que F32 dejó vivo (8 emojis + tokens v0 en
  MyCharacters y 2 paneles de Stats, exports muertos, retirar alias gold/ink). Mismo destino
  que F33: el implementer murió por límite de uso antes de editar nada.

**Verificación en vivo hecha por el líder (2026-07-30), no solo tests:** stack reconstruido
(frontend + backend, vigencia por hash de `sockets/session.js` confirmada) y
`http://localhost:3000/#/tv/17` abierto SIN login → pinta sesión, campaña·sistema, reloj,
tarjeta del último evento (RECOMPENSA), party con vitales de Talani, franja de 5 eventos y
la URL de invitación. **Tras conectar la TV, el log append-only sigue con su última entrada
del 24-jul y `session_members` sin cambios → el espectador NO deja rastro.** Socket.io
conectado (POST de `session:spectate` con 200). `#/dashboard` sin usuario guardado cae al
Login y `localStorage` queda vacío (no se escribe nada antes de autenticar).
Nota: **el stack corriendo incluye código SIN COMMITEAR** (F31+F32); para volver al estado
publicado, `git stash` + `docker compose up -d --build`.

Hallazgos del barrido de código del líder (lectura pura, 2026-07-30):
- 🔴 **`chat:history` filtra los mensajes privados de todos a cualquiera** que abra el chat
  (`backend/src/sockets/chat.js`): el emit en vivo sí filtra por destinatario, pero el
  historial hace un `SELECT` sin filtro. Las notas privadas, en cambio, están bien resueltas
  (señal por socket sin bodies + refetch REST filtrado por rol). → F33.
- 🟡 **Catálogo asimétrico** (verificado contra la DB real): Dragonbane 91 skills / 136 items;
  Stormlight 21 / 2. Las reglas de Stormlight sí están en el RAG (F23), el catálogo no. → F34.
- 🟢 **Lo que estaba "pendiente del founder" ya está hecho**: el seed de Dragonbane está
  corrido en la DB real (los 91/136 salen de ahí). No tiene que ejecutar nada.
- `Modal.jsx` no cierra con Escape ni declara `role="dialog"`, mientras `Sheet.jsx` sí. → F33.
- `nginx.conf`: `location /api/` con el `proxy_read_timeout` por defecto (60 s) = causa del
  504 en `/api/ai/ask` que ya estaba documentado en LEARNINGS. → F33.
- El footgun de F30 (`{intFlag && <…>}`) **NO existe en ningún otro sitio** del frontend
  (grep app-wide) → el barrido de F30 es suficiente.
- `App.jsx` no persiste nada: **cualquier refresh devuelve al login y saca de la sesión**.
  Es el peor problema de usabilidad vivo y nadie lo había anotado. → F31.
- 2 componentes huérfanos (~1.500 líneas) con paleta v0. Verificada la paridad: el import de
  game packs vive hoy en `AttributesPage.jsx:71`, así que no se pierde funcionalidad. → F32.

## Feature en progreso (contexto histórico del lote previo)

Directiva del founder (2026-07-22): "haz todo" → F23 (docs, DONE) → **F24 (fix eventos, SIGUIENTE)**
→ F25 (sesión demo completa) → commit + imagen actualizada corriendo. Una a la vez.

- **F23-full-docs-ingest — DONE + commit `52ff8f6`.** 14 MDs ingeridos para todos los DMs (986
  chunks con vectores). Verificado en vivo (RAG por sistema correcto).
- **F24-planning-freeevents — DONE.** Fix eventos sueltos enlazados en Prep (helper puro
  computeSubLocFlows). 91/91 tests + vigencia por hash. Reviewer cayó por límite → verificado por
  el líder. Prueba en vivo pendiente vía F25. Commit pendiente (junto con este cierre).
- **F25-demo-session-seed — DONE.** 1 sesión activa `[DEMO] Asedio de la Torre` (Honor/Stormlight):
  prep 2 ubic/4 sub/11 eventos/7 enlaces + 3 sueltos enlazados (ejercita F24), 3 NPCs (1 con
  quest+item), 9 disparos (4 plan/3 adhoc/2 npc), 6 chats, 2 notas, resumen IA 982 chars. Verificado
  en vivo (DB+API+bundle: nginx sirve F24+F22; API devuelve la sesión con campaign_game_system_name).
  Stack recreado (up -d --build) Up. Commit pendiente. Falta solo la prueba de UI logueado (founder).

- **F26-ai-concise — DONE.** IA directa (DIRECT_STYLE en positivo, rules temp 0.2, sin
  'conversacional'; citas + anti-alucinación intactos). 151 tests. Verificado EN VIVO: respuesta
  de reglas ahora es una línea con cita, sin preámbulo ni cierre de cortesía. Backend recreado.
  Commit pendiente en este cierre.

## 🏁 "haz todo" COMPLETO (F23+F24+F25) + F26 (concisión IA)
Los 3 commiteados (F23 52ff8f6, F24 23362af, F25 pendiente en este cierre). Imagen actualizada
corriendo. La IA responde con contenido real de ambos sistemas (986 chunks con vectores).
Pendiente SOLO del founder: abrir `[DEMO] Asedio de la Torre` logueado como DM1 y click-through.

## Nota de infraestructura
Docker Desktop se cayó a mitad de sesión (daemon npipe no respondía) y el líder lo reinició
(`Start-Process "Docker Desktop.exe"` + poll `docker info`); los contenedores volvieron solos
por `restart: unless-stopped`. Stack Up de nuevo (backend/frontend/ollama).

**Runtime IA YA ARRIBA:** Ollama + qwen2.5:3b + nomic-embed-text, ready:true, vectores activos.
Nota: nginx da 504 en /api/ai/ask (LLM CPU lento); el streaming por socket del AIPanel sí funciona.

## PENDIENTE (solo del founder, runtime IA — no código)
- **Runtime IA:** `docker compose --profile ai up -d --build` + `... run --rm ai-bootstrap` +
  `curl localhost:3001/api/ai/status` (esperar ready:true) + **reindexar cada doc** + subir los
  `.md` por sistema. Sin esto, F21 mejora el TONO pero el retrieval sigue vacío.

## Scout F22 (hecho por el líder, lectura pura)
- `GET /api/sessions/:id` YA devuelve `campaign_game_system_id` (sessions.js:44) y el listado
  también (sessions.js:21). El AIPanel (AIPanel.jsx:88-103) NO lo usa: deriva el sistema solo
  de `character.game_system_template_id`. Arreglo = resolver desde la campaña primero,
  personajes como fallback.
- Campo legacy `campaigns.game_system` (TEXT) MUERTO: campaigns.js solo lee/escribe
  `game_system_id` (SELECT c.* lo arrastra pero nada lo consume). Limpieza de bajo riesgo.
- Nombre del sistema: la query de sesión NO trae el nombre; opcional añadir
  `gs.name AS campaign_game_system_name` al join, o el frontend cae a `Sistema {id}`.
- Renombrar `game_system_template_id` → NO (toca demasiado, poco valor). Solo documentar.

## Cerradas esta sesión (2026-07-22)
- **F20-quick-event** — APROBADA. Modal de evento rápido en la toolbar (crea-y-dispara al
  instante), frontend puro sobre el POST /events existente. docker build frontend exit 0,
  79/79 tests. 2 lecciones nuevas (vitest sin jsdom → helpers puros; correr tests frontend
  en Docker sin ensuciar el host).
- **F21-ai-tone** — APROBADA. Prompts de IA por tarea (menos robótica). Backend puro (ai.js
  + 2 tests). lint exit 0 + 144 tests en Docker. 2 lecciones nuevas (negar una frase la prima
  en modelos chicos; el backend de compose no monta src/ → rebuild antes de testear).
  Deuda menor: la frase vieja sobrevive en un comentario histórico (ai.js:313-315), sin efecto.
- **F22-system-model-coherence** — APROBADA (reviewer independiente, pasada limpia; re-verificada
  en vivo por el líder). La IA resuelve el sistema desde la CAMPAÑA (helper resolveSessionGameSystems,
  personajes fallback); GET sessions expone campaign_game_system_name (JOIN 1:1); Dashboard avisa
  sin-campaña; legacy campaigns.game_system eliminado con migración idempotente M003; sessions SIN
  game_system_id. backend 148 tests + frontend 85. 2 lecciones nuevas (DROP COLUMN legacy con guard
  PRAGMA + schema; MIGRATIONS exportable para testear idempotencia).

## Backlog F0–F19 (contexto): COMPLETO
Todas `done`. La sesión autónoma previa cerró F15 (saneada), F16, F17, F18 y F19.

## Pendiente SOLO del founder (runtime IA, no código)
Para que la IA generativa funcione en vivo (hoy degrada limpio sin ella):
1. `docker compose --profile ai up -d --build`
2. `docker compose --profile ai run --rm ai-bootstrap`  (baja `nomic-embed-text` + `qwen2.5:3b`)
3. `curl localhost:3001/api/ai/status` → esperar `ready:true`
4. **Reindexar cada doc** (hoy solo FTS, cero vectores): tab Documentos o `POST /api/game-systems/:id/docs/:docId/reindex`.
5. Validar calidad del LLM; si flojea, subir a 7b vía `AI_MODEL`. Detalle en `ai_audit.md`.

## En paralelo (no bloquea features)

- `consultor` → **auditoría de IA end-to-end** (`ai_audit.md`): qué funciona, dónde está
  cableada la IA y dónde falta, dependencias de runtime (Ollama + reindex), y spec/quick-wins
  para F18. Informa el "que la IA funcione para todo".

## Orden del backlog restante

F15 (cerrar) → F16 (NPCs completos; backend parcialmente presente) → F17 (Preparar Sesión
rediseñada) → F18 (sesión en vivo completa: notas, tabs por personaje, toolbar, **presets IA**) →
F19 (detalle de historial).

## Cerradas esta sesión (2026-07-20)
- **F15-catalog-pages** — APROBADA. 5 páginas de catálogo + bulk import. Saneado el commit
  `d894c3b` fuera-de-flujo (verificado+revisado en Docker). Cierre commiteado como `feat(F15)`.
- **F16-npcs** — APROBADA. Gestor de NPCs maestro-detalle + columna `disposition` (migración
  idempotente) + `npcs.test.js`. Backend ya estaba ~90%. Commiteado como `feat(F16)`.
- **F17-prep-redesign** — APROBADA. "Preparar Sesión" full-bleed (rail 62px + panel 266px +
  vistas Lista/Grafo con Bézier/zoom/enlaces). `EventFlowGraph` extendido sin romper `compact`.
  3 lecciones nuevas en LEARNINGS. Backend ya estaba completo.
- **F18-session-live** — APROBADA (la más grande). Notas (privacidad verificada en vivo) +
  IA backend (presets/topics/summaries) + AIPanel v2 (envuelto, streaming intacto) + toolbar DM +
  StatusTab editable + restyle. Backend 141 pass, frontend 68. Migración M002.
- **F19-history-detail** — APROBADA (última). `SessionDetail` con 4 tabs (Notas/Eventos/Resumen/IA)
  reutilizando piezas de F18/F14/F7; tab IA conserva streaming; `FiredEventCard` DRY. frontend 77.

## Cerradas en sesiones previas
- **F13-design-foundation** — commit `476a07d`. AppShell + tokens + iconos.
- **F14-pages-core** — commit `6b9c2c3`. Dashboard/Campañas/Historial rediseñadas.

## IA — auditoría (`ai_audit.md`) + acción REQUERIDA del founder
Veredicto: la IA **no funciona para todo hoy**. Motor backend excelente (F6/F9/F11/F12), pero
(1) runtime apagado de fábrica y (2) solo cableada en el AIPanel de sesión (presets/historial = F18/F19).
El código lo completo yo. Lo que **SOLO el founder puede cerrar** (runtime en su máquina, descarga
de modelos ~GB que ya llenó disco en F9, juicio de calidad del LLM):
1. `docker compose --profile ai up -d --build`
2. `docker compose --profile ai run --rm ai-bootstrap`  (baja `nomic-embed-text` + `qwen2.5:3b`)
3. `curl localhost:3001/api/ai/status`  → esperar `ready:true`
4. **REINDEXAR cada doc** (hoy solo FTS, cero vectores): botón en tab Documentos o
   `POST /api/game-systems/:id/docs/:docId/reindex` (no hay reindex-all).
5. Si `qwen2.5:3b` flojea, subir a 7b vía `AI_MODEL` (sin tocar código).
Riesgo: la IA real nunca corrió en vivo (todo con stubs). La calidad LLM + reindex real están sin verificar.

## Spec F18 (de la auditoría, componer sobre F9–F12; SIN arquitectura nueva)
- Presets Sesión = helper `streamSessionPreset` reusando `callLlmStream`+`packWithinBudget`+`toSources`.
- Topics Sistema = `streamRulesQuestion` con filtro `sectionType` (ya en `hybridSearch`).
- "Incluir sesiones anteriores" = inyectar `session_summaries` previos (sugerido `GET /api/campaigns/:id/summaries`).
- Único backend nuevo: **router de `session_notes`** (tabla existe, faltan rutas) → `createNotesRouter(io)`.
- Con Ollama, correr por **inyección de contexto** (tool-use OFF en local, solo `AI_PROVIDER=api`).
- Quick-win: `ai:ask` no propaga `sectionType` (una línea en `sockets/ai.js` + `streamRulesQuestion`).
- Deuda visual: `AIPanel`/`SessionView` aún con tokens viejos + emojis (`App.jsx:17`) → re-tematizar en F18.

## Deuda menor
- **De la revisión de F34 (2026-08-07), no bloqueantes:**
  - `ItemsPage` **no tiene filtro por sección**. Con 76 items de "Equipo" repartidos en 9
    categorías, buscarlos es incómodo. `SkillsPage` sí tiene chips; portarlos a Items es una
    feature pequeña de frontend.
  - `item_formats` se listan `ORDER BY created_at DESC` → "Equipo" sale **antes** que "Armas"
    en la app. Cosmético y preexistente.
  - Falta un `assert.throws` de 2 líneas para la única rama sin ejercitar de `seed-catalog.js`
    (pack sin `name`).
  - Mezcla de idioma en los nombres de field: inglés en los formatos de items, español en los
    de skills. Coherente con lo legacy de cada uno y con lo que hizo F29, pero el DM los ve.
- **DECISIÓN PENDIENTE DEL FOUNDER — datos legacy de Stormlight** (ni implementer ni reviewer los
  tocaron a propósito; los cuatro son cambios de datos, no de código):
  1. `Thievery` y `Survival` tienen atributo gobernante `Intellect`/`Willpower` en el pack, pero
     `01-mecanicas-core.md` los clasifica SPD/AWA. Corregirlo son 2 líneas.
  2. El pack trae **21 skills donde el MD lista 18** (añade `Trickery`, `Influence`, `Performance`).
  3. La `description` del formato dice **"Las 15 habilidades documentadas"** y hay 21. Ojo: el seed
     **nunca hace UPDATE de descripciones**, así que cambiarla en el pack solo afectaría a
     instalaciones nuevas → crearía divergencia silenciosa pack↔DB.
  4. `Espada larga`≈`Longsword` y `Maza pesada`≈`Hammer` conviven, y los legacy usan rasgos
     inventados ("Versatil", "Pesada") que no existen en la fuente. Inevitable: los legacy no se
     pueden borrar ni renombrar sin romper los pregens.
- **De la revisión de F36 (2026-08-07), las tres no bloqueantes:**
  - `CharactersPage` — si `createCharacter` falla, el modal **sigue abierto** (el
    `setCreateOpen(false)` va después del `await` y se salta al lanzar) y el banner de error se
    pinta en la página **por debajo** del backdrop del `Modal`: el usuario ve el botón volver de
    "Creando…" sin mensaje legible. Es **preexistente**, no lo introdujo F36. Arreglo: mover el
    banner dentro del `<Modal>`.
  - `pages.test.jsx:29` solo renderiza `CharactersPage` con `user={DM}` → **la ruta de jugador no
    tiene test**, y justo `isOwner` (el guard del botón eliminar) es lógica sin cobertura. Añadir
    `<CharactersPage user={player}/>` al array `PAGES` cuesta una línea.
  - El censo que autoriza un borrado debe cubrir **todo el paquete**, no solo `src/`: configs,
    `Dockerfile`, `nginx.conf`. Al de F36 se le escapó `tailwind.config.js:66` (mención histórica
    inocua, no hace falta tocarla).
- **Deuda de estilo v0 (importante antes de eliminar alias v0 de Tailwind):** quedan con tokens v0
  (`gold/ink/gray`) + emojis: `ChatPanel`, `CanvasBoard`, `SessionStatsPanel` (📜⏱️⚔️ en `StatTile`).
  F19 puede rematar `SessionStatsPanel` (está en su superficie); ChatPanel/CanvasBoard necesitan una
  pasada de limpieza. Si se eliminan los alias v0 sin restilar estos, rompen visualmente.
- **Exports muertos (F18):** `listCampaignSummaries` y `categoryClasses` — limpiar en una pasada futura.
- El auto-commiteador del entorno sella el working tree con mensajes genéricos y a veces gana la
  carrera a mis commits `feat(Fxx)`. El trabajo se persiste igual; no reescribir historia.
- Commit `d894c3b` no sigue la convención `feat(F15): …` (cosmético; no re-escribir historia).

## F16 pre-scouted (`scout_F16-npcs.md`)
Backend ~90% listo (CRUD + quests/inventory/campaigns + montado + 4 tablas). Frontend es
placeholder. Trabajo de F16 = frontend (maestro-detalle real) + 7 métodos en `api.js` +
`npcs.test.js` + columna `disposition`. NO tocar router/sub-recursos/PlanningPanel (ya integran).

## F17 pre-scouted (`scout_F17-prep.md`)
Backend COMPLETO (preps/ubicaciones/sub/eventos/enlaces con etiqueta). Página `PrepPage.jsx`
existe pero provisional. Grafo objetivo ~55-60% ya en `EventFlowGraph.jsx` (drag, aristas,
enlaces con etiqueta, CRUD). Trabajo de F17 = frontend: rail 62px + panel ubicaciones 266px +
toggle Lista/Grafo; al grafo faltan Bézier, zoom, fondo de puntos, aristas por tipo, nodo 186px
con barra de categoría, leyenda. Migrar tokens v0→handoff + emojis→`Icon.jsx`. Mapear 8 categorías
v1 → 4 colores `cat.*` (ya en tailwind). Cuidar la firma `compact` de EventFlowGraph (la usa PlanningPanel/F8b).
Decisiones del líder (en diseño documentado + principios): (1) `PrepPage` **full-bleed con rail 62px
propio** (como SessionView), no colapsar el sidebar; (2) **reorder por swap de `order_index` con el PUT
existente**, sin endpoint nuevo; añadir `updateLocation`/`updateSubLocation` a `api.js` (PUT ya existe).

## Preguntas abiertas
- ~~Disposición de NPCs~~ **RESUELTA por scout**: NO existe en schema y el mockup `NPCs.dc.html`
  la necesita (badge Aliado/Neutral/Hostil). Decisión del líder: se agrega en F16 como columna
  `disposition` nullable (aditiva, backward-compatible) = implementar el diseño documentado, no
  inventar arquitectura. Reflejar en POST/PUT.
- **Eliminar campaña (F14, para el founder):** no existe `DELETE /api/campaigns/:id` ni
  política de borrado (FK sessions→campaigns sin ON DELETE). Opciones: (a) archivado,
  (b) DELETE bloqueado si tiene sesiones, (c) cascade. Pendiente de decisión del founder.

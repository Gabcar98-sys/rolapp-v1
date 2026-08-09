# LEARNINGS — Memoria acumulada del harness

> Este archivo es la memoria viva del equipo de agentes.
> Se construye con cada feature. Nunca se borra — solo se agrega.
>
> **Para agentes:** lee este archivo antes de tomar cualquier decisión técnica.
> Si una lección aplica a lo que estás a punto de hacer, síguela.
> Si vas a contradecirla, explícalo en tu reporte y espera aprobación del founder.
>
> **Para el founder:** este archivo es tuyo también. Puedes agregar lecciones manualmente.

---

## Cómo está organizado

Las lecciones se agrupan por categoría. Cada entrada tiene:
- **Contexto:** en qué feature o situación se aprendió.
- **Lección:** qué se aprendió, concreto y accionable.
- **Por qué importa:** consecuencia de ignorarla.

---

## Categorías

- [Stack y plataformas](#stack-y-plataformas)
- [Base de datos / SQLite](#base-de-datos--sqlite)
- [RAG / embeddings / sqlite-vec](#rag--embeddings--sqlite-vec)
- [Backend / Express / Socket.io](#backend--express--socketio)
- [Frontend / React / Tailwind](#frontend--react--tailwind)
- [Arquitectura](#arquitectura)
- [Testing](#testing)
- [Docker / infraestructura](#docker--infraestructura)
- [Proceso y flujo de trabajo](#proceso-y-flujo-de-trabajo)

---

## Stack y plataformas

### El proyecto corre con Docker; Node local es opcional
- **Contexto:** entorno del founder (Windows, sin Node en PATH, Docker presente).
- **Lección:** El camino canónico de ejecución es `docker compose up`. No asumas que hay Node local. Cualquier instrucción de verificación debe poder correrse dentro de contenedores.
- **Por qué importa:** Comandos que asumen `node`/`npm` en el host fallan en la máquina del founder.

### El repo vive fuera de OneDrive
- **Contexto:** la v0 estaba en OneDrive\Escritorio; node_modules sincronizando causaba problemas.
- **Lección:** El repo v1.0 vive en `C:\Users\gabri\dev\rolapp-v1`. No lo muevas a OneDrive ni generes artefactos pesados sincronizables fuera del repo.
- **Por qué importa:** OneDrive sincronizando node_modules causa lentitud, locks y corrupción.

---

## Base de datos / SQLite

### better-sqlite3 es síncrono
- **Contexto:** acceso a datos en todo el backend.
- **Lección:** `better-sqlite3` es **síncrono**. NO uses async/await ni `.then()` con sus métodos. Usa `db.prepare(...).get()/.all()/.run()` directo, y `db.transaction(fn)` para atomicidad.
- **Por qué importa:** Envolverlo en async añade complejidad inútil y oculta errores; las transacciones síncronas son más simples y seguras.

### Verificar migraciones consolidadas con PRAGMA en el contenedor, no leyendo el .sql
- **Contexto:** F1, consolidar 31 migraciones de la v0 en un solo schema.sql.
- **Lección:** Al consolidar columnas que en la v0 venían de migraciones (`ALTER TABLE`), confirma con `PRAGMA table_info(tabla)` dentro del contenedor que cada columna quedó en el baseline. Leer el .sql no basta. En un mismo `db.exec` con varios CREATE TABLE, SQLite tolera FKs hacia tablas declaradas más abajo, así que el orden de bloques puede priorizar legibilidad.
- **Por qué importa:** Una columna migrada que se olvida en el baseline rompe queries de features posteriores de forma silenciosa.

### Eliminar una columna legacy: `DROP COLUMN` idempotente con guard PRAGMA + actualizar schema.sql
- **Contexto:** F22, quitar el campo muerto `campaigns.game_system` (TEXT).
- **Lección:** `ALTER TABLE … DROP COLUMN` funciona en better-sqlite3 11.x. Antes de eliminar: (1) confirma CERO consumidores reales con `rg --pcre2 'game_system(?!_id|_name|_template|s)\b'` (ripgrep necesita `--pcre2` para look-ahead) y `rg --pcre2 '\.game_system(?![_a-zA-Z])'`; (2) migración idempotente que hace el DROP solo si `PRAGMA table_info` encuentra la columna; (3) elimina también la columna de `schema.sql` (fresh install) y comenta el porqué. Cubre AMBOS caminos en tests: upgrade (DB aislada CON la columna → drop → reejecutar no-op) y fresh install (schema sin la columna → M00x no-op pero registrada en `_migrations`).
- **Por qué importa:** Sin el guard, reejecutar la migración lanza; sin tocar schema.sql, las instalaciones nuevas recrean la columna muerta; sin cubrir ambos caminos, el upgrade real del founder queda sin verificar.

### Al leer una SQLite en modo WAL desde fuera, copia también el `-wal` o verás la base de hace semanas
- **Contexto:** F37, el reviewer copió `rolapp.db` a un contenedor para auditar la sesión 17 y le salió **cero eventos** y la sesión inexistente.
- **Lección:** El `.db` era de hacía dos semanas: todo lo reciente vivía en un `rolapp.db-wal` de 6 MB. Al auditar la DB real, copia **`base.db` Y `base.db-wal`** (montando la original `:ro`) y abre la copia. Si el resultado sale sospechosamente vacío, sospecha del WAL **antes** que del código.
- **Por qué importa:** El síntoma es idéntico a "la feature no escribe nada" o "ese id no existe", así que se diagnostica mal y se persigue un bug que no existe.

---

## RAG / embeddings / sqlite-vec

### Concisión en modelos pequeños: cláusula de estilo compartida, en positivo, temperatura baja
- **Contexto:** F26, la IA (qwen2.5:3b) divagaba (preámbulos + cierres de cortesía) pese al anti-alucinación de F21.
- **Lección:** Para respuestas directas, concatena UNA cláusula de estilo compartida a todos los system prompts, redactada en POSITIVO — "abre con la respuesta, ve al grano, cierra al completar" — en vez de prohibir frases ("no digas 'espero que te ayude'"), que en modelos chicos las prima. Combínalo con temperatura baja para la tarea factual (rules a 0.2). Testeable con `assert.match` de las frases presentes (no `doesNotMatch`). Mete el default de temperatura por tarea como fallback de `numEnv('AI_TEMPERATURE', taskDefault)` para no romper el test de precedencia de env.
- **Por qué importa:** El mismo modelo local pasa de un párrafo con relleno a una respuesta de una línea con cita, sin tocar retrieval ni el modelo.

### Los docs de reglas son contenido compartido: ingerir por NOMBRE de sistema, no por el del DM
- **Contexto:** F23, los MDs de Stormlight/Dragonbane no llegaban a todos los DMs.
- **Lección:** Cada DM tiene su propia copia del game_system (misma `name`, distinto `dm_id`). El seed histórico ingería docs solo en el sistema del `--dm` objetivo → los demás DMs quedaban sin reglas. Ingerir por nombre: `SELECT id FROM game_system_templates WHERE name = ?` y `ensureDoc` en CADA sistema. (Nota de modelo pendiente: los game systems son per-DM; el founder quiere que sean para todos — evaluar hacerlos globales/compartidos, no duplicados.)
- **Por qué importa:** Con varios DMs, la IA respondía "sin contenido" para unos y bien para otros, sin causa evidente.

### Un doc ya ingerido SIN Ollama queda con chunks pero sin vectores: hay que REINDEXAR, no reingerir
- **Contexto:** F23, la guía de Stormlight (ingerida en F10 sin Ollama) tenía 62 chunks con embedding NULL.
- **Lección:** `ingestDoc` salta el trabajo si el `content_hash` coincide ("sin cambios") → reingerir el MISMO contenido NUNCA genera vectores. Para cerrar la brecha hay que **reindexar** explícitamente (`POST /api/game-systems/:id/docs/:docId/reindex`), que re-embebe sin re-chunkear. Tras encender Ollama, conviene un chequeo "chunks sin vector" y reindexar esos docs.
- **Por qué importa:** El doc parece ingerido pero el retrieval vectorial no lo ve; degrada a solo-FTS de forma silenciosa.

### Negar una frase en un system prompt puede primarla en modelos pequeños
- **Contexto:** F21, quitar el lenguaje doc-céntrico de los prompts de sesión/resumen para que la IA deje de responder "no hay documento".
- **Lección:** No prohíbas literalmente una frase (`Nunca menciones "documentos cargados"`): (1) reintroduce en el prompt justo el texto a evitar y (2) con un modelo pequeño la negación puede *primar* lo prohibido. Formula el alcance en POSITIVO ("tu única fuente es el contexto de la sesión"). Además, endurecer la abstención ("REGLA CRÍTICA… es preferible abstenerse") hace que un modelo 3B sobre-abstenga y recite frases enlatadas; prefiere tono natural + anti-alucinación acotado a afirmaciones factuales.
- **Por qué importa:** Un prompt bienintencionado pero mal formulado produce justo la respuesta robótica que se quería eliminar.

### Con un modelo pequeño, el dato correcto en el contexto no basta: hay que ponerlo también AGREGADO
- **Contexto:** F37. Tras arreglar el render de eventos, los dos NPCs de la sesión estaban en el contexto y qwen2.5:3b **seguía nombrando solo a uno en 4 de 6 corridas** (sesgo de recencia: el último evento era de ese NPC; y `DIRECT_STYLE` empuja a respuestas mínimas).
- **Lección:** Para preguntas del tipo "enumera los X de la sesión", **precomputa la lista en el contexto** (`=== NPCS QUE HAN APARECIDO ===\nA, B`) en vez de esperar que el modelo la extraiga del historial. Es dato estructurado derivado, no una respuesta enlatada, y de paso **sobrevive a los recortes por presupuesto** si lo calculas sobre TODOS los eventos y no solo sobre los que caben. Dedupe por **nombre**, no por id: en la DB real el mismo NPC viajaba como `npc_id: 5` y como `"5"`. El acierto pasó de 4/6 a 11/11. Ver el criterio de revisión en [Testing](#testing).
- **Por qué importa:** Sin el agregado el modelo improvisa desde la prosa: en la medición de control llegó a responder el nombre de un personaje **jugador** como si fuera un NPC.

### Un ejemplo literal de formato pegado a la generación se copia como contenido
- **Contexto:** F37, ampliación de la lección de F21 con evidencia nueva. El implementer intentó forzar la cita inline repitiendo `p. ej. [Combate > Iniciativa]` en la instrucción final del mensaje `user`.
- **Lección:** El **mismo** ejemplo es inofensivo en el system prompt (donde vive desde F21) y **tóxico** en la instrucción final: 1 de 3 corridas devolvió *"Las reglas están respaldadas por [Combate > Iniciativa]"* — una cita **inventada** (esa sección no existe en los docs). Los ejemplos de formato van **lejos** de la generación; cerca, se convierten en respuesta. Si necesitas mejorar las citas, baja el ruido del retrieval (menos `topK`) en vez de endurecer el prompt.
- **Por qué importa:** Una cita fabricada es peor que ninguna: parece verificable y no lo es.

### La tabla virtual vec0 no puede vivir en schema.sql
- **Contexto:** F1, al consolidar el esquema con la tabla de vectores de sqlite-vec.
- **Lección:** La tabla virtual `vec0` solo existe **tras** `sqliteVec.load(db)`. Patrón: aplicar `schema.sql` primero y luego crear `vec_chunks` con `CREATE VIRTUAL TABLE IF NOT EXISTS … vec0(…, embedding FLOAT[768])` dentro de un try/catch que degrade `vecEnabled` sin romper el arranque. nomic-embed-text = 768 dims. vec0 genera 4 tablas sombra (`vec_chunks_*`) que aparecen en `sqlite_master` — no las cuentes como tablas de aplicación.
- **Por qué importa:** Ponerla en `schema.sql` rompe el arranque cuando la extensión no cargó, y descuadra los conteos de tablas en verificaciones.

---

## Backend / Express / Socket.io

### Routers que emiten por socket → factory `createXRouter(io)`
- **Contexto:** F4, endpoints REST (sessions, canvas) que además emiten eventos por Socket.io.
- **Lección:** Para que un router REST pueda emitir por socket sin imports circulares, expórtalo como factory `export default function createSessionsRouter(io) { ... }` y créalo en `index.js` DESPUÉS de instanciar `io`, montándolo con `app.use('/api/sessions', createSessionsRouter(io))`.
- **Por qué importa:** Importar `io` directamente desde los routers genera ciclos de import y acoplamiento; la factory mantiene el router testeable y desacoplado.

### Filtrar por identidad: el id del solicitante sale del socket, nunca del payload
- **Contexto:** F33, `chat:history` devolvía TODOS los mensajes de la sesión — incluidos los susurros privados entre otros — a cualquiera que lo pidiera. El emit en vivo sí filtraba; el historial no.
- **Lección:** Cuando un handler devuelve datos que dependen de "quién pregunta", toma la identidad de **`socket.data.userId`** (que fija `session:join` en el servidor), nunca de un campo del payload: un cliente pediría el historial "de otro" y leería sus privados. Y resuelve el caso **sin identidad** en fail-closed — un socket que no hizo `session:join` (p. ej. el espectador de la vista TV, que a propósito no recibe `userId`) debe recibir solo lo público, no todo. Ojo al patrón general: **un mismo dato servido por dos caminos (push en vivo vs. fetch de historial) necesita el MISMO filtro en ambos**; es fácil blindar uno y olvidar el otro. Compáralo con el patrón bien resuelto de las notas (F18): el socket emite una señal sin bodies y el cliente refetchea por REST, que filtra por rol.
- **Por qué importa:** Pasa lint, build y todos los tests; solo se detecta leyendo la query. La fuga es silenciosa y total.

### session_events es append-only
- **Contexto:** modelo de eventos de sesión heredado de la v0.
- **Lección:** El log `session_events` solo recibe INSERT. Nunca UPDATE ni DELETE. El estado se deriva reproduciendo el log.
- **Por qué importa:** Mutar el log rompe la reproducción de estado, el historial y las estadísticas derivadas.

### El actor de un evento no es siempre quien lo escribió: sigue el payload hasta el render
- **Contexto:** F37. La IA atribuía al DM las acciones de los NPCs: `renderEvents` hacía JOIN con `users` por `actor_id` y pintaba `DM1:` donde la ficción decía *Brightlord Amaram*.
- **Lección:** `session_events.actor_id` guarda **quién disparó** el evento (el DM), mientras que **quién actúa en ficción** vive en `payload.npc_name` con `payload.actor_type === 'npc'`. Cuando una tabla tenga `actor_id` **y** un `actor_type` en el payload: el `actor_id` es la **procedencia técnica**, el payload es la **verdad narrativa**. Cualquier vista que muestre "quién hizo algo" (IA, cronología, stats, TV) tiene que resolver la etiqueta desde el payload. Lo mismo con `payload.participants`: se perdían enteros.
- **Por qué importa:** El síntoma es perfecto para pasar desapercibido — la línea se ve bien formada, solo que atribuida a la persona equivocada. Aquí hizo que "¿qué NPC han aparecido?" fuera irrespondible sin que nada fallara.

---

## Frontend / React / Tailwind

### Cero estilos inline, cero window.innerWidth
- **Contexto:** la v0 usaba `const s = {…}` en cada componente y hacks de `useWindowWidth`.
- **Lección:** Estilos solo con clases Tailwind + tokens definidos en `tailwind.config.js`. Responsive con breakpoints (`md:`, `lg:`), no midiendo el ancho en JS.
- **Por qué importa:** Los estilos inline duplicados eran el principal dolor de mantenimiento de la v0; medir el ancho en JS re-renderiza de más y no es responsive real.

### Una feature de frontend no está terminada hasta que sus componentes estén cableados y accesibles
- **Contexto:** F5, primera ronda: `PlanningPanel`/`SessionPrepPanel`/`EventTemplatePanel` quedaron definidos pero nunca importados; `SessionView` no se modificó → la planificación era inaccesible desde la UI.
- **Lección:** Crear un componente no es "implementarlo". El implementer debe montarlo en la jerarquía (importado, renderizado, con ruta/tab/acceso navegable) y dejar el flujo de usuario alcanzable. El reviewer hace `grep` de imports para detectar componentes huérfanos.
- **Por qué importa:** Componentes huérfanos pasan lint/build pero la feature no existe para el usuario; es un falso "completado".

### Directiva eslint-disable que referencia un plugin no registrado = error fatal en ESLint 9
- **Contexto:** F5, `eslint-disable-next-line react-hooks/exhaustive-deps` sin tener `eslint-plugin-react-hooks` registrado.
- **Lección:** En ESLint 9 (flat config), una directiva que apunta a una regla de un plugin no registrado es ERROR fatal, no warning, y rompe el build. Para proyectos React, registra `eslint-plugin-react-hooks` con sus reglas en `'warn'` (no rompe el build y aporta valor). No uses disables hacia reglas que el config no conoce.
- **Por qué importa:** Un disable "inofensivo" tumba `docker compose build frontend` entero.

### El flat config de ESLint del frontend necesita eslint-plugin-react (jsx-uses-vars)
- **Contexto:** F4, el lint del frontend emitió 12 warnings falsos `no-unused-vars` sobre imports usados solo como componentes JSX.
- **Lección:** Con flat config de ESLint 9 + JSX, `no-unused-vars` marca como sin usar los componentes que solo aparecen en JSX. Falta la regla `react/jsx-uses-vars` de `eslint-plugin-react`. La próxima feature que toque frontend debe añadir `eslint-plugin-react` y habilitar `react/jsx-uses-vars` (o usar su config recomendada) para eliminar los falsos positivos.
- **Por qué importa:** El ruido de warnings falsos puede ocultar warnings reales y erosiona la confianza en el checkpoint de lint.

### Un entero 0/1 de SQLite en un guard `{flag && <…/>}` pinta el número: barre TODAS las banderas del archivo
- **Contexto:** F30, la ficha mostraba un `0` pegado al nombre de los atributos no-core ("0Deflect", "0Health").
- **Lección:** Las banderas booleanas viajan como INTEGER 0/1 desde SQLite (`is_core`, `has_max`, `is_*`) y llegan crudas al frontend (`SELECT *`). `{0 && <span/>}` devuelve `0` y React lo renderiza LITERAL. Coerciona siempre: `Boolean(flag) && …`, un ternario `flag ? … : null`, o un helper que devuelva nodo o `null` (mejor: el test ejercita el código real, no una copia). Al arreglar UNO, **barre todas las banderas enteras del archivo** con `\{[^}]*&&\s*[(<]` y clasifica cada match: ¿el flag es INTEGER en el schema? ¿el subárbol se pinta directo (footgun) o es la condición de un ternario (a salvo)? Vigila también los valores DERIVADOS (`const x = flag && …` hereda el 0 y lo propaga al guard de más abajo). Un "barrido OK" en el reporte no basta: el reviewer lo re-ejecuta con grep + schema.
- **Por qué importa:** Pasa lint, build y tests unitarios; solo se ve en runtime y solo cuando el flag vale 0. En F30 el primer barrido dejó vivos 2 de 4 casos.

### Dos vistas de los mismos datos deben derivar de la MISMA fuente (grafo vs lista)
- **Contexto:** F24, la pestaña Flujo (grafo) pintaba los eventos sueltos enlazados pero la pestaña Prep (lista) los perdía.
- **Lección:** Cuando dos vistas renderizan el mismo conjunto de entidades por caminos distintos, es fácil que una rama olvide un subconjunto (aquí: la rama `hasLinks` de la lista ignoraba `freeEvents`). Extrae el cálculo a un helper puro compartido y haz que ambas vistas (y todas las ramas de render) lo consuman. Al arreglar una vista que "pierde" datos, revisa que TODAS las ramas (`hasLinks` vs `!hasLinks`) cubran el mismo conjunto.
- **Por qué importa:** El bug pasa build/lint/tests unitarios y solo se ve USANDO la app; divergencias entre vistas erosionan la confianza en la feature.

### Colores dinámicos por entidad: lista de clases estáticas + índice estable, nunca clases interpoladas
- **Contexto:** F14, franja de acento por campaña y puntos del timeline con color derivado del id.
- **Lección:** El JIT de Tailwind solo genera clases que aparecen LITERALES en el código. Para colorear por entidad: define una lista estática de juegos de clases (`const ACCENTS = ['bg-cat-combat', …]`) y elige con un índice estable (hash del id). Ni `style={{}}` (prohibido) ni template strings tipo `bg-${color}` (el JIT no las ve).
- **Por qué importa:** Las clases interpoladas compilan pero no existen en el CSS final; el bug aparece solo en el build de producción.

### `style={{}}` inline SÍ se permite para geometría computada en runtime (no es estilo decorativo)
- **Contexto:** F17, grafo de eventos: posición de nodos arrastrados, `transform: scale` del zoom, posición de píldoras de enlace.
- **Lección:** La prohibición de estilos inline (`const s = {…}`) es contra estilos DECORATIVOS (colores, spacing, tipografía, bordes) que deben ser clases Tailwind + tokens. Un valor GEOMÉTRICO computado en runtime (`transform: translate(347px,122px)`, `scale(1.15)`, `top/left` de un nodo arrastrable) NO se puede expresar como clase estática y `style={{}}` es la vía correcta. Regla para el reviewer: acepta `style=` si es puramente posición/geometría calculada; rechaza si es decoración disfrazada.
- **Por qué importa:** Un rechazo automático por "estilo inline" sobre geometría dinámica bloquea features de canvas/drag/zoom legítimas; y al revés, colar decoración en `style` evade el sistema de diseño.

### Extender un componente compartido = props opcionales retrocompatibles, nunca romper la firma existente
- **Contexto:** F17 extendió `EventFlowGraph` (Bézier, zoom, fondo de puntos, aristas por tipo) que `PlanningPanel` (F8b) ya usa embebido en la sesión con la prop `compact`.
- **Lección:** Cuando amplíes un componente que ya tiene consumidores, añade lo nuevo tras **props opcionales con default** que preserven el comportamiento previo; verifica con `grep` todos los consumidores y confirma que su uso no cambia. El reviewer hace grep de la prop/firma en riesgo (`compact`) y confirma cero regresión en el consumidor existente.
- **Por qué importa:** Cambiar la firma de un componente compartido rompe silenciosamente otras vistas (aquí, la sesión en vivo) que pasan build/lint pero fallan en runtime.

### Vistas de trabajo intensivo van full-bleed (rail 62px propio) fuera del AppShell de 236px
- **Contexto:** F17 (Preparar Sesión) y F4/F18 (SessionView): pantallas-lienzo que necesitan todo el ancho.
- **Lección:** El AppShell con sidebar 236px es para las páginas de navegación (Dashboard, catálogos…). Las pantallas de trabajo intensivo (planificación, sesión en vivo) van **full-bleed con su propio rail de iconos 62px** (réplica solo-iconos del sidebar), como ya hace `SessionView`. No colapses el sidebar 236px para esto; monta la vista full-bleed en `App.jsx`.
- **Por qué importa:** Mantiene consistencia entre las pantallas-lienzo del handoff y evita hacks de layout para exprimir ancho dentro del shell.

### Un control destructivo que afecta a OTROS usuarios no puede ser un icono sin etiqueta
- **Contexto:** F38. El único botón con pinta de "atrás" dentro de la sesión era un `arrow-left` cuya única pista era `title="Reiniciar canvas"`. Borraba el mapa de **toda la mesa**. El founder lo pulsó 16 veces: seis de ellas en dos segundos.
- **Lección:** Tres cosas que se dan por buenas y no lo son: (1) el `title` **no es una etiqueta** — hay que dejar el ratón encima, y en móvil no existe; (2) una flecha **se lee como "volver"** diga lo que diga el `title`, y el usuario no va a descubrir lo contrario antes de pulsar; (3) cuando el efecto no se ve en la propia pantalla, el usuario **repite el clic** porque "no pasa nada" — y multiplica el daño en las pantallas de los demás. Un control destructivo necesita glifo con significado, **texto visible**, `aria-label`, y confirmación con el `Modal` del proyecto (no `window.confirm`) cuyo texto **nombre el alcance**: quién más lo va a notar y cuándo.
- **Por qué importa:** El caso peor de un icono ambiguo no es que no se entienda, es que se pulse repetidamente — y en una app multiusuario cada repetición se propaga a las pantallas del resto.

### La copy de una confirmación es una afirmación técnica: verifícala contra el handler entero, telemetría incluida
- **Contexto:** F38. El modal decía "No afecta a eventos, notas, chat ni personajes". Pero el endpoint **escribe** una fila `session_reset`, y `stats.js` cuenta `event_count` sin filtrar los tipos de motor: en la sesión 17 eso era el 39% del total.
- **Lección:** Al redactar la copy de un diálogo de confirmación, recorre **todos** los efectos del handler —el `UPDATE`, el `logEvent`, el `emit`, el snapshot— y comprueba que **cada negación de la copy sobrevive a los cuatro**. Prefiere verbos concretos ("no borra") a verbos totales ("no afecta"), que son casi siempre falsos. Y deja la copy **cubierta por un test**: en F38 se podía borrar entera la frase que nombraba el alcance sin que nada se pusiera rojo, y el verbo total volvió a prohibirse con un `not.toContain('No afecta a')` explícito.
- **Por qué importa:** Es la frase que el usuario lee justo antes de aceptar. Si es falsa, la confirmación —que existe para que decida con la información correcta— está haciendo lo contrario de su trabajo.

---

## Arquitectura

### Un formato nuevo es más barato que un nombre mentiroso — pero el "cero coste de frontend" se prueba leyendo los tres consumidores
- **Contexto:** F34, meter 76 objetos de equipo de Stormlight cuando el único `item_format` existente se llamaba literalmente "Armas" (y los legacy no se pueden renombrar).
- **Lección:** Con un seed genérico-por-formato (lección de F29), añadir un `item_format`/`skill_format` ENTERO cuesta cero líneas de lógica. Cuando el formato legacy tiene un nombre estrecho que no puedes cambiar y los fields del contenido nuevo son genuinamente distintos (`damage` vs `deflect/cost/weight`), **añade un formato en vez de estirar el viejo**: meter `Soap` o `Blanket` en un formato llamado "Armas" es semánticamente falso y deja 76 items con 4 campos de arma vacíos. **Pero no des por hecho el "cero coste de frontend": pruébalo leyendo los TRES consumidores** — la página que agrupa por formato (`ItemsPage`→`FormatGroups`), el agregador de la ficha (`CharacterSheet.EquipmentTab`, que junta los items de todos los formatos del sistema) y el endpoint que valida al equipar (`SELECT id FROM item_masters WHERE id = ?`, sin atar a un formato). Si UNO de ellos tomara solo el primer formato, N objetos quedarían invisibles. Ojo también a lo que el formato nuevo NO te da gratis: `ItemsPage` no tiene chips de filtro (eso es solo `SkillsPage`), así que el truco de poner `category` como primer field solo rinde en skills.
- **Por qué importa:** Un formato entero que no se renderiza no rompe lint, ni build, ni un solo test: el catálogo simplemente no existe para el usuario, igual que un componente huérfano.

### Al borrar un huérfano, la paridad no acaba en el JSX: sigue el dato hasta el backend
- **Contexto:** F36, borrar `MyCharacters.jsx` porque `CharactersPage.jsx` lo supersedía.
- **Lección:** La capacidad de más riesgo al sustituir una vista no es una que falte, sino una **condición nueva** que el sucesor añade. Aquí el sucesor pinta el botón de eliminar tras `isOwner={String(char.user_id) === String(user.id)}` donde el huérfano lo mostraba siempre: si el endpoint no devolviera `user_id`, la capacidad desaparecería y `String(undefined) === String(3)` daría `false` **sin lanzar**. Regla: cuando el sucesor **añade un guard** sobre algo que el huérfano ofrecía incondicionalmente, verifica en el backend que el campo del guard viaja de verdad en la respuesta (aquí `characters.js` → `getCharacterFull` → `SELECT c.*`). Corolario útil: al comparar huérfano vs sucesor, **la divergencia suele ser el bug del huérfano** — `MyCharacters` pasaba `user.id` (un jugador) donde la API espera `dm_id`, así que su selector de sistemas salía siempre vacío y nadie lo vio en un mes. Motivo extra para borrar en vez de "recuperar".
- **Por qué importa:** Ni el grep, ni el lint, ni el build, ni los tests ven una capacidad que se apaga en silencio detrás de un `undefined`.

### Un seed de catálogo genérico-por-formato absorbe formatos nuevos sin tocar código
- **Contexto:** F29, añadir toda la MAGIA de Dragonbane (un `skill_format` entero nuevo, "Magia", con 56 hechizos) al catálogo.
- **Lección:** Si el seed de catálogo itera **todos** los `skill_formats`/`item_formats` del pack y asegura cada formato por `(game_system_id, name)` (en vez de hardcodear "Habilidades"/"Equipo"), añadir un formato COMPLETO nuevo es puramente un cambio de **datos** en el pack JSON: el seed lo crea e inserta idempotentemente sin cambio de lógica. Diseña los seeds de catálogo genéricos-por-formato desde el principio. Bonus UI: si el frontend deriva el chip de filtro del **primer field** del formato vía una lista tipo `TYPE_FIELD_NAMES` (que incluye `category`), pon el campo discriminante (p. ej. la escuela de magia) como primer field y queda filtrable sin código nuevo.
- **Por qué importa:** Ampliar el catálogo (magia, nuevas categorías) se vuelve data-only, sin re-tocar el seed ni el frontend; menos superficie de bug y features de contenido casi sin código.

### Enriquecer el catálogo de un sistema YA existente ≠ importar un game pack
- **Contexto:** F28, poblar Habilidades/Items de Dragonbane (systems 4 y 6, uno por DM) que ya existían casi vacíos.
- **Lección:** `importGamePack` solo puebla skills/items al **CREAR** un sistema nuevo; sobre sistemas ya existentes es no-op para el catálogo. Para rellenar entidades faltantes en sistemas existentes (varios, uno por DM) hace falta un **seed dedicado** que: (1) asegure el `skill_format`/`item_format` + sus fields por `game_system_id` (aditivo por `field_name`, sin renombrar ni borrar los previos); (2) inserte entidades faltantes **por nombre** (idempotente, sin duplicar); (3) rellene los values con `INSERT OR IGNORE` sobre el `UNIQUE(entity, field)` — nunca UPDATE ni DELETE, para no clobbering ediciones del DM. Opera **por NOMBRE de sistema** (`WHERE name='X'`) para alcanzar todas las copias per-DM (ver lección de F23). Mantén el pack JSON como **única fuente de verdad** y que el seed lo lea (DRY); no hardcodees los datos en el script.
- **Por qué importa:** Reimportar el pack no rellena catálogos existentes (silencioso), y un seed que haga UPDATE/DELETE pisaría el trabajo del DM o duplicaría al reejecutar.

### Un modo que se llama "Sesión" pero cuyo contrato de transporte no acepta `sessionId` es un bug de CONTRATO, no de prompt
- **Contexto:** F37. El panel de IA tenía modo "Sesión", pero su preset "Pregunta libre" iba por `streamRulesQuestion`, que solo recupera `doc_chunks`. El evento de socket `ai:ask` **ni siquiera aceptaba** un `sessionId`.
- **Lección:** Cuando una respuesta salga irrelevante o "robótica", **imprime el contexto REAL que se está mandando** antes de tocar un prompt. El síntoma invita a retocar el system prompt; la causa puede estar dos capas más abajo, en el payload del evento. Corolario: una etiqueta de UI que promete un ámbito ("Sesión") es una afirmación sobre el contrato de transporte — verifica que el ámbito viaje de verdad, de punta a punta. Hallazgo de paso en F37: el frontend ya mandaba `session_id` por REST desde F9 y el backend lo ignoraba — un contrato declarado a medias sobrevive años sin que nada falle.
- **Por qué importa:** Se pierden días afinando prompts contra un contexto que nunca contuvo el dato, y el arreglo real es un parámetro opcional.

---

## Testing

### Para probar retrocompatibilidad, corre las DOS versiones a la vez — y con control positivo
- **Contexto:** F37. El implementer escribió un test que comparaba el mensaje `user` contra un literal escrito a mano. Si lo hubiera copiado del código nuevo, habría pasado demostrando **nada**.
- **Lección:** La prueba fuerte es barata: vuelca `git show HEAD:ruta` como `modulo_head.js` dentro de un **contenedor efímero**, importa los DOS módulos en el mismo proceso y compara el artefacto (aquí, el array de `messages`) con comparación estricta sobre la misma DB. **Acompáñalo SIEMPRE de un control positivo** — un caso donde el resultado DEBE diferir: sin él, un arnés roto produce cinco "iguales" tranquilizadores. Complemento estático para "no toqué el prompt X": **hashea la región de cada constante** en HEAD y ahora, en vez de leer el diff (en F37, 7/7 idénticas).
- **Por qué importa:** Un test contra un literal no distingue el contrato histórico de una copia del código nuevo; es exactamente el caso en que un test verde no prueba nada.

### Un bloque agregado en el contexto no es "hacer trampa" si desaparece cuando el dato no existe — pruébalo APAGANDO el dato
- **Contexto:** F37, auditar un bloque derivado (`=== NPCS QUE HAN APARECIDO ===`) que el implementer añadió fuera de encargo para que el modelo acertara.
- **Lección:** Ante un agregado así, la pregunta de revisión no es "¿está enlatado?" sino dos comprobaciones **ejecutables**: (1) que con el dato ausente el bloque **no se emita** — ni encabezado vacío ni "ninguno"; y (2) que **sin él el modelo empeore de verdad**, medido levantando un backend efímero sobre una **COPIA** de la DB con el dato neutralizado. Con las dos, un agregado derivado pasa de "decisión fuera de encargo" a "dato estructurado justificado".
- **Por qué importa:** Distingue el contexto estructurado legítimo de una respuesta enlatada que solo funciona para la pregunta que se demostró. En F37 la medición fue concluyente: sin el bloque, el modelo llegó a listar un personaje **jugador** como NPC.

### Auditar trabajo previo sin commitear: la prueba es la DIFERENCIA SIMÉTRICA contra la fuente, no "parece completo"
- **Contexto:** F34, el working tree traía +173 líneas en `game-packs/stormlight.json` de una corrida que murió sin dejar reporte.
- **Lección:** Ante trabajo huérfano sobre el que vas a construir, el chequeo barato y concluyente es extraer los nombres de la **fuente** y del **artefacto** y comparar en **AMBAS direcciones** (`fuente \ artefacto` y `artefacto \ fuente`); los dos vacíos = fidelidad probada. Complétalo con: parseable, duplicados por nombre dentro de cada grupo, **colisiones de nombre ENTRE grupos** (críticas si algo resuelve por nombre con first-wins, como `base_character.skill_links`), referencias a campos no declarados, un barrido de valores basura (`"undefined"`/`"null"` literales, que la UI pinta tal cual) y que lo legacy sea **`JSON.stringify`-idéntico a `git show HEAD:archivo`**. En F34 esto convirtió "173 líneas de procedencia desconocida" en "auditado y aceptado" en una pasada — y de paso demostró que el conteo del ENCARGO era el erróneo (el brief decía 20 acciones; la fuente tiene 18).
- **Por qué importa:** Construir sobre datos no auditados propaga sus errores y te los apunta a ti; y "parece completo" no distingue entre 18 y 20 entradas.

### El test viejo SIN TOCAR prueba un refactor solo si, mutando el módulo nuevo, se pone rojo
- **Contexto:** F34, extraer la lógica de `seed-dragonbane-catalog.js` a un `seed-catalog.js` genérico dejando wrappers por juego.
- **Lección:** Cuando la única diferencia entre dos scripts son 2 constantes, extrae el cuerpo y deja wrappers que re-exporten los nombres históricos — así el test de la feature anterior pasa **sin editar una línea**, y eso es evidencia de retrocompatibilidad mucho más fuerte que releer el diff. Regla: **si al refactorizar tienes que tocar el test viejo, no era un refactor.** Pero "el test viejo pasa" por sí solo no basta: podría estar pasando por caminos que ya no se ejecutan. Ciérralo mutando el **módulo nuevo** y confirmando que ese test se pone ROJO, y demuestra que no lo editaste comparando su `sha256` con el que registró la feature anterior.
- **Por qué importa:** Un refactor que rompe el contrato pasa desapercibido si el test que lo cubría se "adaptó" al cambio.

### Antes de borrar un archivo, censa también las rutas escritas como STRING, no solo los imports
- **Contexto:** F36, `designDebt.test.js` listaba `'pages/MyCharacters.jsx'` como cadena dentro de un array y lo abría con `readFileSync` sin guard de existencia.
- **Lección:** El grep de imports puede dar cero y aun así existir acoplamiento: test-guards, configs y listas de rutas referencian archivos como **texto**, y borrar el archivo revienta con un `ENOENT` (fallo de infraestructura, no un assert legible). Busca el **basename**, no solo `from '…'`. Y amplía el censo a **todo el paquete** —`tailwind.config.js`, `Dockerfile`, `nginx.conf`—, no solo `src/`. Cuando una lista así se queda sin uno de sus archivos, **retira la entrada en vez de envolver el `readFileSync` en un guard de existencia**: tolerar rutas muertas debilita el guard en silencio (un archivo renombrado dejaría de vigilarse sin avisar).
- **Por qué importa:** Ningún análisis de imports ve este acoplamiento, y el fallo aparece como error de infraestructura en un test ajeno al borrado.

### Mutar para validar un guard: hazlo DENTRO del contenedor efímero, nunca en el árbol real
- **Contexto:** F36, validar por mutación que el guard de deuda visual sigue armado, con otro agente trabajando en paralelo.
- **Lección:** El patrón "muto → confirmo rojo → `git checkout --`" deja una ventana con el working tree corrupto; con el auto-commiteador de este entorno o con agentes en paralelo, esa ventana puede quedar **sellada en un commit**. Alternativa de coste cero: `docker run --rm <img> sh -c "muta && npx vitest run src/guard.test.js"` — la mutación vive y muere en la capa de escritura del contenedor, el host no se toca y el `git status` no se mueve. Sirve igual para provocar fallos de infraestructura (reponer una ruta borrada en una lista y ver el `ENOENT`).
- **Por qué importa:** Una mutación commiteada por accidente introduce exactamente la regresión que el guard existía para impedir.

### `grep -P` en Git Bash aborta por locale: un `|| echo "CERO"` convierte el fallo en un falso "limpio"
- **Contexto:** F32/F35, censar emojis y clases de la paleta v0 en `frontend/src`.
- **Lección:** En Git Bash, `grep -P` puede abortar con "supports only unibyte and UTF-8 locales" **sin imprimir nada**; encadenado a `|| echo "CERO"` produce un cero mentiroso que se cuela en un reporte como "barrido limpio". Antepón `LC_ALL=en_US.UTF-8` y **comprueba el exit code** (0 = hay coincidencias, 1 = no hay, **2 = el grep falló**). Para censos que autorizan un borrado destructivo (retirar alias de Tailwind, eliminar exports), añade un **control positivo**: corre el MISMO patrón contra una versión donde sabes que hay coincidencias (`git show HEAD:archivo`) y confirma que las encuentra; si el control no encuentra nada, tu patrón está roto, no el código limpio.
- **Por qué importa:** Un censo con falso negativo autoriza un borrado que rompe cosas. Y retirar un alias de Tailwind **no rompe el build**: las clases dejan de generarse y la regresión es puramente visual y silenciosa.

### Una regresión que no rompe el build necesita un test-guard que reescanee el código
- **Contexto:** F35, retirar los alias `gold`/`ink-*` tras migrar los últimos consumidores.
- **Lección:** Cuando la deuda que acabas de pagar puede volver sin que nada se ponga rojo (clases de una paleta muerta, emojis donde el diseño exige iconos, imports prohibidos), deja un test que **reescanee el árbol de fuentes** en cada `npm test` y falle nombrando el archivo culpable. Valídalo por mutación: reintroduce la clase, confirma el rojo, revierte. Cuesta 20 líneas y convierte una convención en un invariante ejecutable.
- **Por qué importa:** Sin el guard, la limpieza se deshace sola en la siguiente feature y nadie se entera hasta que alguien mira la pantalla.

### Ejecuta si puedes, escanea si no puedes — y sabe cuál de las dos estás usando
- **Contexto:** F38. El guard de "el botón no puentea el modal" era `not.toMatch(/onClick=\{onReset\}/)`. El reviewer lo mató con `onClick={() => onReset()}`: misma regresión, otra sintaxis, suite entera en verde.
- **Lección:** Un guard de fuente que afirma sobre **una forma sintáctica** es casi siempre más estrecho que su nombre. Afirma sobre el **conjunto** de apariciones del símbolo peligroso (censo con número fijo + la familia `on[A-Z]\w*=\{[^}]*sym`, colapsando espacios), y **valida el guard con su propio control positivo**: pásale las formas peligrosas que se te ocurran y una legítima. Pero aunque lo hagas bien, **un guard de fuente es léxico y se derrota renombrando** — probado en F38: aliasea la prop (`onReset: fireReset`), puentea con el alias, y el censo sigue cuadrando, el regex no encuentra nada, y lint y build pasan con 0 errores. Lo que garantiza es que la regresión **no vuelva por accidente en una línea**, no que sea imposible. Por eso: **cuando la unidad se pueda ejecutar, prefiere siempre el test de comportamiento**. Un componente JSX **sin hooks** se puede invocar como función, recorrer su árbol de elementos y dispararle los `onClick` de verdad — sin jsdom y sin dependencias nuevas. Deja el guard de fuente solo para lo que no se puede ejecutar (en F38, el componente con estado que monta el diálogo).
- **Por qué importa:** Sin la jerarquía, se canoniza el escaneo como si fuera prueba de comportamiento y el harness aprende una técnica con el agujero dentro. En F38 la diferencia fue concreta: extraer `MapResetConfirm` convirtió tres mutaciones supervivientes en tests reales, incluido "Cancelar que reinicia el canvas de toda la mesa".

### En una corrida de mutación, el control positivo va DENTRO de cada corrida, no una vez al principio
- **Contexto:** F38. Había que leer una mutación cuyo resultado esperado era **verde** (envolver una etiqueta en un `<span>` inocuo no debe romper nada).
- **Lección:** Cuando alguna mutación se espera verde, un control positivo corrido una sola vez no basta: no distingue "verde porque la aserción es robusta" de "verde porque el runner no arrancó". Inyecta un test que **siempre falla** en todas las corridas, de modo que el **suelo de cada una sea 1 rojo**, y cuenta los rojos *sobre el suelo*. Complementos que salvaron la corrida en F38: que el script **aborte si el patrón a mutar no aparece exactamente 1 vez** (el reviewer descubrió así que su propia mutación sustituía una frase que vivía en **dos** sitios —la copy y el `title`— y por eso no probaba lo que creía), y comprobar que el rojo es un `AssertionError` y no un error de sintaxis disfrazado de test caído.
- **Por qué importa:** Un arnés roto devuelve verdes tranquilizadores, y una mutación mal aplicada se disfraza de "el guard funciona". Las dos producen la misma sensación de seguridad y ninguna de las dos es evidencia.

### Un `aria-label` puede hacer pasar en verde el test de "el texto es visible"
- **Contexto:** F38. `expect(html).toContain('Reiniciar mapa')` seguía verde tras revertir el botón a un icono mudo: la cadena estaba en el `aria-label`.
- **Lección:** Sobre HTML renderizado por SSR, `toContain('texto')` no distingue **contenido** de **atributo**. La receta robusta es **borrar todas las etiquetas y asertar sobre el texto que queda** — los atributos viven dentro de los corchetes angulares y se van con ellas: `const visibleText = (html) => html.replace(/<[^>]*>/g, '')`. Lo que **no** funciona es anclar el texto a la estructura (`/<\/svg>\s*Etiqueta<\/button>/`): sobrevive a Prettier —el HTML lo genera React, no el formateo del JSX— pero da **falso positivo** en cuanto alguien mete un `<span className="hidden sm:inline">` entre medias, que es justo el retoque que invita una toolbar apretada. Asértalo por separado: el atributo con `toContain('aria-label="…"')`, el texto visible con la versión sin etiquetas.
- **Por qué importa:** El test que creías que protegía "el usuario ve la etiqueta" en realidad solo protegía "la cadena está en el archivo", y esa es exactamente la regresión que se quería impedir.

### El runner de vitest del frontend no tiene jsdom: testea helpers puros, no clics
- **Contexto:** F20, cubrir la lógica del modal de evento rápido en `session.test.jsx`.
- **Lección:** Los tests de frontend montan con `renderToStaticMarkup` (SSR, sin efectos ni DOM interactivo); no hay `jsdom` ni testing-library. Para cubrir lógica load-bearing de handlers, **extrae un helper puro exportado** (p. ej. `buildQuickEventPayload({...})`) y testéalo directamente, en vez de simular clics. Añadir jsdom/testing-library mete dependencias pesadas y arriesga el build context de Docker; no lo hagas solo para un test.
- **Por qué importa:** Intentar simular interacción con el runner actual falla o obliga a deps nuevas; el helper puro cubre la lógica real sin coste.

### Correr los tests del frontend en Docker sin ensuciar el host
- **Contexto:** F20, verificar vitest en el entorno canónico (el Dockerfile del frontend solo tiene stage lint+build, no test).
- **Lección:** Patrón sin `npm install` en el dir montado (que deja `node_modules` residual y envenena el build context): `docker build --target build -t tmp ./frontend` + `docker run --rm tmp npm test`, y al terminar `docker rmi tmp`. Vitest está disponible en el build stage (deps instaladas sin `--omit=dev`).
- **Por qué importa:** Reproduce el checkpoint de tests en el entorno canónico sin dejar artefactos del host que rompan `docker compose build frontend` después.

### Seed de datos demo idempotente = reset por MARCADOR, no por id
- **Contexto:** F25, dejar UNA sesión demo limpia y reejecutable.
- **Lección:** Para un estado demo idempotente, borra por marcador único (nombre de prep/sesión, tripleta dm_id+game_system_id+nombre de NPC) y recrea, en vez de intentar upsert de un grafo complejo. Ojo: los `event_templates` SUELTOS del prep tienen FK a `prep_id` SIN cascade (como en routes/sessionPreps.js) → bórralos por `prep_id` ANTES de la prep (locations/sub_locations sí cascadean). `session_events` es append-only en operación normal; un `DELETE FROM` masivo solo es válido como reset explícito sancionado por el founder.
- **Por qué importa:** Reejecutar el seed deja siempre el mismo estado limpio sin duplicar prep/eventos/NPCs ni tocar datos ajenos.

### Para testear la idempotencia real de una migración, expón las funciones de migración
- **Contexto:** F22, verificar que M003 (`DROP COLUMN`) es idempotente y que M001/M002 no cambiaron.
- **Lección:** Exporta el array de migraciones (`export const MIGRATIONS = [[name, (db) => …], …]`) con funciones que reciben `db` por parámetro (en vez de cerrar sobre el `db` del módulo). Así el test ejercita la **función REAL** sobre una DB `better-sqlite3(':memory:')` aislada: aplica dos veces y asserta que no lanza y que el estado (PRAGMA table_info) no cambia. Cubre además el fresh install verificando que la DB cargada (schema+migraciones) tiene el estado final y que la migración quedó registrada en `_migrations`.
- **Por qué importa:** Duplicar el `ALTER` en el test no prueba la migración real; exponer la fn permite testear el código que de verdad corre en producción y evita regresiones al refactorizar el runner.

### Al insertar en tablas puente en tests, actualizar el DELETE del beforeEach compartido
- **Contexto:** F14, tests nuevos insertaban en `session_members` y `session_summaries`; las FKs rompieron la limpieza de tests vecinos.
- **Lección:** Si un test nuevo inserta en una tabla puente (session_members, session_summaries, etc.), añade su `DELETE FROM` al `beforeEach` del archivo. El síntoma de olvidarlo es engañoso: `hookFailed` en tests AJENOS, no en el tuyo.
- **Por qué importa:** El fallo aparece en tests que no tocaste y se pierde tiempo buscando en el lugar equivocado.

---

## Docker / infraestructura

### Cada servicio con imagen Docker necesita .dockerignore (node_modules del host envenena el build context)
- **Contexto:** F8b, `docker compose build frontend` falló porque el implementer dejó un `frontend/node_modules` residual (de correr vitest en el dir montado); sin `.dockerignore` entró al build context y un symlink de Windows (`.bin/acorn`) abortó el build con "invalid file request".
- **Lección:** `backend/` y `frontend/` tienen `.dockerignore` (node_modules, dist, data, .git). No corras `npm install`/`vitest` directamente en el directorio del proyecto montado si vas a buildear la imagen después; usa `docker compose exec`/build stage. Si aparece un node_modules residual, bórralo antes de verificar el build.
- **Por qué importa:** El build context sin filtrar arrastra artefactos del host; en Windows los symlinks de `.bin` rompen el `COPY . .` del Dockerfile.

### SPA en nginx: index.html con no-cache, assets hasheados con immutable (o el navegador sirve builds viejos)
- **Contexto:** F27, el founder tuvo que hard-refrescar 2 veces (copy de IA, ficha de personaje) porque el navegador servía un bundle viejo tras el deploy.
- **Lección:** En el `nginx.conf` del frontend, sirve `index.html` con `Cache-Control: no-cache` (que el navegador revalide siempre) y `/assets/*` (nombres con hash de Vite) con `public, max-age=31536000, immutable`. Así, tras cada deploy el navegador toma el index.html nuevo → los chunks nuevos, sin hard-refresh. OJO: nginx NO hereda `add_header` del server en un `location` que tenga su propio `add_header`; pon el header en cada bloque que lo necesite. Verifica con `curl -I` real (index → no-cache, asset → immutable). Sin esto, el síntoma engaña: parece bug de código pero es caché del navegador.
- **Por qué importa:** Un cambio desplegado y verificado en el bundle servido igual se ve 'roto' en el navegador del usuario; el arreglo de código correcto se percibe como no aplicado.

### nginx da 504 en `/api/ai/ask` con el LLM local en CPU; el streaming por socket sí funciona
- **Contexto:** F23, verificar el answer end-to-end del LLM local (qwen2.5:3b en CPU es lento).
- **Lección:** El `/api/ai/ask` (REST, no streaming) puede superar el `proxy_read_timeout` de nginx → 504, aunque la generación funcione. El AIPanel usa **streaming por socket.io** (tokens incrementales), que NO sufre este timeout, así que el usuario está bien. Para verificar por REST, pégale al backend directo (`docker compose exec backend` → `curl localhost:3001`) o sube el timeout del proxy; el retrieval (`/api/rag/search`) es la prueba rápida y determinista.
- **Por qué importa:** Un 504 en `/ai/ask` puede leerse como "la IA está rota" cuando en realidad es timeout de proxy; el camino real (socket) funciona.

### El servicio `backend` de compose NO monta `src/` como volumen: reconstruir antes de verificar
- **Contexto:** F21, verificar cambios en `services/ai.js`; el primer `docker compose run backend npm test` corrió código VIEJO.
- **Lección:** El servicio `backend` del compose solo monta `./data` y `./game-packs`, NO `src/` (el código va horneado en la imagen). Tras cambiar backend, **reconstruye** (`docker compose build backend`) ANTES de `docker compose run --rm --no-deps backend npm test`, o correrás la versión anterior. Síntoma engañoso: los tests muestran nombres/asserts viejos y "pasan" sobre el código previo.
- **Por qué importa:** Un checkpoint puede darse por verde sobre código que no es el que cambiaste; el fallo real queda oculto hasta runtime.

### Prueba que la imagen está al día por HASH, no por timestamp ni por "cache hit"
- **Contexto:** F22, se afirmó "la imagen es de hace 2h pero el cache-hit prueba que está al día" — razonamiento flojo que el founder corrigió (el código había cambiado hacía minutos).
- **Lección:** El `CreatedSince` de `docker images` NO es fiable como "última vez que se buildeó" (BuildKit puede fijar timestamps deterministas). Y aunque un cache-hit de `docker compose build` normalmente implica fuente idéntico, no lo des por probado: **compara hashes host↔imagen** de los archivos que cambiaste — `sha256sum backend/src/<f>` vs `docker compose run --rm --no-deps backend sha256sum src/<f>`. Si coinciden, la imagen contiene el código actual y los tests son válidos; si no, `docker compose build` (o `--no-cache`) y re-verifica. Ojo con CRLF/LF: el working tree en Windows está en LF (el COPY los preserva), así que los hashes deben coincidir.
- **Por qué importa:** Confiar en el timestamp o en el cache-hit sin probar currency puede validar los tests contra una imagen vieja; el hash es la prueba objetiva de que corriste el código actual.

### El lint/test debe poder correr en el entorno canónico (Docker), no "en teoría"
- **Contexto:** F4, `docker compose exec backend npm run lint` falló con `eslint: not found`.
- **Lección:** Si la imagen usa `npm install --omit=dev`, las devDependencies (eslint, etc.) no existen en el contenedor. Decisiones de la v1.0: (1) el backend instala TODAS las deps (`npm install` sin `--omit=dev`) y hace `COPY eslint.config.js ./` para que lint/test corran con `docker compose exec backend …`; (2) el frontend (imagen final = nginx, sin Node) fuerza lint y build en su build stage (`RUN npm run lint && RUN npm run build`), así `docker compose build frontend` = lint+build verificados.
- **Por qué importa:** Sin esto, "lint ✅" es irreproducible y un checkpoint del harness queda imposible de cumplir en la máquina del founder (sin Node local).

---

## Proceso y flujo de trabajo

### Para fechar una orfandad, busca el commit donde murió su ÚLTIMO importador, no el `git log` del archivo
- **Contexto:** F36, `MyCharacters.jsx` parecía vivo: su última edición era del día anterior.
- **Lección:** El `git log` de un archivo solo muestra cuándo se **editó**, no cuándo dejó de ser alcanzable — y da la impresión contraria. La orfandad real se data iterando `git ls-tree` + grep por commit hasta ver desaparecer al importador: aquí `pages/Lobby.jsx`, borrado en F13 (2026-07-02), **22 features antes**. Con esa fecha el coste del despiste es cuantificable: la feature anterior invirtió trabajo migrando emojis y tokens de una página inalcanzable desde hacía un mes. **Corolario de proceso: el barrido de huérfanos va AL PRINCIPIO del trabajo sobre un archivo, no después.**
- **Por qué importa:** Un huérfano pasa lint, build y tests, y no existe para el usuario; sin fechar la orfandad no se ve cuánto trabajo se está tirando sobre él.

### No declarar un checkpoint en verde sin ejecutarlo en el entorno donde se exige
- **Contexto:** F4, el reporte del implementer afirmó "lint ✅" sin que fuera reproducible en el contenedor.
- **Lección:** El implementer no marca un checkpoint como verde sin correr el comando exacto en el entorno canónico (Docker). El reviewer ejecuta literalmente cada comando del checklist; no se fía del reporte.
- **Por qué importa:** Un checkpoint declarado en verde pero irreproducible esconde bloqueantes hasta la revisión, desperdiciando una iteración completa.

---

## Formato para agregar una lección

```markdown
### [Título corto de la lección]
- **Contexto:** [qué estabas haciendo cuando lo descubriste]
- **Lección:** [qué hacer o qué evitar — concreto y accionable]
- **Por qué importa:** [qué pasa si se ignora]
```

---

## Historial de cambios

<!-- El líder y el consultor registran aquí cada vez que agregan una lección -->
<!-- Formato: [fecha] — [agente] agregó lección "[título]" en categoría [categoría] -->
- 2026-06-29 — founder sembró lecciones iniciales del stack al portar el harness desde la v0.
- 2026-06-29 — líder agregó "La tabla virtual vec0 no puede vivir en schema.sql" (RAG/sqlite-vec) y "Verificar migraciones consolidadas con PRAGMA" (SQLite) tras cerrar F1.
- 2026-06-29 — líder agregó tras cerrar F4: "Routers que emiten por socket → factory" (Backend), "El lint/test debe poder correr en Docker" (Docker/infra), "ESLint frontend necesita eslint-plugin-react" (Frontend), "No declarar un checkpoint en verde sin ejecutarlo" (Proceso).
- 2026-06-29 — líder agregó tras cerrar F5: "Una feature de frontend no está terminada hasta que sus componentes estén cableados" (Frontend) y "Directiva eslint-disable a plugin no registrado = error fatal en ESLint 9" (Frontend).
- 2026-06-29 — líder agregó tras cerrar F8b: "Cada servicio con imagen Docker necesita .dockerignore" (Docker/infra).
- 2026-07-02 — líder agregó tras cerrar F14: "Colores dinámicos por entidad: lista de clases estáticas + índice estable" (Frontend) y "Al insertar en tablas puente en tests, actualizar el DELETE del beforeEach" (Testing).
- 2026-07-20 — líder agregó tras cerrar F17 (sesión autónoma): "`style={{}}` inline SÍ se permite para geometría computada", "Extender un componente compartido = props opcionales retrocompatibles" y "Vistas de trabajo intensivo van full-bleed (rail 62px)" — las tres en Frontend.
- 2026-07-22 — líder agregó tras cerrar F20: "El runner de vitest del frontend no tiene jsdom: testea helpers puros" y "Correr los tests del frontend en Docker sin ensuciar el host" — ambas en Testing.
- 2026-07-22 — líder agregó tras cerrar F21: "Negar una frase en un system prompt puede primarla en modelos pequeños" (RAG/embeddings) y "El servicio backend de compose NO monta src/: reconstruir antes de verificar" (Docker/infra).
- 2026-07-22 — líder agregó tras cerrar F22: "Eliminar una columna legacy: DROP COLUMN idempotente con guard PRAGMA + actualizar schema.sql" (Base de datos/SQLite) y "Para testear la idempotencia real de una migración, exporta el array de migraciones con fns que reciben db" (Testing).
- 2026-07-22 — líder agregó "Prueba que la imagen está al día por HASH, no por timestamp ni por cache hit" (Docker/infra) + checkpoint y criterio de rechazo en CHECKPOINTS.md, a pedido del founder tras detectar razonamiento flojo sobre la vigencia de la imagen.
- 2026-07-22 — líder agregó tras cerrar F23: "Los docs de reglas son contenido compartido: ingerir por NOMBRE de sistema" y "Un doc ingerido sin Ollama queda sin vectores: reindexar" (RAG), y "nginx da 504 en /api/ai/ask con LLM CPU; el streaming por socket sí funciona" (Docker/infra).
- 2026-07-22 — líder agregó tras cerrar F25 "Seed de datos demo idempotente = reset por marcador" (Testing); tras F26 "Concisión en modelos pequeños: cláusula compartida en positivo + temp baja" (RAG); tras F27 "SPA en nginx: index.html no-cache, assets immutable" (Docker/infra).
- 2026-07-23 — líder agregó tras cerrar F28 "Enriquecer el catálogo de un sistema YA existente ≠ importar un game pack" (Arquitectura).
- 2026-07-23 — líder agregó tras cerrar F29 "Un seed de catálogo genérico-por-formato absorbe formatos nuevos sin tocar código" (Arquitectura).
- 2026-07-30 — líder agregó tras cerrar F30 "Un entero 0/1 de SQLite en un guard `{flag && <…/>}` pinta el número: barre TODAS las banderas del archivo" (Frontend).
- 2026-07-30 — líder agregó tras cerrar F35 "`grep -P` en Git Bash aborta por locale: un `|| echo CERO` convierte el fallo en un falso limpio" y "Una regresión que no rompe el build necesita un test-guard que reescanee el código" — ambas en Testing.
- 2026-07-30 — líder agregó tras cerrar F33 "Filtrar por identidad: el id del solicitante sale del socket, nunca del payload" (Backend).
- 2026-08-07 — líder agregó tras cerrar F36: "Al borrar un huérfano, la paridad no acaba en el JSX: sigue el dato hasta el backend" (Arquitectura), "Antes de borrar un archivo, censa también las rutas escritas como STRING" y "Mutar para validar un guard: hazlo DENTRO del contenedor efímero" (Testing), y "Para fechar una orfandad, busca el commit donde murió su ÚLTIMO importador" (Proceso).
- 2026-08-08 — líder agregó tras cerrar F37 (7 lecciones, la cosecha de un bug reportado en vivo por el founder): "El actor de un evento no es siempre quien lo escribió: sigue el payload hasta el render" (Backend), "Un modo que se llama 'Sesión' pero cuyo contrato de transporte no acepta sessionId es un bug de CONTRATO, no de prompt" (Arquitectura), "Con un modelo pequeño, el dato correcto en el contexto no basta: hay que ponerlo también AGREGADO" y "Un ejemplo literal de formato pegado a la generación se copia como contenido" (RAG), "Para probar retrocompatibilidad, corre las DOS versiones a la vez — y con control positivo" y "Un bloque agregado en el contexto no es 'hacer trampa' si desaparece cuando el dato no existe" (Testing), y "Al leer una SQLite en modo WAL desde fuera, copia también el -wal" (Base de datos/SQLite).
- 2026-08-08 — líder agregó tras cerrar F38 (5 lecciones; la feature se aprobó en dos pases y la cosecha salió del PRIMER review, que aprobó el código pero encontró cuatro mutaciones destructivas en verde): "Ejecuta si puedes, escanea si no puedes — y sabe cuál de las dos estás usando", "En una corrida de mutación, el control positivo va DENTRO de cada corrida" y "Un `aria-label` puede hacer pasar en verde el test de 'el texto es visible'" (Testing), más "Un control destructivo que afecta a OTROS usuarios no puede ser un icono sin etiqueta" y "La copy de una confirmación es una afirmación técnica: verifícala contra el handler entero" (Frontend). La primera va CON la cláusula del límite que pidió el reviewer: un guard léxico se derrota renombrando el símbolo, y él lo probó (alias de la prop → censo cuadrando, regex sin hallazgos, lint y build en 0 errores, y el botón destructivo de vuelta).
- 2026-08-07 — líder agregó tras cerrar F34: "Un formato nuevo es más barato que un nombre mentiroso — pero el 'cero coste de frontend' se prueba leyendo los tres consumidores" (Arquitectura), "Auditar trabajo previo sin commitear: la prueba es la DIFERENCIA SIMÉTRICA contra la fuente" y "El test viejo SIN TOCAR prueba un refactor solo si, mutando el módulo nuevo, se pone rojo" (Testing).

# Revisión: F35 — Último resto de deuda v0 (cierra F32)
Fecha: 2026-07-31
Revisor: reviewer (independiente)
Base de comparación: 34f051c feat(F31)
Veredicto: **APROBADO**

---

## Alcance revisado (solo F35)

| Archivo | Estado | En el brief del líder | En el reporte del implementer |
|---|---|---|---|
| frontend/src/pages/MyCharacters.jsx | M | Sí | Sí |
| frontend/src/components/Stats/CampaignStatsPanel.jsx | M | Sí | Sí |
| frontend/src/components/Stats/CharacterStatsPanel.jsx | M | Sí | Sí |
| frontend/src/components/Stats/Sparkline.jsx | M | Sí | Sí |
| frontend/src/lib/api.js | M | Sí | Sí |
| frontend/src/lib/planning.js | M | Sí | Sí |
| frontend/tailwind.config.js | M | Sí | Sí |
| frontend/src/designDebt.test.js | nuevo | Sí | Sí |
| frontend/src/components/Stats/stats.test.jsx | nuevo | NO | Sí (declarado) |
| frontend/src/pages/myCharacters.test.jsx | nuevo | NO | Sí (declarado) |

Los dos últimos son tests SSR de los MISMOS componentes del alcance, declarados explícitamente en
impl_F35-last-v0-debt.md. No se consideran fuera de alcance (el criterio de rechazo es "fuera del
scope DECLARADO"), pero se anotan para que el líder los incorpore a la lista de la feature.
Cero cambios de backend. Cero solape con los archivos de F33.

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint + build frontend vía "docker compose build frontend" -> exit 0 (el stage fuerza npm run lint y npm run build).
- [x] Reejecutado también con el patrón F20: "docker build --target build -t tmp-rev3335 ./frontend" -> exit 0.
- [x] Backend intacto: su lint sigue en verde (exit 0) tras esta feature, que no lo toca.
- [x] No hay código comentado sin explicación: las dos notas (planning.js y tailwind.config.js) explican QUÉ se borró y POR QUÉ, sin dejar el código muerto detrás.
- [x] Cero console.log / debugger de debug (grep sobre los 10 archivos -> exit 1).

### Código y patrones del proyecto
- [x] No aplica better-sqlite3 (feature solo-frontend); igualmente se verificó que no hay cambios en backend/.
- [x] No aplica session_events.
- [x] Frontend: estilos SOLO con clases Tailwind + tokens. Grep de "style={{" y "const s = {" en los 10 archivos -> exit 1. La geometría del Sparkline sigue en atributos SVG (viewBox / points), no en CSS.
- [x] Cero window.innerWidth / useWindowWidth (grep -> exit 1). Responsive con breakpoints (md:grid-cols-2 conservado).
- [x] Nombres descriptivos en inglés (PregenCard, CharacterRow, LocationChip, AttributeRow); cada subcomponente extraído es de presentación pura y con una sola responsabilidad.
- [x] Sin dependencias circulares: los subcomponentes se exportan desde su propio archivo y solo los importan los tests.

### Tests
- [x] Vigencia por HASH host vs imagen antes de creer los tests (MyCharacters.jsx d51df6b4..., tailwind.config.js 30ff2ef8..., designDebt.test.js 6872081e...): idénticos.
- [x] Existe test por componente/módulo público nuevo: designDebt.test.js (4), stats.test.jsx (8), myCharacters.test.jsx (5).
- [x] Todos pasan: "Test Files 16 passed (16)" / "Tests 162 passed (162)".
- [x] Caso feliz + casos de error/degradados: Sparkline con menos de 2 valores, PregenCard sin listas (degrada a 0), CharacterRow sin sistema de juego ("Sin sistema"), AttributeRow con is_core=0 y has_max=0 (lección F30, sin el 0 fantasma).

### Arquitectura
- [x] Respeta la estructura de carpetas; no se movió ningún archivo.
- [x] Cero dependencias nuevas (package.json intacto; no se ejecutó npm install).
- [x] Sin cambios de esquema ni de endpoints.

### Learnings
- [x] Propuso 4 lecciones (censo con exit code + control positivo, guardia contra regresión silenciosa, case-sensitivity al confirmar exports muertos, extraer el subcomponente para SSR-testear).

### Reporte
- [x] .claude/progress/impl_F35-last-v0-debt.md existe, con los archivos tocados, la tabla emoji->icono, el censo y los hallazgos.
- [x] Este .claude/progress/review_F35-last-v0-debt.md.

---

## Verificación independiente de los 5 puntos pedidos

### 1) Retirar los alias gold / ink-* NO deja consumidores huérfanos (censo REHECHO por el revisor)

Método: LC_ALL=en_US.UTF-8, comprobando exit code en cada corrida (1 = sin coincidencias, 0 = hay, 2 = error de grep), sobre frontend/src (TODOS los archivos, incluido src/styles/index.css) y frontend/index.html.

Censo A, literales exactos (excluyendo *.test.*):
    -gold      EXIT=1  CERO
    -ink-900   EXIT=1  CERO
    -ink-800   EXIT=1  CERO
    -ink-700   EXIT=1  CERO
    -ink-600   EXIT=1  CERO
    -ink-500   EXIT=1  CERO
    -ink-line  EXIT=1  CERO

Censo B, FORMA de utilidad Tailwind con TODOS los prefijos de color (bg, text, border, ring, ring-offset, divide, from, via, to, fill, stroke, outline, shadow, placeholder, decoration, caret, accent, selection) y TODAS las variantes (hover:, focus:, focus-visible:, active:, group-hover:, group-focus:, focus-within:, disabled:, sm:, md:, lg:, xl:, dark:, first:, last:, odd:, even:, peer-checked:, aria-selected:, data-[...]:) sobre gold, gold-soft, gold-dim, ink-900|800|700|600|500|line:
    frontend/src + frontend/index.html  EXIT=1  -> CERO consumidores
    (incluso INCLUYENDO los archivos de test: EXIT=1, porque los tests componen las muestras en runtime)

Censo C, grises crudos (text-gray-*, bg-gray-*, border-gray-*, etc.): EXIT=1 -> CERO.
(Nota: gray-* es paleta POR DEFECTO de Tailwind, no un alias retirado, así que aunque quedara alguno no habría regresión visual; se censó igualmente.)

CONTROL POSITIVO con la MISMA invocación recursiva (imprescindible: un EXIT=1 con un patrón mal escrito es indistinguible de un árbol limpio). Volqué al scratchpad las versiones de 34f051c de MyCharacters.jsx y Sparkline.jsx y corrí el mismo comando sobre "src index.html <scratchpad>":
    .../MyCharacters_v0.jsx:9   border-ink-line
    .../MyCharacters_v0.jsx:9   focus:border-gold
    .../MyCharacters_v0.jsx:88  text-gold
    .../MyCharacters_v0.jsx:129 text-gold
    .../Sparkline_v0.jsx:25     text-gold
    EXIT=0  -> el patrón SÍ encuentra las clases v0 cuando existen, y encuentra CERO en src/ e index.html.

CSS y @apply: el único archivo CSS es src/styles/index.css y su único @apply es "bg-bg font-sans text-ink antialiased". No hay llamadas theme(). index.html no contiene ningún atributo class.

ink DEFAULT conservado: tailwind.config.js:74 -> "ink: '#ECE6DB'" (mismo valor que el DEFAULT anterior, ahora como color plano). Consumidores vivos de la familia -ink: 22 archivos, más el @apply text-ink de src/styles/index.css. Correcto y necesario.

Conclusión del punto 1: CERO consumidores huérfanos. La retirada de los alias es segura.

### 2) Los 8 emojis -> nombres de icono que existen de verdad

Claves verificadas contra el objeto ICONS de frontend/src/components/ui/Icon.jsx:
    id-card OK / sliders OK / skills OK / bag OK / chart OK / trash OK / pin OK
(skills es efectivamente un glifo de estrella: path de 5 puntas en Icon.jsx:26-28, sustituto legítimo del emoji de estrella.)
Icon devuelve null si el nombre no existe, así que un nombre inventado habría dado un hueco silencioso: no lo hay.

Accesibilidad de los que hacen de botón:
- Botón "Desde pregen": icono + TEXTO visible -> no necesita aria-label.
- Botones de solo icono de CharacterRow: conservan aria-label "Ver estadísticas de {nombre}" y "Eliminar {nombre}" (asertados en myCharacters.test.jsx).
- Contadores de PregenCard: decorativos, con title="Atributos" / "Habilidades" / "Inventario" en el contenedor.
- LocationChip y la estrella de AttributeRow: decorativos junto a texto.
- Icon renderiza siempre aria-hidden="true" (Icon.jsx:174), así que ningún icono contamina el nombre accesible.
Emojis vivos en los 4 archivos migrados: 0 (asertado además por el guard).

### 3) Exports muertos

    listCampaignSummaries : grep en TODO el repo (frontend + backend, excluyendo node_modules/.git/.claude) -> EXIT=1, CERO referencias. Además "summaries" en frontend/src -> EXIT=1.
    categoryClasses       : única aparición restante es la NOTA explicativa de planning.js:14. CATEGORY_CLASSES -> EXIT=1, CERO.
    eventCategoryClasses  : INTACTO. Exportado en planning.js:82 y con 17 referencias en 8 archivos (EventFlowGraph, EventListView, NotesPanel, PlanningPanel, SessionEventsPanel, TvView, planning.test.js). Confirmado que la trampa de case-sensitivity no se comió nada.

### 4) El guard designDebt.test.js es real (mutación hecha POR EL REVISOR)

Todas las mutaciones se aplicaron DENTRO de contenedores efímeros (docker run --rm) sobre la imagen del build stage: el working tree del host nunca se tocó (git status idéntico antes y después).

    Mutación 1: text-accent-text -> text-gold en Sparkline.jsx (archivo de F35)
      -> ROJO: AssertionError expected [ 'components/Stats/Sparkline.jsx' ] to deeply equal []
    Mutación 2: border-line -> border-ink-line en components/layout/Sidebar.jsx (archivo NO tocado por F35)
      -> ROJO: AssertionError expected [ 'components/layout/Sidebar.jsx' ] to deeply equal []
      (prueba que el censo del guard barre TODO el árbol, no solo los 4 archivos de F35, y que nombra al culpable)
    Mutación 3: reintroducir un emoji en MyCharacters.jsx
      -> ROJO: AssertionError expected [ 'pages/MyCharacters.jsx' ] to deeply equal []
    Control sin mutación: Test Files 1 passed (1) / Tests 4 passed (4)

El guard además se autoprotege: comprueba que el árbol escaneado no está vacío (>40 archivos) y trae control positivo/negativo del patrón en runtime, sin escribir ninguna clase v0 literal (para no ensuciar el propio censo).

### 5) Cero cambios de comportamiento en las vistas migradas

- MyCharacters.jsx: el diff es tokens + iconos + extracción de PregenCard/CharacterRow. Las llamadas API (listMyCharacters, listGameSystems, listBaseCharacters, createCharacter, adoptBaseCharacter, deleteCharacter) y los handlers (createCharacter, adopt, remove, transiciones de view) son los mismos; los handlers viajan por prop y el JSX movido es idéntico salvo tokens/iconos.
- CampaignStatsPanel / CharacterStatsPanel: los useEffect y las llamadas de stats no se tocaron; solo se extrajeron LocationChip y AttributeRow.
- Sparkline: solo dos clases; la geometría (viewBox, points, preserveAspectRatio, role, aria-label) intacta.
- api.js / planning.js: solo eliminación de exports muertos.
- F30 respetada: en AttributeRow, is_core y has_max se usan como CONDICIÓN de ternario, nunca como guard {flag && <...>}; hay 2 tests que asertan el texto exacto ("Deflect4", "Salud7") para el caso 0.

---

## Resultado de verificación (comandos reejecutados por el revisor)

| Comando | Resultado |
|---|---|
| docker compose build frontend | OK exit 0 (lint + build forzados en el stage) |
| docker build --target build -t tmp-rev3335 ./frontend | OK exit 0 |
| hash host vs imagen (MyCharacters.jsx, tailwind.config.js, Modal.jsx, designDebt.test.js) | OK idénticos |
| docker run --rm tmp-rev3335 npm test | OK "Test Files 16 passed (16)" / "Tests 162 passed (162)" |
| mutaciones del guard dentro de contenedores --rm | OK 3 de 3 en ROJO; control en verde |
| docker rmi tmp-rev3335 | OK eliminada |
| docker compose run --rm --no-deps backend npm run lint / npm test | OK exit 0 / 173 tests, 0 fallos (nada roto por el lado backend) |
| Host sin node_modules antes y después | OK frontend/node_modules y backend/node_modules no existen |
| git status --short y git diff --stat 34f051c | OK solo los 10 archivos de F35 + los 5 de F33 + .claude/ (del líder) |

- lint:  OK
- build: OK (vite build dentro del stage)
- test:  OK 162 pasando / 0 fallando (17 tests nuevos de F35)

---

## Lecciones aplicadas correctamente

- F32 / falso negativo de grep: aplicada. Usó LC_ALL, exit codes y control positivo contra git show HEAD:. Yo REHICE el censo por mi cuenta con un patrón más amplio (más prefijos y variantes) y con control positivo por la MISMA invocación recursiva: mismo resultado, CERO consumidores.
- F30 (entero 0/1 en un guard): aplicada. Barrido de guards && en los archivos tocados; is_core / has_max quedan como condición de ternario; dos tests asertan el texto exacto para el caso 0.
- F20 (vitest sin jsdom): aplicada. Extrajo hojas puras exportadas y las renderiza con renderToStaticMarkup, ejercitando el código REAL, no una copia.
- F20 (Docker sin ensuciar el host): aplicada. --target build + --rm + rmi, sin npm install en el directorio montado.
- F22 (vigencia por hash): aplicada y reverificada por mí.
- F17 (style inline solo para geometría): correctamente NO usado; la geometría del sparkline va en atributos SVG.
- F14 (clases literales para el JIT): todas las clases nuevas son literales; no hay clases interpoladas en los archivos tocados.

---

## Puntos a corregir

Ninguno bloqueante.

---

## Observaciones (no bloqueantes)

1. Dos archivos de test nuevos (stats.test.jsx, myCharacters.test.jsx) no figuraban en la lista de alcance del brief del líder, aunque sí están declarados en el reporte del implementer y cubren componentes del alcance. Sugerencia: actualizar la lista de archivos de la feature al cerrarla.
2. Cobertura del guard: designDebt.test.js escanea solo src/ y salta *.test.*, y su regex cubre gold / ink-N / ink-line / gray-N pero no otras clases de la paleta v0 como text-red-300 (que F35 sí migró a danger-text). No es un riesgo de build (red-* es paleta por defecto de Tailwind) pero el retorno de un red-* crudo no sería rojo. Tampoco escanea index.html (hoy sin clases). Ampliación barata si se quiere blindar del todo.
3. MyCharacters.jsx sigue siendo HUÉRFANO: confirmé con git grep que ya no lo importaba nadie ni en 34f051c ni en 569c698 (es decir, la orfandad es anterior a F32, no la causó F35). El implementer lo reportó con honestidad y el líder ya abrió F36-mycharacters-orphan. El trabajo de migración de ese archivo es, hoy, inalcanzable desde la UI.
4. Migración extra de los 3 banners de error (bg-danger/20 + text-red-300 -> bg-danger-tint + text-danger-text): es un cambio VISUAL fuera de la lista literal de tokens del brief. Coherente con el resto de páginas del handoff y declarado por el implementer; solo requiere el visto bueno del líder.
5. Accesibilidad menor: la estrella de atributo principal pasó de emoji a Icon con aria-hidden, así que la distinción "principal" ya no llega a un lector de pantalla (antes tampoco tenía texto alternativo real). Se podría añadir un title o un sr-only si importa.
6. El endpoint GET /api/campaigns/:id/summaries queda sin ningún cliente tras borrar listCampaignSummaries (deuda simétrica reportada por el implementer). No se tocó backend, correcto.

---

## Candidatos para LEARNINGS.md (para que el líder evalúe)

1. Frontend: retirar un alias de Tailwind es una regresión SILENCIOSA. No rompe lint ni build; la clase deja de generarse y el elemento se queda sin color. Antes de retirarlo, censo con FORMA de clase (prefijo-color, que es lo único que compila el JIT) para no contar como consumidores los regex de tests ni las cadenas de datos; después, un test de guardia que reescanee el árbol para que la reaparición sea ROJA en vez de invisible. (Propuesta del implementer; la suscribo, verificada por mutación.)
2. Proceso: un EXIT=1 de grep solo vale acompañado de un CONTROL POSITIVO con la MISMA invocación. No basta con correr el patrón contra "git show HEAD:archivo": conviene ejecutar el comando completo (mismos flags, mismo modo recursivo) sobre un árbol que SÍ contiene el texto (por ejemplo una copia en un directorio temporal), porque el fallo puede estar en los flags o en el recorrido, no en el patrón.
3. Proceso: ojo con la case-sensitivity al confirmar que un export está muerto (categoryClasses vs eventCategoryClasses). El riesgo va en las dos direcciones.
4. Testing: para testear markup que solo existe tras useEffect, extrae el subcomponente de presentación y expórtalo (complemento de la lección F20).
5. Proceso (mío, del método de revisión): las mutaciones para validar un test de guardia se hacen DENTRO de un contenedor efímero (docker run --rm sobre la imagen del build stage) y no en el working tree. Se prueba el guard sin arriesgar dejar la mutación olvidada en el repo, y hay que mutar al menos un archivo FUERA de la lista de la feature para probar que el escaneo es de árbol completo.

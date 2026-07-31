# Revisión: F32 — Deuda visual y código muerto (restyle ChatPanel/CanvasBoard + borrar huérfanos)
Fecha: 2026-07-30
Revisor: reviewer (independiente)
Veredicto: **APROBADO** — con 1 hallazgo de reporte que el líder DEBE corregir (ver "Hallazgo").

> Revisión hecha en paralelo con F31. Los alcances NO se mezclan: aquí solo se juzgan
> ChatPanel.jsx, CanvasBoard.jsx, chatPanel.test.jsx y los 4 borrados de DMMaster/.
> App.jsx, lib/route.js, lib/storage.js, lib/vitals.js, pages/TvView.jsx,
> Session/PartyVitals.jsx, Session/SessionToolbar.jsx, Session/SessionCharactersPanel.jsx y
> backend/src/sockets/session.js son de F31 y se juzgan en review_F31-tv-session-view.md.

---

## Checklist CHECKPOINTS.md

### Build y lint
- [x] Lint + build frontend vía `docker compose build frontend` -> exit 0 (el Dockerfile fuerza RUN npm run lint y RUN npm run build en el build stage).
- [x] Lint backend: no aplica cambio de backend, pero se ejecutó igualmente en el contenedor -> exit 0.
- [x] No se declaró ningún checkpoint sin ejecutarlo en Docker.
- [x] No hay código comentado sin explicación. Los 2 comentarios nuevos de ChatPanel justifican decisiones (el icono refleja el destinatario; to_user_id se coerciona con Boolean).
- [x] Cero console.log/console.debug en ChatPanel.jsx y CanvasBoard.jsx (grep).

### Código y patrones del proyecto
- [x] better-sqlite3: no aplica (cero backend en el alcance; verificado con git status).
- [x] session_events append-only: no aplica (cero backend).
- [x] **Estilos solo Tailwind + tokens.** Cero style inline, cero "const s = {", cero window.innerWidth en los 2 archivos (grep). El mapeo v0 -> handoff es 1:1 y todos los tokens destino existen en tailwind.config.js: bg-rail (:11), bg-bg (:10), bg-surface-2 (:15), bg-hover (:18), border-line (:23), text-title (:29), text-muted (:35), text-faint (:33), text-accent-text (:43), border-accent (:41), rounded-btn (:87).
- [x] Responsive con breakpoints de Tailwind, sin cambios (el panel ya vive en el aside md: / bottom-sheet de SessionView).
- [x] Nombres descriptivos en inglés; una responsabilidad por pieza (formatMessageTime = formato, ChatMessage = burbuja, ChatPanel = panel + socket).
- [x] Sin dependencias circulares (ChatPanel importa socket, Button, Icon; nada nuevo hacia arriba).

### Tests
- [x] Existe test por pieza pública nueva no trivial: formatMessageTime (4), ChatMessage (5), ChatPanel (2) = 11 tests en chatPanel.test.jsx.
- [x] Los tests ejercitan el **código real** (importan ChatPanel, ChatMessage y formatMessageTime desde ./ChatPanel.jsx y renderizan los componentes de verdad con renderToStaticMarkup). Cero copias de la lógica.
- [x] Todos los tests pasan: 140/140 en 12 archivos.
- [x] Caso feliz **y** casos de error: formatMessageTime con null, undefined, 0, -1, cadena vacía, 'ayer' y NaN -> siempre '' y siempre typeof string; ChatMessage sin created_at -> no pinta hora ni deja un literal suelto (aserción sobre el texto sin tags, patrón F30). Los timestamps se construyen con new Date(y,m,d,h,min) para no depender de la zona horaria del contenedor: correcto.
- [x] Vigencia de la imagen: no aplica al backend (sin cambios), y el frontend se testea sobre una imagen recién construida desde el working tree (docker build --target build), así que por construcción refleja el código actual.

### Arquitectura
- [x] Respeta la estructura de architecture.md (componentes en frontend/src/components/<dominio>/).
- [x] **Cero dependencias nuevas** - git diff HEAD sobre frontend/package.json y backend/package.json está VACÍO.
- [x] Cero cambios de esquema, cero endpoints nuevos, cero backend.

### Learnings
- [x] 2 candidatos propuestos por el implementer (+ 3 del revisor, abajo).

### Reporte
- [x] .claude/progress/impl_F32-ui-debt-cleanup.md existe y lista modificados, creados y borrados.
- [x] .claude/progress/review_F32-ui-debt-cleanup.md (este archivo).

---

## 1. El borrado NO perdió funcionalidad — RE-VERIFICADO POR EL REVISOR

Método propio (no me fío de la tabla del reporte): `git show HEAD:<ruta>` de los 4 huérfanos,
extracción de TODOS los métodos invocados con un patrón que **también captura las llamadas
encadenadas multilínea** (`api\.\w+\(` y además `^\s*\.\w+\(`), y comprobación uno a uno
contra la página que lo reemplaza.

### 1.1 GameSystemPanel.jsx (725 líneas) -> pages/AttributesPage.jsx
18 métodos invocados por el huérfano, **18/18 presentes** en la página:
createAttribute, createEquipmentSlot, createGameSystem, createMechanic, createMechanicParam,
deleteAttribute, deleteDoc, deleteEquipmentSlot, deleteGameSystem, deleteMechanic,
deleteMechanicParam, **exportGameSystem**, getGameSystem, **importGamePack**, ingestDoc,
listDocs, listGameSystems, **reindexDoc**.
Los 4 puntos calientes que señaló el líder están todos: importar pack, EXPORTAR pack,
borrar sistema, CRUD de mecánicas + params, slots de equipamiento, y docs del RAG con
reindex. Las pestañas Habilidades/Objetos que el huérfano montaba (SkillsPanel/ItemsPanel)
son ahora páginas propias con nav propio.

### 1.2 BaseCharactersPanel.jsx (361) -> pages/BaseCharactersPage.jsx
13 métodos, **13/13 presentes**: addBaseCharacterItem, createBaseCharacter,
deleteBaseCharacter, deleteBaseCharacterItem, getBaseCharacter, getGameSystem,
getSkillFormat, linkBaseCharacterSkill, listBaseCharacters, listGameSystems,
listSkillFormats, setBaseCharacterAttrs, unlinkBaseCharacterSkill.
La página añade además updateBaseCharacter (editar), que el huérfano no tenía.

### 1.3 SkillsPanel.jsx (256) -> pages/SkillsPage.jsx
8 métodos, **8/8 presentes**: createSkill, createSkillField, createSkillFormat, deleteSkill,
deleteSkillField, deleteSkillFormat, getSkillFormat, listSkillFormats.
Extras confirmados de la página: **bulkImportSkills** (SkillsPage.jsx:529, importación masiva
JSON), updateSkill, búsqueda, chips de filtro y paginación. **Campos dinámicos CON TIPO**
confirmados vía components/Catalog/FormatShared.jsx (:137 boolean, :152 number/text, :170
envía field_type al crear, :190 lo muestra) — el huérfano creaba campos sin tipo.
Superset estricto.

### 1.4 ItemsPanel.jsx (268) -> pages/ItemsPage.jsx
8 métodos, **8/8 presentes**: createItem, createItemField, createItemFormat, deleteItem,
deleteItemField, deleteItemFormat, getItemFormat, listItemFormats.
**equippable**: confirmado EDITABLE en el modal (ItemsPage.jsx:394 estado, :402 carga,
:412/:414 lo envía en update y create, :451 el checkbox) y visible en la tarjeta (:306, :342).
En el huérfano era solo lectura. Superset estricto.

### 1.5 Alcanzabilidad desde la UI (lección F5)
Las 4 páginas están cableadas en App.jsx (renderPage) y expuestas en el sidebar del DM
(components/layout/navItems.js): Habilidades (skills), Personajes Base (base-characters),
Bases de Atributos (attributes), Items (items). Ninguna capacidad quedó huérfana.

**Veredicto del punto 1: CERO capacidades perdidas.** El borrado de 1610 líneas está justificado.

Corrección menor a la tabla del reporte (en dirección segura, no cambia el veredicto): el
reporte lista deleteSkillField y deleteItemField como añadidos "+" de las páginas nuevas;
en realidad SkillsPanel/ItemsPanel ya los tenían. Es paridad, no mejora.

## 2. Cero imports rotos — CONFIRMADO

Grep de `GameSystemPanel|BaseCharactersPanel|SkillsPanel|ItemsPanel` en TODO frontend/src
**y** backend/src (incluidos los .test.jsx) -> **CERO coincidencias**.
El directorio frontend/src/components/DMMaster/ conserva solo los 6 vivos: EventFlowGraph,
EventListView, LocationTree, PrepRail, PrepSelector, PrepWorkspace.
Los 4 borrados están en el índice como `D ` (git rm), no como borrado a mano: correcto.

## 4. Contrato de socket del chat — CONFIRMADO SIN CAMBIOS

El diff de ChatPanel.jsx **no toca ni una línea** del bloque de socket (ChatPanel.jsx:60-82):
- emisión de historial: `socket.emit('chat:history', { sessionId })` — idéntica.
- listeners: `socket.on('chat:history', onHistory)` y `socket.on('chat:message', onMessage)`, con su off en el cleanup — idénticos.
- envío: `socket.emit('chat:message', { sessionId, from: user.id, body: text.trim(), to: toUserId })` — payload idéntico.
- **Enter sigue enviando**: `onKeyDown={(e) => e.key === 'Enter' && send()}` intacto.
- Firma pública del componente sin cambios (sessionId, user, connectedUsers = []); SessionView no necesitó tocarse. Idem CanvasBoard (sessionId, imageUrl).
Cero cambios de backend, así que el bug de privacidad F33 sigue exactamente donde estaba: ni se agrava ni se enmascara.

## 5. formatMessageTime — CONFIRMADO

Helper **puro y exportado** (ChatPanel.jsx:6-12): sin React, sin efectos, sin dependencias.
Devuelve SIEMPRE string ('' si el dato no sirve), nunca un número: cierra por diseño el
footgun F30. El test lo importa y lo llama directamente, **y además** renderiza el
componente real ChatMessage que lo consume, así que el camino de producción queda ejercitado
por dos vías. `isPrivate = Boolean(message.to_user_id)` es el cambio de semántica declarado y
es una mejora (cubre undefined, que antes daba "privado" por error).

## 6. CanvasBoard — CONFIRMADO

Diff de 3 líneas, puro cambio de token (bg-ink-800 -> bg-rail x2, border-ink-line ->
border-line, text-gray-600 -> text-muted). El error boundary, el Suspense, el lazy import de
TldrawCanvas y el fallback de imagen quedan **byte a byte iguales**. Cero riesgo funcional.

---

## 3. Emojis y tokens v0 — PARCIAL: **HALLAZGO**

### 3a. Los DOS archivos del alcance: limpios
- Grep de tokens v0 (`gold`, `ink-900|800|700|600|500`, `ink-line`, `text-gray-`, `bg-gray-`,
  `border-gray-`) en ChatPanel.jsx y CanvasBoard.jsx -> **CERO coincidencias**. Correcto.
- Emojis en esos dos archivos -> **CERO**. Los 5 emojis originales (dos veces la almohadilla
  de "todos", dos candados y la flecha de enviar) están sustituidos por Icon users/pin/arrow-right,
  y la desviación del `<option>` (el icono va FUERA del select, porque un option nativo solo
  pinta texto) está bien razonada y documentada.

### 3b. tailwind.config.js: NO se tocó — CORRECTO, y la justificación del reporte es EXACTA
`git diff --stat frontend/tailwind.config.js` -> **vacío**. Verificado además el censo de
consumidores restantes que alega el reporte, y coincide al 100%:

| Alias | Consumidores reales que quedan (excluyendo tests) |
|---|---|
| gold | Stats/Sparkline.jsx:25; pages/MyCharacters.jsx:9, :88, :129 |
| ink-900 | Stats/CampaignStatsPanel.jsx:66, :79; pages/MyCharacters.jsx:9 |
| ink-line | Stats/CampaignStatsPanel.jsx:66, :79; pages/MyCharacters.jsx:9 |
| ink-800 / 700 / 600 / 500 | **CERO** (F32 los dejó sin consumidores) |

Como gold, ink-900 e ink-line siguen usados, dejar el config intacto es la decisión correcta
según la instrucción del líder ("eliminarlos solo con CERO consumidores").

### 3c. HALLAZGO: la afirmación "cero emojis en TODO src/" del reporte es FALSA
El reporte (seccion 2) dice: *"Barrido final de emojis en todo src/: 0 (comprobado con el
rango 1F000-1FAFF / 2600-27BF)"*. **Ese barrido no da 0.** Re-ejecutado por el revisor con
ripgrep (soporte Unicode real), quedan **8 emojis vivos en 3 archivos**:

```
frontend/src/pages/MyCharacters.jsx:137   mago      (U+1F9D9)  "Desde pregen"
frontend/src/pages/MyCharacters.jsx:211   portapapeles (U+1F4CB)
frontend/src/pages/MyCharacters.jsx:212   rayo      (U+26A1)
frontend/src/pages/MyCharacters.jsx:213   mochila   (U+1F392)
frontend/src/pages/MyCharacters.jsx:258   gráfico   (U+1F4CA)
frontend/src/pages/MyCharacters.jsx:266   papelera  (U+1F5D1)
frontend/src/components/Stats/CampaignStatsPanel.jsx:67   pin de mapa (U+1F4CD)
frontend/src/components/Stats/CharacterStatsPanel.jsx:56  estrella    (U+2B50)
```
(La estrella tipográfica U+2605 de CharacterSheet.jsx —el marcador de atributo principal de
F30— NO cuenta: es un carácter tipográfico deliberado, no un emoji de color.)

**Por qué NO bloquea el veredicto:**
1. Los 3 archivos afectados están **fuera del alcance declarado de F32** (git status confirma
   que no se tocaron) y el líder los excluyó explícitamente: la entrada de feature_list.json
   dice *"el ÚNICO archivo con emojis vivos en todo src/ es ChatPanel; no busques más"*.
   La premisa del líder era errónea; el implementer obedeció la instrucción.
2. F32 **no introdujo** ni un solo emoji y erradicó todos los de su alcance.
3. Ningún checkpoint de CHECKPOINTS.md ni criterio de rechazo automático exige "cero emojis
   en todo src".

**Lo que SÍ exige acción del líder** (no del implementer, que no debe tocar código ajeno):
- (a) Corregir la frase del reporte impl_F32: cambiar *"Barrido final de emojis en todo src/: 0"*
  por *"Barrido de emojis en los archivos del alcance: 0; quedan 8 emojis en 3 archivos fuera de alcance"*.
- (b) Corregir la premisa de la entrada F32 de feature_list.json y abrir una entrada de
  backlog con esos 3 archivos (MyCharacters.jsx, Stats/CampaignStatsPanel.jsx,
  Stats/CharacterStatsPanel.jsx). Coincide exactamente con la "deuda visual restante" que el
  propio implementer ya listó para poder retirar los alias gold/ink-* del config: **una sola
  pasada futura cierra las dos deudas a la vez** (emojis + alias v0 + lib/planning.js:24).

**Causa raíz probable, y trampa que el revisor también pisó:** en Git Bash sobre Windows,
`grep -P` aborta con *"grep: -P supports only unibyte and UTF-8 locales"*, sale con código de
error y **no imprime nada**. Un barrido escrito como `grep -rnP '<rango>' src || echo "CERO"`
imprime "CERO" para un grep que nunca llegó a ejecutarse. Yo obtuve ese mismo falso "CERO"
en mi primera pasada y solo lo detecté al repetirlo con ripgrep. Ver candidato a LEARNINGS 3.

---

## Comandos ejecutados y salida resumida

(Verificación común, ejecutada UNA vez para F31 y F32.)

```
# Host limpio ANTES
ls -d frontend/node_modules backend/node_modules   -> No such file or directory (ambos)

# Frontend (lo relevante para F32)
docker compose build frontend                      -> Image rolapp-v1-frontend Built, exit 0
                                                      (fuerza RUN npm run lint + RUN npm run build)
docker build --target build -t tmp-rev3132 ./frontend   -> exit 0
docker run --rm tmp-rev3132 npm test               -> Test Files  12 passed (12)
                                                      Tests  140 passed (140)
   src/components/Chat/chatPanel.test.jsx (11 tests)   <- los 11 nuevos de F32
docker rmi tmp-rev3132                             -> Untagged / Deleted

# Backend (sin cambios de F32; ejecutado por F31 y válido como control)
docker compose build backend                       -> Built, exit 0
   hash host == hash imagen para src/sockets/session.js y session.test.js  (COINCIDEN)
docker compose run --rm --no-deps backend npm run lint  -> exit 0
docker compose run --rm --no-deps backend npm test      -> 165 tests / 164 pass / 0 fail / 1 skip

# Host limpio DESPUÉS
ls -d frontend/node_modules backend/node_modules   -> No such file or directory (ambos)
docker images | grep tmp-                          -> cero imágenes temporales
git status --short                                 -> cero archivos de código fuera de los
                                                      alcances declarados de F31 y F32
```

- lint frontend: OK (exit 0 dentro del build stage)
- build frontend: OK
- test frontend: OK - 140/140, de los cuales 11 nuevos de F32
- backend: OK y sin tocar por F32

**Scope**: git status confirma que F32 modificó exactamente ChatPanel.jsx y CanvasBoard.jsx,
creó chatPanel.test.jsx y borró los 4 paneles de DMMaster/. Cero archivos fuera de alcance.
No tocó App.jsx, lib/*, TvView.jsx, SessionToolbar, SessionCharactersPanel, CharacterSheet.jsx
ni backend, tal como exigía la convivencia con F30/F31.

---

## Lecciones aplicadas correctamente

| Lección | Aplicada | Verificación del revisor |
|---|---|---|
| **F20** - vitest sin jsdom: testear helpers puros | SÍ | formatMessageTime y ChatMessage extraídos y exportados; test 100% SSR + función pura, cero deps nuevas. |
| **F20** - tests de frontend en Docker sin ensuciar el host | SÍ | --target build + docker run + docker rmi; host sin node_modules antes y después (re-comprobado). |
| **F30** - entero 0/1 en un guard && | SÍ | Boolean(message.to_user_id); ternarios para la hora; el helper devuelve siempre string. Barrido re-ejecutado por el revisor sobre ChatPanel.jsx: los guards que quedan son comparaciones (.length > 0, .length === 0), a salvo. |
| **F13** - cero emojis, iconografía solo desde ui/Icon.jsx | SÍ (en su alcance) | users, pin y arrow-right existen en ICON_NAMES; cero emojis en los 2 archivos del alcance. Ver el hallazgo 3c sobre la afirmación de "todo src/". |
| **F17** - extender != romper | SÍ | Firmas públicas de ChatPanel y CanvasBoard sin cambios; SessionView no necesitó tocarse. |
| **F14/Frontend** - cero estilos inline, cero window.innerWidth | SÍ | Grep -> cero en ambos archivos. |
| **F5** - nada de componentes huérfanos | SÍ, y en positivo | Es la feature que ELIMINA los huérfanos; re-verificado con grep en todo src y en backend. |
| **Proceso F4** - no declarar un checkpoint sin ejecutarlo | **PARCIAL** | Las cifras de lint/build/test se reprodujeron exactamente. El "barrido de emojis en todo src/: 0" NO se sostiene (3c). |

---

## Puntos a corregir

Ninguno bloqueante en el código. Una corrección **documental** obligatoria antes de cerrar:

1. **Corregir la afirmación del reporte impl_F32 (seccion 2)**: "Barrido final de emojis en
   todo src/: 0" es falsa. Sustituir por el alcance real y adjuntar la lista de 8 emojis
   supervivientes. La acción es del líder (editar el reporte y el backlog); el implementer no
   debe tocar los 3 archivos, que están fuera de su alcance.

---

## Observaciones (no bloqueantes)

1. **La premisa del líder en feature_list.json era incorrecta** ("el ÚNICO archivo con emojis
   vivos en todo src/ es ChatPanel; no busques más"). Conviene que las entradas del backlog
   que afirman un censo lo marquen como *hipótesis a verificar*, no como hecho: si el
   implementer la hubiera verificado en vez de repetirla, el hallazgo habría aparecido antes.
2. **"pin" vs "shield" para privado.** El implementer aplicó la instrucción literal (pin) y
   deja constancia de que shield lee mejor para "mensaje privado". Es un cambio de una palabra;
   decisión del líder. Un candado real no existe en ICON_NAMES.
3. **Deuda restante ya inventariada y correcta** para poder retirar gold/ink-* del config:
   pages/MyCharacters.jsx, Stats/CampaignStatsPanel.jsx, Stats/CharacterStatsPanel.jsx,
   Stats/Sparkline.jsx y lib/planning.js:24 (categoryClasses.general, que además es uno de los
   exports muertos aplazados del punto 3 del backlog). Es exactamente el mismo conjunto que
   arrastra los emojis del hallazgo 3c: **una pasada cierra emojis + alias v0 + exports muertos**.
4. **Punto 3 del backlog (exports muertos) aplazado** por colisión con F31, que trabajaba sobre
   lib/. Justificado y correctamente declarado; queda pendiente de reprogramar ahora que F31
   ya no está en vuelo.
5. **rounded-btn (9px) para la burbuja de chat** en vez de rounded-card (13px): justificado por
   densidad. Es criterio visual, no infracción de tokens.
6. **Mejora de accesibilidad no pedida pero bienvenida**: aria-label en select, input y botón
   de enviar. Va en la misma dirección que el remate (A) de F33 sobre Modal.jsx.

---

## Candidatos para LEARNINGS.md (el líder decide)

1. **Frontend - "Un `<option>` nativo no renderiza SVG: el icono va FUERA del `<select>`".**
   Al erradicar emojis de un selector no se puede sustituir el emoji por un `<Icon>` dentro del
   `<option>` (el navegador solo pinta texto). Patrón: icono en la fila, junto al select,
   reflejando el valor seleccionado, y opciones en texto plano ("Todos" / "Privado - ana").
   La alternativa (dropdown propio) es rediseño, no restyle. (Endorsada por el revisor.)

2. **Proceso - "Borrar código muerto se justifica con una tabla de paridad método a método, no
   con un grep de imports".**
   Cero importadores prueba que está muerto HOY, no que su capacidad exista en el reemplazo.
   Procedimiento barato y objetivo: extraer TODOS los métodos que invoca el huérfano
   (ojo con las llamadas encadenadas multilínea, que un `grep api\.\w+` se pierde: hay que
   capturar también las líneas que empiezan por punto) y comprobar uno a uno que aparecen en
   la página que lo sustituye. Y **re-correr el análisis después de cada borrado**: en F32,
   borrar GameSystemPanel dejó huérfanos EN CASCADA a SkillsPanel e ItemsPanel.
   (Endorsada; el revisor re-ejecutó el método completo y los 47 métodos dieron 47/47.)

3. **NUEVA (propuesta del revisor) - Testing/Docker: "Un barrido que no encuentra nada solo
   vale si demuestras que el barrido CORRE: valida con un control positivo".**
   En Git Bash sobre Windows, `grep -P` aborta con "grep: -P supports only unibyte and UTF-8
   locales", sale con error y **no imprime nada**; escrito como `grep -rnP '<rango>' src ||
   echo "CERO"` imprime un "CERO" que en realidad significa "el comando falló". Así se declaró
   "cero emojis en todo src/" cuando quedaban 8. Reglas: (a) para rangos Unicode usa **ripgrep**
   (`rg`), que los soporta nativamente; (b) antes de declarar un barrido en verde, ejecútalo
   contra algo que SABES que existe (control positivo) y comprueba que lo encuentra;
   (c) nunca uses `cmd || echo "CERO"` para reportar ausencia, porque confunde "0 resultados"
   con "el comando falló" — separa el exit code del recuento.

4. **NUEVA (propuesta del revisor) - Proceso: "Un censo afirmado en feature_list.json es una
   hipótesis, no un hecho: el implementer lo verifica antes de repetirlo".**
   La entrada de F32 afirmaba "el ÚNICO archivo con emojis vivos en todo src/ es ChatPanel; no
   busques más". Era falsa. Una instrucción de ALCANCE ("no toques otros archivos") es
   vinculante; una afirmación de HECHO ("no hay más") es verificable y hay que verificarla
   antes de copiarla al reporte como resultado propio. Redacción recomendada en el backlog:
   *"según el censo del líder solo X lo tiene — confírmalo y reporta discrepancias"*.

5. **NUEVA (propuesta del revisor) - Proceso: "Dos implementers en el mismo working tree:
   el que ve un fallo ajeno lo REPORTA y re-verifica, no lo arregla".**
   La primera pasada de F32 salió con 2 tests en rojo que eran de F31 (pickVitals inventaba
   ceros para un personaje sin atributos). El implementer de F32 no los tocó: esperó,
   reconstruyó y reintentó, y lo dejó anotado en su reporte. Es la conducta correcta —arreglar
   código ajeno habría contaminado los dos alcances y roto la trazabilidad de la revisión— y
   además el fallo cruzado sirvió de segunda red de seguridad para F31. Corolario para el
   líder: al paralelizar, exige que cada reporte declare explícitamente los archivos AJENOS que
   vio moverse.

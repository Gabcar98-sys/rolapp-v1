# Implementación: F30 — charsheet-iscore-zero (0 espurio en atributos no-core)

Fecha: 2026-07-23
Status: completado

## Contexto del bug
Los atributos NO-core de la ficha mostraban un `0` pegado al nombre ("0Deflect",
"0Physical Defense", "0Health"). Causa raíz confirmada: `is_core` llega como ENTERO
0/1 desde SQLite, y el guard `{def.is_core && <span>★</span>}` evalúa a `0` cuando
`is_core === 0`; React renderiza ese `0` literal en el DOM. Los core (`is_core === 1`)
pintaban la ★ bien.

## Archivos creados
- `frontend/src/components/Character/characterSheet.test.jsx`: test de regresión SSR
  (renderToStaticMarkup, patrón F20 sin jsdom) del helper puro `coreMarker`. Cubre:
  core → ★ presente; no-core → markup vacío, SIN ★ y SIN `0`; falsy → `null`; y el
  fragmento real "marcador + nombre" asertando que NO aparece "0Deflect".

## Archivos modificados
- `frontend/src/components/Character/CharacterSheet.jsx`:
  - Añadido helper puro EXPORTADO `coreMarker(isCore)` que devuelve el `<span>★</span>`
    solo si `Boolean(isCore)`, y `null` en caso contrario (patrón `Boolean(...)` que el
    equipo ya usa en `AttributesPage.jsx:487`). Comentario explica el porqué (entero 0/1).
  - Línea ~189 (`AttributesTab`): `{def.is_core && <span…>★</span>}` → `{coreMarker(def.is_core)}`.
  - Línea ~330 (`StatusRow`): `{def.is_core && <span…>★</span>}` → `{coreMarker(def.is_core)}`.
  - Estilos y resto del markup intactos; el código que corre ES el que se testea (sin
    duplicar la lógica del guard).

## Diff conceptual
Dos guards `&&`-con-entero que renderizaban `0` → una llamada al helper `coreMarker`,
que coerciona a booleano y devuelve nodo o `null`.

## Barrido de otros guards `&&`-con-número (solo este archivo)
- Línea ~335 `{def.has_max && maxDraft !== '' ? <span/> : null}`: el `&&` es la CONDICIÓN
  de un ternario; su resultado numérico (0/1) se consume como booleano y NUNCA se pinta.
  A salvo.
- Línea ~203 `def.has_max ? … : …` y demás `has_max`: ternarios / `if`, no renderizan el número.
- Resto de `&&` del archivo operan sobre strings/booleans/funciones (`canEdit`, `error`,
  `onBack`, `game_system_name`, `selectedFormat`, `canAdd`…). Ningún otro `&&`-con-número
  que pinte un literal. Fix acotado a las 2 líneas del reporte.

## Tests escritos
- `frontend/src/components/Character/characterSheet.test.jsx` (4 tests): regresión del
  `0` espurio y presencia de la ★ para core.

## Resultado de verificación (entorno canónico = Docker)
- lint + build: ✅ — `docker compose build frontend` exit 0 (lint y build forzados en el
  build stage; "✓ built in 3.75s").
- test: ✅ 95 pasando (8 archivos), incluidos los 4 nuevos de `characterSheet.test.jsx`.
  Corrido con el patrón F20: `docker build --target build -t tmp-f30 ./frontend` +
  `docker run --rm tmp-f30 npm test` + `docker rmi tmp-f30`.
- Higiene Docker: sin `node_modules` residual en el host antes y después; `.dockerignore`
  del frontend ya excluye node_modules/dist/.git. NO se corrió npm/vitest en el dir montado.
- Manual / e2e: No aplica (fix visual determinista, cubierto por SSR).

## Lecciones aplicadas
- Testing F20 ("el runner de vitest del frontend no tiene jsdom: testea helpers puros"):
  extraje `coreMarker` como helper puro exportado y lo testeé con `renderToStaticMarkup`,
  sin jsdom ni testing-library.
- Testing F20 ("correr los tests del frontend en Docker sin ensuciar el host"): usé
  `docker build --target build` + `docker run --rm` + `docker rmi`, sin instalar deps en
  el host.
- Frontend (patrón `Boolean(...)` de `AttributesPage.jsx:487`): misma coerción para evitar
  pintar el entero.
- Docker/infra F8b (".dockerignore / node_modules residual"): verifiqué host limpio antes
  y después del build.

## Decisiones tomadas
- Extraje un helper `coreMarker` (en vez de inlinear `{Boolean(def.is_core) && …}` dos
  veces) para que la lógica quede en UN solo lugar testeable y el test ejercite el código
  real, no una copia. Sin dependencias nuevas.

## Candidatos para LEARNINGS.md
- **Frontend:** "Valores enteros de SQLite (0/1) en guards JSX pintan el número: coerciona
  con `Boolean(x)` o helper que devuelva nodo/null; nunca `{intFlag && <…/>}`." Aplica a
  cualquier flag `is_core`/`has_max`/`is_*` que venga de la DB. El síntoma (un `0` pegado
  al texto) pasa build/lint/tests unitarios y solo se ve en runtime con `flag === 0`.

## Remate tras rechazo del reviewer (segunda pasada)
El reviewer aceptó el fix de `is_core` (189/330) pero RECHAZÓ por un guard `has_max`
sin barrer. Corregido:

1. **`CharacterSheet.jsx:381` (`StatusRow`)** — `{def.has_max && (<label>…)}` → ternario
   `{def.has_max ? (<label>…) : null}`. `has_max` es INTEGER 0/1 (schema.sql:119, servido
   crudo por `SELECT *` en gameSystems.js:52) y `StatusRow` se renderiza para
   `is_core || has_max`, así que un atributo core sin máximo (has_max=0) pintaba un `0`
   literal en la pestaña Estado. Markup/estilos intactos.

2. **`CharacterSheet.jsx:303` (footgun derivado, hallado en el re-barrido)** —
   `const hasNumericMax = def.has_max && …` heredaba el ENTERO `0` cuando has_max=0 (no un
   booleano) y lo propagaba a `useDots` (línea 305), cuyo guard `{useDots && (<div/>)}`
   (línea ~351) pintaría el `0` para un core sin máximo. Coercionado en la raíz:
   `Boolean(def.has_max) && …`, con lo que `hasNumericMax`, `useDots` y `pct` quedan
   booleanos/null limpios.

3. **Re-barrido COMPLETO del archivo** (regex `\{[^}]*&&\s*[(<]` + revisión manual de cada
   guard): tras estos fixes NO queda ningún `{intFlag && <…>}` con flag numérico de la DB.
   Todos los `&&` restantes operan sobre booleanos o strings: `canEdit`, `tab === 'x'`,
   `error` (''), `onBack`, `game_system_name` (''), `selectedFormat` (''), `useDots`
   (ahora bool), `!useDots && pct !== null`, `isAdding`, `canAdd`, `equipped.length === 0`.
   El único `&&`-con-número restante (`{def.has_max && maxDraft !== '' ? … : null}`, ~344)
   es la CONDICIÓN de un ternario → su resultado numérico se consume como booleano y nunca
   se pinta. A salvo. **Confirmado: no queda ningún footgun de este tipo.**

4. **Test extendido** (`characterSheet.test.jsx`, ahora 6 casos): exporté `StatusRow` y
   añadí un `describe` que lo renderiza por SSR con **valor actual NO-cero (7)** para que
   el único `0` posible sea el espurio del guard. Aserción sobre el TEXTO visible
   (`html.replace(/<[^>]*>/g, '')`) porque las clases Tailwind de Button/Card contienen
   dígitos (`opacity-50`, `duration-150`) que envenenarían un `toContain('0')` sobre el
   HTML crudo. Casos: (a) core sin máximo (has_max=0) → sin `0` de texto, con ★, "7",
   "Deflect"; (b) core con máximo numérico → tracker con ★, "Health", "/6". Conservados
   los 4 casos de `coreMarker`.

## Re-verificación (Docker, patrón F20) tras el remate
- lint + build: ✅ — `docker compose build frontend` exit 0.
- test: ✅ **97 pasando** (8 archivos); `characterSheet.test.jsx` pasa de 4 a 6 casos.
  `docker build --target build -t tmp-f30 ./frontend` + `docker run --rm tmp-f30 npm test`
  + `docker rmi tmp-f30`.
- Higiene: host sin `node_modules` residual antes y después.

## Bloqueantes
Ninguno.

# Revisión: F30 — charsheet-iscore-zero ('0' fantasma en labels de atributos)
Fecha: 2026-07-30 (2ª pasada — re-revisión tras rechazo)
Veredicto: APROBADO

## Resumen
El bloqueante único de la 1ª pasada (guard `&&`-con-entero `{def.has_max && (<label>Máx…)}`
en `CharacterSheet.jsx:381`) está CERRADO, y el implementer además encontró y cerró un
footgun DERIVADO que el reviewer no había señalado (`hasNumericMax` heredando el entero 0
y propagándolo a `useDots`, cuyo guard `{useDots && (<div/>)}` pintaba ese 0).
Re-barrido completo del archivo: NO queda ningún guard `&&` con bandera entera de SQLite.
Verificado en Docker con hashes host↔imagen idénticos, lint 0 errores, build exit 0 y 97/97
tests. Además se comprobó POR MUTACIÓN que los tests detectan realmente las tres regresiones.
Scope limpio. Host sin `node_modules` residual antes ni después.

## Checklist CHECKPOINTS.md (aplicable: frontend puro)
- [x] Lint frontend pasa EN EL CONTENEDOR — `docker compose build frontend` exit 0 (lint forzado en el build stage, Dockerfile:8) y `docker run --rm tmp-f30rev npm run lint` → 0 errores, 6 warnings PREEXISTENTES (todas `react-hooks/exhaustive-deps` en otros archivos; ninguna en CharacterSheet.jsx ni en el test).
- [x] Build frontend pasa — `docker compose build frontend` exit 0; `docker build --target build` exit 0.
- [x] Lint NO declarado sin ejecutarlo: ejecutado por el reviewer, salida registrada abajo.
- [x] La imagen refleja el código ACTUAL verificado por HASH (no por cache-hit ni timestamp): sha256 host == imagen para los 2 archivos.
- [x] No hay código comentado sin explicación (los comentarios nuevos explican el porqué del `Boolean()`).
- [x] No hay `console.log` de debug (grep sobre los 2 archivos → ninguno).
- [x] Tests existen y pasan — 97/97 en 8 archivos; `characterSheet.test.jsx` 6/6.
- [x] Al menos un test por unidad pública nueva no trivial — `coreMarker` (4 casos) y `StatusRow` (2 casos), ambos EXPORTADOS y ejercitados desde el módulo real, no una copia.
- [x] Caso feliz cubierto — is_core=1 → estrella + title "atributo principal"; core con máximo numérico → tracker con "/6".
- [x] Caso de error/regresión cubierto — is_core=0 → markup vacío, sin estrella y sin '0'; has_max=0 en StatusRow → texto visible sin '0' espurio.
- [x] Frontend: estilos solo Tailwind + tokens; cero inline (grep de `style={{` y `const s = {` → ninguno).
- [x] Frontend: cero `window.innerWidth` (grep → ninguno).
- [x] Nombres descriptivos en inglés (`coreMarker`, `isCore`, `hasNumericMax`, `StatusRow`).
- [x] Una sola responsabilidad por función; sin dependencias circulares (el test importa del componente, no al revés).
- [x] Respeta la estructura de architecture.md — helper y test junto al componente, sin deps nuevas.
- [x] Sin dependencias nuevas; sin cambios de esquema; sin endpoints nuevos.
- [x] Scope limitado a lo declarado — `git status --short` solo los 2 archivos de F30 + los 2 .md de progress.
- [x] Higiene Docker — host sin `frontend/node_modules` ANTES y DESPUÉS; imagen temporal `tmp-f30rev` borrada.
- [x] Lección propuesta para LEARNINGS.md (decisión técnica no trivial) — presente en el reporte del implementer.
- [x] Reportes de progress escritos (impl_F30 con la sección "Remate tras rechazo"; este review_F30).

## Punto bloqueante previo — VERIFICADO CERRADO
1. `CharacterSheet.jsx:384-397` (antes 381) ahora es TERNARIO, no guard `&&`:
   `{def.has_max ? (<label className="ml-auto …">Máx <input … /></label>) : null}`
   Con has_max=0 devuelve `null` → React no pinta nada. Confirmado por lectura Y por mutación.
2. `CharacterSheet.jsx:306` coerciona EN LA RAÍZ:
   `const hasNumericMax = Boolean(def.has_max) && Number.isFinite(maxNum) && maxNum > 0;`
   → `hasNumericMax`, `useDots` y `pct` quedan booleanos/null limpios. Este era un footgun
   DERIVADO real que mi 1ª revisión NO había detectado: sin el `Boolean(...)`, `useDots` valía
   el entero 0 y el guard de la línea 351 pintaba un '0'. Mérito del implementer.

## Re-barrido COMPLETO de guards (regex `\{[^}]*&&\s*[(<]` + los 26 usos de `&&` del archivo)
Cada uso clasificado por el tipo del operando izquierdo:
- Banderas INTEGER de SQLite (las peligrosas): CERO guards `&&` que pinten el subárbol directo.
  - 347 `{def.has_max && maxDraft !== '' ? <span/> : null}` → el `&&` es la CONDICIÓN de un
    ternario (precedencia: `&&` liga más fuerte que `?:`); su 0/1 se consume como test, nunca
    se pinta. A SALVO — confirmado empíricamente: el test con has_max=0 pasa sin '0' en el texto.
  - 306, 308 → asignaciones ya coercionadas a booleano.
  - 169, 212, 295, 299, 302, 320, 384 → ternarios / spreads; no renderizan el número.
- Booleanos puros: 115/125/128/131/141 (`tab === 'x'`), 351 (`useDots`, ahora bool),
  370 (`!useDots && pct !== null`), 639 (`equipped.length === 0 && !isAdding`),
  657 (`canAdd && !isAdding`), 670 (`isAdding`), 632 (`canAdd`).
- `canEdit` (255, 376, 487, 502, 549, 560, 646, 735, 787): trazado hasta los DOS callers reales —
  SessionCharactersPanel.jsx:63 y CharactersPage.jsx:111 — ambos derivados de comparaciones
  booleanas (`user.role === 'dm'`, `String(...) === String(...)`). Nunca un entero de la DB.
- Strings/funciones: 95 (`onBack`), 102 (`game_system_name`), 108 (`error`, ''), 513
  (`selectedFormat`, ''). Un '' renderiza vacío; undefined/null no renderizan.
- 24, 304: comentarios, no código.
Conclusión: el barrido de esta 2ª pasada está COMPLETO. `{def.is_core && <span…>}` ya no existe
(la única coincidencia textual de "is_core &&" es el comentario de la línea 24).

## Resultado de verificación (EJECUTADO por el reviewer, no copiado del reporte)
Nota: el daemon de Docker estaba caído al empezar; se levantó Docker Desktop antes de verificar.
- currency por HASH: OK (host == imagen, exacto)
  - CharacterSheet.jsx       53471119fd147b7b1c0e25137553f79c776eb952ef669a79c07427148433ffad
  - characterSheet.test.jsx  92e436708a1c5ffe813d4f3be5a6099ed0aea83bd4e3f4b5c537fedee89c368d
- lint:  OK — `docker run --rm tmp-f30rev npm run lint` → "6 problems (0 errors, 6 warnings)", exit 0.
- build: OK — `docker compose build frontend` → "Image rolapp-v1-frontend Built", EXIT_BUILD=0.
- test:  OK — patrón F20: `docker build --target build -t tmp-f30rev ./frontend` +
  `docker run --rm tmp-f30rev npm test` + `docker rmi tmp-f30rev`
  → "Test Files 8 passed (8) | Tests 97 passed (97)"; "characterSheet.test.jsx (6 tests)".
- host:  OK — sin frontend/node_modules ni backend/node_modules antes ni después; sin imágenes tmp residuales.
- scope: OK — `git status --short`:
    M  frontend/src/components/Character/CharacterSheet.jsx
    ?? frontend/src/components/Character/characterSheet.test.jsx
    ?? .claude/progress/impl_F30-charsheet-iscore-zero.md
    ?? .claude/progress/review_F30-charsheet-iscore-zero.md
  Nada más. Los archivos de F29 ya están commiteados en 9f18a37 → fuera del working tree, no revisados.
- diff:  OK — 18 inserciones / 6 supresiones en 1 archivo. Markup, clases y comportamiento intactos.

## Prueba de que los tests DETECTAN la regresión (mutation testing en contenedor efímero)
Se mutó el fuente DENTRO de contenedores `docker run --rm` (el working tree del host nunca se
tocó; el reviewer no editó código del repo). Con el código actual sin mutar: 6/6 en verde.

| # | Mutación aplicada | Resultado |
|---|-------------------|-----------|
| M1 | linea 384 ternario → guard `&&` (y 397 `) : null}` → `)}`) | FALLA: Received "★Deflect7−+0" — reaparece el 0 del bug |
| M2 | linea 306 `Boolean(def.has_max)` → `def.has_max` | FALLA: Received "★Deflect70−+" — el 0 entra vía `useDots` |
| M3 | `coreMarker` vuelto a `isCore && (…)` | FALLAN 3 tests: Received "<span>0Deflect</span>" |

Los tests son genuinos, no tautológicos. Acierto de diseño del test: asertar sobre el TEXTO
visible (quitando los tags con una regex) y usar valor actual 7 (no 0), de modo que el único 0
posible sea el espurio; las clases Tailwind con dígitos (opacity-50, duration-150) viven dentro
de los tags y no envenenan la aserción.

## Lecciones aplicadas correctamente
- Testing F20 (vitest sin jsdom → helpers puros / SSR): OK. `coreMarker` y `StatusRow` exportados
  y renderizados con `renderToStaticMarkup`. StatusRow tiene hooks, pero SSR los soporta (el
  useEffect no corre en SSR). Sin jsdom ni testing-library, sin dependencias nuevas.
- Testing F20 (tests del frontend en Docker sin ensuciar el host): OK, patrón build-stage +
  `--rm` + `rmi`; host limpio verificado antes y después.
- Docker/infra F8b (.dockerignore / node_modules residual): OK, sin residual.
- Docker "prueba que la imagen está al día por HASH, no por timestamp ni cache-hit": OK, verificada.
- Frontend "cero estilos inline, cero window.innerWidth": OK.
- Frontend, patrón `Boolean(...)` de AttributesPage.jsx:487: OK — ahora sí extendido a TODAS las
  banderas enteras del archivo (is_core y has_max), que era exactamente el motivo del rechazo previo.

## Puntos a corregir
Ninguno. Cero bloqueantes.

## Observaciones (no bloqueantes)
- Grep en todo `frontend/src` por el mismo antipatrón (guard `&&` con campo `is_*`/`has_*`) fuera
  de CharacterSheet.jsx → CERO ocurrencias. El footgun queda erradicado del frontend actual,
  no solo de este archivo.
- `StatusRow` se exporta únicamente para poder testearlo. Es aceptable (el test ejercita el código
  real, que es lo que exige el checklist), pero nadie debería importarlo desde otras vistas sin
  pasar por `StatusTab`. Hoy nadie lo hace.
- El test de `StatusRow` cubre SSR; la interacción (click en los dots, blur del input de Máx) sigue
  sin cubrir por la ausencia de jsdom — consistente con la lección F20, no es deuda nueva de F30.
- Las 6 warnings de lint son preexistentes y ajenas a F30; una de ellas ("Unused eslint-disable
  directive") es basura barata de limpiar en alguna feature futura de mantenimiento.
- El bug original se veía en runtime con datos reales; no hay verificación manual en navegador en
  esta pasada (fix visual determinista y cubierto por SSR), igual que aceptó la 1ª revisión.

## Candidatos para LEARNINGS.md (para que el líder evalúe)
- **Frontend:** "Banderas INTEGER de SQLite (0/1) en JSX: nunca `{flag && <…/>}`". React pinta el 0
  literal. Coerciona con `Boolean(flag)`, usa ternario `? … : null`, o un helper que devuelva
  nodo/null. Aplica a is_core, has_max y cualquier is_* que llegue crudo por `SELECT *`. El síntoma
  (un 0 pegado al texto) pasa lint, build y tests unitarios: solo se ve en runtime con flag === 0.
- **Frontend (corolario — lo que costó la 1ª pasada):** la coerción va EN LA RAÍZ, no solo en el
  sitio de render. Un `const x = intFlag && cond` HEREDA el 0 y lo propaga a guards aguas abajo
  (`{x && <…/>}`). Hay que barrer las VARIABLES DERIVADAS de la bandera, no solo la bandera.
- **Testing:** para asertar "no aparece un 0 espurio" en markup de Tailwind, compara sobre el TEXTO
  visible (quitando los tags) y elige datos de prueba sin ceros legítimos (valor 7, no 0). Sobre el
  HTML crudo, clases como opacity-50 o duration-150 producen falsos negativos.
- **Proceso (reviewer):** verificar que un test DETECTA la regresión mutando el fuente dentro de un
  contenedor efímero (`docker run --rm … sed -i … && npx vitest run …`). Prueba que el test no es
  tautológico sin tocar el working tree del host. Barato, rápido y decisivo.
- **Proceso (reviewer):** un rechazo bien acotado se paga solo — el implementer no solo cerró el
  punto señalado, sino que encontró el footgun derivado (`hasNumericMax`/`useDots`) que el propio
  reviewer no había visto. Señalar la CLASE de error, no solo la línea.

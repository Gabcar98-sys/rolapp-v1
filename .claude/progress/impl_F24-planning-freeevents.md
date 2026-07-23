# Implementación: F24 — Eventos sueltos enlazados invisibles en Prep

Fecha: 2026-07-22
Status: completado

## Resumen (2 líneas)
Los eventos sueltos enlazados (`freeEvents` con `hasLinks === true`) ahora aparecen en la
pestaña Prep como grupo "Sin ubicación" con su flujo Inicio/Próximo, igual que las
sub-ubicaciones. La lógica de flujos se extrajo a un helper puro exportado y testeado sin DOM.

## El bug (confirmado)
En `PlanningPanel`, con enlaces presentes (`hasLinks`), la rama `hierarchy && hasLinks`
(PlanningPanel.jsx:338 en el original) solo mapeaba `subLocFlows`, y ese `useMemo` iteraba
únicamente `hierarchy.locations[].sub_locations[]`, sin procesar nunca `hierarchy.freeEvents`.
Los eventos sueltos solo se pintaban en la rama `!hasLinks` (PlanningPanel.jsx:409). Resultado:
un prep con eventos sueltos enlazados mostraba "Sin eventos en esta preparación" en Prep,
aunque la pestaña Flujo (grafo) sí los pintaba.

## Archivos modificados
- `frontend/src/lib/planning.js`: nuevo helper PURO exportado `computeSubLocFlows(...)` +
  dos helpers internos (`computeGroupFlow`, `collectEventIds`). Portada tal cual la lógica
  Inicio/Próximo que vivía inline en el `useMemo` del componente, y añadido el grupo
  "Sin ubicación" (`kind: 'free'`) que reúsa exactamente la misma lógica de raíces/hoja/próximos.
- `frontend/src/components/Session/PlanningPanel.jsx`:
  - Import de `computeSubLocFlows`.
  - El `useMemo` de flujos ahora es un wrapper delgado que llama al helper; `hasLinks` pasó a
    un `const` trivial (`eventLinks.length > 0`). Mismas dependencias del memo.
  - La rama `hasLinks` del render ahora distingue `kind === 'free'`: cabecera "Sin ubicación"
    (sin icono pin ni sub-cabecera, consistente con la rama `!hasLinks`) vs. sub-ubicación
    (pin + nombre + sub-nombre). El bloque Inicio/Próximo + `EventCard` + botón Lanzar se reúsa
    idéntico para ambos grupos.
- `frontend/src/lib/planning.test.js`: tests del helper (ver abajo).
- `.claude/feature_list.json`: F24 → `in_progress` (no `done`; lo gatilla el reviewer).

## Firma y casos del helper
`computeSubLocFlows({ locations = [], freeEvents = [], eventLinks = [], allEventsMap = new Map(), firedTemplateIds = new Set() } = {})`
→ devuelve un array de grupos. Cada grupo:
`{ kind: 'subloc' | 'free', locName, subLocName, mode: 'initial' | 'active', initialEntries, nextEntries }`
donde cada entry es el valor de `allEventsMap` (`{ event, locName, subLocName }`), y los
`nextEntries` llevan además `linkLabel`.

Reglas (idénticas a la v0 por sub-ubicación, aplicadas también al grupo free):
- Inicio = raíces del grupo: sin enlace entrante DENTRO del grupo y que no sean ramas
  (`!parent_event_id`).
- Sin disparados en el grupo → `mode: 'initial'` (solo Inicio).
- Con disparados → `mode: 'active'`: hoja disparada = sin sucesor disparado en el grupo;
  Próximos = enlazados desde una hoja disparada y aún no disparados (dedup).
- Los ids del grupo free se recolectan de `freeEvents` recorriendo sus `branches`.

## Cómo quedó el render del grupo "Sin ubicación"
En la vista Prep con enlaces, tras las sub-ubicaciones aparece un grupo con cabecera
"Sin ubicación" (mismo estilo que la rama sin enlaces), con su sección Inicio (tarjetas +
botón Lanzar) y, cuando hay disparos en el grupo, su sección Próximo con la etiqueta del
enlace. El botón Lanzar y el modal de participantes funcionan igual (los eventos sueltos no
llevan `locationName`/`subLocationName`, así que se disparan sin ubicación, como antes).

## Tests escritos (`frontend/src/lib/planning.test.js`, describe "computeSubLocFlows (F24)")
- `A→B→C` sueltos, sin disparar: 1 grupo `kind:'free'`, `mode:'initial'`, Inicio=[A], próximos vacíos.
- `A→B→C` sueltos con A disparado: `mode:'active'`, Inicio=[A], Próximo=[B] con `linkLabel:'luego'`.
- ubicación + sueltos: ambos grupos presentes (`['subloc','free']`), Inicio del subloc=[5], del free=[1].
- ramas no cuentan como Inicio del grupo free (la rama con `parent_event_id` se excluye).
- sin enlaces: no rompe; grupo free `mode:'initial'` con todos como Inicio.
- sin argumentos: degrada a `[]` sin lanzar.
No se debilitó ningún test existente.

## Resultado de verificación (entorno canónico Docker)
- lint:  ✅ (enforced en `docker compose build frontend`, exit 0)
- build: ✅ (`docker compose build frontend`, exit 0, "built in 6.46s")
- test:  ✅ 91/91 (frontend, vía `docker build --target build -t rolapp-fe-f24 ./frontend` +
  `docker run --rm rolapp-fe-f24 npm test`); `planning.test.js` 14 tests (6 nuevos del helper).
- Manual / e2e: No aplica en esta entrega — la verificación EN LA APP (crear eventos sueltos
  enlazados y verlos en Prep) la hará el líder con la sesión demo (F25), según el alcance.

Comandos:
```
docker compose build frontend
docker build --target build -t rolapp-fe-f24 ./frontend
docker run --rm rolapp-fe-f24 npm test
docker rmi rolapp-fe-f24
```
Imagen temporal eliminada; sin `node_modules` residual en `frontend/` (`.dockerignore` presente).
La verificación de tests corrió sobre imágenes recién construidas desde el source actual (el
edit invalida la capa COPY, sin riesgo de cache viejo).

## Lecciones aplicadas
- "El runner de vitest del frontend no tiene jsdom: testea helpers puros" → toda la lógica
  load-bearing va en `computeSubLocFlows` (puro) y se testea directamente, sin montar el panel.
- "Correr los tests del frontend en Docker sin ensuciar el host" → patrón build-stage
  (`--target build`) + `docker run` + `docker rmi`, sin `npm install` en el dir montado; sin
  node_modules residual.
- "Extender un componente compartido = props opcionales retrocompatibles" → no se tocó la firma
  de `EventFlowGraph` (la prop `compact` y la pestaña Flujo quedan intactas); el cambio es aditivo.
- "Cero estilos inline / cero emojis" → solo clases Tailwind + tokens; sin emojis.

## Decisiones tomadas
- Ubiqué el helper en `frontend/src/lib/planning.js` (módulo de helpers puros de planificación,
  junto a `flattenPrepEvents`/`computeGraphLayout`) en vez de exportarlo desde el componente,
  y los tests en `planning.test.js` (ya existente). Consistente con el dominio; ambos patrones
  (helper en lib vs. helper exportado del componente) ya se usan en el repo.
- Los ids del grupo free se derivan de `freeEvents` (recorriendo ramas), no del `allEventsMap`
  por nombre vacío: es explícito y evita ambigüedad si algún día una ubicación tuviera nombre
  vacío. La firma incluye `freeEvents` tal como pidió el líder.
- Sin dependencias nuevas. Cero cambios de backend.

## Candidatos para LEARNINGS.md
- Al arreglar una vista que "pierde" un subconjunto de datos, revisar que TODAS las ramas de
  render (aquí `hasLinks` vs `!hasLinks`) cubran el mismo conjunto de entidades; el grafo (Flujo)
  y la lista (Prep) deben derivar de la misma fuente para no divergir. Extraer el cálculo a un
  helper puro compartido reduce el riesgo de que una rama olvide un grupo.

## Bloqueantes
Ninguno.

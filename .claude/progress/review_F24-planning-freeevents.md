# Revisión: F24 — Eventos sueltos enlazados invisibles en Prep
Fecha: 2026-07-22
Veredicto: **APROBADO**

> NOTA: el agente reviewer cayó por límite de sesión justo cuando iba a confirmar la vigencia
> por hash. El **líder** completó la verificación independiente con los comandos exactos del
> checkpoint (build + tests + hash de vigencia). No se editó código. La verificación EN LA APP
> (crear eventos sueltos enlazados y verlos en Prep) se hará con la sesión demo F25.

## Scope (git diff --stat HEAD)
Solo frontend: `frontend/src/lib/planning.js` (+99, helper nuevo), `PlanningPanel.jsx` (usa el helper + grupo "Sin ubicación"), `planning.test.js` (+150, tests) + flag en feature_list.json.
**Cero cambios en backend/** (verificado con `git diff --name-only HEAD | grep '^backend/'` → vacío).

## Checklist
- [x] **Eventos sueltos enlazados aparecen en Prep (rama hasLinks).** `PlanningPanel.jsx:303-305`
      renderiza el grupo `kind === 'free'` con cabecera "Sin ubicación" dentro de la rama con enlaces;
      antes solo existían en `!hasLinks` (`PlanningPanel.jsx:375`, que queda intacto).
- [x] **Lógica en helper puro exportado** `computeSubLocFlows` en `planning.js` (importado en
      `PlanningPanel.jsx:4`, usado en el useMemo `:211`). Testeable sin DOM.
- [x] **`EventFlowGraph` con `compact` intacto** (`PlanningPanel.jsx:435`); pestaña Flujo sin cambios.
- [x] **Sin estilos inline decorativos** (`grep 'style={{'` en los 2 archivos → vacío), sin emojis.
- [x] **Build frontend (lint+build):** `docker compose build frontend` → exit 0.
- [x] **Tests:** `docker build --target build` + `docker run npm test` → **91/91** (planning.test.js 14, +6 del helper). Imagen temporal eliminada.
- [x] **Vigencia por hash (host↔imagen build-stage):**
      `planning.js` = `020ec3e9314aec…` (coincide); `PlanningPanel.jsx` = `8d20bce89365…` (coincide).
      → la imagen contiene el código actual; los tests corrieron contra el código de F24.
- [x] Sin `node_modules` residual.

## Verificación (comandos ejecutados por el líder)
```
git diff --stat HEAD                          # solo 3 archivos frontend + feature_list
docker compose build frontend                 # exit 0 (lint+build)
docker build --target build -t tmp ./frontend
docker run --rm tmp npm test                  # 91 passed (7 files)
sha256sum (host) vs docker run tmp sha256sum  # planning.js + PlanningPanel.jsx: IDÉNTICOS
docker rmi tmp
```

---
**VEREDICTO FINAL: APROBADO.** El fix cubre el hueco (los grupos free enlazados ahora se pintan en
Prep con flujo Inicio/Próximo, consistente con el grafo), sin tocar la rama `!hasLinks`, el disparo,
el modal NPC ni `EventFlowGraph(compact)`. Verificado en Docker con vigencia por hash. Falta solo la
prueba en vivo en la app, que se hará con F25.

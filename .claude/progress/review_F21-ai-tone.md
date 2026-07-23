# Revisión: F21-ai-tone (IA menos robótica — prompts por tarea)
Fecha: 2026-07-22
Veredicto: APROBADO

Revisión independiente. No se editó código. Verificación ejecutada literalmente en el
entorno canónico Docker (imagen backend reconstruida antes de testear: el servicio compose
backend NO monta src/ como volumen, lección del propio implementer).

## Requisitos F21 — ítem por ítem

1. Cláusula única NO_HALLUCINATION reemplazada por variantes POR TAREA. — PASA
   - grep de 'const NO_HALLUCINATION' en ai.js -> sin coincidencias (constante eliminada).
   - Verificado dentro del contenedor: NO_HALLUCINATION const still defined: false;
     RULES_GROUNDING: true. Cada tarea tiene su propia guía.

2. La frase enlatada ya no vive como instrucción al modelo. — PASA (con observación)
   - Los STRINGS de prompt no contienen "No encuentro esa información" ni "documentos
     cargados" (ai.js:324-354, 730-740).
   - CAVEAT: la frase sobrevive SOLO en un comentario histórico que documenta la
     eliminación (ai.js:313-315). Cero efecto en runtime; el prompt enviado al LLM está
     limpio. CHECKPOINTS permite comentarios con explicación. Ver Observaciones.
   - El guardián de regresión doesNotMatch(/No encuentro esa información en los documentos
     cargados/i) corre sobre el prompt string y pasa.

3. SUMMARY_SYSTEM y SESSION_SYSTEM NO mencionan "documentos". — PASA
   - grep de 'documento' en ai.js -> solo líneas 314 y 319 (comentarios). Ambos prompts
     razonan sobre "el contexto de la sesión … que es tu única fuente" (ai.js:336-346 y 730-740).

4. RULES_SYSTEM mantiene anti-alucinación de reglas oficiales con tono natural. — PASA
   - RULES_SYSTEM (331-334) + RULES_GROUNDING (324-329): cita la sección; nunca presenta
     como regla oficial algo fuera del contexto; matiza como sugerencia NO oficial; evita
     rechazos secos y frases enlatadas.

5. PLANNING_SYSTEM es creativo y propone. — PASA
   - ai.js:348-354: "PROPÓN SIEMPRE ideas concretas y accionables … Nunca te niegues a
     proponer ni recites frases de rechazo; tu trabajo es inspirar al DM". Anti-alucinación
     solo sobre reglas oficiales (marca ideas como sugerencia).

6. buildRulesPrompt maneja chunks.length === 0 sin rechazo robótico (aplica a streaming). — PASA
   - ai.js:596-613: instrucción del mensaje user condicional a chunks.length. Sin contexto
     pide orientación general útil marcada como sugerencia NO oficial, sin inventar reglas
     ni recitar frase enlatada de rechazo.
   - renderRules([]) sigue devolviendo cadena vacía (sin bloque "REGLAS RECUPERADAS").
   - streamRulesQuestion comparte buildRulesPrompt (ai.js:667): aplica igual a streaming.

7. INTACTOS: retrieval, tool-loop, degradación, contratos de retorno. — PASA
   - retrieveRules (411), hybridSearch (import 2), packWithinBudget (395), runToolLoop (532):
     el diff de ai.js NO toca esas funciones (solo prompts 312-354, buildRulesPrompt 596-613
     y SESSION_SYSTEM 724-732). Firmas sin cambio.
   - Contratos de retorno sin cambios (preexistentes, fuera del diff):
     { answer, sources, citations } (631, 642, 664, 673); preset
     { answer, sources: [], citations: [] } (861); planning
     { suggestion, sources, citations } (890, 900). Ninguna clave ni firma cambió.
   - Nota: planning/presets devuelven un SUPERSET (citations) del contrato mínimo de la
     tarea; es preexistente, no regresión.

8. Tests actualizados sin debilitar asserts de contrato. — PASA
   - El test antiguo (asertaba la frase enlatada) fue REEMPLAZADO por uno de tono natural
     (test de CONTENIDO de prompt, no de contrato); asserts nuevos sustantivos:
     /regla oficial/i, /natural/i, /sugerencia NO oficial|no oficial/i, doesNotMatch de la
     frase enlatada.
   - Dos tests nuevos: caso sin contexto (result.sources.length === 0; instrucción user pide
     orientación; sin bloque "REGLAS RECUPERADAS") y prompt de sesión (contexto de sesión,
     sin "documentos cargados", tono natural).
   - Los tests de contrato NO aparecen en el diff -> intactos, ninguno debilitado.

## Checklist CHECKPOINTS.md
- [x] Lint backend pasa en contenedor (exit 0)
- [x] Tests existen y pasan (144 tests / 143 pass / 0 fail / 1 skip preexistente)
- [x] Caso feliz cubierto (prompt con contexto / preset de sesión)
- [x] Al menos un caso de error/borde cubierto (chunks vacío -> orientación honesta)
- [x] better-sqlite3 síncrono (N/A en este diff, no toca DB)
- [x] session_events append-only (N/A — sin cambios de DB)
- [x] Frontend: N/A (F21 es backend puro; los cambios de frontend del árbol son de F20)
- [x] Nombres descriptivos en inglés (RULES_GROUNDING, RULES_SYSTEM, buildRulesPrompt…)
- [x] Respeta estructura de architecture.md (solo backend/src/services)
- [x] No hay código comentado sin explicación (el comentario histórico tiene su por qué)
- [x] Reportes de progreso escritos (impl_F21-ai-tone.md presente; este review)
- [x] Lección técnica propuesta para LEARNINGS.md (2 candidatos en el reporte del impl)

## Scope — verificación independiente (git status/diff)
- Archivos de F21 (esperados): backend/src/services/ai.js, ai.test.js, ai.presets.test.js
  + flag en feature_list.json (F21 -> in_progress, NO done). OK.
- feature_list.json: +24 líneas = alta de entradas de backlog F20/F21/F22 (metadata en
  .claude/, permitida). F21 correctamente en in_progress.
- NO hay cambios en rag.js, aiTools.js, embeddings.js, sockets ni rutas. Confirmado por
  git status (solo esos 3 archivos bajo backend/src/services/).
- Cambios en frontend (SessionToolbar.jsx, session.test.jsx), .claude/LEARNINGS.md,
  .claude/progress/current.md y artefactos F20: NO son de F21 (auto-commiteador / F20 sin
  commitear). No se cuentan en contra. Ver Observaciones.

## Resultado de verificación (Docker canónico)
Comandos exactos:
    docker compose build backend
    docker compose run --rm --no-deps backend npm run lint
    docker compose run --rm --no-deps backend npm test
- lint:  OK  (eslint src scripts -> LINT_EXIT=0)
- build: N/A (backend puro; imagen reconstruida OK). COPY src ./src salió CACHED porque el
  contenido en disco (versión F21) coincide con lo ya horneado por el implementer; verificado
  dentro del contenedor que el código F21 está presente (RULES_GROUNDING: true,
  NO_HALLUCINATION const: false).
- test:  OK  144 tests / 143 pass / 0 fail / 1 skip / TEST_EXIT=0
  - OK 91 - prompts: el system prompt de reglas es natural, cita y no inventa reglas oficiales
  - OK 92 - prompts: sin contexto, el prompt de reglas pide ayuda honesta (no rechazo robótico)
  - OK 76 - F21: el system prompt de sesión razona sobre datos de sesión y NO menciona documentos
  - Único skip (130) preexistente: hybridSearch lanza error claro cuando vec y FTS están
    deshabilitados # SKIP (F12), no introducido por F21.
- Higiene host: sin node_modules residual (backend ni frontend); contenedores run con --rm.

## Lecciones aplicadas correctamente
- "El lint/test debe correr en el entorno canónico (Docker)": aplicada y verificada.
- "El backend baked-in no toma cambios sin rebuild": reconstruyó imagen antes de testear;
  reproducido en esta revisión.
- "Sin node_modules residual en el host": verificado limpio.

## Puntos a corregir (bloqueantes)
Ninguno.

## Observaciones (no bloqueantes)
1. La frase "No encuentro esa información en los documentos cargados" sobrevive en un
   comentario histórico (ai.js:313-315) que documenta la eliminación. Cero impacto en
   runtime y permitido por CHECKPOINTS. Si se quiere que un grep literal dé cero, el líder
   puede pedir reformular ese comentario. No condiciona la aprobación.
2. F20 figura done en feature_list.json pero sus cambios (frontend + entrada de backlog)
   están SIN commitear en el árbol junto con los de F21. Ajeno a F21; señalado para que el
   líder decida el orden de commits y no arrastre F20 en el commit de F21.

## Candidatos para LEARNINGS.md (para que el líder evalúe)
- El servicio backend de compose NO monta src/ como volumen -> verificar cambios de backend
  requiere docker compose build backend ANTES de docker compose run --rm backend npm test;
  si no, se corre el código viejo horneado (síntoma engañoso). (Docker/infra.)
- Negar una frase en un system prompt puede primarla en modelos pequeños -> formular el
  alcance en positivo ("tu única fuente es el contexto de la sesión") en vez de prohibir
  literalmente la frase a evitar. (RAG/prompts o Backend.)

## VEREDICTO FINAL: APROBADO

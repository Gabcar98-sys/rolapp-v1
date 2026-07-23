# Modelo canónico: Sistema de juego → Campaña / Sesión / Personajes / Items

> Documento de referencia. Aclara el modelo mental correcto del founder (diagrama del
> 2026-07-22) y marca qué parte del código ya está alineada y qué falta (feature F22).
> Decisión de arquitectura tomada por el founder el 2026-07-22 — ver más abajo.

---

## El modelo en una frase

**El "Sistema de juego" es el padre de todo.** Define *cómo se juega*: qué atributos y
habilidades existen, qué items hay, cómo se equipan, cómo funcionan los valores de los
personajes y qué mecánicas aplican. Todo lo demás (campañas, sesiones, personajes, items,
NPCs, documentos para la IA) cuelga de un sistema de juego.

```
                         ┌─────────────────────────┐
                         │   SISTEMA DE JUEGO       │  game_system_templates
                         │  (padre de todo)         │
                         └───────────┬─────────────┘
        ┌───────────────┬────────────┼───────────────┬──────────────┐
        ▼               ▼            ▼               ▼              ▼
   Atributos +      Items         Personajes      Personajes     Documentos
   Habilidades   (item_masters)   base/pregens     (de jugador)   (para la IA)
   Mecánicas +                    base_characters  characters     game_docs
   Slots equipo

                         ┌─────────────────────────┐
                         │        CAMPAÑA           │  campaigns.game_system_id
                         │  (grupo de sesiones)     │  → ELIGE el sistema de juego
                         └───────────┬─────────────┘
                                     ▼
                         ┌─────────────────────────┐
                         │        SESIÓN            │  sessions.campaign_id
                         │  hereda el sistema de    │  → hereda el sistema de la campaña
                         │  su campaña              │
                         └───────────┬─────────────┘
                                     ▼
                         Eventos de sesión (session_events, append-only)
                         · pueden tener o no un NPC
                         · pueden tener o no participantes (jugadores/personajes)
```

---

## Decisión de arquitectura (2026-07-22)

> **¿Quién decide el sistema de juego de una sesión: la campaña o la sesión?**
> **Decisión del founder: SIEMPRE la campaña.** La sesión NO tiene sistema propio; lo
> hereda de su campaña. No se agrega `game_system_id` a la tabla `sessions`.
>
> Consecuencia: una **sesión sin campaña queda sin sistema de juego** (caso permitido por
> retrocompatibilidad, F8a). Sin sistema, la IA de reglas y la coherencia de personajes no
> tienen a qué anclarse. La UI debe dejar claro que, para tener sistema (y por tanto IA de
> reglas + validación de personajes), la sesión necesita una campaña con sistema asignado.

---

## Entidades y su vínculo al sistema (estado real del schema)

| Entidad | Tabla | Cómo se ata al sistema | Estado |
|---|---|---|---|
| Sistema de juego | `game_system_templates` | es el padre | ✅ |
| Atributos | `attribute_templates` | `game_system_id` (CASCADE) | ✅ |
| Habilidades | `skill_formats` → `skills` | `skill_formats.game_system_id` | ✅ |
| Items | `item_formats` → `item_masters` | `item_formats.game_system_id` | ✅ únicos del sistema |
| Slots de equipo | `equipment_slot_templates` | `game_system_id` (CASCADE) | ✅ |
| Mecánicas | `game_mechanics` (+ params) | `game_system_id` (CASCADE) | ✅ |
| Personajes base (pregens) | `base_characters` | `game_system_id` | ✅ creados por el DM para el sistema |
| Personajes (de jugador) | `characters` | `game_system_template_id` | ✅ (nombre de columna inconsistente) |
| Documentos IA | `game_docs` | `game_system_id` (CASCADE) | ✅ |
| Campaña | `campaigns` | `game_system_id` (FK) elige el sistema | ✅ |
| Sesión | `sessions` | `campaign_id` → hereda de la campaña | ✅ por diseño (sin FK directa) |
| Eventos | `session_events` (append-only) | vía la sesión | ✅ NPC/participantes opcionales |

- **Personajes:** los crea el usuario a partir del sistema activo; además el DM crea
  **personajes base** (`base_characters`) reutilizables para ese sistema.
- **Items:** son **únicos del sistema** (viven bajo un `item_format` que pertenece al sistema).
- **Eventos:** un evento de sesión **puede o no** tener NPC (`actor_type: 'dm' | 'npc'`) y
  **puede o no** tener participantes específicos (`participant_type: 'all' | 'specific'`).

---

## Discrepancias vs. el modelo (las corrige F22)

1. **La IA resuelve el sistema desde los PERSONAJES, no desde la campaña.**
   `AIPanel.jsx` deriva `gameSystemId` de `character.game_system_template_id` de los
   personajes en sesión (AIPanel.jsx:94). Si la sesión no tiene personajes-con-sistema,
   muestra *"No hay sistema de juego asociado a esta sesión"* aunque su campaña sí tenga
   sistema. **Objetivo:** resolver desde `campaign_game_system_id` (ya expuesto por
   `sessions.js`), con los personajes como *fallback*.

2. **Campo legacy `campaigns.game_system` (TEXT).** Existe en el schema (schema.sql:33)
   pero no se lee en ningún lado. Candidato a deprecación/eliminación (con migración).

3. **Inconsistencia de nombres.** `characters.game_system_template_id` vs. `game_system_id`
   en el resto de tablas. Cosmético; documentado aquí. Renombrar solo si es barato y seguro.

---

## Reglas de coherencia ya vigentes (F8a)

- Un personaje solo puede unirse a una sesión cuya **campaña** tenga el **mismo**
  `game_system_id` que el personaje (422 si no coincide) — `gameSystemCoherence.js`.
- Sesiones **sin campaña o sin sistema**: se permite cualquier personaje (retrocompatibilidad).

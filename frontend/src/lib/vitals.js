// Vitales de un personaje derivados del SISTEMA DE JUEGO (cero hardcode de "HP").
// Misma regla que la pestaña Estado de la ficha (`StatusTab`): son vitales los
// atributos `is_core || has_max`. Con máximo numérico se pintan como puntos si el
// máximo es pequeño (<= MAX_DOTS) y como barra si es grande.
//
// Helper PURO (sin React) para poder testearlo con el runner de vitest sin jsdom
// (lección F20). El componente de presentación es components/Session/PartyVitals.jsx.

export const MAX_DOTS = 20;

// Anchos de barra en pasos de 10% con clases Tailwind LITERALES: el JIT solo genera
// lo que ve escrito (lección F14), así que nada de `w-[${pct}%]`.
const BAR_WIDTHS = [
  'w-0', 'w-[10%]', 'w-1/5', 'w-[30%]', 'w-2/5', 'w-1/2',
  'w-3/5', 'w-[70%]', 'w-4/5', 'w-[90%]', 'w-full',
];

export function barWidthClass(pct) {
  const step = Math.max(0, Math.min(10, Math.round(Number(pct) / 10)));
  return BAR_WIDTHS[step];
}

// Definiciones de atributo a partir de la ficha del personaje, para cuando el
// consumidor no tiene (ni necesita) las attrDefs del sistema: `templateAttrs` ya trae
// attr_name / is_core / has_max desde el join del backend.
function defsFromCharacter(character) {
  return (character?.templateAttrs ?? []).map((a) => ({
    id: a.attribute_template_id,
    name: a.attr_name,
    is_core: a.is_core,
    has_max: a.has_max,
  }));
}

// pickVitals(character, attrDefs) → [{ id, name, current, max, mode, pct }]
//   mode: 'dots' (máx <= 20) | 'bar' (máx > 20) | 'plain' (core sin máximo numérico).
//
// OJO (regresión F30): `is_core`/`has_max` llegan como ENTEROS 0/1 de SQLite. Aquí se
// coercionan con Boolean() para que nunca se filtren a un guard `{flag && …}` de JSX,
// que renderizaría el 0 literal. `max` es null (no 0) cuando no hay máximo.
export function pickVitals(character, attrDefs = null) {
  const attrs = character?.templateAttrs ?? [];
  const defs =
    Array.isArray(attrDefs) && attrDefs.length > 0 ? attrDefs : defsFromCharacter(character);

  return defs
    .filter((d) => Boolean(d.is_core) || Boolean(d.has_max))
    // Solo se muestran los vitales que el personaje TIENE en su ficha: si no ha
    // rellenado el atributo (o no tiene ninguno), no se inventa un 0 en la pantalla.
    .filter((d) => attrs.some((a) => a.attribute_template_id === d.id))
    .map((def) => {
      const val = attrs.find((a) => a.attribute_template_id === def.id);
      const currentNum = Number(val?.value);
      const current = Number.isFinite(currentNum) ? currentNum : 0;
      const maxNum = Number(val?.max_value);
      const hasMax = Boolean(def.has_max) && Number.isFinite(maxNum) && maxNum > 0;
      return {
        id: def.id,
        name: def.name,
        current,
        max: hasMax ? maxNum : null,
        mode: hasMax ? (maxNum <= MAX_DOTS ? 'dots' : 'bar') : 'plain',
        pct: hasMax ? Math.min(100, Math.round((current / maxNum) * 100)) : null,
      };
    });
}

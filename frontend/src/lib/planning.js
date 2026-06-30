// Constantes compartidas del motor de planificación (categorías de evento).

export const EVENT_CATEGORIES = [
  'general',
  'combate',
  'exploración',
  'interacción',
  'trampa',
  'recompensa',
  'historia',
  'NPC',
];

// Clases Tailwind por categoría (sin estilos inline). Cada entrada da el color de
// texto y de borde del badge/franja de la tarjeta del evento.
const CATEGORY_CLASSES = {
  combate: 'text-red-400 border-red-400',
  exploración: 'text-blue-400 border-blue-400',
  interacción: 'text-emerald-400 border-emerald-400',
  trampa: 'text-amber-400 border-amber-400',
  recompensa: 'text-purple-400 border-purple-400',
  historia: 'text-teal-400 border-teal-400',
  NPC: 'text-orange-400 border-orange-400',
  general: 'text-gray-400 border-gray-500',
};

export function categoryClasses(category) {
  return CATEGORY_CLASSES[category] ?? CATEGORY_CLASSES.general;
}

// Eventos del log que NO son de planificación (presencia / sistema / chat).
const NON_PLANNING_TYPES = new Set([
  'session_join',
  'session_leave',
  'session_start',
  'session_end',
  'session_reset',
  'message',
]);

export function isPlanningEvent(event) {
  return !NON_PLANNING_TYPES.has(event.type);
}

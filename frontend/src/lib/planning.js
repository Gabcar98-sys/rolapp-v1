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

// ── Mapeo de categorías v1 → 4 colores del handoff (tokens cat-*) ─────────────────
// El handoff sólo define 4 colores de categoría (combat/social/explore/discovery).
// Las 8 categorías v1 se agrupan en esos 4 cubos. El color se elige por ÍNDICE
// estable sobre listas de clases LITERALES (lección F14: el JIT sólo genera lo que
// ve literal — nunca `bg-${x}` ni estilos inline).
//
// Índices: 0=combat · 1=social · 2=explore · 3=discovery.
const CATEGORY_BUCKET = {
  combate: 0,
  NPC: 1,
  interacción: 1,
  exploración: 2,
  trampa: 2,
  historia: 3,
  recompensa: 3,
  general: 3,
};

// Etiqueta en español para mostrar en badges (capitaliza el valor v1 tal cual).
const CATEGORY_LABELS = {
  general: 'General',
  combate: 'Combate',
  exploración: 'Exploración',
  interacción: 'Interacción',
  trampa: 'Trampa',
  recompensa: 'Recompensa',
  historia: 'Historia',
  NPC: 'NPC',
};

// Barra superior 4px del nodo/tarjeta (color de fondo, no borde).
const CAT_BAR_CLASSES = [
  'bg-cat-combat-bar',
  'bg-cat-social-bar',
  'bg-cat-explore-bar',
  'bg-cat-discovery-bar',
];

// Badge píldora (tinte de fondo + texto de la categoría).
const CAT_BADGE_CLASSES = [
  'bg-cat-combat-bg text-cat-combat-text',
  'bg-cat-social-bg text-cat-social-text',
  'bg-cat-explore-bg text-cat-explore-text',
  'bg-cat-discovery-bg text-cat-discovery-text',
];

// Borde de color de categoría (nodo seleccionado en el grafo).
const CAT_BORDER_CLASSES = [
  'border-cat-combat-bar',
  'border-cat-social-bar',
  'border-cat-explore-bar',
  'border-cat-discovery-bar',
];

export function categoryBucket(category) {
  return CATEGORY_BUCKET[category] ?? CATEGORY_BUCKET.general;
}

export function categoryLabel(category) {
  return CATEGORY_LABELS[category] ?? category ?? 'General';
}

// Devuelve las clases del handoff para una categoría v1: barra, badge y borde.
export function eventCategoryClasses(category) {
  const i = categoryBucket(category);
  return {
    label: categoryLabel(category),
    barClass: CAT_BAR_CLASSES[i],
    badgeClass: CAT_BADGE_CLASSES[i],
    borderClass: CAT_BORDER_CLASSES[i],
  };
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

// ── Layout automático del grafo de eventos ──────────────────────────────────────
// Aplana la jerarquía (locations → sub_locations → events + ramas) y los eventos
// sueltos en una lista única, anotando la etiqueta de ubicación de cada evento.
export function flattenPrepEvents(locations = [], freeEvents = []) {
  const all = [];
  const recurse = (events, locationLabel) => {
    for (const e of events) {
      all.push({ ...e, locationLabel });
      if (e.branches?.length) recurse(e.branches, locationLabel);
    }
  };
  for (const loc of locations) {
    for (const sub of loc.sub_locations ?? []) recurse(sub.events ?? [], `${loc.name} › ${sub.name}`);
  }
  recurse(freeEvents, '');
  return all;
}

// Calcula posiciones (x, y) por capas con un layout topológico simple, sin
// dependencias externas. Las aristas (ramas + enlaces) definen el orden vertical:
// la capa de un nodo = 1 + máxima capa de sus predecesores (con tope para ciclos).
// Devuelve { positions: Map<id,{x,y}>, width, height }.
export function computeGraphLayout(events, edges, opts = {}) {
  const nodeW = opts.nodeW ?? 190;
  const nodeH = opts.nodeH ?? 96;
  const gapX = opts.gapX ?? 48;
  const gapY = opts.gapY ?? 70;

  const ids = events.map((e) => e.id);
  const idSet = new Set(ids);
  // Adyacencia y grado de entrada solo entre nodos presentes.
  const successors = new Map(ids.map((id) => [id, []]));
  const indegree = new Map(ids.map((id) => [id, 0]));
  for (const edge of edges) {
    if (!idSet.has(edge.from) || !idSet.has(edge.to)) continue;
    successors.get(edge.from).push(edge.to);
    indegree.set(edge.to, indegree.get(edge.to) + 1);
  }

  // Asignación de capa por BFS desde las raíces (indegree 0); si todo está en
  // ciclo, arrancamos con el primer nodo para no quedar sin raíces.
  const layer = new Map(ids.map((id) => [id, 0]));
  const visited = new Set();
  let queue = ids.filter((id) => indegree.get(id) === 0);
  if (queue.length === 0 && ids.length > 0) queue = [ids[0]];
  while (queue.length > 0) {
    const next = [];
    for (const id of queue) {
      if (visited.has(id)) continue;
      visited.add(id);
      for (const succ of successors.get(id)) {
        // El sucesor cae al menos una capa por debajo del nodo actual.
        if (layer.get(succ) < layer.get(id) + 1) layer.set(succ, layer.get(id) + 1);
        next.push(succ);
      }
    }
    queue = next;
  }

  // Agrupa por capa preservando el orden original de eventos.
  const byLayer = new Map();
  for (const e of events) {
    const l = layer.get(e.id);
    if (!byLayer.has(l)) byLayer.set(l, []);
    byLayer.get(l).push(e.id);
  }

  const positions = new Map();
  let maxRow = 0;
  for (const [l, rowIds] of byLayer) {
    rowIds.forEach((id, col) => {
      positions.set(id, { x: col * (nodeW + gapX), y: l * (nodeH + gapY) });
    });
    if (rowIds.length > maxRow) maxRow = rowIds.length;
  }

  const layers = byLayer.size;
  return {
    positions,
    width: Math.max(maxRow, 1) * (nodeW + gapX),
    height: Math.max(layers, 1) * (nodeH + gapY),
    nodeW,
    nodeH,
  };
}

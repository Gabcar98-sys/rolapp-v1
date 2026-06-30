import db from '../db/index.js';

// Servicio del motor de planificación: arma la jerarquía completa de un prep.
// Toda la lectura es síncrona (better-sqlite3) y vía prepared statements.

const selectPrep = db.prepare(`
  SELECT sp.*, c.name AS campaign_name
  FROM session_preps sp
  LEFT JOIN campaigns c ON sp.campaign_id = c.id
  WHERE sp.id = ?
`);

const selectLocations = db.prepare(
  'SELECT * FROM locations WHERE prep_id = ? ORDER BY order_index ASC, created_at ASC'
);

const selectSubLocations = db.prepare(
  'SELECT * FROM sub_locations WHERE location_id = ? ORDER BY order_index ASC, created_at ASC'
);

const selectRootEvents = db.prepare(`
  SELECT * FROM event_templates
  WHERE sub_location_id = ? AND parent_event_id IS NULL
  ORDER BY order_index ASC, created_at ASC
`);

const selectBranches = db.prepare(
  'SELECT * FROM event_templates WHERE parent_event_id = ? ORDER BY order_index ASC, created_at ASC'
);

const selectFreeEvents = db.prepare(`
  SELECT * FROM event_templates
  WHERE prep_id = ? AND sub_location_id IS NULL AND parent_event_id IS NULL
  ORDER BY order_index ASC, created_at ASC
`);

const selectParticipants = db.prepare(
  'SELECT * FROM event_participants WHERE event_template_id = ?'
);

const selectEventLinks = db.prepare(`
  SELECT el.* FROM event_links el
  JOIN event_templates et ON el.from_event_id = et.id
  WHERE et.prep_id = ?
`);

// Anexa participantes y ramas (recursivo) a cada evento de la lista.
function attachExtras(events) {
  for (const evt of events) {
    evt.participants = selectParticipants.all(evt.id);
    evt.branches = attachExtras(selectBranches.all(evt.id));
  }
  return events;
}

// Devuelve { prep, locations, freeEvents, eventLinks } o null si el prep no existe.
export function getPrepHierarchy(prepId) {
  const prep = selectPrep.get(prepId);
  if (!prep) return null;

  const locations = selectLocations.all(prep.id);
  for (const loc of locations) {
    loc.sub_locations = selectSubLocations.all(loc.id);
    for (const sub of loc.sub_locations) {
      sub.events = attachExtras(selectRootEvents.all(sub.id));
    }
  }

  const freeEvents = attachExtras(selectFreeEvents.all(prep.id));
  const eventLinks = selectEventLinks.all(prep.id);

  return { prep, locations, freeEvents, eventLinks };
}

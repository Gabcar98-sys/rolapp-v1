import db from '../db/index.js';

// El log session_events es APPEND-ONLY: aquí solo hay INSERT, nunca UPDATE/DELETE.
// El estado de la sesión se deriva reproduciendo este log.
const insertEvent = db.prepare(`
  INSERT INTO session_events (session_id, type, actor_id, target_id, payload)
  VALUES (?, ?, ?, ?, ?)
`);

// Inserta un evento y devuelve la fila recién creada (con username del actor).
// payload se serializa a JSON; si falla, se degrada sin romper el flujo principal.
export function logEvent(sessionId, type, actorId = null, payload = {}, targetId = null) {
  const info = insertEvent.run(sessionId, type, actorId, targetId, JSON.stringify(payload ?? {}));
  return getEvent(info.lastInsertRowid);
}

const selectEvent = db.prepare(`
  SELECT se.*, u.username AS actor_username
  FROM session_events se
  LEFT JOIN users u ON se.actor_id = u.id
  WHERE se.id = ?
`);

export function getEvent(id) {
  return selectEvent.get(id);
}

const selectEvents = db.prepare(`
  SELECT se.*, u.username AS actor_username
  FROM session_events se
  LEFT JOIN users u ON se.actor_id = u.id
  WHERE se.session_id = ?
  ORDER BY se.created_at ASC, se.id ASC
`);

export function listEvents(sessionId) {
  return selectEvents.all(sessionId);
}

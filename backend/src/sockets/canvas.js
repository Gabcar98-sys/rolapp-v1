import db from '../db/index.js';

// Comprueba si un socket puede dibujar en la sesión. En la mesa (LAN local-first)
// cualquier miembro conectado puede colaborar; el DM siempre puede.
function canDraw(sessionId) {
  return !!db.prepare("SELECT id FROM sessions WHERE id = ? AND status = 'active'").get(sessionId);
}

// Lee el snapshot de tldraw persistido (columna canvas_state.tldraw_snapshot).
function readSnapshot(sessionId) {
  const row = db
    .prepare('SELECT tldraw_snapshot FROM canvas_state WHERE session_id = ?')
    .get(sessionId);
  return row?.tldraw_snapshot ?? null;
}

// Persiste el snapshot con upsert síncrono (better-sqlite3). Mantiene image_url intacta.
function saveSnapshot(sessionId, snapshot) {
  db.prepare(`
    INSERT INTO canvas_state (session_id, tldraw_snapshot, updated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(session_id) DO UPDATE SET tldraw_snapshot = excluded.tldraw_snapshot, updated_at = unixepoch()
  `).run(sessionId, snapshot);
}

export function registerCanvasHandlers(io, socket) {
  // canvas:set_image { sessionId, imageUrl } (solo DM) → persiste y emite el cambio.
  socket.on('canvas:set_image', ({ sessionId, imageUrl = null }) => {
    sessionId = Number(sessionId);
    if (!sessionId) return;

    const session = db.prepare('SELECT dm_id FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return;
    // Solo el DM dueño puede fijar la imagen; el userId se fijó en session:join.
    if (Number(session.dm_id) !== Number(socket.data.userId)) return;

    db.prepare(`
      INSERT INTO canvas_state (session_id, image_url, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(session_id) DO UPDATE SET image_url = excluded.image_url, updated_at = unixepoch()
    `).run(sessionId, imageUrl);

    io.to(`session:${sessionId}`).emit('canvas:image_changed', { imageUrl });
  });

  // canvas:update { sessionId, document, version } → persiste el snapshot de tldraw
  // y lo retransmite al resto de la room. La versión (timestamp) resuelve carreras
  // en el cliente. El debounce vive en el cliente para no saturar el socket.
  socket.on('canvas:update', ({ sessionId, document, version }) => {
    sessionId = Number(sessionId);
    if (!sessionId || !document) return;
    if (!canDraw(sessionId)) return;

    const payload = JSON.stringify({ document, version: version ?? Date.now() });
    saveSnapshot(sessionId, payload);

    // socket.to(...) excluye al emisor: no reaplica su propio cambio.
    socket.to(`session:${sessionId}`).emit('canvas:updated', { document, version });
  });

  // canvas:request_snapshot { sessionId } → devuelve el snapshot persistido al que
  // acaba de entrar, para que arranque con el dibujo actual.
  socket.on('canvas:request_snapshot', ({ sessionId }) => {
    sessionId = Number(sessionId);
    if (!sessionId) return;

    const snapshot = readSnapshot(sessionId);
    if (!snapshot) return;

    const parsed = JSON.parse(snapshot);
    socket.emit('canvas:updated', { document: parsed.document, version: parsed.version });
  });
}

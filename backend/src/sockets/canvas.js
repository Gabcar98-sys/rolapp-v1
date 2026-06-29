import db from '../db/index.js';

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
}

import db from '../db/index.js';

const insertMessage = db.prepare(
  'INSERT INTO messages (session_id, from_user_id, to_user_id, body) VALUES (?, ?, ?, ?)'
);

const getHistory = db.prepare(`
  SELECT m.id, m.session_id, m.from_user_id, m.to_user_id, m.body, m.created_at,
         u.username AS from_username
  FROM messages m
  JOIN users u ON m.from_user_id = u.id
  WHERE m.session_id = ?
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 200
`);

export function registerChatHandlers(io, socket) {
  // chat:history { sessionId } → devuelve el historial solo al solicitante.
  socket.on('chat:history', ({ sessionId }) => {
    socket.emit('chat:history', { messages: getHistory.all(Number(sessionId)) });
  });

  // chat:message { sessionId, from, body, to? } → persiste y emite.
  // Si hay destinatario (to), es privado: llega solo al emisor y al destinatario.
  socket.on('chat:message', ({ sessionId, from, body, to = null }) => {
    sessionId = Number(sessionId);
    const fromId = Number(from);
    const toId = to ? Number(to) : null;
    const text = String(body ?? '').trim();
    if (!sessionId || !fromId || !text) return;

    const info = insertMessage.run(sessionId, fromId, toId, text);
    const sender = db.prepare('SELECT username FROM users WHERE id = ?').get(fromId);

    const message = {
      id: info.lastInsertRowid,
      session_id: sessionId,
      from_user_id: fromId,
      from_username: sender?.username ?? 'Desconocido',
      to_user_id: toId,
      body: text,
      created_at: Math.floor(Date.now() / 1000),
    };

    if (toId) {
      const room = io.sockets.adapter.rooms.get(`session:${sessionId}`);
      if (room) {
        for (const sid of room) {
          const s = io.sockets.sockets.get(sid);
          if (s && (s.data.userId === fromId || s.data.userId === toId)) {
            s.emit('chat:message', { message });
          }
        }
      }
    } else {
      io.to(`session:${sessionId}`).emit('chat:message', { message });
    }
  });
}

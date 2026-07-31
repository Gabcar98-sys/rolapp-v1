import db from '../db/index.js';

const insertMessage = db.prepare(
  'INSERT INTO messages (session_id, from_user_id, to_user_id, body) VALUES (?, ?, ?, ?)'
);

// Tronco común del historial (mismas columnas, mismo orden y mismo LIMIT para los dos
// casos). Los fragmentos son literales del propio módulo: los datos del cliente SIEMPRE
// entran por parámetros del prepared statement, nunca por concatenación.
const HISTORY_SELECT = `
  SELECT m.id, m.session_id, m.from_user_id, m.to_user_id, m.body, m.created_at,
         u.username AS from_username
  FROM messages m
  JOIN users u ON m.from_user_id = u.id
  WHERE m.session_id = ?
`;
const HISTORY_TAIL = `
  ORDER BY m.created_at ASC, m.id ASC
  LIMIT 200
`;

// Solicitante identificado: mensajes públicos + los privados en los que participa
// (como destinatario o como emisor). Los susurros ajenos nunca salen de la query.
const getHistoryForUser = db.prepare(
  `${HISTORY_SELECT} AND (m.to_user_id IS NULL OR m.to_user_id = ? OR m.from_user_id = ?) ${HISTORY_TAIL}`
);

// Solicitante sin identidad (socket que no hizo session:join; p. ej. un ESPECTADOR de la
// vista TV de F31, que entra por session:spectate y a propósito no tiene userId): SOLO
// mensajes públicos.
const getPublicHistory = db.prepare(`${HISTORY_SELECT} AND m.to_user_id IS NULL ${HISTORY_TAIL}`);

// Identidad del solicitante tomada del socket (la fija session:join en sockets/session.js).
// NUNCA del payload del cliente: sería suplantable y bastaría pedir el historial "de otro"
// para leer sus susurros.
function viewerId(socket) {
  const id = Number(socket.data?.userId);
  return Number.isInteger(id) && id > 0 ? id : null;
}

export function registerChatHandlers(io, socket) {
  // chat:history { sessionId } → devuelve el historial solo al solicitante, filtrado por
  // destinatario para no filtrar los privados de la mesa.
  socket.on('chat:history', ({ sessionId }) => {
    const id = Number(sessionId);
    const userId = viewerId(socket);
    const messages = userId
      ? getHistoryForUser.all(id, userId, userId)
      : getPublicHistory.all(id);
    socket.emit('chat:history', { messages });
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

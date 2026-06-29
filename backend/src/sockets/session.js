import db from '../db/index.js';
import { logEvent } from '../services/events.js';

// Presencia en memoria por room: sessionId → Map<userId, { socketId, userId, username, role }>.
// No se persiste: refleja quién está conectado ahora mismo.
const connectedUsers = new Map();

function presenceList(sessionId) {
  return connectedUsers.has(sessionId)
    ? Array.from(connectedUsers.get(sessionId).values())
    : [];
}

function leave(io, socket, sessionId, userId) {
  if (!sessionId || !userId) return;
  socket.leave(`session:${sessionId}`);

  const room = connectedUsers.get(sessionId);
  if (room) {
    room.delete(userId);
    if (room.size === 0) connectedUsers.delete(sessionId);
  }

  logEvent(sessionId, 'session_leave', userId, {});
  io.to(`session:${sessionId}`).emit('session:users', { users: presenceList(sessionId) });
}

export function registerSessionHandlers(io, socket) {
  // session:join { sessionId, user } → une el socket al room y publica presencia.
  socket.on('session:join', ({ sessionId, user }) => {
    sessionId = Number(sessionId);
    const userId = Number(user?.id);
    if (!sessionId || !userId) {
      socket.emit('session:error', { message: 'sessionId y user son requeridos' });
      return;
    }

    const session = db
      .prepare("SELECT id FROM sessions WHERE id = ? AND status = 'active'")
      .get(sessionId);
    const dbUser = db.prepare('SELECT id, username, role FROM users WHERE id = ?').get(userId);
    if (!session || !dbUser) {
      socket.emit('session:error', { message: 'Sesión o usuario no válido' });
      return;
    }

    // Registro opcional del miembro (idempotente).
    db.prepare('INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)')
      .run(sessionId, userId);

    socket.join(`session:${sessionId}`);
    socket.data.sessionId = sessionId;
    socket.data.userId = userId;

    if (!connectedUsers.has(sessionId)) connectedUsers.set(sessionId, new Map());
    connectedUsers.get(sessionId).set(userId, {
      socketId: socket.id,
      userId,
      username: dbUser.username,
      role: dbUser.role,
    });

    logEvent(sessionId, 'session_join', userId, { username: dbUser.username });
    io.to(`session:${sessionId}`).emit('session:users', { users: presenceList(sessionId) });
  });

  // session:leave { sessionId, user } → salida explícita.
  socket.on('session:leave', ({ sessionId, user }) => {
    leave(io, socket, Number(sessionId), Number(user?.id ?? socket.data.userId));
  });

  // session:fire_event { sessionId, actor_id, type, payload } → append-only + emite.
  socket.on('session:fire_event', ({ sessionId, actor_id = null, type, payload = {} }) => {
    sessionId = Number(sessionId);
    if (!sessionId || !type) return;
    const event = logEvent(sessionId, type, actor_id, payload);
    io.to(`session:${sessionId}`).emit('session:event_fired', { event });
  });

  // disconnect → limpia presencia con los datos guardados en socket.data.
  socket.on('disconnect', () => {
    leave(io, socket, socket.data.sessionId, socket.data.userId);
  });
}

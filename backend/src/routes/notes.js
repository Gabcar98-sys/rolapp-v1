import { Router } from 'express';
import db from '../db/index.js';

// ════════════════════════════════════════════════════════════════════════════════
// Notas de sesión (F18). CRUD sobre session_notes. A diferencia de session_events,
// esta tabla NO es append-only: admite UPDATE y DELETE.
//
// SEGURIDAD DE NOTAS PRIVADAS (crítico): las notas con is_public = 0 solo las ve y
// gestiona el DM dueño de la sesión. Para NO filtrar el cuerpo de notas privadas a los
// jugadores por socket, el evento `notes:updated` es una SEÑAL sin contenido
// ({ sessionId }); cada cliente re-consulta GET /api/notes?session_id=&user_id=, que
// filtra por rol en el backend. Así el payload del socket nunca lleva bodies privados.
//
// Factory createNotesRouter(io) porque emite por socket al room de la sesión (lección
// "routers que emiten por socket → factory", creada en index.js tras instanciar io).
// ════════════════════════════════════════════════════════════════════════════════
export default function createNotesRouter(io) {
  const router = Router();

  // Emite una señal de cambio (sin bodies) al room de la sesión. Los clientes refetch
  // por REST, que aplica el filtro de visibilidad por rol.
  function emitNotesChanged(sessionId) {
    io.to(`session:${sessionId}`).emit('notes:updated', { sessionId: Number(sessionId) });
  }

  // Determina si el usuario es el DM dueño de la sesión (puede ver/gestionar privadas).
  function isSessionDM(sessionId, userId) {
    if (!userId) return false;
    const session = db.prepare('SELECT dm_id FROM sessions WHERE id = ?').get(sessionId);
    return session ? String(session.dm_id) === String(userId) : false;
  }

  // GET /api/notes?session_id=&user_id=  — notas de una sesión filtradas por rol.
  // El DM dueño ve todas; cualquier otro usuario ve SOLO las públicas (is_public = 1).
  router.get('/', (req, res) => {
    const { session_id, user_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'session_id es requerido' });
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(session_id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const dm = isSessionDM(session_id, user_id);
    const notes = dm
      ? db
          .prepare('SELECT * FROM session_notes WHERE session_id = ? ORDER BY created_at DESC, id DESC')
          .all(session_id)
      : db
          .prepare(
            'SELECT * FROM session_notes WHERE session_id = ? AND is_public = 1 ORDER BY created_at DESC, id DESC'
          )
          .all(session_id);

    res.json({ notes, isDM: dm });
  });

  // POST /api/notes  { session_id, dm_id, title, body?, event_type?, is_public? }
  // Solo el DM dueño de la sesión crea notas.
  router.post('/', (req, res) => {
    const { session_id, dm_id, title, body = '', event_type = 'general', is_public = false } = req.body ?? {};
    if (!session_id || !dm_id || !title?.trim()) {
      return res.status(400).json({ error: 'session_id, dm_id y title son requeridos' });
    }
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(session_id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (String(session.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño gestiona las notas de la sesión' });
    }

    // updated_at explícito: en instalaciones migradas la columna se añadió sin DEFAULT
    // (SQLite no admite DEFAULT no-constante en ALTER), así que lo fijamos al crear.
    const r = db
      .prepare(
        `INSERT INTO session_notes (session_id, dm_id, title, body, event_type, is_public, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, unixepoch())`
      )
      .run(session_id, dm_id, title.trim(), body, String(event_type || 'general'), is_public ? 1 : 0);

    const note = db.prepare('SELECT * FROM session_notes WHERE id = ?').get(r.lastInsertRowid);
    emitNotesChanged(session_id);
    res.status(201).json({ note });
  });

  // PUT /api/notes/:id  { dm_id, title?, body?, event_type?, is_public? }
  router.put('/:id', (req, res) => {
    const { dm_id, title, body, event_type, is_public } = req.body ?? {};
    const note = db.prepare('SELECT * FROM session_notes WHERE id = ?').get(req.params.id);
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    if (String(note.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede editar esta nota' });
    }

    const parts = [];
    const vals = [];
    if (title !== undefined) {
      if (!title.trim()) return res.status(400).json({ error: 'El título no puede estar vacío' });
      parts.push('title = ?'); vals.push(title.trim());
    }
    if (body !== undefined) { parts.push('body = ?'); vals.push(body); }
    if (event_type !== undefined) { parts.push('event_type = ?'); vals.push(String(event_type || 'general')); }
    if (is_public !== undefined) { parts.push('is_public = ?'); vals.push(is_public ? 1 : 0); }
    if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });
    parts.push('updated_at = unixepoch()');

    db.prepare(`UPDATE session_notes SET ${parts.join(', ')} WHERE id = ?`).run(...vals, note.id);
    const updated = db.prepare('SELECT * FROM session_notes WHERE id = ?').get(note.id);
    emitNotesChanged(note.session_id);
    res.json({ note: updated });
  });

  // DELETE /api/notes/:id  { dm_id }
  router.delete('/:id', (req, res) => {
    const { dm_id } = req.body ?? {};
    const note = db.prepare('SELECT * FROM session_notes WHERE id = ?').get(req.params.id);
    if (!note) return res.status(404).json({ error: 'Nota no encontrada' });
    if (String(note.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede eliminar esta nota' });
    }
    db.prepare('DELETE FROM session_notes WHERE id = ?').run(note.id);
    emitNotesChanged(note.session_id);
    res.json({ ok: true });
  });

  return router;
}

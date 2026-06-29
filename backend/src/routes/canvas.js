import { Router } from 'express';
import db from '../db/index.js';

// Estado del canvas compartido. En F4 solo se maneja image_url; el snapshot de
// tldraw llega en F8. El router necesita io para sincronizar el cambio por socket.
export default function createCanvasRouter(io) {
  const router = Router();

  // GET /api/canvas/:sessionId  → estado actual del canvas (image_url).
  router.get('/:sessionId', (req, res) => {
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const state = db
      .prepare('SELECT * FROM canvas_state WHERE session_id = ?')
      .get(req.params.sessionId);
    res.json({ canvas: state ?? { session_id: Number(req.params.sessionId), image_url: null } });
  });

  // PATCH /api/canvas/:sessionId  { dm_id, image_url }  → upsert (solo el DM dueño).
  router.patch('/:sessionId', (req, res) => {
    const { dm_id, image_url = null } = req.body ?? {};
    if (!dm_id) return res.status(400).json({ error: 'dm_id es requerido' });

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (String(session.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede cambiar el canvas' });
    }

    db.prepare(`
      INSERT INTO canvas_state (session_id, image_url, updated_at)
      VALUES (?, ?, unixepoch())
      ON CONFLICT(session_id) DO UPDATE SET image_url = excluded.image_url, updated_at = unixepoch()
    `).run(session.id, image_url);

    io.to(`session:${session.id}`).emit('canvas:image_changed', { imageUrl: image_url });

    const state = db.prepare('SELECT * FROM canvas_state WHERE session_id = ?').get(session.id);
    res.json({ canvas: state });
  });

  return router;
}

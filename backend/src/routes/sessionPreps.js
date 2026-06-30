import { Router } from 'express';
import db from '../db/index.js';
import { getPrepHierarchy } from '../services/planning.js';

const router = Router();

// GET /api/session-preps?dm_id=&campaign_id=  — lista preps con conteo de eventos.
router.get('/', (req, res) => {
  const { dm_id, campaign_id } = req.query;
  let query = `
    SELECT sp.*, u.username AS dm_username,
           c.name AS campaign_name,
           COUNT(et.id) AS event_count
    FROM session_preps sp
    JOIN users u ON sp.dm_id = u.id
    LEFT JOIN campaigns c ON sp.campaign_id = c.id
    LEFT JOIN event_templates et ON et.prep_id = sp.id
    WHERE 1 = 1
  `;
  const params = [];
  if (dm_id) {
    query += ' AND sp.dm_id = ?';
    params.push(dm_id);
  }
  if (campaign_id) {
    query += ' AND sp.campaign_id = ?';
    params.push(campaign_id);
  }
  query += ' GROUP BY sp.id ORDER BY sp.created_at DESC';
  res.json({ preps: db.prepare(query).all(...params) });
});

// GET /api/session-preps/:id  — prep con su jerarquía completa
// (locations → sub_locations → events [con branches] + eventLinks + freeEvents).
router.get('/:id', (req, res) => {
  const hierarchy = getPrepHierarchy(req.params.id);
  if (!hierarchy) return res.status(404).json({ error: 'Prep no encontrada' });
  res.json(hierarchy);
});

// POST /api/session-preps  { dm_id, name, campaign_id?, description? }
router.post('/', (req, res) => {
  const { dm_id, campaign_id = null, name, description = '' } = req.body ?? {};
  if (!dm_id || !name) {
    return res.status(400).json({ error: 'dm_id y name son requeridos' });
  }

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear preps' });

  const info = db
    .prepare('INSERT INTO session_preps (dm_id, campaign_id, name, description) VALUES (?, ?, ?, ?)')
    .run(dm_id, campaign_id, name, description);

  const prep = db.prepare('SELECT * FROM session_preps WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ prep });
});

// PUT /api/session-preps/:id  — actualiza campos del prep (solo el DM dueño).
router.put('/:id', (req, res) => {
  const { dm_id, name, description, campaign_id } = req.body ?? {};
  const prep = db.prepare('SELECT * FROM session_preps WHERE id = ?').get(req.params.id);
  if (!prep) return res.status(404).json({ error: 'Prep no encontrada' });
  if (String(prep.dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const parts = [];
  const vals = [];
  if (name !== undefined) {
    parts.push('name = ?');
    vals.push(name);
  }
  if (description !== undefined) {
    parts.push('description = ?');
    vals.push(description);
  }
  if (campaign_id !== undefined) {
    parts.push('campaign_id = ?');
    vals.push(campaign_id || null);
  }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE session_preps SET ${parts.join(', ')} WHERE id = ?`).run(...vals, prep.id);
  res.json({ prep: db.prepare('SELECT * FROM session_preps WHERE id = ?').get(prep.id) });
});

// DELETE /api/session-preps/:id  — elimina el prep (ON DELETE CASCADE limpia hijos).
router.delete('/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const prep = db.prepare('SELECT * FROM session_preps WHERE id = ?').get(req.params.id);
  if (!prep) return res.status(404).json({ error: 'Prep no encontrada' });
  if (String(prep.dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  // Las locations cascadean a sub_locations/events; los event_templates sueltos del
  // prep (sin sub-ubicación) se borran aparte porque su FK a prep no es cascade.
  db.transaction(() => {
    db.prepare('DELETE FROM event_templates WHERE prep_id = ?').run(prep.id);
    db.prepare('DELETE FROM session_preps WHERE id = ?').run(prep.id);
  })();

  res.json({ ok: true });
});

export default router;

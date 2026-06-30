import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Carga la ubicación junto al dueño del prep, para verificar permisos en una query.
function getLocationWithOwner(id) {
  return db
    .prepare(`
      SELECT l.*, sp.dm_id AS prep_dm_id
      FROM locations l
      JOIN session_preps sp ON l.prep_id = sp.id
      WHERE l.id = ?
    `)
    .get(id);
}

// GET /api/locations?prep_id=
router.get('/', (req, res) => {
  const { prep_id } = req.query;
  if (!prep_id) return res.status(400).json({ error: 'prep_id es requerido' });
  const locations = db
    .prepare('SELECT * FROM locations WHERE prep_id = ? ORDER BY order_index ASC, created_at ASC')
    .all(prep_id);
  res.json({ locations });
});

// POST /api/locations  { prep_id, name, dm_id, description? }
router.post('/', (req, res) => {
  const { prep_id, name, description = '', dm_id } = req.body ?? {};
  if (!prep_id || !name || !dm_id) {
    return res.status(400).json({ error: 'prep_id, name y dm_id son requeridos' });
  }

  const prep = db.prepare('SELECT * FROM session_preps WHERE id = ?').get(prep_id);
  if (!prep) return res.status(404).json({ error: 'Prep no encontrada' });
  if (String(prep.dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  // order_index secuencial al final de la lista de la prep.
  const { m } = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM locations WHERE prep_id = ?')
    .get(prep_id);
  const info = db
    .prepare('INSERT INTO locations (prep_id, name, description, order_index) VALUES (?, ?, ?, ?)')
    .run(prep_id, name, description, m + 1);

  const location = db.prepare('SELECT * FROM locations WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ location });
});

// PUT /api/locations/:id  { dm_id, name?, description? }
router.put('/:id', (req, res) => {
  const { name, description, dm_id } = req.body ?? {};
  const loc = getLocationWithOwner(req.params.id);
  if (!loc) return res.status(404).json({ error: 'Ubicación no encontrada' });
  if (String(loc.prep_dm_id) !== String(dm_id)) {
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
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE locations SET ${parts.join(', ')} WHERE id = ?`).run(...vals, loc.id);
  res.json({ location: db.prepare('SELECT * FROM locations WHERE id = ?').get(loc.id) });
});

// DELETE /api/locations/:id  { dm_id }  — cascade limpia sub_locations y events.
router.delete('/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const loc = getLocationWithOwner(req.params.id);
  if (!loc) return res.status(404).json({ error: 'Ubicación no encontrada' });
  if (String(loc.prep_dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  db.prepare('DELETE FROM locations WHERE id = ?').run(loc.id);
  res.json({ ok: true });
});

export default router;

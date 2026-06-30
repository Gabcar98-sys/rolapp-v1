import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Carga la sub-ubicación junto al dueño del prep (vía location → prep) para permisos.
function getSubLocationWithOwner(id) {
  return db
    .prepare(`
      SELECT sl.*, sp.dm_id AS prep_dm_id
      FROM sub_locations sl
      JOIN locations l ON sl.location_id = l.id
      JOIN session_preps sp ON l.prep_id = sp.id
      WHERE sl.id = ?
    `)
    .get(id);
}

// GET /api/sub-locations?location_id=
router.get('/', (req, res) => {
  const { location_id } = req.query;
  if (!location_id) return res.status(400).json({ error: 'location_id es requerido' });
  const subLocations = db
    .prepare(
      'SELECT * FROM sub_locations WHERE location_id = ? ORDER BY order_index ASC, created_at ASC'
    )
    .all(location_id);
  res.json({ sub_locations: subLocations });
});

// POST /api/sub-locations  { location_id, name, dm_id, description? }
router.post('/', (req, res) => {
  const { location_id, name, description = '', dm_id } = req.body ?? {};
  if (!location_id || !name || !dm_id) {
    return res.status(400).json({ error: 'location_id, name y dm_id son requeridos' });
  }

  const loc = db
    .prepare(`
      SELECT l.id, sp.dm_id AS prep_dm_id
      FROM locations l
      JOIN session_preps sp ON l.prep_id = sp.id
      WHERE l.id = ?
    `)
    .get(location_id);
  if (!loc) return res.status(404).json({ error: 'Ubicación no encontrada' });
  if (String(loc.prep_dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  const { m } = db
    .prepare('SELECT COALESCE(MAX(order_index), -1) AS m FROM sub_locations WHERE location_id = ?')
    .get(location_id);
  const info = db
    .prepare(
      'INSERT INTO sub_locations (location_id, name, description, order_index) VALUES (?, ?, ?, ?)'
    )
    .run(location_id, name, description, m + 1);

  const subLocation = db
    .prepare('SELECT * FROM sub_locations WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json({ sub_location: subLocation });
});

// PUT /api/sub-locations/:id  { dm_id, name?, description? }
router.put('/:id', (req, res) => {
  const { name, description, dm_id } = req.body ?? {};
  const sub = getSubLocationWithOwner(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Sub-ubicación no encontrada' });
  if (String(sub.prep_dm_id) !== String(dm_id)) {
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

  db.prepare(`UPDATE sub_locations SET ${parts.join(', ')} WHERE id = ?`).run(...vals, sub.id);
  res.json({ sub_location: db.prepare('SELECT * FROM sub_locations WHERE id = ?').get(sub.id) });
});

// DELETE /api/sub-locations/:id  { dm_id }  — cascade limpia los events de la sub.
router.delete('/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const sub = getSubLocationWithOwner(req.params.id);
  if (!sub) return res.status(404).json({ error: 'Sub-ubicación no encontrada' });
  if (String(sub.prep_dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Sin permisos' });
  }

  db.prepare('DELETE FROM sub_locations WHERE id = ?').run(sub.id);
  res.json({ ok: true });
});

export default router;

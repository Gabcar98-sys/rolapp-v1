import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// GET /api/campaigns?dm_id=  — lista las campañas de un DM (para agrupar en el lobby).
router.get('/', (req, res) => {
  const { dm_id } = req.query;
  if (!dm_id) {
    return res.status(400).json({ error: 'dm_id es requerido' });
  }
  const campaigns = db
    .prepare('SELECT * FROM campaigns WHERE dm_id = ? ORDER BY created_at DESC')
    .all(dm_id);
  res.json({ campaigns });
});

// GET /api/campaigns/:id
router.get('/:id', (req, res) => {
  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json({ campaign });
});

// POST /api/campaigns  { name, dm_id, description? }
router.post('/', (req, res) => {
  const { name, dm_id, description = '' } = req.body ?? {};
  if (!name || !dm_id) {
    return res.status(400).json({ error: 'name y dm_id son requeridos' });
  }

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(404).json({ error: 'DM no encontrado' });

  const info = db
    .prepare('INSERT INTO campaigns (name, dm_id, description) VALUES (?, ?, ?)')
    .run(name, dm_id, description);

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ campaign });
});

export default router;

import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Lectura de campaña con el nombre del sistema de juego (JOIN opcional).
const selectCampaign = db.prepare(`
  SELECT c.*, gs.name AS game_system_name
  FROM campaigns c
  LEFT JOIN game_system_templates gs ON c.game_system_id = gs.id
  WHERE c.id = ?
`);

// GET /api/campaigns?dm_id=  — lista las campañas de un DM (para agrupar en el lobby).
router.get('/', (req, res) => {
  const { dm_id } = req.query;
  if (!dm_id) {
    return res.status(400).json({ error: 'dm_id es requerido' });
  }
  const campaigns = db
    .prepare(`
      SELECT c.*, gs.name AS game_system_name
      FROM campaigns c
      LEFT JOIN game_system_templates gs ON c.game_system_id = gs.id
      WHERE c.dm_id = ?
      ORDER BY c.created_at DESC
    `)
    .all(dm_id);
  res.json({ campaigns });
});

// GET /api/campaigns/:id
router.get('/:id', (req, res) => {
  const campaign = selectCampaign.get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  res.json({ campaign });
});

// POST /api/campaigns  { name, dm_id, description?, game_system_id? }
router.post('/', (req, res) => {
  const { name, dm_id, description = '', game_system_id = null } = req.body ?? {};
  if (!name || !dm_id) {
    return res.status(400).json({ error: 'name y dm_id son requeridos' });
  }

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(404).json({ error: 'DM no encontrado' });

  const info = db
    .prepare('INSERT INTO campaigns (name, dm_id, description, game_system_id) VALUES (?, ?, ?, ?)')
    .run(name, dm_id, description, game_system_id || null);

  const campaign = selectCampaign.get(info.lastInsertRowid);
  res.status(201).json({ campaign });
});

// PUT /api/campaigns/:id  { dm_id, name?, description?, game_system_id? }  — solo el DM dueño.
router.put('/:id', (req, res) => {
  const { dm_id, name, description, game_system_id } = req.body ?? {};
  if (!dm_id) return res.status(400).json({ error: 'dm_id es requerido' });

  const campaign = db.prepare('SELECT * FROM campaigns WHERE id = ?').get(req.params.id);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });
  if (String(campaign.dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Solo el DM dueño puede editar la campaña' });
  }

  const parts = [];
  const vals = [];
  if (name !== undefined) {
    if (!String(name).trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
    parts.push('name = ?'); vals.push(String(name).trim());
  }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (game_system_id !== undefined) { parts.push('game_system_id = ?'); vals.push(game_system_id || null); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE campaigns SET ${parts.join(', ')} WHERE id = ?`).run(...vals, campaign.id);
  res.json({ campaign: selectCampaign.get(campaign.id) });
});

export default router;

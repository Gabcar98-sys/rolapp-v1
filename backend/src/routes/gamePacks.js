import { Router } from 'express';
import db from '../db/index.js';
import { importGamePack } from '../services/gamePack.js';

const router = Router();

// POST /api/game-packs/import  { dm_id, pack }
// Importa un game pack JSON completo (sistema + entidades) en una transacción.
router.post('/import', (req, res) => {
  const { dm_id, pack } = req.body ?? {};
  if (!dm_id || !pack) return res.status(400).json({ error: 'dm_id y pack son requeridos' });

  try {
    const gameSystemId = importGamePack(db, dm_id, pack);
    const system = db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(gameSystemId);
    res.status(201).json({ game_system_id: gameSystemId, system });
  } catch (err) {
    // La transacción ya revirtió; devolvemos el motivo de validación/import.
    res.status(400).json({ error: err.message });
  }
});

export default router;

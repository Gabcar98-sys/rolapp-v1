import { Router } from 'express';
import db from '../db/index.js';
import {
  computeSessionStats,
  getSessionStatsSnapshot,
  saveSessionStats,
  computeCampaignStats,
  computeCharacterStats,
} from '../services/stats.js';

// Router de estadísticas derivadas (F7). Solo lectura/derivación; sin socket.
// Montado en /api con rutas absolutas (sesiones, campañas, personajes).
const router = Router();

// GET /api/sessions/:id/stats — devuelve el snapshot si existe; si no, lo calcula
// al vuelo (sesiones que aún no se han cerrado todavía no tienen snapshot).
router.get('/sessions/:id/stats', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

  const snapshot = getSessionStatsSnapshot(db, sessionId);
  if (snapshot) return res.json({ stats: snapshot, source: 'snapshot' });

  const stats = computeSessionStats(db, sessionId);
  res.json({ stats, source: 'live' });
});

// POST /api/sessions/:id/stats — recalcula y persiste el snapshot (solo DM dueño).
// Útil para refrescar las stats de una sesión ya cerrada tras añadir notas.
router.post('/sessions/:id/stats', (req, res) => {
  const sessionId = Number(req.params.id);
  const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
  if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

  const { dm_id } = req.body ?? {};
  if (dm_id !== undefined && String(session.dm_id) !== String(dm_id)) {
    return res.status(403).json({ error: 'Solo el DM dueño puede regenerar las estadísticas' });
  }

  const stats = saveSessionStats(db, sessionId);
  res.status(201).json({ stats, source: 'snapshot' });
});

// GET /api/campaigns/:id/stats — estadísticas agregadas de la campaña.
router.get('/campaigns/:id/stats', (req, res) => {
  const campaignId = Number(req.params.id);
  const campaign = db.prepare('SELECT id FROM campaigns WHERE id = ?').get(campaignId);
  if (!campaign) return res.status(404).json({ error: 'Campaña no encontrada' });

  const stats = computeCampaignStats(db, campaignId);
  res.json({ stats });
});

// GET /api/characters/:id/stats — estadísticas de un personaje.
router.get('/characters/:id/stats', (req, res) => {
  const characterId = Number(req.params.id);
  const stats = computeCharacterStats(db, characterId);
  if (!stats) return res.status(404).json({ error: 'Personaje no encontrado' });

  res.json({ stats });
});

export default router;

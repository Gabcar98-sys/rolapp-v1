import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

const selectNpcWithSystem = db.prepare(`
  SELECT n.*, gs.name AS game_system_name
  FROM npcs n
  LEFT JOIN game_system_templates gs ON gs.id = n.game_system_id
  WHERE n.id = ?
`);

// Verifica que el NPC exista y pertenezca al DM; devuelve la fila o null.
function getOwnedNpc(id, dmId) {
  const npc = db.prepare('SELECT * FROM npcs WHERE id = ?').get(id);
  if (!npc) return { error: 404 };
  if (String(npc.dm_id) !== String(dmId)) return { error: 403 };
  return { npc };
}

// ── NPCs ────────────────────────────────────────────────────────────────────────

// GET /api/npcs?dm_id=&game_system_id=
router.get('/', (req, res) => {
  const { dm_id, game_system_id } = req.query;
  if (!dm_id) return res.status(400).json({ error: 'dm_id es requerido' });

  let query = `
    SELECT n.*,
           gs.name AS game_system_name,
           COUNT(DISTINCT nq.id) AS quest_count,
           COUNT(DISTINCT ni.id) AS inventory_count
    FROM npcs n
    LEFT JOIN game_system_templates gs ON gs.id = n.game_system_id
    LEFT JOIN npc_quests nq ON nq.npc_id = n.id
    LEFT JOIN npc_inventory ni ON ni.npc_id = n.id
    WHERE n.dm_id = ?
  `;
  const params = [dm_id];
  if (game_system_id) {
    query += ' AND n.game_system_id = ?';
    params.push(game_system_id);
  }
  query += ' GROUP BY n.id ORDER BY n.created_at DESC';

  res.json({ npcs: db.prepare(query).all(...params) });
});

// GET /api/npcs/:id  — NPC con quests, inventario y campañas vinculadas.
router.get('/:id', (req, res) => {
  const npc = selectNpcWithSystem.get(req.params.id);
  if (!npc) return res.status(404).json({ error: 'NPC no encontrado' });

  const quests = db
    .prepare('SELECT * FROM npc_quests WHERE npc_id = ? ORDER BY created_at ASC')
    .all(npc.id);
  const inventory = db
    .prepare('SELECT * FROM npc_inventory WHERE npc_id = ? ORDER BY created_at ASC')
    .all(npc.id);
  const campaigns = db
    .prepare(`
      SELECT c.id, c.name
      FROM npc_campaign_links ncl
      JOIN campaigns c ON c.id = ncl.campaign_id
      WHERE ncl.npc_id = ?
      ORDER BY c.name ASC
    `)
    .all(npc.id);

  res.json({ npc, quests, inventory, campaigns });
});

// POST /api/npcs  { dm_id, name, description?, avatar_icon?, game_system_id? }
router.post('/', (req, res) => {
  const { dm_id, name, description = '', avatar_icon = '🧑', game_system_id = null } =
    req.body ?? {};
  if (!dm_id || !name) return res.status(400).json({ error: 'dm_id y name son requeridos' });

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear NPCs' });

  const info = db
    .prepare(
      'INSERT INTO npcs (dm_id, name, description, avatar_icon, game_system_id) VALUES (?, ?, ?, ?, ?)'
    )
    .run(dm_id, name.trim(), description.trim(), avatar_icon, game_system_id || null);

  res.status(201).json({ npc: selectNpcWithSystem.get(info.lastInsertRowid) });
});

// PUT /api/npcs/:id
router.put('/:id', (req, res) => {
  const { dm_id, name, description, avatar_icon, game_system_id } = req.body ?? {};
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  const parts = [];
  const vals = [];
  if (name !== undefined) {
    parts.push('name = ?');
    vals.push(name.trim());
  }
  if (description !== undefined) {
    parts.push('description = ?');
    vals.push(description.trim());
  }
  if (avatar_icon !== undefined) {
    parts.push('avatar_icon = ?');
    vals.push(avatar_icon);
  }
  if (game_system_id !== undefined) {
    parts.push('game_system_id = ?');
    vals.push(game_system_id || null);
  }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE npcs SET ${parts.join(', ')} WHERE id = ?`).run(...vals, req.params.id);
  res.json({ npc: selectNpcWithSystem.get(req.params.id) });
});

// DELETE /api/npcs/:id  — cascade limpia quests, inventario y vínculos a campaña.
router.delete('/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM npcs WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── Quests ────────────────────────────────────────────────────────────────────

// POST /api/npcs/:id/quests  { dm_id, title, description?, reward? }
router.post('/:id/quests', (req, res) => {
  const { dm_id, title, description = '', reward = '' } = req.body ?? {};
  if (!title) return res.status(400).json({ error: 'title es requerido' });
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  const info = db
    .prepare('INSERT INTO npc_quests (npc_id, title, description, reward) VALUES (?, ?, ?, ?)')
    .run(owned.npc.id, title.trim(), description.trim(), reward.trim());

  res
    .status(201)
    .json({ quest: db.prepare('SELECT * FROM npc_quests WHERE id = ?').get(info.lastInsertRowid) });
});

// DELETE /api/npcs/:id/quests/:qid
router.delete('/:id/quests/:qid', (req, res) => {
  const { dm_id } = req.body ?? {};
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM npc_quests WHERE id = ? AND npc_id = ?').run(
    req.params.qid,
    req.params.id
  );
  res.json({ ok: true });
});

// ── Inventario ──────────────────────────────────────────────────────────────────

// POST /api/npcs/:id/inventory  { dm_id, item_name, quantity?, description?, cost? }
router.post('/:id/inventory', (req, res) => {
  const { dm_id, item_name, quantity = 1, description = '', cost = 0 } = req.body ?? {};
  if (!item_name) return res.status(400).json({ error: 'item_name es requerido' });
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  const info = db
    .prepare(
      'INSERT INTO npc_inventory (npc_id, item_name, quantity, description, cost) VALUES (?, ?, ?, ?, ?)'
    )
    .run(owned.npc.id, item_name.trim(), Number(quantity), description.trim(), Number(cost));

  res
    .status(201)
    .json({ item: db.prepare('SELECT * FROM npc_inventory WHERE id = ?').get(info.lastInsertRowid) });
});

// DELETE /api/npcs/:id/inventory/:iid
router.delete('/:id/inventory/:iid', (req, res) => {
  const { dm_id } = req.body ?? {};
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM npc_inventory WHERE id = ? AND npc_id = ?').run(
    req.params.iid,
    req.params.id
  );
  res.json({ ok: true });
});

// ── Vínculos a campaña ──────────────────────────────────────────────────────────

// POST /api/npcs/:id/campaigns  { dm_id, campaign_id }  — idempotente.
router.post('/:id/campaigns', (req, res) => {
  const { dm_id, campaign_id } = req.body ?? {};
  if (!campaign_id) return res.status(400).json({ error: 'campaign_id es requerido' });
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('INSERT OR IGNORE INTO npc_campaign_links (npc_id, campaign_id) VALUES (?, ?)').run(
    req.params.id,
    campaign_id
  );
  res.status(201).json({ ok: true });
});

// DELETE /api/npcs/:id/campaigns/:cid
router.delete('/:id/campaigns/:cid', (req, res) => {
  const { dm_id } = req.body ?? {};
  const owned = getOwnedNpc(req.params.id, dm_id);
  if (owned.error === 404) return res.status(404).json({ error: 'NPC no encontrado' });
  if (owned.error === 403) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM npc_campaign_links WHERE npc_id = ? AND campaign_id = ?').run(
    req.params.id,
    req.params.cid
  );
  res.json({ ok: true });
});

export default router;

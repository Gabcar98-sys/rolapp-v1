import { Router } from 'express';
import db from '../db/index.js';
import { exportGameSystem } from '../services/gamePack.js';

const router = Router();

// Verifica que el sistema exista y pertenezca al DM; devuelve { system } o responde error.
function requireOwnedSystem(req, res) {
  const system = db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(req.params.id);
  if (!system) {
    res.status(404).json({ error: 'Sistema no encontrado' });
    return null;
  }
  const { dm_id } = req.body ?? {};
  if (String(system.dm_id) !== String(dm_id)) {
    res.status(403).json({ error: 'Solo el DM dueño puede editar este sistema' });
    return null;
  }
  return system;
}

// ── Game System Templates ─────────────────────────────────────────────────────

// GET /api/game-systems?dm_id=  — lista sistemas (con conteo de atributos).
router.get('/', (req, res) => {
  const { dm_id } = req.query;
  let query = `
    SELECT gs.*, u.username AS dm_username,
           COUNT(at.id) AS attribute_count
    FROM game_system_templates gs
    JOIN users u ON gs.dm_id = u.id
    LEFT JOIN attribute_templates at ON at.game_system_id = gs.id
  `;
  const params = [];
  if (dm_id) {
    query += ' WHERE gs.dm_id = ?';
    params.push(dm_id);
  }
  query += ' GROUP BY gs.id ORDER BY gs.created_at DESC';
  res.json({ systems: db.prepare(query).all(...params) });
});

// GET /api/game-systems/:id  — sistema con atributos, slots y mecánicas (+ params).
router.get('/:id', (req, res) => {
  const system = db.prepare(`
    SELECT gs.*, u.username AS dm_username
    FROM game_system_templates gs JOIN users u ON gs.dm_id = u.id
    WHERE gs.id = ?
  `).get(req.params.id);
  if (!system) return res.status(404).json({ error: 'Sistema no encontrado' });

  const attributes = db.prepare(
    'SELECT * FROM attribute_templates WHERE game_system_id = ? ORDER BY category ASC, sort_order ASC, id ASC'
  ).all(system.id);

  const equipmentSlots = db.prepare(
    'SELECT * FROM equipment_slot_templates WHERE game_system_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(system.id);

  const mechanics = db.prepare(
    'SELECT * FROM game_mechanics WHERE game_system_id = ? ORDER BY id ASC'
  ).all(system.id);
  const paramStmt = db.prepare(
    'SELECT * FROM game_mechanic_params WHERE mechanic_id = ? ORDER BY sort_order ASC, id ASC'
  );
  for (const mech of mechanics) mech.params = paramStmt.all(mech.id);

  res.json({ system, attributes, equipmentSlots, mechanics });
});

// GET /api/game-systems/:id/export  — serializa el sistema a un game pack JSON.
router.get('/:id/export', (req, res) => {
  try {
    const pack = exportGameSystem(db, req.params.id);
    res.json({ pack });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});

router.post('/', (req, res) => {
  const { name, description = '', dm_id } = req.body ?? {};
  if (!name || !dm_id) return res.status(400).json({ error: 'name y dm_id son requeridos' });

  const user = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!user) return res.status(403).json({ error: 'Solo un DM puede crear sistemas de juego' });

  const r = db.prepare(
    'INSERT INTO game_system_templates (name, description, dm_id) VALUES (?, ?, ?)'
  ).run(name, description, dm_id);

  res.status(201).json({
    system: db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(r.lastInsertRowid),
  });
});

router.put('/:id', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const { name, description } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE game_system_templates SET ${parts.join(', ')} WHERE id = ?`).run(...vals, system.id);
  res.json({ system: db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(system.id) });
});

router.delete('/:id', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  db.prepare('DELETE FROM game_system_templates WHERE id = ?').run(system.id);
  res.json({ ok: true });
});

// ── Attribute Templates ───────────────────────────────────────────────────────

router.get('/:id/attributes', (req, res) => {
  const attrs = db.prepare(
    'SELECT * FROM attribute_templates WHERE game_system_id = ? ORDER BY category ASC, sort_order ASC, id ASC'
  ).all(req.params.id);
  res.json({ attributes: attrs });
});

router.post('/:id/attributes', (req, res) => {
  const {
    name, type = 'text', category = 'general', sort_order = 0,
    is_core = 0, has_max = 0, formula = '',
  } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name es requerido' });
  const system = requireOwnedSystem(req, res);
  if (!system) return;

  const r = db.prepare(`
    INSERT INTO attribute_templates
      (game_system_id, name, type, category, sort_order, is_core, has_max, formula)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(system.id, name, type, category, sort_order, is_core ? 1 : 0, has_max ? 1 : 0, formula);

  res.status(201).json({
    attribute: db.prepare('SELECT * FROM attribute_templates WHERE id = ?').get(r.lastInsertRowid),
  });
});

router.put('/:id/attributes/:attrId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const { name, type, category, sort_order, is_core, has_max, formula } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (type !== undefined) { parts.push('type = ?'); vals.push(type); }
  if (category !== undefined) { parts.push('category = ?'); vals.push(category); }
  if (sort_order !== undefined) { parts.push('sort_order = ?'); vals.push(sort_order); }
  if (is_core !== undefined) { parts.push('is_core = ?'); vals.push(is_core ? 1 : 0); }
  if (has_max !== undefined) { parts.push('has_max = ?'); vals.push(has_max ? 1 : 0); }
  if (formula !== undefined) { parts.push('formula = ?'); vals.push(formula); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const r = db.prepare(
    `UPDATE attribute_templates SET ${parts.join(', ')} WHERE id = ? AND game_system_id = ?`
  ).run(...vals, req.params.attrId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Atributo no encontrado' });

  res.json({ attribute: db.prepare('SELECT * FROM attribute_templates WHERE id = ?').get(req.params.attrId) });
});

router.delete('/:id/attributes/:attrId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const r = db.prepare(
    'DELETE FROM attribute_templates WHERE id = ? AND game_system_id = ?'
  ).run(req.params.attrId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Atributo no encontrado' });
  res.json({ ok: true });
});

// ── Equipment Slot Templates ──────────────────────────────────────────────────

router.get('/:id/equipment-slots', (req, res) => {
  const slots = db.prepare(
    'SELECT * FROM equipment_slot_templates WHERE game_system_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(req.params.id);
  res.json({ slots });
});

router.post('/:id/equipment-slots', (req, res) => {
  const { name, slot_key, max_items = 1, sort_order = 0 } = req.body ?? {};
  if (!name || !slot_key) return res.status(400).json({ error: 'name y slot_key son requeridos' });
  const system = requireOwnedSystem(req, res);
  if (!system) return;

  const r = db.prepare(`
    INSERT INTO equipment_slot_templates (game_system_id, name, slot_key, max_items, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(system.id, name, slot_key, max_items, sort_order);

  res.status(201).json({
    slot: db.prepare('SELECT * FROM equipment_slot_templates WHERE id = ?').get(r.lastInsertRowid),
  });
});

router.put('/:id/equipment-slots/:slotId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const { name, slot_key, max_items, sort_order } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (slot_key !== undefined) { parts.push('slot_key = ?'); vals.push(slot_key); }
  if (max_items !== undefined) { parts.push('max_items = ?'); vals.push(max_items); }
  if (sort_order !== undefined) { parts.push('sort_order = ?'); vals.push(sort_order); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const r = db.prepare(
    `UPDATE equipment_slot_templates SET ${parts.join(', ')} WHERE id = ? AND game_system_id = ?`
  ).run(...vals, req.params.slotId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Slot no encontrado' });

  res.json({ slot: db.prepare('SELECT * FROM equipment_slot_templates WHERE id = ?').get(req.params.slotId) });
});

router.delete('/:id/equipment-slots/:slotId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const r = db.prepare(
    'DELETE FROM equipment_slot_templates WHERE id = ? AND game_system_id = ?'
  ).run(req.params.slotId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Slot no encontrado' });
  res.json({ ok: true });
});

// ── Game Mechanics (+ params) ─────────────────────────────────────────────────

router.get('/:id/mechanics', (req, res) => {
  const mechanics = db.prepare(
    'SELECT * FROM game_mechanics WHERE game_system_id = ? ORDER BY id ASC'
  ).all(req.params.id);
  const paramStmt = db.prepare(
    'SELECT * FROM game_mechanic_params WHERE mechanic_id = ? ORDER BY sort_order ASC, id ASC'
  );
  for (const mech of mechanics) mech.params = paramStmt.all(mech.id);
  res.json({ mechanics });
});

router.post('/:id/mechanics', (req, res) => {
  const { name, mechanic_type = 'custom', affects = 'general', description = '' } = req.body ?? {};
  if (!name) return res.status(400).json({ error: 'name es requerido' });
  const system = requireOwnedSystem(req, res);
  if (!system) return;

  const r = db.prepare(`
    INSERT INTO game_mechanics (game_system_id, name, mechanic_type, affects, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(system.id, name, mechanic_type, affects, description);

  res.status(201).json({
    mechanic: db.prepare('SELECT * FROM game_mechanics WHERE id = ?').get(r.lastInsertRowid),
  });
});

router.put('/:id/mechanics/:mechId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const { name, mechanic_type, affects, description } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (mechanic_type !== undefined) { parts.push('mechanic_type = ?'); vals.push(mechanic_type); }
  if (affects !== undefined) { parts.push('affects = ?'); vals.push(affects); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const r = db.prepare(
    `UPDATE game_mechanics SET ${parts.join(', ')} WHERE id = ? AND game_system_id = ?`
  ).run(...vals, req.params.mechId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Mecánica no encontrada' });

  res.json({ mechanic: db.prepare('SELECT * FROM game_mechanics WHERE id = ?').get(req.params.mechId) });
});

router.delete('/:id/mechanics/:mechId', (req, res) => {
  const system = requireOwnedSystem(req, res);
  if (!system) return;
  const r = db.prepare(
    'DELETE FROM game_mechanics WHERE id = ? AND game_system_id = ?'
  ).run(req.params.mechId, system.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Mecánica no encontrada' });
  res.json({ ok: true });
});

// Confirma que la mecánica pertenezca a un sistema del DM; devuelve la mecánica o responde error.
function requireOwnedMechanic(req, res) {
  const mech = db.prepare(`
    SELECT gm.*, gs.dm_id AS owner_id
    FROM game_mechanics gm
    JOIN game_system_templates gs ON gm.game_system_id = gs.id
    WHERE gm.id = ? AND gm.game_system_id = ?
  `).get(req.params.mechId, req.params.id);
  if (!mech) {
    res.status(404).json({ error: 'Mecánica no encontrada' });
    return null;
  }
  if (String(mech.owner_id) !== String(req.body?.dm_id)) {
    res.status(403).json({ error: 'Solo el DM dueño puede editar este sistema' });
    return null;
  }
  return mech;
}

router.post('/:id/mechanics/:mechId/params', (req, res) => {
  const { param_name, param_type = 'text', param_value = '', sort_order = 0 } = req.body ?? {};
  if (!param_name) return res.status(400).json({ error: 'param_name es requerido' });
  if (!requireOwnedMechanic(req, res)) return;

  const r = db.prepare(`
    INSERT INTO game_mechanic_params (mechanic_id, param_name, param_type, param_value, sort_order)
    VALUES (?, ?, ?, ?, ?)
  `).run(req.params.mechId, param_name, param_type, param_value, sort_order);

  res.status(201).json({
    param: db.prepare('SELECT * FROM game_mechanic_params WHERE id = ?').get(r.lastInsertRowid),
  });
});

router.put('/:id/mechanics/:mechId/params/:paramId', (req, res) => {
  if (!requireOwnedMechanic(req, res)) return;
  const { param_name, param_type, param_value, sort_order } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (param_name !== undefined) { parts.push('param_name = ?'); vals.push(param_name); }
  if (param_type !== undefined) { parts.push('param_type = ?'); vals.push(param_type); }
  if (param_value !== undefined) { parts.push('param_value = ?'); vals.push(param_value); }
  if (sort_order !== undefined) { parts.push('sort_order = ?'); vals.push(sort_order); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  const r = db.prepare(
    `UPDATE game_mechanic_params SET ${parts.join(', ')} WHERE id = ? AND mechanic_id = ?`
  ).run(...vals, req.params.paramId, req.params.mechId);
  if (r.changes === 0) return res.status(404).json({ error: 'Parámetro no encontrado' });

  res.json({ param: db.prepare('SELECT * FROM game_mechanic_params WHERE id = ?').get(req.params.paramId) });
});

router.delete('/:id/mechanics/:mechId/params/:paramId', (req, res) => {
  if (!requireOwnedMechanic(req, res)) return;
  const r = db.prepare(
    'DELETE FROM game_mechanic_params WHERE id = ? AND mechanic_id = ?'
  ).run(req.params.paramId, req.params.mechId);
  if (r.changes === 0) return res.status(404).json({ error: 'Parámetro no encontrado' });
  res.json({ ok: true });
});

export default router;

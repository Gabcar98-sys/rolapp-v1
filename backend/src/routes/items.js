import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

function withFields(format) {
  format.fields = db.prepare(
    'SELECT * FROM item_format_fields WHERE format_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(format.id);
  return format;
}

// Anexa los valores de un item master como mapa { field_id: value }.
function withValues(item) {
  const rows = db.prepare('SELECT field_id, value FROM item_master_values WHERE item_id = ?').all(item.id);
  item.values = {};
  for (const row of rows) item.values[row.field_id] = row.value;
  return item;
}

function requireOwnedFormat(formatId, dmId, res) {
  const format = db.prepare('SELECT * FROM item_formats WHERE id = ?').get(formatId);
  if (!format) {
    res.status(404).json({ error: 'Formato no encontrado' });
    return null;
  }
  if (String(format.dm_id) !== String(dmId)) {
    res.status(403).json({ error: 'Solo el DM dueño puede editar este formato' });
    return null;
  }
  return format;
}

// ── Item formats ──────────────────────────────────────────────────────────────

router.get('/formats', (req, res) => {
  const { dm_id, game_system_id } = req.query;
  let query = 'SELECT * FROM item_formats WHERE 1 = 1';
  const params = [];
  if (dm_id) { query += ' AND dm_id = ?'; params.push(dm_id); }
  if (game_system_id) { query += ' AND game_system_id = ?'; params.push(game_system_id); }
  query += ' ORDER BY created_at DESC';
  res.json({ formats: db.prepare(query).all(...params).map(withFields) });
});

router.get('/formats/:id', (req, res) => {
  const format = db.prepare('SELECT * FROM item_formats WHERE id = ?').get(req.params.id);
  if (!format) return res.status(404).json({ error: 'Formato no encontrado' });
  withFields(format);
  format.items = db.prepare('SELECT * FROM item_masters WHERE format_id = ? ORDER BY name ASC').all(format.id).map(withValues);
  res.json({ format });
});

router.post('/formats', (req, res) => {
  const { dm_id, game_system_id = null, name, description = '' } = req.body ?? {};
  if (!dm_id || !name) return res.status(400).json({ error: 'dm_id y name son requeridos' });
  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear formatos' });

  const r = db.prepare(
    'INSERT INTO item_formats (dm_id, game_system_id, name, description) VALUES (?, ?, ?, ?)'
  ).run(dm_id, game_system_id, name, description);
  res.status(201).json({ format: withFields(db.prepare('SELECT * FROM item_formats WHERE id = ?').get(r.lastInsertRowid)) });
});

router.put('/formats/:id', (req, res) => {
  const { dm_id, name, description } = req.body ?? {};
  const format = requireOwnedFormat(req.params.id, dm_id, res);
  if (!format) return;

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE item_formats SET ${parts.join(', ')} WHERE id = ?`).run(...vals, format.id);
  res.json({ format: withFields(db.prepare('SELECT * FROM item_formats WHERE id = ?').get(format.id)) });
});

router.delete('/formats/:id', (req, res) => {
  const format = requireOwnedFormat(req.params.id, req.body?.dm_id, res);
  if (!format) return;
  db.prepare('DELETE FROM item_formats WHERE id = ?').run(format.id);
  res.json({ ok: true });
});

// ── Campos del formato ──────────────────────────────────────────────────────

router.post('/formats/:id/fields', (req, res) => {
  const { dm_id, field_name, field_type = 'text', sort_order = 0 } = req.body ?? {};
  if (!field_name) return res.status(400).json({ error: 'field_name es requerido' });
  const format = requireOwnedFormat(req.params.id, dm_id, res);
  if (!format) return;

  const r = db.prepare(
    'INSERT INTO item_format_fields (format_id, field_name, field_type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(format.id, field_name, field_type, sort_order);
  res.status(201).json({ field: db.prepare('SELECT * FROM item_format_fields WHERE id = ?').get(r.lastInsertRowid) });
});

router.delete('/formats/:formatId/fields/:fieldId', (req, res) => {
  const format = requireOwnedFormat(req.params.formatId, req.body?.dm_id, res);
  if (!format) return;
  const r = db.prepare(
    'DELETE FROM item_format_fields WHERE id = ? AND format_id = ?'
  ).run(req.params.fieldId, format.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Campo no encontrado' });
  res.json({ ok: true });
});

// ── Item masters (entidades) ──────────────────────────────────────────────────

router.get('/', (req, res) => {
  const { format_id, dm_id } = req.query;
  let query = 'SELECT * FROM item_masters WHERE 1 = 1';
  const params = [];
  if (format_id) { query += ' AND format_id = ?'; params.push(format_id); }
  if (dm_id) { query += ' AND dm_id = ?'; params.push(dm_id); }
  query += ' ORDER BY name ASC';
  res.json({ items: db.prepare(query).all(...params).map(withValues) });
});

router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM item_masters WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  res.json({ item: withValues(item) });
});

router.post('/', (req, res) => {
  const { dm_id, format_id, name, description = '', equippable = 1, values = {} } = req.body ?? {};
  if (!dm_id || !format_id || !name) {
    return res.status(400).json({ error: 'dm_id, format_id y name son requeridos' });
  }
  const format = requireOwnedFormat(format_id, dm_id, res);
  if (!format) return;

  const create = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO item_masters (format_id, dm_id, name, description, equippable) VALUES (?, ?, ?, ?, ?)'
    ).run(format_id, dm_id, name, description, equippable ? 1 : 0);
    const insertVal = db.prepare(
      'INSERT INTO item_master_values (item_id, field_id, value) VALUES (?, ?, ?)'
    );
    for (const [fieldId, value] of Object.entries(values)) {
      insertVal.run(r.lastInsertRowid, fieldId, String(value ?? ''));
    }
    return r.lastInsertRowid;
  });
  res.status(201).json({ item: withValues(db.prepare('SELECT * FROM item_masters WHERE id = ?').get(create())) });
});

router.put('/:id', (req, res) => {
  const { dm_id, name, description, equippable, values } = req.body ?? {};
  const item = db.prepare('SELECT * FROM item_masters WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  if (String(item.dm_id) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (equippable !== undefined) { parts.push('equippable = ?'); vals.push(equippable ? 1 : 0); }
  if (parts.length === 0 && values === undefined) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  db.transaction(() => {
    if (parts.length > 0) {
      db.prepare(`UPDATE item_masters SET ${parts.join(', ')} WHERE id = ?`).run(...vals, item.id);
    }
    if (values !== undefined) {
      const upsert = db.prepare(`
        INSERT INTO item_master_values (item_id, field_id, value) VALUES (?, ?, ?)
        ON CONFLICT(item_id, field_id) DO UPDATE SET value = excluded.value
      `);
      for (const [fieldId, value] of Object.entries(values)) {
        upsert.run(item.id, fieldId, String(value ?? ''));
      }
    }
  })();
  res.json({ item: withValues(db.prepare('SELECT * FROM item_masters WHERE id = ?').get(item.id)) });
});

router.delete('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM item_masters WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });
  if (String(item.dm_id) !== String(req.body?.dm_id)) return res.status(403).json({ error: 'Sin permisos' });
  db.prepare('DELETE FROM item_masters WHERE id = ?').run(item.id);
  res.json({ ok: true });
});

export default router;

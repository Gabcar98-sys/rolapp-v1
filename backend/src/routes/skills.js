import { Router } from 'express';
import db from '../db/index.js';
import { bulkImportSkills, validateBulkSkillsData } from '../services/skillsImport.js';

const router = Router();

// Anexa los campos de un formato (orden estable) para shape consistente.
function withFields(format) {
  format.fields = db.prepare(
    'SELECT * FROM skill_format_fields WHERE format_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(format.id);
  return format;
}

// Anexa los valores de un skill como mapa { field_id: value }.
function withValues(skill) {
  const rows = db.prepare('SELECT field_id, value FROM skill_field_values WHERE skill_id = ?').all(skill.id);
  skill.values = {};
  for (const row of rows) skill.values[row.field_id] = row.value;
  return skill;
}

function requireOwnedFormat(formatId, dmId, res) {
  const format = db.prepare('SELECT * FROM skill_formats WHERE id = ?').get(formatId);
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

// ── Skill formats ─────────────────────────────────────────────────────────────

// GET /api/skills/formats?dm_id=&game_system_id=
router.get('/formats', (req, res) => {
  const { dm_id, game_system_id } = req.query;
  let query = 'SELECT * FROM skill_formats WHERE 1 = 1';
  const params = [];
  if (dm_id) { query += ' AND dm_id = ?'; params.push(dm_id); }
  if (game_system_id) { query += ' AND game_system_id = ?'; params.push(game_system_id); }
  query += ' ORDER BY created_at DESC';
  const formats = db.prepare(query).all(...params).map(withFields);
  res.json({ formats });
});

// GET /api/skills/formats/:id  — formato con campos y skills (cada uno con sus valores).
router.get('/formats/:id', (req, res) => {
  const format = db.prepare('SELECT * FROM skill_formats WHERE id = ?').get(req.params.id);
  if (!format) return res.status(404).json({ error: 'Formato no encontrado' });
  withFields(format);
  format.skills = db.prepare('SELECT * FROM skills WHERE format_id = ? ORDER BY name ASC').all(format.id).map(withValues);
  res.json({ format });
});

router.post('/formats', (req, res) => {
  const { dm_id, game_system_id = null, name, description = '' } = req.body ?? {};
  if (!dm_id || !name) return res.status(400).json({ error: 'dm_id y name son requeridos' });
  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear formatos' });

  const r = db.prepare(
    'INSERT INTO skill_formats (dm_id, game_system_id, name, description) VALUES (?, ?, ?, ?)'
  ).run(dm_id, game_system_id, name, description);
  res.status(201).json({ format: withFields(db.prepare('SELECT * FROM skill_formats WHERE id = ?').get(r.lastInsertRowid)) });
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

  db.prepare(`UPDATE skill_formats SET ${parts.join(', ')} WHERE id = ?`).run(...vals, format.id);
  res.json({ format: withFields(db.prepare('SELECT * FROM skill_formats WHERE id = ?').get(format.id)) });
});

router.delete('/formats/:id', (req, res) => {
  const format = requireOwnedFormat(req.params.id, req.body?.dm_id, res);
  if (!format) return;
  db.prepare('DELETE FROM skill_formats WHERE id = ?').run(format.id);
  res.json({ ok: true });
});

// ── Campos del formato ──────────────────────────────────────────────────────

router.post('/formats/:id/fields', (req, res) => {
  const { dm_id, field_name, field_type = 'text', sort_order = 0 } = req.body ?? {};
  if (!field_name) return res.status(400).json({ error: 'field_name es requerido' });
  const format = requireOwnedFormat(req.params.id, dm_id, res);
  if (!format) return;

  const r = db.prepare(
    'INSERT INTO skill_format_fields (format_id, field_name, field_type, sort_order) VALUES (?, ?, ?, ?)'
  ).run(format.id, field_name, field_type, sort_order);
  res.status(201).json({ field: db.prepare('SELECT * FROM skill_format_fields WHERE id = ?').get(r.lastInsertRowid) });
});

router.delete('/formats/:formatId/fields/:fieldId', (req, res) => {
  const format = requireOwnedFormat(req.params.formatId, req.body?.dm_id, res);
  if (!format) return;
  const r = db.prepare(
    'DELETE FROM skill_format_fields WHERE id = ? AND format_id = ?'
  ).run(req.params.fieldId, format.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Campo no encontrado' });
  res.json({ ok: true });
});

// ── Importación masiva (F15) ─────────────────────────────────────────────────

// POST /api/skills/bulk-import  { dm_id, format_id, data }
// data = { "Nombre": { campo: valor, description?: "…" } }. Crea los campos
// faltantes del formato (tipo autodetectado), omite duplicados por nombre y
// devuelve el reporte { imported, skipped, createdFields }.
router.post('/bulk-import', (req, res) => {
  const { dm_id, format_id, data } = req.body ?? {};
  if (!dm_id || !format_id) {
    return res.status(400).json({ error: 'dm_id y format_id son requeridos' });
  }
  const valid = validateBulkSkillsData(data);
  if (!valid.ok) return res.status(400).json({ error: valid.error });

  const format = requireOwnedFormat(format_id, dm_id, res);
  if (!format) return;

  try {
    const report = bulkImportSkills(db, { dmId: dm_id, formatId: format.id, data });
    res.status(201).json({ ok: true, ...report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── Skills (entidades) ────────────────────────────────────────────────────────

// GET /api/skills?format_id=&dm_id=
router.get('/', (req, res) => {
  const { format_id, dm_id } = req.query;
  let query = 'SELECT * FROM skills WHERE 1 = 1';
  const params = [];
  if (format_id) { query += ' AND format_id = ?'; params.push(format_id); }
  if (dm_id) { query += ' AND dm_id = ?'; params.push(dm_id); }
  query += ' ORDER BY name ASC';
  res.json({ skills: db.prepare(query).all(...params).map(withValues) });
});

router.get('/:id', (req, res) => {
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada' });
  res.json({ skill: withValues(skill) });
});

// POST /api/skills  { dm_id, format_id, name, description?, values? }
// values es un mapa { field_id: value }.
router.post('/', (req, res) => {
  const { dm_id, format_id, name, description = '', values = {} } = req.body ?? {};
  if (!dm_id || !format_id || !name) {
    return res.status(400).json({ error: 'dm_id, format_id y name son requeridos' });
  }
  const format = requireOwnedFormat(format_id, dm_id, res);
  if (!format) return;

  const create = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO skills (format_id, dm_id, name, description) VALUES (?, ?, ?, ?)'
    ).run(format_id, dm_id, name, description);
    const insertVal = db.prepare(
      'INSERT INTO skill_field_values (skill_id, field_id, value) VALUES (?, ?, ?)'
    );
    for (const [fieldId, value] of Object.entries(values)) {
      insertVal.run(r.lastInsertRowid, fieldId, String(value ?? ''));
    }
    return r.lastInsertRowid;
  });
  res.status(201).json({ skill: withValues(db.prepare('SELECT * FROM skills WHERE id = ?').get(create())) });
});

router.put('/:id', (req, res) => {
  const { dm_id, name, description, values } = req.body ?? {};
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada' });
  if (String(skill.dm_id) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (parts.length === 0 && values === undefined) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  db.transaction(() => {
    if (parts.length > 0) {
      db.prepare(`UPDATE skills SET ${parts.join(', ')} WHERE id = ?`).run(...vals, skill.id);
    }
    if (values !== undefined) {
      const upsert = db.prepare(`
        INSERT INTO skill_field_values (skill_id, field_id, value) VALUES (?, ?, ?)
        ON CONFLICT(skill_id, field_id) DO UPDATE SET value = excluded.value
      `);
      for (const [fieldId, value] of Object.entries(values)) {
        upsert.run(skill.id, fieldId, String(value ?? ''));
      }
    }
  })();
  res.json({ skill: withValues(db.prepare('SELECT * FROM skills WHERE id = ?').get(skill.id)) });
});

router.delete('/:id', (req, res) => {
  const skill = db.prepare('SELECT * FROM skills WHERE id = ?').get(req.params.id);
  if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada' });
  if (String(skill.dm_id) !== String(req.body?.dm_id)) return res.status(403).json({ error: 'Sin permisos' });
  db.prepare('DELETE FROM skills WHERE id = ?').run(skill.id);
  res.json({ ok: true });
});

export default router;

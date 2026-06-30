import { Router } from 'express';
import db from '../db/index.js';

const router = Router();

// Construye un evento con sus participantes (shape consistente en respuestas).
function buildEventWithExtras(id) {
  const evt = db.prepare('SELECT * FROM event_templates WHERE id = ?').get(id);
  if (!evt) return null;
  evt.participants = db
    .prepare('SELECT * FROM event_participants WHERE event_template_id = ?')
    .all(id);
  return evt;
}

// Inserta los participantes de un evento (ignora los que no tienen nombre).
function insertParticipants(eventId, participants) {
  const stmt = db.prepare(
    'INSERT INTO event_participants (event_template_id, name, type, character_id) VALUES (?, ?, ?, ?)'
  );
  for (const p of participants) {
    if (p.name) stmt.run(eventId, p.name, p.type || 'personaje', p.character_id || null);
  }
}

// Calcula el siguiente order_index según el contenedor del evento (rama, sub-ubicación o prep).
function nextOrderIndex({ parent_event_id, sub_location_id, prep_id }) {
  if (parent_event_id) {
    return (
      db
        .prepare(
          'SELECT COALESCE(MAX(order_index), -1) AS m FROM event_templates WHERE parent_event_id = ?'
        )
        .get(parent_event_id).m + 1
    );
  }
  if (sub_location_id) {
    return (
      db
        .prepare(
          'SELECT COALESCE(MAX(order_index), -1) AS m FROM event_templates WHERE sub_location_id = ? AND parent_event_id IS NULL'
        )
        .get(sub_location_id).m + 1
    );
  }
  if (prep_id) {
    return (
      db
        .prepare(
          'SELECT COALESCE(MAX(order_index), -1) AS m FROM event_templates WHERE prep_id = ? AND sub_location_id IS NULL AND parent_event_id IS NULL'
        )
        .get(prep_id).m + 1
    );
  }
  return 0;
}

// ── Enlaces entre eventos (aristas del grafo) ──────────────────────────────────
// Se registran ANTES de /:id para que Express no interprete "links" como un :id.

// POST /api/event-templates/links  { from_event_id, to_event_id, dm_id, label? }
router.post('/links', (req, res) => {
  const { from_event_id, to_event_id, label = '', dm_id } = req.body ?? {};
  if (!from_event_id || !to_event_id || !dm_id) {
    return res.status(400).json({ error: 'from_event_id, to_event_id y dm_id son requeridos' });
  }
  if (String(from_event_id) === String(to_event_id)) {
    return res.status(400).json({ error: 'Un evento no puede enlazarse a sí mismo' });
  }

  const fromEvt = db
    .prepare(`
      SELECT et.dm_id, sp.dm_id AS prep_dm_id
      FROM event_templates et
      LEFT JOIN session_preps sp ON et.prep_id = sp.id
      WHERE et.id = ?
    `)
    .get(from_event_id);
  if (!fromEvt) return res.status(404).json({ error: 'Evento origen no encontrado' });
  const ownerId = fromEvt.prep_dm_id ?? fromEvt.dm_id;
  if (String(ownerId) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  try {
    const info = db
      .prepare('INSERT INTO event_links (from_event_id, to_event_id, label) VALUES (?, ?, ?)')
      .run(from_event_id, to_event_id, label);
    res
      .status(201)
      .json({ link: db.prepare('SELECT * FROM event_links WHERE id = ?').get(info.lastInsertRowid) });
  } catch (e) {
    if (e.message.includes('UNIQUE')) return res.status(409).json({ error: 'El enlace ya existe' });
    throw e;
  }
});

// DELETE /api/event-templates/links/:id  { dm_id }
router.delete('/links/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const link = db
    .prepare(`
      SELECT el.*, sp.dm_id AS prep_dm_id, et.dm_id AS evt_dm_id
      FROM event_links el
      JOIN event_templates et ON el.from_event_id = et.id
      LEFT JOIN session_preps sp ON et.prep_id = sp.id
      WHERE el.id = ?
    `)
    .get(req.params.id);
  if (!link) return res.status(404).json({ error: 'Enlace no encontrado' });
  const ownerId = link.prep_dm_id ?? link.evt_dm_id;
  if (String(ownerId) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM event_links WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

// ── CRUD de event_templates ────────────────────────────────────────────────────

// GET /api/event-templates?dm_id=&campaign_id=&prep_id=
router.get('/', (req, res) => {
  const { campaign_id, dm_id, prep_id } = req.query;
  let query = `
    SELECT et.*, u.username AS dm_username
    FROM event_templates et
    JOIN users u ON et.dm_id = u.id
    WHERE 1 = 1
  `;
  const params = [];
  if (campaign_id) {
    query += ' AND et.campaign_id = ?';
    params.push(campaign_id);
  }
  if (dm_id) {
    query += ' AND et.dm_id = ?';
    params.push(dm_id);
  }
  if (prep_id) {
    query += ' AND et.prep_id = ?';
    params.push(prep_id);
  }
  query += ' ORDER BY et.order_index ASC, et.created_at ASC';

  const templates = db.prepare(query).all(...params);
  for (const tmpl of templates) {
    tmpl.participants = db
      .prepare('SELECT * FROM event_participants WHERE event_template_id = ?')
      .all(tmpl.id);
  }
  res.json({ templates });
});

// POST /api/event-templates  — crea un evento (raíz, en sub-ubicación o rama) + participantes.
router.post('/', (req, res) => {
  const {
    campaign_id = null,
    dm_id,
    title,
    description = '',
    category = 'general',
    prep_id = null,
    sub_location_id = null,
    order_index = null,
    parent_event_id = null,
    branch_label = '',
    participants = [],
  } = req.body ?? {};
  if (!dm_id || !title) return res.status(400).json({ error: 'dm_id y title son requeridos' });

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear eventos' });

  const finalOrder =
    order_index ?? nextOrderIndex({ parent_event_id, sub_location_id, prep_id });

  const create = db.transaction(() => {
    const info = db
      .prepare(`
        INSERT INTO event_templates
          (campaign_id, dm_id, title, description, category, prep_id, sub_location_id, order_index, parent_event_id, branch_label)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        campaign_id,
        dm_id,
        title,
        description,
        category,
        prep_id,
        sub_location_id || null,
        finalOrder,
        parent_event_id || null,
        branch_label
      );
    insertParticipants(info.lastInsertRowid, participants);
    return info.lastInsertRowid;
  });

  res.status(201).json({ template: buildEventWithExtras(create()) });
});

// PUT /api/event-templates/:id  — actualiza campos y/o reemplaza participantes.
router.put('/:id', (req, res) => {
  const {
    title,
    description,
    category,
    dm_id,
    sub_location_id,
    order_index,
    branch_label,
    participants,
  } = req.body ?? {};
  const tmpl = db.prepare('SELECT * FROM event_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Evento no encontrado' });
  if (String(tmpl.dm_id) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  const parts = [];
  const vals = [];
  if (title !== undefined) {
    parts.push('title = ?');
    vals.push(title);
  }
  if (description !== undefined) {
    parts.push('description = ?');
    vals.push(description);
  }
  if (category !== undefined) {
    parts.push('category = ?');
    vals.push(category);
  }
  if (sub_location_id !== undefined) {
    parts.push('sub_location_id = ?');
    vals.push(sub_location_id || null);
  }
  if (order_index !== undefined) {
    parts.push('order_index = ?');
    vals.push(order_index);
  }
  if (branch_label !== undefined) {
    parts.push('branch_label = ?');
    vals.push(branch_label);
  }

  if (parts.length === 0 && participants === undefined) {
    return res.status(400).json({ error: 'Nada que actualizar' });
  }

  db.transaction(() => {
    if (parts.length > 0) {
      db.prepare(`UPDATE event_templates SET ${parts.join(', ')} WHERE id = ?`).run(...vals, tmpl.id);
    }
    if (participants !== undefined) {
      db.prepare('DELETE FROM event_participants WHERE event_template_id = ?').run(tmpl.id);
      insertParticipants(tmpl.id, participants);
    }
  })();

  res.json({ template: buildEventWithExtras(tmpl.id) });
});

// DELETE /api/event-templates/:id  — borra el evento (cascade limpia ramas y enlaces).
router.delete('/:id', (req, res) => {
  const { dm_id } = req.body ?? {};
  const tmpl = db.prepare('SELECT * FROM event_templates WHERE id = ?').get(req.params.id);
  if (!tmpl) return res.status(404).json({ error: 'Evento no encontrado' });
  if (String(tmpl.dm_id) !== String(dm_id)) return res.status(403).json({ error: 'Sin permisos' });

  db.prepare('DELETE FROM event_templates WHERE id = ?').run(tmpl.id);
  res.json({ ok: true });
});

export default router;

import { Router } from 'express';
import db from '../db/index.js';
import { getCharacterFull } from './characters.js';

// Ficha completa de un personaje base (pregen del DM): datos + atributos + inventario
// + skills enlazadas (con rank).
function getBaseCharacterFull(id) {
  const bc = db.prepare(`
    SELECT bc.*, u.username AS dm_username, gs.name AS game_system_name
    FROM base_characters bc
    JOIN users u ON bc.dm_id = u.id
    LEFT JOIN game_system_templates gs ON bc.game_system_id = gs.id
    WHERE bc.id = ?
  `).get(id);
  if (!bc) return null;

  const attrs = db.prepare(
    'SELECT * FROM base_character_attrs WHERE base_character_id = ? ORDER BY sort_order ASC, id ASC'
  ).all(id);

  const inventory = db.prepare(
    'SELECT * FROM base_character_inventory WHERE base_character_id = ? ORDER BY id ASC'
  ).all(id);

  const skillLinks = db.prepare(`
    SELECT bcsl.id, bcsl.skill_id, bcsl.rank,
           s.name AS skill_name, s.description AS skill_description,
           sf.id AS format_id, sf.name AS format_name
    FROM base_character_skill_links bcsl
    JOIN skills s ON bcsl.skill_id = s.id
    JOIN skill_formats sf ON s.format_id = sf.id
    WHERE bcsl.base_character_id = ?
    ORDER BY sf.name ASC, s.name ASC
  `).all(id);

  return { ...bc, attrs, inventory, skillLinks };
}

// Confirma que el pregen exista y pertenezca al DM; responde error y null si no.
function requireOwnedBase(req, res) {
  const bc = db.prepare('SELECT * FROM base_characters WHERE id = ?').get(req.params.id);
  if (!bc) {
    res.status(404).json({ error: 'Personaje base no encontrado' });
    return null;
  }
  if (String(bc.dm_id) !== String(req.body?.dm_id)) {
    res.status(403).json({ error: 'Solo el DM dueño puede editar este personaje base' });
    return null;
  }
  return bc;
}

const router = Router();

// ── Listado ───────────────────────────────────────────────────────────────────

// GET /api/base-characters?dm_id=&game_system_id=
// Con dm_id: el DM ve TODOS los suyos. Sin dm_id (jugador): solo los públicos.
router.get('/', (req, res) => {
  const { dm_id, game_system_id } = req.query;
  let query = 'SELECT id FROM base_characters WHERE 1 = 1';
  const params = [];
  if (dm_id) { query += ' AND dm_id = ?'; params.push(dm_id); }
  else { query += ' AND is_public = 1'; }
  if (game_system_id) { query += ' AND game_system_id = ?'; params.push(game_system_id); }
  query += ' ORDER BY created_at DESC, id DESC';
  const baseCharacters = db.prepare(query).all(...params).map((r) => getBaseCharacterFull(r.id));
  res.json({ baseCharacters });
});

// GET /api/base-characters/:id
router.get('/:id', (req, res) => {
  const bc = getBaseCharacterFull(req.params.id);
  if (!bc) return res.status(404).json({ error: 'Personaje base no encontrado' });
  res.json({ baseCharacter: bc });
});

// ── CRUD ────────────────────────────────────────────────────────────────────

router.post('/', (req, res) => {
  const { dm_id, name, description = '', avatar_icon = '🧙', game_system_id = null, is_public = 1 } = req.body ?? {};
  if (!dm_id || !name?.trim()) return res.status(400).json({ error: 'dm_id y name son requeridos' });

  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
  if (!dm) return res.status(403).json({ error: 'Solo un DM puede crear personajes base' });

  const r = db.prepare(`
    INSERT INTO base_characters (dm_id, game_system_id, name, description, avatar_icon, is_public)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(dm_id, game_system_id || null, name.trim(), description, avatar_icon, is_public ? 1 : 0);

  res.status(201).json({ baseCharacter: getBaseCharacterFull(r.lastInsertRowid) });
});

router.put('/:id', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  const { name, description, avatar_icon, game_system_id, is_public } = req.body ?? {};

  const parts = [];
  const vals = [];
  if (name !== undefined) { parts.push('name = ?'); vals.push(name); }
  if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
  if (avatar_icon !== undefined) { parts.push('avatar_icon = ?'); vals.push(avatar_icon); }
  if (game_system_id !== undefined) { parts.push('game_system_id = ?'); vals.push(game_system_id || null); }
  if (is_public !== undefined) { parts.push('is_public = ?'); vals.push(is_public ? 1 : 0); }
  if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

  db.prepare(`UPDATE base_characters SET ${parts.join(', ')} WHERE id = ?`).run(...vals, bc.id);
  res.json({ baseCharacter: getBaseCharacterFull(bc.id) });
});

router.delete('/:id', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  db.prepare('DELETE FROM base_characters WHERE id = ?').run(bc.id);
  res.json({ ok: true });
});

// ── Atributos (reemplazo completo del set) ────────────────────────────────────

// PUT /api/base-characters/:id/attrs  { dm_id, attrs: [{ attribute_template_id?, attr_name, attr_type?, attr_category?, value, sort_order? }] }
router.put('/:id/attrs', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  const { attrs } = req.body ?? {};
  if (!Array.isArray(attrs)) return res.status(400).json({ error: 'attrs debe ser un array' });

  const insert = db.prepare(`
    INSERT INTO base_character_attrs
      (base_character_id, attribute_template_id, attr_name, attr_type, attr_category, value, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  db.transaction(() => {
    db.prepare('DELETE FROM base_character_attrs WHERE base_character_id = ?').run(bc.id);
    for (const [i, a] of attrs.entries()) {
      insert.run(
        bc.id,
        a.attribute_template_id || null,
        a.attr_name || '',
        a.attr_type || 'text',
        a.attr_category || 'general',
        String(a.value ?? ''),
        a.sort_order ?? i
      );
    }
  })();

  res.json({ baseCharacter: getBaseCharacterFull(bc.id) });
});

// ── Inventario ────────────────────────────────────────────────────────────────

router.post('/:id/inventory', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  const { item_name, quantity = 1, description = '' } = req.body ?? {};
  if (!item_name?.trim()) return res.status(400).json({ error: 'item_name es requerido' });

  const r = db.prepare(
    'INSERT INTO base_character_inventory (base_character_id, item_name, quantity, description) VALUES (?, ?, ?, ?)'
  ).run(bc.id, item_name.trim(), Number(quantity) || 1, description);

  res.status(201).json({ item: db.prepare('SELECT * FROM base_character_inventory WHERE id = ?').get(r.lastInsertRowid) });
});

router.delete('/:id/inventory/:itemId', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  const r = db.prepare('DELETE FROM base_character_inventory WHERE id = ? AND base_character_id = ?')
    .run(req.params.itemId, bc.id);
  if (r.changes === 0) return res.status(404).json({ error: 'Objeto no encontrado' });
  res.json({ ok: true });
});

// ── Skills enlazadas (con rank) ───────────────────────────────────────────────

router.post('/:id/skill-links', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  const { skill_id, rank = 0 } = req.body ?? {};
  if (!skill_id) return res.status(400).json({ error: 'skill_id es requerido' });
  const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(skill_id);
  if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada' });

  db.prepare(`
    INSERT INTO base_character_skill_links (base_character_id, skill_id, rank) VALUES (?, ?, ?)
    ON CONFLICT(base_character_id, skill_id) DO UPDATE SET rank = excluded.rank
  `).run(bc.id, skill_id, Number(rank) || 0);

  res.status(201).json({ baseCharacter: getBaseCharacterFull(bc.id) });
});

router.delete('/:id/skill-links/:skillId', (req, res) => {
  const bc = requireOwnedBase(req, res);
  if (!bc) return;
  db.prepare('DELETE FROM base_character_skill_links WHERE base_character_id = ? AND skill_id = ?')
    .run(bc.id, req.params.skillId);
  res.json({ baseCharacter: getBaseCharacterFull(bc.id) });
});

// ── Crear personaje de jugador a partir del pregen ────────────────────────────

// POST /api/base-characters/:id/adopt  { user_id, name? }
// Copia atributos (los que tienen attribute_template_id), inventario y skills (con rank)
// de forma transaccional. Devuelve la ficha completa del nuevo personaje.
router.post('/:id/adopt', (req, res) => {
  const { user_id, name } = req.body ?? {};
  if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

  const bc = getBaseCharacterFull(req.params.id);
  if (!bc) return res.status(404).json({ error: 'Personaje base no encontrado' });

  // Pregen no público: solo su DM dueño puede adoptarlo.
  if (!bc.is_public && String(bc.dm_id) !== String(user_id)) {
    return res.status(403).json({ error: 'Este personaje base no está disponible' });
  }

  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
  if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

  const charName = (name || bc.name).trim();

  const create = db.transaction(() => {
    const r = db.prepare(
      'INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)'
    ).run(user_id, charName, bc.game_system_id || null);
    const charId = r.lastInsertRowid;

    const insertAttr = db.prepare(`
      INSERT OR IGNORE INTO character_template_attr_values (character_id, attribute_template_id, value)
      VALUES (?, ?, ?)
    `);
    for (const attr of bc.attrs) {
      // Solo se copian los atributos ligados a una plantilla del sistema; los
      // atributos sueltos (sin attribute_template_id) no tienen destino estructurado.
      if (attr.attribute_template_id) {
        insertAttr.run(charId, attr.attribute_template_id, String(attr.value ?? ''));
      }
    }

    const insertItem = db.prepare(
      'INSERT INTO character_inventory (character_id, item_name, quantity, description) VALUES (?, ?, ?, ?)'
    );
    for (const item of bc.inventory) {
      insertItem.run(charId, item.item_name, item.quantity, item.description);
    }

    const insertSkill = db.prepare(
      'INSERT OR IGNORE INTO character_skill_links (character_id, skill_id, rank) VALUES (?, ?, ?)'
    );
    for (const sl of bc.skillLinks) {
      insertSkill.run(charId, sl.skill_id, sl.rank ?? 0);
    }

    return charId;
  });

  const charId = create();
  res.status(201).json({ character: getCharacterFull(charId) });
});

export default router;

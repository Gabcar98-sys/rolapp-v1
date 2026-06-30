import { Router } from 'express';
import db from '../db/index.js';
import { logEvent } from '../services/events.js';
import { checkCharacterFitsSession } from '../services/gameSystemCoherence.js';

// ── Lectura de ficha completa ───────────────────────────────────────────────
// Arma la ficha de un personaje: datos base + valores de atributos (join con la
// plantilla del sistema para conocer type/category/is_core/has_max/formula),
// skills enlazadas del catálogo (con rank), skills manuales, inventario y equipo.
function getCharacterFull(charId) {
  const character = db.prepare(`
    SELECT c.*, u.username, gs.name AS game_system_name
    FROM characters c
    JOIN users u ON c.user_id = u.id
    LEFT JOIN game_system_templates gs ON c.game_system_template_id = gs.id
    WHERE c.id = ?
  `).get(charId);
  if (!character) return null;

  const templateAttrs = db.prepare(`
    SELECT ctav.id, ctav.attribute_template_id, ctav.value, ctav.max_value,
           at.name AS attr_name, at.type AS attr_type, at.category,
           at.sort_order, at.is_core, at.has_max, at.formula
    FROM character_template_attr_values ctav
    JOIN attribute_templates at ON ctav.attribute_template_id = at.id
    WHERE ctav.character_id = ?
    ORDER BY at.category ASC, at.sort_order ASC, at.id ASC
  `).all(charId);

  const skillLinks = db.prepare(`
    SELECT csl.id, csl.skill_id, csl.rank,
           s.name AS skill_name, s.description AS skill_description,
           sf.id AS format_id, sf.name AS format_name
    FROM character_skill_links csl
    JOIN skills s ON csl.skill_id = s.id
    JOIN skill_formats sf ON s.format_id = sf.id
    WHERE csl.character_id = ?
    ORDER BY sf.name ASC, s.name ASC
  `).all(charId);

  const skills = db.prepare(
    'SELECT * FROM character_skills WHERE character_id = ? ORDER BY skill_list ASC, id ASC'
  ).all(charId);

  const inventory = db.prepare(
    'SELECT * FROM character_inventory WHERE character_id = ? ORDER BY created_at ASC, id ASC'
  ).all(charId);

  const equipment = listEquipment(charId);

  return { ...character, templateAttrs, skillLinks, skills, inventory, equipment };
}

// Lista el equipo de un personaje: cada entrada con datos del slot, del item master
// y sus valores de formato (para poder mostrar las stats del objeto equipado).
function listEquipment(charId) {
  const equipped = db.prepare(`
    SELECT ce.id, ce.slot_id, ce.item_id, ce.notes, ce.equipped_at,
           est.name AS slot_name, est.slot_key, est.max_items, est.sort_order AS slot_sort_order,
           im.name AS item_name, im.description AS item_description, im.equippable,
           im.format_id, iff.name AS format_name
    FROM character_equipment ce
    JOIN equipment_slot_templates est ON est.id = ce.slot_id
    JOIN item_masters im ON im.id = ce.item_id
    LEFT JOIN item_formats iff ON iff.id = im.format_id
    WHERE ce.character_id = ?
    ORDER BY est.sort_order ASC, est.id ASC
  `).all(charId);

  const valuesStmt = db.prepare(`
    SELECT imv.value, iff2.field_name, iff2.field_type, iff2.sort_order
    FROM item_master_values imv
    JOIN item_format_fields iff2 ON iff2.id = imv.field_id
    WHERE imv.item_id = ?
    ORDER BY iff2.sort_order ASC, iff2.id ASC
  `);
  return equipped.map((e) => ({ ...e, values: valuesStmt.all(e.item_id) }));
}

// ── Autorización ─────────────────────────────────────────────────────────────
// Devuelve el personaje o responde con el error y null. El dueño siempre puede;
// un DM puede gestionar el personaje si está vinculado a alguna de SUS sesiones.
function requireEditable(charId, actorId, res) {
  const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(charId);
  if (!char) {
    res.status(404).json({ error: 'Personaje no encontrado' });
    return null;
  }
  if (String(char.user_id) === String(actorId)) return char;

  // ¿El actor es DM de alguna sesión a la que está vinculado el personaje?
  const isSessionDM = db.prepare(`
    SELECT 1
    FROM session_characters sc
    JOIN sessions s ON s.id = sc.session_id
    WHERE sc.character_id = ? AND s.dm_id = ?
    LIMIT 1
  `).get(charId, actorId);
  if (isSessionDM) return char;

  res.status(403).json({ error: 'Sin permisos para gestionar este personaje' });
  return null;
}

// Notifica por socket a todas las sesiones donde participa el personaje.
function emitCharacterUpdated(io, charId) {
  const character = getCharacterFull(charId);
  const sessionIds = db.prepare(
    'SELECT session_id FROM session_characters WHERE character_id = ?'
  ).all(charId);
  for (const { session_id } of sessionIds) {
    io.to(`session:${session_id}`).emit('characters:updated', { characterId: Number(charId), character });
  }
  return character;
}

// El router emite por socket al editar fichas en sesión, por eso es factory (ver LEARNINGS).
export default function createCharactersRouter(io) {
  const router = Router();

  // ── Listados ────────────────────────────────────────────────────────────────

  // GET /api/characters?user_id=  — mis personajes (ficha completa de cada uno).
  router.get('/', (req, res) => {
    const { user_id } = req.query;
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });
    const rows = db.prepare(
      'SELECT id FROM characters WHERE user_id = ? ORDER BY created_at ASC, id ASC'
    ).all(user_id);
    res.json({ characters: rows.map((r) => getCharacterFull(r.id)) });
  });

  // GET /api/characters/session/:sessionId  — personajes vinculados a una sesión.
  router.get('/session/:sessionId', (req, res) => {
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    const rows = db.prepare(`
      SELECT c.id FROM characters c
      JOIN session_characters sc ON sc.character_id = c.id
      WHERE sc.session_id = ?
      ORDER BY sc.joined_at ASC, c.id ASC
    `).all(req.params.sessionId);
    res.json({ characters: rows.map((r) => getCharacterFull(r.id)) });
  });

  // GET /api/characters/:id  — ficha completa.
  router.get('/:id', (req, res) => {
    const character = getCharacterFull(req.params.id);
    if (!character) return res.status(404).json({ error: 'Personaje no encontrado' });
    res.json({ character });
  });

  // ── CRUD del personaje ────────────────────────────────────────────────────────

  // POST /api/characters  { user_id, name, game_system_template_id? }
  router.post('/', (req, res) => {
    const { user_id, name, game_system_template_id = null } = req.body ?? {};
    if (!user_id || !name?.trim()) {
      return res.status(400).json({ error: 'user_id y name son requeridos' });
    }
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const r = db.prepare(
      'INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)'
    ).run(user_id, name.trim(), game_system_template_id || null);

    res.status(201).json({ character: getCharacterFull(r.lastInsertRowid) });
  });

  // PATCH /api/characters/:id  { user_id, name?, game_system_template_id? }
  router.patch('/:id', (req, res) => {
    const { user_id, name, game_system_template_id } = req.body ?? {};
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const parts = [];
    const vals = [];
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ error: 'El nombre no puede estar vacío' });
      parts.push('name = ?'); vals.push(name.trim());
    }
    if (game_system_template_id !== undefined) {
      parts.push('game_system_template_id = ?'); vals.push(game_system_template_id || null);
    }
    if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    db.prepare(`UPDATE characters SET ${parts.join(', ')} WHERE id = ?`).run(...vals, char.id);
    res.json({ character: emitCharacterUpdated(io, char.id) });
  });

  // DELETE /api/characters/:id  { user_id }  — solo el dueño elimina su personaje.
  router.delete('/:id', (req, res) => {
    const { user_id } = req.body ?? {};
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!char) return res.status(404).json({ error: 'Personaje no encontrado' });
    if (String(char.user_id) !== String(user_id)) {
      return res.status(403).json({ error: 'Solo el dueño puede eliminar su personaje' });
    }
    // session_characters referencia characters(id) sin ON DELETE; con foreign_keys=ON
    // hay que limpiar el vínculo a sesiones antes de borrar (el resto de tablas hijas
    // de characters sí cascadean). event_participants usa ON DELETE SET NULL.
    db.transaction(() => {
      db.prepare('DELETE FROM session_characters WHERE character_id = ?').run(char.id);
      db.prepare('DELETE FROM characters WHERE id = ?').run(char.id);
    })();
    res.json({ ok: true });
  });

  // ── Valores de atributos ────────────────────────────────────────────────────

  // PUT /api/characters/:id/attributes  { user_id, values: [{ attribute_template_id, value, max_value? }] }
  router.put('/:id/attributes', (req, res) => {
    const { user_id, values } = req.body ?? {};
    if (!Array.isArray(values)) return res.status(400).json({ error: 'values debe ser un array' });
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const upsert = db.prepare(`
      INSERT INTO character_template_attr_values (character_id, attribute_template_id, value, max_value)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(character_id, attribute_template_id) DO UPDATE SET
        value = excluded.value,
        max_value = excluded.max_value
    `);
    db.transaction(() => {
      for (const v of values) {
        if (v.attribute_template_id === undefined) continue;
        upsert.run(
          char.id,
          v.attribute_template_id,
          String(v.value ?? ''),
          v.max_value != null && v.max_value !== '' ? String(v.max_value) : null
        );
      }
    })();

    res.json({ character: emitCharacterUpdated(io, char.id) });
  });

  // ── Skills del catálogo (enlace con rank) ─────────────────────────────────────

  // POST /api/characters/:id/skill-links  { user_id, skill_id, rank? }  — idempotente.
  router.post('/:id/skill-links', (req, res) => {
    const { user_id, skill_id, rank = 0 } = req.body ?? {};
    if (!skill_id) return res.status(400).json({ error: 'skill_id es requerido' });
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const skill = db.prepare('SELECT id FROM skills WHERE id = ?').get(skill_id);
    if (!skill) return res.status(404).json({ error: 'Habilidad no encontrada' });

    db.prepare(`
      INSERT INTO character_skill_links (character_id, skill_id, rank) VALUES (?, ?, ?)
      ON CONFLICT(character_id, skill_id) DO UPDATE SET rank = excluded.rank
    `).run(char.id, skill_id, Number(rank) || 0);

    res.status(201).json({ character: emitCharacterUpdated(io, char.id) });
  });

  // DELETE /api/characters/:id/skill-links/:skillId  { user_id }
  router.delete('/:id/skill-links/:skillId', (req, res) => {
    const char = requireEditable(req.params.id, req.body?.user_id, res);
    if (!char) return;
    db.prepare('DELETE FROM character_skill_links WHERE character_id = ? AND skill_id = ?')
      .run(char.id, req.params.skillId);
    res.json({ character: emitCharacterUpdated(io, char.id) });
  });

  // ── Skills manuales ───────────────────────────────────────────────────────────

  // POST /api/characters/:id/skills  { user_id, name, description?, skill_list? }
  router.post('/:id/skills', (req, res) => {
    const { user_id, name, description = '', skill_list = 'General' } = req.body ?? {};
    if (!name?.trim()) return res.status(400).json({ error: 'name es requerido' });
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    // Si edita el DM (no dueño) la fuente es dm_assigned; si edita el dueño, manual.
    const source = String(char.user_id) === String(user_id) ? 'manual' : 'dm_assigned';
    const list = String(skill_list || 'General').trim() || 'General';

    db.prepare(
      'INSERT INTO character_skills (character_id, name, description, skill_list, source) VALUES (?, ?, ?, ?, ?)'
    ).run(char.id, name.trim(), description, list, source);

    res.status(201).json({ character: emitCharacterUpdated(io, char.id) });
  });

  // DELETE /api/characters/:id/skills/:skillId  { user_id }
  router.delete('/:id/skills/:skillId', (req, res) => {
    const char = requireEditable(req.params.id, req.body?.user_id, res);
    if (!char) return;
    db.prepare('DELETE FROM character_skills WHERE id = ? AND character_id = ?')
      .run(req.params.skillId, char.id);
    res.json({ character: emitCharacterUpdated(io, char.id) });
  });

  // ── Inventario ──────────────────────────────────────────────────────────────

  // POST /api/characters/:id/inventory  { user_id, item_name, quantity?, description? }
  router.post('/:id/inventory', (req, res) => {
    const { user_id, item_name, quantity = 1, description = '' } = req.body ?? {};
    if (!item_name?.trim()) return res.status(400).json({ error: 'item_name es requerido' });
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const r = db.prepare(
      'INSERT INTO character_inventory (character_id, item_name, quantity, description) VALUES (?, ?, ?, ?)'
    ).run(char.id, item_name.trim(), Number(quantity) || 1, description);

    emitCharacterUpdated(io, char.id);
    res.status(201).json({ item: db.prepare('SELECT * FROM character_inventory WHERE id = ?').get(r.lastInsertRowid) });
  });

  // PUT /api/characters/:id/inventory/:itemId  { user_id, item_name?, quantity?, description? }
  router.put('/:id/inventory/:itemId', (req, res) => {
    const { user_id, item_name, quantity, description } = req.body ?? {};
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const parts = [];
    const vals = [];
    if (item_name !== undefined) { parts.push('item_name = ?'); vals.push(item_name); }
    if (quantity !== undefined) { parts.push('quantity = ?'); vals.push(Number(quantity) || 1); }
    if (description !== undefined) { parts.push('description = ?'); vals.push(description); }
    if (parts.length === 0) return res.status(400).json({ error: 'Nada que actualizar' });

    const r = db.prepare(
      `UPDATE character_inventory SET ${parts.join(', ')} WHERE id = ? AND character_id = ?`
    ).run(...vals, req.params.itemId, char.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Objeto no encontrado' });

    emitCharacterUpdated(io, char.id);
    res.json({ item: db.prepare('SELECT * FROM character_inventory WHERE id = ?').get(req.params.itemId) });
  });

  // DELETE /api/characters/:id/inventory/:itemId  { user_id }
  router.delete('/:id/inventory/:itemId', (req, res) => {
    const char = requireEditable(req.params.id, req.body?.user_id, res);
    if (!char) return;
    const r = db.prepare('DELETE FROM character_inventory WHERE id = ? AND character_id = ?')
      .run(req.params.itemId, char.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Objeto no encontrado' });
    emitCharacterUpdated(io, char.id);
    res.json({ ok: true });
  });

  // ── Equipo ──────────────────────────────────────────────────────────────────

  // POST /api/characters/:id/equipment  { user_id, slot_id, item_id, notes? }
  // Respeta max_items del slot; rechaza si el slot está lleno.
  router.post('/:id/equipment', (req, res) => {
    const { user_id, slot_id, item_id, notes = '' } = req.body ?? {};
    if (!slot_id || !item_id) {
      return res.status(400).json({ error: 'slot_id e item_id son requeridos' });
    }
    const char = requireEditable(req.params.id, user_id, res);
    if (!char) return;

    const slot = db.prepare('SELECT * FROM equipment_slot_templates WHERE id = ?').get(slot_id);
    if (!slot) return res.status(404).json({ error: 'Slot no encontrado' });
    const item = db.prepare('SELECT id FROM item_masters WHERE id = ?').get(item_id);
    if (!item) return res.status(404).json({ error: 'Objeto no encontrado' });

    const occupied = db.prepare(
      'SELECT COUNT(*) AS n FROM character_equipment WHERE character_id = ? AND slot_id = ?'
    ).get(char.id, slot_id).n;
    if (occupied >= (slot.max_items ?? 1)) {
      return res.status(409).json({ error: 'El slot está lleno' });
    }

    try {
      db.prepare(
        'INSERT INTO character_equipment (character_id, slot_id, item_id, notes) VALUES (?, ?, ?, ?)'
      ).run(char.id, slot_id, item_id, notes);
    } catch (err) {
      if (String(err.message).includes('UNIQUE')) {
        return res.status(409).json({ error: 'Ese objeto ya está equipado en ese slot' });
      }
      throw err;
    }

    emitCharacterUpdated(io, char.id);
    res.status(201).json({ equipment: listEquipment(char.id) });
  });

  // DELETE /api/characters/:id/equipment/:equipId  { user_id }
  router.delete('/:id/equipment/:equipId', (req, res) => {
    const char = requireEditable(req.params.id, req.body?.user_id, res);
    if (!char) return;
    const r = db.prepare('DELETE FROM character_equipment WHERE id = ? AND character_id = ?')
      .run(req.params.equipId, char.id);
    if (r.changes === 0) return res.status(404).json({ error: 'Equipo no encontrado' });
    emitCharacterUpdated(io, char.id);
    res.json({ equipment: listEquipment(char.id) });
  });

  // ── Vínculo a sesión ──────────────────────────────────────────────────────────

  // POST /api/characters/:id/sessions/:sessionId  { user_id }  — el jugador elige
  // qué personaje lleva a la sesión. Dueño o DM de la sesión pueden vincular.
  router.post('/:id/sessions/:sessionId', (req, res) => {
    const { user_id } = req.body ?? {};
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!char) return res.status(404).json({ error: 'Personaje no encontrado' });
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const isOwner = String(char.user_id) === String(user_id);
    const isDM = String(session.dm_id) === String(user_id);
    if (!isOwner && !isDM) return res.status(403).json({ error: 'Sin permisos para vincular este personaje' });

    // Coherencia de sistema de juego: el personaje debe pertenecer al mismo sistema
    // que la campaña de la sesión (cuando ambos están definidos).
    const fit = checkCharacterFitsSession(session.id, char.id);
    if (!fit.ok) return res.status(422).json({ error: fit.error });

    db.prepare('INSERT OR IGNORE INTO session_characters (session_id, character_id) VALUES (?, ?)')
      .run(session.id, char.id);
    logEvent(session.id, 'character_joined', user_id, { character_id: char.id, name: char.name });

    const characters = db.prepare(`
      SELECT c.id FROM characters c
      JOIN session_characters sc ON sc.character_id = c.id
      WHERE sc.session_id = ?
      ORDER BY sc.joined_at ASC, c.id ASC
    `).all(session.id).map((r) => getCharacterFull(r.id));
    io.to(`session:${session.id}`).emit('characters:list_updated', { characters });

    res.status(201).json({ ok: true, characters });
  });

  // DELETE /api/characters/:id/sessions/:sessionId  { user_id }
  router.delete('/:id/sessions/:sessionId', (req, res) => {
    const { user_id } = req.body ?? {};
    const char = db.prepare('SELECT * FROM characters WHERE id = ?').get(req.params.id);
    if (!char) return res.status(404).json({ error: 'Personaje no encontrado' });
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const isOwner = String(char.user_id) === String(user_id);
    const isDM = String(session.dm_id) === String(user_id);
    if (!isOwner && !isDM) return res.status(403).json({ error: 'Sin permisos' });

    db.prepare('DELETE FROM session_characters WHERE session_id = ? AND character_id = ?')
      .run(session.id, char.id);

    const characters = db.prepare(`
      SELECT c.id FROM characters c
      JOIN session_characters sc ON sc.character_id = c.id
      WHERE sc.session_id = ?
      ORDER BY sc.joined_at ASC, c.id ASC
    `).all(session.id).map((r) => getCharacterFull(r.id));
    io.to(`session:${session.id}`).emit('characters:list_updated', { characters });

    res.json({ ok: true, characters });
  });

  return router;
}

// Se exporta para reutilizar la lectura de ficha desde baseCharacters (crear-desde-pregen).
export { getCharacterFull };

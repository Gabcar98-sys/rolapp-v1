// Servicio de game packs: serializa un sistema de juego a JSON versionado
// (export) y reconstruye un sistema completo desde un pack (import transaccional).
//
// El formato del pack referencia atributos y campos por NOMBRE, nunca por id,
// para que sea portable entre instalaciones. El import mapea nombre→id internamente.

export const PACK_VERSION = '1.0';
const SUPPORTED_VERSIONS = new Set(['1.0']);

// ── Export ──────────────────────────────────────────────────────────────────

// Serializa un sistema de juego a un objeto game pack JSON. Lanza si no existe.
export function exportGameSystem(db, gameSystemId) {
  const system = db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(gameSystemId);
  if (!system) throw new Error('Sistema de juego no encontrado');

  const attributes = db.prepare(`
    SELECT name, type, category, sort_order, is_core, has_max, formula
    FROM attribute_templates WHERE game_system_id = ?
    ORDER BY category ASC, sort_order ASC, id ASC
  `).all(gameSystemId).map((a) => ({
    name: a.name,
    type: a.type,
    category: a.category,
    sort_order: a.sort_order,
    is_core: !!a.is_core,
    has_max: !!a.has_max,
    formula: a.formula,
  }));

  const skill_formats = serializeFormats(db, gameSystemId, {
    formatsTable: 'skill_formats',
    fieldsTable: 'skill_format_fields',
    entitiesTable: 'skills',
    valuesTable: 'skill_field_values',
    entityFk: 'skill_id',
    entitiesKey: 'skills',
  });

  const item_formats = serializeFormats(db, gameSystemId, {
    formatsTable: 'item_formats',
    fieldsTable: 'item_format_fields',
    entitiesTable: 'item_masters',
    valuesTable: 'item_master_values',
    entityFk: 'item_id',
    entitiesKey: 'items',
    extraEntityCols: ['equippable'],
  });

  const equipment_slots = db.prepare(`
    SELECT name, slot_key, max_items, sort_order
    FROM equipment_slot_templates WHERE game_system_id = ?
    ORDER BY sort_order ASC, id ASC
  `).all(gameSystemId);

  const mechanics = db.prepare(`
    SELECT id, name, mechanic_type, affects, description
    FROM game_mechanics WHERE game_system_id = ? ORDER BY id ASC
  `).all(gameSystemId).map((m) => ({
    name: m.name,
    type: m.mechanic_type,
    affects: m.affects,
    description: m.description,
    params: db.prepare(`
      SELECT param_name, param_type, param_value, sort_order
      FROM game_mechanic_params WHERE mechanic_id = ? ORDER BY sort_order ASC, id ASC
    `).all(m.id),
  }));

  const base_characters = db.prepare(
    'SELECT id, name, description, avatar_icon, is_public FROM base_characters WHERE game_system_id = ? ORDER BY id ASC'
  ).all(gameSystemId).map((bc) => ({
    name: bc.name,
    description: bc.description,
    avatar_icon: bc.avatar_icon,
    is_public: !!bc.is_public,
    attrs: db.prepare(
      'SELECT attr_name, attr_type, attr_category, value, sort_order FROM base_character_attrs WHERE base_character_id = ? ORDER BY sort_order ASC, id ASC'
    ).all(bc.id),
    inventory: db.prepare(
      'SELECT item_name, quantity, description FROM base_character_inventory WHERE base_character_id = ?'
    ).all(bc.id),
    // Skills enlazadas por NOMBRE (no por id) para que el pack sea portable.
    skill_links: db.prepare(
      `SELECT s.name AS skill_name, bcsl.rank
       FROM base_character_skill_links bcsl
       JOIN skills s ON s.id = bcsl.skill_id
       WHERE bcsl.base_character_id = ?
       ORDER BY s.name ASC`
    ).all(bc.id),
  }));

  // Solo metadatos de docs; el contenido .md se ingiere en F6 (RAG).
  const docs = db.prepare(
    'SELECT title, source_path FROM game_docs WHERE game_system_id = ? ORDER BY id ASC'
  ).all(gameSystemId).map((d) => ({ title: d.title, path: d.source_path }));

  return {
    pack_version: PACK_VERSION,
    name: system.name,
    description: system.description,
    attributes,
    skill_formats,
    item_formats,
    equipment_slots,
    mechanics,
    base_characters,
    docs,
  };
}

// Serializa formatos (skill o item) con sus campos y entidades; los valores se
// emiten por NOMBRE de campo para que el pack sea portable.
function serializeFormats(db, gameSystemId, cfg) {
  const formats = db.prepare(
    `SELECT * FROM ${cfg.formatsTable} WHERE game_system_id = ? ORDER BY created_at ASC, id ASC`
  ).all(gameSystemId);

  return formats.map((fmt) => {
    const fields = db.prepare(
      `SELECT * FROM ${cfg.fieldsTable} WHERE format_id = ? ORDER BY sort_order ASC, id ASC`
    ).all(fmt.id);
    const fieldNameById = new Map(fields.map((f) => [f.id, f.field_name]));

    const entities = db.prepare(
      `SELECT * FROM ${cfg.entitiesTable} WHERE format_id = ? ORDER BY name ASC`
    ).all(fmt.id).map((ent) => {
      const valueRows = db.prepare(
        `SELECT field_id, value FROM ${cfg.valuesTable} WHERE ${cfg.entityFk} = ?`
      ).all(ent.id);
      const values = {};
      for (const row of valueRows) {
        const fieldName = fieldNameById.get(row.field_id);
        if (fieldName) values[fieldName] = row.value;
      }
      const out = { name: ent.name, description: ent.description, values };
      for (const col of cfg.extraEntityCols ?? []) out[col] = ent[col];
      return out;
    });

    return {
      name: fmt.name,
      description: fmt.description,
      fields: fields.map((f) => ({ name: f.field_name, type: f.field_type })),
      [cfg.entitiesKey]: entities,
    };
  });
}

// ── Import ────────────────────────────────────────────────────────────────────

// Valida la forma del pack; lanza Error con mensaje claro si es inválido.
function validatePack(pack) {
  if (!pack || typeof pack !== 'object') throw new Error('El pack debe ser un objeto JSON');
  if (!SUPPORTED_VERSIONS.has(pack.pack_version)) {
    throw new Error(`pack_version no soportada: ${pack.pack_version ?? '(ausente)'}`);
  }
  if (!pack.name || typeof pack.name !== 'string') throw new Error('El pack requiere un name');

  const arrayFields = ['attributes', 'skill_formats', 'item_formats', 'equipment_slots', 'mechanics', 'base_characters', 'docs'];
  for (const key of arrayFields) {
    if (pack[key] !== undefined && !Array.isArray(pack[key])) {
      throw new Error(`El campo "${key}" debe ser un arreglo`);
    }
  }
  for (const attr of pack.attributes ?? []) {
    if (!attr.name) throw new Error('Cada atributo requiere un name');
  }
}

// Importa un game pack completo en una transacción. dmId es el dueño del sistema.
// Devuelve el id del game system creado. Si algo falla, la transacción revierte.
export function importGamePack(db, dmId, pack) {
  validatePack(pack);
  const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dmId);
  if (!dm) throw new Error('Solo un DM puede importar packs');

  const run = db.transaction(() => {
    const sysInfo = db.prepare(
      'INSERT INTO game_system_templates (name, description, dm_id) VALUES (?, ?, ?)'
    ).run(pack.name, pack.description ?? '', dmId);
    const gameSystemId = sysInfo.lastInsertRowid;

    const insertAttr = db.prepare(`
      INSERT INTO attribute_templates
        (game_system_id, name, type, category, sort_order, is_core, has_max, formula)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    (pack.attributes ?? []).forEach((a, idx) => {
      insertAttr.run(
        gameSystemId, a.name, a.type ?? 'text', a.category ?? 'general',
        a.sort_order ?? idx, a.is_core ? 1 : 0, a.has_max ? 1 : 0, a.formula ?? ''
      );
    });

    importFormats(db, gameSystemId, dmId, pack.skill_formats ?? [], {
      formatsTable: 'skill_formats',
      fieldsTable: 'skill_format_fields',
      entitiesTable: 'skills',
      valuesTable: 'skill_field_values',
      entityFk: 'skill_id',
      entitiesKey: 'skills',
    });

    importFormats(db, gameSystemId, dmId, pack.item_formats ?? [], {
      formatsTable: 'item_formats',
      fieldsTable: 'item_format_fields',
      entitiesTable: 'item_masters',
      valuesTable: 'item_master_values',
      entityFk: 'item_id',
      entitiesKey: 'items',
      extraEntityCols: { equippable: (e) => (e.equippable === false ? 0 : 1) },
    });

    const insertSlot = db.prepare(`
      INSERT INTO equipment_slot_templates (game_system_id, name, slot_key, max_items, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    (pack.equipment_slots ?? []).forEach((s, idx) => {
      if (!s.name || !s.slot_key) throw new Error('Cada equipment_slot requiere name y slot_key');
      insertSlot.run(gameSystemId, s.name, s.slot_key, s.max_items ?? 1, s.sort_order ?? idx);
    });

    const insertMech = db.prepare(`
      INSERT INTO game_mechanics (game_system_id, name, mechanic_type, affects, description)
      VALUES (?, ?, ?, ?, ?)
    `);
    const insertParam = db.prepare(`
      INSERT INTO game_mechanic_params (mechanic_id, param_name, param_type, param_value, sort_order)
      VALUES (?, ?, ?, ?, ?)
    `);
    for (const m of pack.mechanics ?? []) {
      if (!m.name) throw new Error('Cada mecánica requiere un name');
      const mechId = insertMech.run(
        gameSystemId, m.name, m.type ?? 'custom', m.affects ?? 'general', m.description ?? ''
      ).lastInsertRowid;
      (m.params ?? []).forEach((p, idx) => {
        insertParam.run(mechId, p.param_name, p.param_type ?? 'text', p.param_value ?? '', p.sort_order ?? idx);
      });
    }

    const insertBase = db.prepare(`
      INSERT INTO base_characters (dm_id, game_system_id, name, description, avatar_icon, is_public)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    // Los pregens referencian atributos por NOMBRE; los ligamos al attribute_template_id
    // del sistema para que "adopt" pueda copiar sus valores a un personaje de jugador.
    const insertBaseAttr = db.prepare(`
      INSERT INTO base_character_attrs
        (base_character_id, attribute_template_id, attr_name, attr_type, attr_category, value, sort_order)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const insertBaseInv = db.prepare(`
      INSERT INTO base_character_inventory (base_character_id, item_name, quantity, description)
      VALUES (?, ?, ?, ?)
    `);
    const insertBaseSkillLink = db.prepare(`
      INSERT OR IGNORE INTO base_character_skill_links (base_character_id, skill_id, rank)
      VALUES (?, ?, ?)
    `);

    // Mapas nombre→id dentro de este sistema (los atributos y skills ya se insertaron
    // arriba en la misma transacción). category::name evita colisiones de nombres iguales
    // en categorías distintas; también dejamos un fallback solo por nombre.
    const attrIdByKey = new Map();
    const attrIdByName = new Map();
    for (const row of db.prepare(
      'SELECT id, name, category FROM attribute_templates WHERE game_system_id = ?'
    ).all(gameSystemId)) {
      attrIdByKey.set(`${row.category}::${row.name}`, row.id);
      if (!attrIdByName.has(row.name)) attrIdByName.set(row.name, row.id);
    }
    const skillIdByName = new Map();
    for (const row of db.prepare(
      `SELECT sk.id, sk.name FROM skills sk
       JOIN skill_formats sf ON sf.id = sk.format_id
       WHERE sf.game_system_id = ?`
    ).all(gameSystemId)) {
      if (!skillIdByName.has(row.name)) skillIdByName.set(row.name, row.id);
    }

    for (const bc of pack.base_characters ?? []) {
      if (!bc.name) throw new Error('Cada base_character requiere un name');
      const bcId = insertBase.run(
        dmId, gameSystemId, bc.name, bc.description ?? '',
        bc.avatar_icon ?? '🧙', bc.is_public === false ? 0 : 1
      ).lastInsertRowid;
      (bc.attrs ?? []).forEach((a, idx) => {
        const category = a.attr_category ?? 'general';
        const templateId = attrIdByKey.get(`${category}::${a.attr_name}`)
          ?? attrIdByName.get(a.attr_name)
          ?? null;
        insertBaseAttr.run(
          bcId, templateId, a.attr_name, a.attr_type ?? 'text', category,
          a.value ?? '', a.sort_order ?? idx
        );
      });
      for (const inv of bc.inventory ?? []) {
        insertBaseInv.run(bcId, inv.item_name, inv.quantity ?? 1, inv.description ?? '');
      }
      for (const link of bc.skill_links ?? []) {
        const skillId = skillIdByName.get(link.skill_name);
        if (skillId === undefined) {
          throw new Error(
            `El skill_link "${link.skill_name}" del pregen "${bc.name}" no corresponde a ninguna habilidad del pack`
          );
        }
        insertBaseSkillLink.run(bcId, skillId, Number(link.rank) || 0);
      }
    }

    // Docs: solo metadatos. El contenido .md y su chunking/embedding se hacen en F6.
    const insertDoc = db.prepare(
      'INSERT INTO game_docs (game_system_id, title, source_path) VALUES (?, ?, ?)'
    );
    for (const d of pack.docs ?? []) {
      insertDoc.run(gameSystemId, d.title ?? null, d.path ?? null);
    }

    return gameSystemId;
  });

  return run();
}

// Inserta formatos (skill o item) con campos y entidades; mapea valores por nombre→field_id.
function importFormats(db, gameSystemId, dmId, formats, cfg) {
  const insertFormat = db.prepare(
    `INSERT INTO ${cfg.formatsTable} (dm_id, game_system_id, name, description) VALUES (?, ?, ?, ?)`
  );
  const insertField = db.prepare(
    `INSERT INTO ${cfg.fieldsTable} (format_id, field_name, field_type, sort_order) VALUES (?, ?, ?, ?)`
  );

  for (const fmt of formats) {
    if (!fmt.name) throw new Error('Cada formato requiere un name');
    const formatId = insertFormat.run(dmId, gameSystemId, fmt.name, fmt.description ?? '').lastInsertRowid;

    const fieldIdByName = new Map();
    (fmt.fields ?? []).forEach((f, idx) => {
      if (!f.name) throw new Error(`Cada campo del formato "${fmt.name}" requiere un name`);
      const fieldId = insertField.run(formatId, f.name, f.type ?? 'text', f.sort_order ?? idx).lastInsertRowid;
      fieldIdByName.set(f.name, fieldId);
    });

    const extraCols = Object.keys(cfg.extraEntityCols ?? {});
    const insertEntity = db.prepare(
      `INSERT INTO ${cfg.entitiesTable} (format_id, dm_id, name, description${extraCols.length ? ', ' + extraCols.join(', ') : ''})
       VALUES (?, ?, ?, ?${extraCols.map(() => ', ?').join('')})`
    );
    const insertValue = db.prepare(
      `INSERT INTO ${cfg.valuesTable} (${cfg.entityFk}, field_id, value) VALUES (?, ?, ?)`
    );

    for (const ent of fmt[cfg.entitiesKey] ?? []) {
      if (!ent.name) throw new Error(`Cada entidad del formato "${fmt.name}" requiere un name`);
      const extraVals = extraCols.map((col) => cfg.extraEntityCols[col](ent));
      const entId = insertEntity.run(formatId, dmId, ent.name, ent.description ?? '', ...extraVals).lastInsertRowid;
      for (const [fieldName, value] of Object.entries(ent.values ?? {})) {
        const fieldId = fieldIdByName.get(fieldName);
        if (fieldId === undefined) {
          throw new Error(`El valor "${fieldName}" no corresponde a ningún campo del formato "${fmt.name}"`);
        }
        insertValue.run(entId, fieldId, String(value ?? ''));
      }
    }
  }
}

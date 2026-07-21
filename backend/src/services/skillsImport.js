// Importación masiva de habilidades (F15), portada de la v0 y adaptada al schema v1.
// El JSON tiene la forma { "NombreHabilidad": { campo: valor, description?: "…" } }.
// Los campos desconocidos del formato se crean automáticamente detectando su tipo.

// Valida la estructura del payload de importación. Devuelve { ok } o { ok:false, error }.
export function validateBulkSkillsData(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'data debe ser un objeto { nombre: { campo: valor } }' };
  }
  if (Object.keys(data).length === 0) {
    return { ok: false, error: 'data está vacío: no hay habilidades que importar' };
  }
  return { ok: true };
}

// Detecta el tipo de un campo nuevo a partir de todos sus valores no vacíos.
function detectFieldType(values) {
  const present = values.filter((v) => v !== undefined && v !== null && v !== '');
  if (present.length === 0) return 'text';
  if (present.every((v) => typeof v === 'boolean' || v === 'true' || v === 'false')) return 'boolean';
  if (present.every((v) => !Number.isNaN(Number(v)))) return 'number';
  return 'text';
}

// Ejecuta la importación de forma TRANSACCIONAL (creación de campos incluida):
// si algo falla, no queda ni un campo ni una habilidad a medias.
// Devuelve { imported, skipped, createdFields } (createdFields = nombres).
export function bulkImportSkills(db, { dmId, formatId, data }) {
  const run = db.transaction(() => {
    const existingFields = db
      .prepare('SELECT * FROM skill_format_fields WHERE format_id = ? ORDER BY sort_order ASC, id ASC')
      .all(formatId);
    // Mapa por nombre normalizado para casar claves del JSON con campos existentes.
    const fieldMap = new Map(existingFields.map((f) => [f.field_name.toLowerCase(), f]));

    const insertField = db.prepare(
      'INSERT INTO skill_format_fields (format_id, field_name, field_type, sort_order) VALUES (?, ?, ?, ?)'
    );
    const insertSkill = db.prepare(
      'INSERT INTO skills (format_id, dm_id, name, description) VALUES (?, ?, ?, ?)'
    );
    const upsertValue = db.prepare(`
      INSERT INTO skill_field_values (skill_id, field_id, value) VALUES (?, ?, ?)
      ON CONFLICT(skill_id, field_id) DO UPDATE SET value = excluded.value
    `);
    const findSkill = db.prepare(
      'SELECT id FROM skills WHERE format_id = ? AND LOWER(name) = LOWER(?)'
    );

    // Pre-escaneo: descubre claves nuevas y crea los campos faltantes con tipo detectado.
    const createdFields = [];
    const keyValues = new Map(); // clave normalizada → lista de valores (para detectar tipo)
    for (const skillData of Object.values(data)) {
      if (!skillData || typeof skillData !== 'object' || Array.isArray(skillData)) continue;
      for (const [key, value] of Object.entries(skillData)) {
        if (key === 'description') continue;
        const norm = key.toLowerCase();
        if (!keyValues.has(norm)) keyValues.set(norm, []);
        keyValues.get(norm).push(value);
      }
    }
    for (const [key, values] of keyValues) {
      if (fieldMap.has(key)) continue;
      const fieldType = detectFieldType(values);
      const r = insertField.run(formatId, key, fieldType, existingFields.length + createdFields.length);
      const field = db.prepare('SELECT * FROM skill_format_fields WHERE id = ?').get(r.lastInsertRowid);
      fieldMap.set(key, field);
      createdFields.push(field.field_name);
    }

    let imported = 0;
    let skipped = 0;
    for (const [rawName, skillData] of Object.entries(data)) {
      const name = String(rawName ?? '').trim();
      // Entrada inválida (valor que no es objeto) o nombre vacío → se omite.
      if (!name || !skillData || typeof skillData !== 'object' || Array.isArray(skillData)) {
        skipped += 1;
        continue;
      }
      // El schema v1 no tiene UNIQUE(format_id, name): los duplicados se detectan aquí.
      if (findSkill.get(formatId, name)) {
        skipped += 1;
        continue;
      }
      const description = skillData.description != null ? String(skillData.description) : '';
      const r = insertSkill.run(formatId, dmId, name, description);
      for (const [key, value] of Object.entries(skillData)) {
        if (key === 'description') continue;
        const field = fieldMap.get(key.toLowerCase());
        if (!field) continue;
        upsertValue.run(r.lastInsertRowid, field.id, String(value ?? ''));
      }
      imported += 1;
    }

    return { imported, skipped, createdFields };
  });
  return run();
}

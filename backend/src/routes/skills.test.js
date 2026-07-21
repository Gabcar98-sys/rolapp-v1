import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let skillsRouter;
let validateBulkSkillsData;

// Invoca un handler del router resolviendo :params manualmente (Express los inyecta en runtime).
function invoke(router, method, routePath, { params = {}, body = {}, query = {} } = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  assert.ok(layer, `no existe handler ${method.toUpperCase()} ${routePath}`);
  return new Promise((resolve) => {
    const req = { body, query, params };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, data }); return this; },
    };
    layer.route.stack[0].handle(req, res, () => {});
  });
}

before(async () => {
  ({ default: db } = await import('../db/index.js'));
  ({ default: skillsRouter } = await import('./skills.js'));
  ({ validateBulkSkillsData } = await import('../services/skillsImport.js'));
});

let dmId;
let otherDmId;
let formatId;

beforeEach(() => {
  db.exec(`
    DELETE FROM skill_field_values;
    DELETE FROM skills;
    DELETE FROM skill_format_fields;
    DELETE FROM skill_formats;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  otherDmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')").run().lastInsertRowid;
  formatId = db.prepare(
    'INSERT INTO skill_formats (dm_id, name) VALUES (?, ?)'
  ).run(dmId, 'Habilidades').lastInsertRowid;
  // Un campo preexistente para verificar que se reutiliza (casando por nombre).
  db.prepare(
    "INSERT INTO skill_format_fields (format_id, field_name, field_type, sort_order) VALUES (?, 'tipo', 'text', 0)"
  ).run(formatId);
});

// ── Validación pura ───────────────────────────────────────────────────────────

test('validateBulkSkillsData rechaza arrays, no-objetos y objetos vacíos', () => {
  assert.equal(validateBulkSkillsData(null).ok, false);
  assert.equal(validateBulkSkillsData([1, 2]).ok, false);
  assert.equal(validateBulkSkillsData('x').ok, false);
  assert.equal(validateBulkSkillsData({}).ok, false);
  assert.equal(validateBulkSkillsData({ Tajo: { tipo: 'Ataque' } }).ok, true);
});

// ── Endpoint bulk-import ──────────────────────────────────────────────────────

test('POST /bulk-import importa, crea campos faltantes con tipo detectado y reporta', async () => {
  const data = {
    'Tajo demoledor': { tipo: 'Ataque', coste: 2, pasiva: false, description: 'Golpe pesado.' },
    'Muro de escudos': { tipo: 'Defensa', coste: 1, pasiva: false },
    'Reflejos felinos': { tipo: 'Pasiva', pasiva: true },
  };
  const { status, data: report } = await invoke(skillsRouter, 'post', '/bulk-import', {
    body: { dm_id: dmId, format_id: formatId, data },
  });

  assert.equal(status, 201);
  assert.equal(report.imported, 3);
  assert.equal(report.skipped, 0);
  // 'tipo' ya existía; se crean 'coste' (number) y 'pasiva' (boolean).
  assert.deepEqual(report.createdFields.sort(), ['coste', 'pasiva']);

  const fields = db.prepare('SELECT field_name, field_type FROM skill_format_fields WHERE format_id = ?').all(formatId);
  assert.equal(fields.length, 3);
  assert.equal(fields.find((f) => f.field_name === 'coste').field_type, 'number');
  assert.equal(fields.find((f) => f.field_name === 'pasiva').field_type, 'boolean');

  // Los valores quedan enlazados al campo correcto.
  const skill = db.prepare('SELECT * FROM skills WHERE name = ?').get('Tajo demoledor');
  assert.equal(skill.description, 'Golpe pesado.');
  const tipoField = fields.find((f) => f.field_name === 'tipo');
  const tipoFieldId = db.prepare(
    'SELECT id FROM skill_format_fields WHERE format_id = ? AND field_name = ?'
  ).get(formatId, tipoField.field_name).id;
  const value = db.prepare(
    'SELECT value FROM skill_field_values WHERE skill_id = ? AND field_id = ?'
  ).get(skill.id, tipoFieldId);
  assert.equal(value.value, 'Ataque');
});

test('POST /bulk-import omite duplicados por nombre y entradas inválidas', async () => {
  db.prepare('INSERT INTO skills (format_id, dm_id, name) VALUES (?, ?, ?)').run(formatId, dmId, 'Tajo demoledor');

  const data = {
    'Tajo demoledor': { tipo: 'Ataque' }, // duplicado (ya existe en el formato)
    'Voz de mando': { tipo: 'Apoyo' },
    'Entrada rota': 'no-es-objeto', // inválida → omitida
  };
  const { status, data: report } = await invoke(skillsRouter, 'post', '/bulk-import', {
    body: { dm_id: dmId, format_id: formatId, data },
  });

  assert.equal(status, 201);
  assert.equal(report.imported, 1);
  assert.equal(report.skipped, 2);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM skills WHERE format_id = ?').get(formatId).n, 2);
});

test('POST /bulk-import responde 400 con data inválido y 403 si el formato es de otro DM', async () => {
  const bad = await invoke(skillsRouter, 'post', '/bulk-import', {
    body: { dm_id: dmId, format_id: formatId, data: [] },
  });
  assert.equal(bad.status, 400);

  const forbidden = await invoke(skillsRouter, 'post', '/bulk-import', {
    body: { dm_id: otherDmId, format_id: formatId, data: { X: { tipo: 'a' } } },
  });
  assert.equal(forbidden.status, 403);
  // Nada se importó.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM skills WHERE format_id = ?').get(formatId).n, 0);
});

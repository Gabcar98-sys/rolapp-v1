import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test. Debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let exportGameSystem;
let importGamePack;
let dmId;

before(async () => {
  ({ default: db } = await import('../db/index.js'));
  ({ exportGameSystem, importGamePack } = await import('./gamePack.js'));
});

beforeEach(() => {
  db.exec(`
    DELETE FROM skill_field_values;
    DELETE FROM skills;
    DELETE FROM skill_format_fields;
    DELETE FROM skill_formats;
    DELETE FROM item_master_values;
    DELETE FROM item_masters;
    DELETE FROM item_format_fields;
    DELETE FROM item_formats;
    DELETE FROM game_mechanic_params;
    DELETE FROM game_mechanics;
    DELETE FROM equipment_slot_templates;
    DELETE FROM base_character_inventory;
    DELETE FROM base_character_attrs;
    DELETE FROM base_characters;
    DELETE FROM attribute_templates;
    DELETE FROM game_docs;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
});

// Pack mínimo pero completo: atributos, un skill format con skill, slot y mecánica.
function minimalPack() {
  return {
    pack_version: '1.0',
    name: 'Pack de prueba',
    description: 'Un sistema mínimo',
    attributes: [
      { name: 'Fuerza', type: 'number', category: 'core', is_core: true, has_max: false, formula: '' },
      { name: 'Salud', type: 'number', category: 'resources', is_core: false, has_max: true, formula: '10 + Fuerza' },
    ],
    skill_formats: [
      {
        name: 'Habilidades',
        description: '',
        fields: [{ name: 'attribute', type: 'text' }],
        skills: [{ name: 'Atletismo', description: 'Físico', values: { attribute: 'Fuerza' } }],
      },
    ],
    item_formats: [
      {
        name: 'Armas',
        description: '',
        fields: [{ name: 'damage', type: 'text' }],
        items: [{ name: 'Espada', description: '', equippable: true, values: { damage: '1d8' } }],
      },
    ],
    equipment_slots: [{ name: 'Mano derecha', slot_key: 'right_hand', max_items: 1 }],
    mechanics: [
      {
        name: 'Carga',
        type: 'inventory_weight',
        affects: 'inventory',
        description: 'Peso máximo',
        params: [{ param_name: 'max_weight', param_type: 'number', param_value: '50' }],
      },
    ],
    base_characters: [],
    docs: [{ title: 'Reglas core', path: 'test/01-core.md' }],
  };
}

test('importGamePack crea el sistema y devuelve su id', () => {
  const id = importGamePack(db, dmId, minimalPack());
  assert.ok(id > 0);
  const system = db.prepare('SELECT * FROM game_system_templates WHERE id = ?').get(id);
  assert.equal(system.name, 'Pack de prueba');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attribute_templates WHERE game_system_id = ?').get(id).n, 2);
});

test('round-trip import→export preserva la estructura del pack', () => {
  const original = minimalPack();
  const id = importGamePack(db, dmId, original);
  const exported = exportGameSystem(db, id);

  assert.equal(exported.pack_version, '1.0');
  assert.equal(exported.name, original.name);
  assert.equal(exported.attributes.length, 2);

  const fuerza = exported.attributes.find((a) => a.name === 'Fuerza');
  assert.equal(fuerza.is_core, true);
  assert.equal(fuerza.type, 'number');

  // El skill referencia su atributo por NOMBRE tras el round-trip.
  assert.equal(exported.skill_formats.length, 1);
  assert.equal(exported.skill_formats[0].skills[0].values.attribute, 'Fuerza');

  // El item conserva equippable y su valor por nombre de campo.
  assert.equal(exported.item_formats[0].items[0].values.damage, '1d8');

  assert.equal(exported.equipment_slots[0].slot_key, 'right_hand');
  assert.equal(exported.mechanics[0].params[0].param_name, 'max_weight');
  assert.equal(exported.docs[0].path, 'test/01-core.md');
});

test('reimportar un pack exportado produce el mismo sistema (idempotencia estructural)', () => {
  const id1 = importGamePack(db, dmId, minimalPack());
  const exported1 = exportGameSystem(db, id1);
  const id2 = importGamePack(db, dmId, exported1);
  const exported2 = exportGameSystem(db, id2);
  assert.deepEqual(exported2, exported1);
});

test('validación: rechaza pack_version no soportada', () => {
  const bad = { ...minimalPack(), pack_version: '9.9' };
  assert.throws(() => importGamePack(db, dmId, bad), /pack_version no soportada/);
});

test('validación: rechaza pack sin name', () => {
  const bad = minimalPack();
  delete bad.name;
  assert.throws(() => importGamePack(db, dmId, bad), /requiere un name/);
});

test('el import es transaccional: un pack que falla a mitad no deja basura', () => {
  const before = db.prepare('SELECT COUNT(*) AS n FROM game_system_templates').get().n;
  const broken = minimalPack();
  // Un valor de skill que apunta a un campo inexistente debe abortar TODO el import.
  broken.skill_formats[0].skills[0].values = { campo_inexistente: 'x' };

  assert.throws(() => importGamePack(db, dmId, broken), /no corresponde a ningún campo/);

  const after = db.prepare('SELECT COUNT(*) AS n FROM game_system_templates').get().n;
  assert.equal(after, before, 'no se creó ningún sistema');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attribute_templates').get().n, 0, 'no quedaron atributos');
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM skill_formats').get().n, 0, 'no quedaron formatos');
});

test('exportGameSystem lanza si el sistema no existe', () => {
  assert.throws(() => exportGameSystem(db, 99999), /no encontrado/);
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';

// vec0/FTS necesitan un archivo real (ver LEARNINGS): DB temporal. DB_PATH antes de importar db.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-dragonbane-'));
process.env.DB_PATH = join(tmpDir, 'catalog-test.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePacksDir() {
  const candidates = [
    process.env.GAME_PACKS_DIR,
    resolve('/app/game-packs'),
    resolve(__dirname, '../../game-packs'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'dragonbane.json'))) return dir;
  }
  throw new Error(`No se encontró game-packs. Probados: ${candidates.join(', ')}`);
}
const packsDir = resolvePacksDir();

function loadPack() {
  return JSON.parse(readFileSync(join(packsDir, 'dragonbane.json'), 'utf8'));
}

// Reproduce un estado "pre-F28/F29": clona el pack pero recorta el catálogo a lo que el pack
// original tenía (6 skills, 2 items) y solo los fields antiguos (attribute/category; weight/cost).
// Además DESCARTA el skill_format "Magia" (nuevo en F29), simulando un sistema Dragonbane
// creado antes de la magia. Así al importar tenemos el sistema casi vacío que el founder
// reportó y probamos que el seed lo enriquece hasta el pack completo.
function makeLegacyPack(pack) {
  const legacy = JSON.parse(JSON.stringify(pack));
  const legacySkillNames = new Set([
    'Acrobacias', 'Sigilo', 'Fuerza Bruta', 'Conocimiento de Bestias', 'Persuasion', 'Concentracion',
  ]);
  // Solo el formato "Habilidades", recortado; el formato "Magia" no existe aún (F29 lo crea).
  const sf = legacy.skill_formats.find((f) => f.name === 'Habilidades');
  sf.fields = [{ name: 'attribute', type: 'text' }, { name: 'category', type: 'text' }];
  sf.skills = sf.skills
    .filter((s) => legacySkillNames.has(s.name))
    .map((s) => ({ ...s, values: { attribute: s.values.attribute, category: s.values.category } }));
  legacy.skill_formats = [sf];

  const legacyItemNames = new Set(['Espada', 'Antorcha']);
  const itf = legacy.item_formats[0];
  itf.fields = [{ name: 'weight', type: 'number' }, { name: 'cost', type: 'text' }];
  itf.items = itf.items
    .filter((i) => legacyItemNames.has(i.name))
    .map((i) => ({ ...i, values: { weight: i.values.weight, cost: i.values.cost } }));
  return legacy;
}

// Cuenta skills de un formato concreto (por nombre) en el sistema.
function countSkillsInFormat(gameSystemId, formatName) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
     WHERE sf.game_system_id = ? AND sf.name = ?`
  ).get(gameSystemId, formatName).n;
}

// Cuenta hechizos de una escuela (field category) en el formato Magia del sistema.
function countSpellsBySchool(gameSystemId, school) {
  return db.prepare(
    `SELECT COUNT(*) AS n
     FROM skills sk
     JOIN skill_formats sf ON sf.id = sk.format_id
     JOIN skill_field_values v ON v.skill_id = sk.id
     JOIN skill_format_fields ff ON ff.id = v.field_id
     WHERE sf.game_system_id = ? AND sf.name = 'Magia' AND ff.field_name = 'category' AND v.value = ?`
  ).get(gameSystemId, school).n;
}

let db;
let importGamePack, seedDragonbaneCatalog;

before(async () => {
  db = (await import('../src/db/index.js')).default;
  ({ importGamePack } = await import('../src/services/gamePack.js'));
  ({ seedDragonbaneCatalog } = await import('./seed-dragonbane-catalog.js'));
});

let dmId, dmId2;

beforeEach(() => {
  db.exec(`
    DELETE FROM base_character_skill_links;
    DELETE FROM base_character_inventory;
    DELETE FROM base_character_attrs;
    DELETE FROM base_characters;
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
    DELETE FROM attribute_templates;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  dmId2 = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')").run().lastInsertRowid;
});

// Cuenta skills/items del formato del sistema.
function countEntities(gameSystemId) {
  const skills = db.prepare(
    `SELECT COUNT(*) AS n FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id WHERE sf.game_system_id = ?`
  ).get(gameSystemId).n;
  const items = db.prepare(
    `SELECT COUNT(*) AS n FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id WHERE itf.game_system_id = ?`
  ).get(gameSystemId).n;
  return { skills, items };
}

// Devuelve un Map field_name → value para una skill por nombre en el sistema.
function skillValues(gameSystemId, skillName) {
  const rows = db.prepare(
    `SELECT ff.field_name, v.value
     FROM skills sk
     JOIN skill_formats sf ON sf.id = sk.format_id
     JOIN skill_field_values v ON v.skill_id = sk.id
     JOIN skill_format_fields ff ON ff.id = v.field_id
     WHERE sf.game_system_id = ? AND sk.name = ?`
  ).all(gameSystemId, skillName);
  return new Map(rows.map((r) => [r.field_name, r.value]));
}

test('enriquece un sistema Dragonbane casi vacío hasta el catálogo completo del pack', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  // Estado pre-seed: solo lo legacy.
  assert.deepEqual(countEntities(gsId), { skills: 6, items: 2 });

  const res = seedDragonbaneCatalog(db, pack);
  assert.equal(res.systemsSeeded, 1);

  // Post-seed: conteos totales iguales al pack (fuente de verdad). Skills = suma de todos los
  // skill_formats (Habilidades + Magia); items = único item_format.
  const expectedSkills = pack.skill_formats.reduce((n, f) => n + f.skills.length, 0); // 35 + 56 = 91
  const expectedItems = pack.item_formats[0].items.length; // 136
  assert.deepEqual(countEntities(gsId), { skills: expectedSkills, items: expectedItems });
  assert.equal(countSkillsInFormat(gsId, 'Habilidades'), 35);

  // Los fields nuevos se añadieron al formato Habilidades (aditivos, sin tocar el orden previo).
  const skillFields = db.prepare(
    `SELECT ff.field_name FROM skill_format_fields ff
     JOIN skill_formats sf ON sf.id = ff.format_id
     WHERE sf.game_system_id = ? AND sf.name = 'Habilidades' ORDER BY ff.sort_order`
  ).all(gsId).map((r) => r.field_name);
  assert.deepEqual(skillFields, ['attribute', 'category', 'type', 'notes']);
});

test('mapea correctamente los atributos DRB (FUE/AGI/INT/CAR) a los del pack', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  seedDragonbaneCatalog(db, pack);

  assert.equal(skillValues(gsId, 'Espadas').get('attribute'), 'Fuerza'); // FUE
  assert.equal(skillValues(gsId, 'Arcos').get('attribute'), 'Destreza'); // AGI
  assert.equal(skillValues(gsId, 'Alerta').get('attribute'), 'Inteligencia'); // INT
  assert.equal(skillValues(gsId, 'Enganar').get('attribute'), 'Carisma'); // CAR
  // Category correcta: general vs arma.
  assert.equal(skillValues(gsId, 'Espadas').get('category'), 'arma');
  assert.equal(skillValues(gsId, 'Alerta').get('category'), 'general');
});

test('rellena los fields nuevos (type/notes) en las 6 skills legacy sin duplicarlas', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  seedDragonbaneCatalog(db, pack);

  // No se duplicó Sigilo (coincide por nombre con una skill del pack).
  const sigiloCount = db.prepare(
    `SELECT COUNT(*) AS n FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
     WHERE sf.game_system_id = ? AND sk.name = 'Sigilo'`
  ).get(gsId).n;
  assert.equal(sigiloCount, 1);

  // La skill legacy 'Fuerza Bruta' recibió type/notes (que antes no existían como fields).
  const fb = skillValues(gsId, 'Fuerza Bruta');
  assert.equal(fb.get('attribute'), 'Fuerza'); // valor legacy preservado
  assert.ok(fb.get('type'), 'la skill legacy recibió el field type');
  assert.ok(fb.get('notes'), 'la skill legacy recibió el field notes');
});

test('es idempotente: dos corridas dejan el mismo estado', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));

  const first = seedDragonbaneCatalog(db, pack);
  const stateAfter1 = countEntities(gsId);
  const valuesAfter1 = db.prepare(
    `SELECT COUNT(*) AS n FROM skill_field_values v JOIN skills sk ON sk.id = v.skill_id
     JOIN skill_formats sf ON sf.id = sk.format_id WHERE sf.game_system_id = ?`
  ).get(gsId).n;

  const second = seedDragonbaneCatalog(db, pack);
  const stateAfter2 = countEntities(gsId);
  const valuesAfter2 = db.prepare(
    `SELECT COUNT(*) AS n FROM skill_field_values v JOIN skills sk ON sk.id = v.skill_id
     JOIN skill_formats sf ON sf.id = sk.format_id WHERE sf.game_system_id = ?`
  ).get(gsId).n;

  assert.deepEqual(stateAfter1, stateAfter2, 'los conteos no cambian en la 2ª corrida');
  assert.equal(valuesAfter1, valuesAfter2, 'los valores de fields no se duplican');
  // La 2ª corrida no inserta nada nuevo.
  assert.equal(second.perSystem[0].skills.inserted, 0);
  assert.equal(second.perSystem[0].items.inserted, 0);
  assert.equal(second.perSystem[0].skills.valuesInserted, 0);
  assert.equal(second.perSystem[0].items.valuesInserted, 0);
  // La 1ª sí insertó.
  assert.ok(first.perSystem[0].skills.inserted > 0);
});

test('alcanza AMBOS sistemas Dragonbane (todos los DMs) y no toca otros sistemas', () => {
  const pack = loadPack();
  const gs1 = importGamePack(db, dmId, makeLegacyPack(pack));
  const gs2 = importGamePack(db, dmId2, makeLegacyPack(pack)); // copia per-DM del mismo nombre

  // Un sistema ajeno con nombre distinto que NO debe tocarse.
  const otherPack = JSON.parse(JSON.stringify(makeLegacyPack(pack)));
  otherPack.name = 'Stormlight RPG';
  const gsOther = importGamePack(db, dmId, otherPack);
  const otherBefore = countEntities(gsOther);

  const res = seedDragonbaneCatalog(db, pack);
  assert.equal(res.systemsSeeded, 2, 'alcanza los dos sistemas Dragonbane');

  const expected = {
    skills: pack.skill_formats.reduce((n, f) => n + f.skills.length, 0),
    items: pack.item_formats[0].items.length,
  };
  assert.deepEqual(countEntities(gs1), expected);
  assert.deepEqual(countEntities(gs2), expected);
  // Ambos sistemas recibieron el formato Magia con sus 56 hechizos.
  assert.equal(countSkillsInFormat(gs1, 'Magia'), 56);
  assert.equal(countSkillsInFormat(gs2, 'Magia'), 56);
  // El sistema ajeno quedó intacto (ni skills ni el formato Magia).
  assert.deepEqual(countEntities(gsOther), otherBefore);
  assert.equal(countSkillsInFormat(gsOther, 'Magia'), 0);
});

test('F29: crea el formato Magia con sus fields y los 56 hechizos por escuela', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  // Pre-seed: el formato Magia no existe todavía.
  assert.equal(countSkillsInFormat(gsId, 'Magia'), 0);

  seedDragonbaneCatalog(db, pack);

  // El formato Magia se creó con sus 7 fields (category primero → chip de escuela en la UI).
  const magiaFields = db.prepare(
    `SELECT ff.field_name FROM skill_format_fields ff
     JOIN skill_formats sf ON sf.id = ff.format_id
     WHERE sf.game_system_id = ? AND sf.name = 'Magia' ORDER BY ff.sort_order`
  ).all(gsId).map((r) => r.field_name);
  assert.deepEqual(magiaFields, [
    'category', 'rango', 'prerequisito', 'requisito', 'tiempo_lanzamiento', 'alcance', 'duracion',
  ]);

  // 56 hechizos, repartidos por escuela como en la fuente.
  assert.equal(countSkillsInFormat(gsId, 'Magia'), 56);
  assert.equal(countSpellsBySchool(gsId, 'General'), 6);
  assert.equal(countSpellsBySchool(gsId, 'Animismo'), 18);
  assert.equal(countSpellsBySchool(gsId, 'Elementalismo'), 19);
  assert.equal(countSpellsBySchool(gsId, 'Mentalismo'), 13);

  // El efecto va en la description (columna nativa) y los trucos son cantrips (rango Truco).
  const proteccion = skillValues(gsId, 'Proteccion');
  assert.equal(proteccion.get('rango'), '1');
  assert.equal(proteccion.get('tiempo_lanzamiento'), 'accion');
  const canto = skillValues(gsId, 'Canto de pajaro');
  assert.equal(canto.get('rango'), 'Truco');
  const cantoDesc = db.prepare(
    `SELECT sk.description AS d FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
     WHERE sf.game_system_id = ? AND sf.name = 'Magia' AND sk.name = 'Canto de pajaro'`
  ).get(gsId).d;
  assert.ok(cantoDesc && cantoDesc.length > 0, 'el truco tiene su efecto en la description');
});

test('F29: completa los items faltantes del MD de equipo sin duplicar ni tocar los previos', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));

  seedDragonbaneCatalog(db, pack);

  // Conteo total = pack completo (136 items).
  assert.equal(countEntities(gsId).items, pack.item_formats[0].items.length);

  // Items nuevos de F29 presentes (ropa, instrumento, estudios/magia, recipiente, transporte, animal).
  const itemNames = new Set(
    db.prepare(
      `SELECT im.name AS n FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id
       WHERE itf.game_system_id = ?`
    ).all(gsId).map((r) => r.n)
  );
  for (const name of ['Botas', 'Arpa', 'Varita', 'Cofre', 'Carro', 'Caballo de guerra', 'Veneno letal']) {
    assert.ok(itemNames.has(name), `item nuevo presente: ${name}`);
  }

  // Sin duplicados por nombre.
  const dupCount = db.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT im.name FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id
       WHERE itf.game_system_id = ? GROUP BY im.name HAVING COUNT(*) > 1)`
  ).get(gsId).n;
  assert.equal(dupCount, 0, 'no hay items duplicados por nombre');
});

test('no crea el sistema si no existe: solo enriquece los existentes', () => {
  const pack = loadPack();
  // Sin importar ningún sistema Dragonbane.
  const res = seedDragonbaneCatalog(db, pack);
  assert.equal(res.systemsSeeded, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_system_templates').get().n, 0);
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

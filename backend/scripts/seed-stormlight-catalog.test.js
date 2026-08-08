import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';

// vec0/FTS necesitan un archivo real (ver LEARNINGS): DB temporal. DB_PATH antes de importar db.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-stormlight-'));
process.env.DB_PATH = join(tmpDir, 'catalog-test.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolvePacksDir() {
  const candidates = [
    process.env.GAME_PACKS_DIR,
    resolve('/app/game-packs'),
    resolve(__dirname, '../../game-packs'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'stormlight.json'))) return dir;
  }
  throw new Error(`No se encontró game-packs. Probados: ${candidates.join(', ')}`);
}
const packsDir = resolvePacksDir();

function loadPack() {
  return JSON.parse(readFileSync(join(packsDir, 'stormlight.json'), 'utf8'));
}

// Reproduce el estado "pre-F34" del sistema Stormlight tal como lo dejó F10: solo el
// skill_format legacy "Stormlight Skills" con sus 21 skills y los fields attribute/tasks (sin
// category), y el item_format "Armas" con sus 4 fields y sus 2 items. Los base_characters
// (pregens del Puente Nueve) se conservan: sus skill_links deben seguir resolviendo.
function makeLegacyPack(pack) {
  const legacy = JSON.parse(JSON.stringify(pack));

  const sf = legacy.skill_formats.find((f) => f.name === 'Stormlight Skills');
  sf.fields = [{ name: 'attribute', type: 'text' }, { name: 'tasks', type: 'text' }];
  sf.skills = sf.skills.map((s) => ({
    ...s,
    values: { attribute: s.values.attribute, tasks: s.values.tasks },
  }));
  legacy.skill_formats = [sf];

  const armas = legacy.item_formats.find((f) => f.name === 'Armas');
  armas.fields = [
    { name: 'category', type: 'text' },
    { name: 'governing_skill', type: 'text' },
    { name: 'damage', type: 'text' },
    { name: 'traits', type: 'text' },
  ];
  const legacyItemNames = new Set(['Espada larga', 'Maza pesada']);
  armas.items = armas.items.filter((i) => legacyItemNames.has(i.name));
  legacy.item_formats = [armas];

  return legacy;
}

let db;
let importGamePack, seedStormlightCatalog;

before(async () => {
  db = (await import('../src/db/index.js')).default;
  ({ importGamePack } = await import('../src/services/gamePack.js'));
  ({ seedStormlightCatalog } = await import('./seed-stormlight-catalog.js'));
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
    DELETE FROM game_docs;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  dmId2 = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')").run().lastInsertRowid;
});

// ── Helpers de conteo ────────────────────────────────────────────────────────

function countEntities(gameSystemId) {
  const skills = db.prepare(
    `SELECT COUNT(*) AS n FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id WHERE sf.game_system_id = ?`
  ).get(gameSystemId).n;
  const items = db.prepare(
    `SELECT COUNT(*) AS n FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id WHERE itf.game_system_id = ?`
  ).get(gameSystemId).n;
  return { skills, items };
}

function countSkillsInFormat(gameSystemId, formatName) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
     WHERE sf.game_system_id = ? AND sf.name = ?`
  ).get(gameSystemId, formatName).n;
}

function countItemsInFormat(gameSystemId, formatName) {
  return db.prepare(
    `SELECT COUNT(*) AS n FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id
     WHERE itf.game_system_id = ? AND itf.name = ?`
  ).get(gameSystemId, formatName).n;
}

// Cuenta skills de un formato cuyo field `fieldName` vale `value` (p. ej. talentos por camino).
function countSkillsByFieldValue(gameSystemId, formatName, fieldName, value) {
  return db.prepare(
    `SELECT COUNT(*) AS n
     FROM skills sk
     JOIN skill_formats sf ON sf.id = sk.format_id
     JOIN skill_field_values v ON v.skill_id = sk.id
     JOIN skill_format_fields ff ON ff.id = v.field_id
     WHERE sf.game_system_id = ? AND sf.name = ? AND ff.field_name = ? AND v.value = ?`
  ).get(gameSystemId, formatName, fieldName, value).n;
}

function countItemsByFieldValue(gameSystemId, formatName, fieldName, value) {
  return db.prepare(
    `SELECT COUNT(*) AS n
     FROM item_masters im
     JOIN item_formats itf ON itf.id = im.format_id
     JOIN item_master_values v ON v.item_id = im.id
     JOIN item_format_fields ff ON ff.id = v.field_id
     WHERE itf.game_system_id = ? AND itf.name = ? AND ff.field_name = ? AND v.value = ?`
  ).get(gameSystemId, formatName, fieldName, value).n;
}

function skillFieldNames(gameSystemId, formatName) {
  return db.prepare(
    `SELECT ff.field_name FROM skill_format_fields ff
     JOIN skill_formats sf ON sf.id = ff.format_id
     WHERE sf.game_system_id = ? AND sf.name = ? ORDER BY ff.sort_order`
  ).all(gameSystemId, formatName).map((r) => r.field_name);
}

function itemFieldNames(gameSystemId, formatName) {
  return db.prepare(
    `SELECT ff.field_name FROM item_format_fields ff
     JOIN item_formats itf ON itf.id = ff.format_id
     WHERE itf.game_system_id = ? AND itf.name = ? ORDER BY ff.sort_order`
  ).all(gameSystemId, formatName).map((r) => r.field_name);
}

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

function itemValues(gameSystemId, itemName) {
  const rows = db.prepare(
    `SELECT ff.field_name, v.value
     FROM item_masters im
     JOIN item_formats itf ON itf.id = im.format_id
     JOIN item_master_values v ON v.item_id = im.id
     JOIN item_format_fields ff ON ff.id = v.field_id
     WHERE itf.game_system_id = ? AND im.name = ?`
  ).all(gameSystemId, itemName);
  return new Map(rows.map((r) => [r.field_name, r.value]));
}

// Totales esperados derivados del pack (única fuente de verdad).
function expectedTotals(pack) {
  return {
    skills: pack.skill_formats.reduce((n, f) => n + f.skills.length, 0),
    items: pack.item_formats.reduce((n, f) => n + f.items.length, 0),
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

test('enriquece un sistema Stormlight con solo lo legacy hasta el catálogo completo del pack', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  // Estado pre-seed: lo que dejó F10 (21 skills / 2 items).
  assert.deepEqual(countEntities(gsId), { skills: 21, items: 2 });

  const res = seedStormlightCatalog(db, pack);
  assert.equal(res.systemsSeeded, 1);

  assert.deepEqual(countEntities(gsId), expectedTotals(pack)); // 135 skills / 90 items
  assert.equal(countSkillsInFormat(gsId, 'Stormlight Skills'), 21);
  assert.equal(countSkillsInFormat(gsId, 'Caminos Heroicos'), 6);
  assert.equal(countSkillsInFormat(gsId, 'Talentos'), 90);
  assert.equal(countSkillsInFormat(gsId, 'Acciones'), 18);
  assert.equal(countItemsInFormat(gsId, 'Armas'), 14);
  assert.equal(countItemsInFormat(gsId, 'Equipo'), 76);
});

test('el field category se añade al formato legacy de forma ADITIVA, sin tocar attribute/tasks', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  assert.deepEqual(skillFieldNames(gsId, 'Stormlight Skills'), ['attribute', 'tasks']);

  seedStormlightCatalog(db, pack);

  // El field nuevo va al final: el orden previo no se altera.
  assert.deepEqual(skillFieldNames(gsId, 'Stormlight Skills'), ['attribute', 'tasks', 'category']);

  // Las 21 skills legacy conservan sus valores y reciben la category derivada de su atributo.
  const athletics = skillValues(gsId, 'Athletics');
  assert.equal(athletics.get('attribute'), 'Strength');
  assert.equal(athletics.get('category'), 'fisica');
  assert.match(athletics.get('tasks'), /Levantar, empujar, escalar/);
  assert.equal(skillValues(gsId, 'Lore').get('category'), 'cognitiva');
  assert.equal(skillValues(gsId, 'Perception').get('category'), 'espiritual');

  // Ninguna skill legacy se duplicó.
  const dup = db.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT sk.name FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
       WHERE sf.game_system_id = ? GROUP BY sk.name HAVING COUNT(*) > 1)`
  ).get(gsId).n;
  assert.equal(dup, 0);
});

test('crea Caminos Heroicos, Talentos y Acciones con sus fields y conteos por camino', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  assert.equal(countSkillsInFormat(gsId, 'Talentos'), 0); // pre-seed no existen

  seedStormlightCatalog(db, pack);

  assert.deepEqual(skillFieldNames(gsId, 'Caminos Heroicos'), [
    'talento_clave', 'especialidades', 'habilidad_inicial', 'atributos_recomendados', 'habilidades_recomendadas',
  ]);
  // category primero → es el chip de filtro de la UI (TYPE_FIELD_NAMES).
  assert.deepEqual(skillFieldNames(gsId, 'Talentos'), ['category', 'especialidad', 'activacion', 'prerequisito']);
  assert.deepEqual(skillFieldNames(gsId, 'Acciones'), ['category', 'coste', 'cuando']);

  // Los 6 caminos de la fuente, con su talento clave.
  assert.equal(skillValues(gsId, 'Warrior').get('talento_clave'), 'Vigilant Stance + End Stance');
  assert.equal(skillValues(gsId, 'Scholar').get('especialidades'), 'Strategist, Surgeon');

  // 90 talentos = 81 propios de camino + 9 compartidos entre caminos.
  const byPath = {
    Agent: 13, Envoy: 13, Hunter: 13, Leader: 13, Scholar: 15, Warrior: 14, Compartido: 9,
  };
  for (const [path, n] of Object.entries(byPath)) {
    assert.equal(countSkillsByFieldValue(gsId, 'Talentos', 'category', path), n, `talentos de ${path}`);
  }
  assert.equal(Object.values(byPath).reduce((a, b) => a + b, 0), 90);

  // El efecto del talento va en la description (columna nativa), como en F29.
  const opportunist = db.prepare(
    `SELECT sk.description AS d FROM skills sk JOIN skill_formats sf ON sf.id = sk.format_id
     WHERE sf.game_system_id = ? AND sf.name = 'Talentos' AND sk.name = 'Opportunist'`
  ).get(gsId).d;
  assert.match(opportunist, /dado de trama/);
  assert.equal(skillValues(gsId, 'Opportunist').get('especialidad'), 'Key Talent');

  // Acciones: las 18 de la fuente, con su coste.
  assert.equal(countSkillsByFieldValue(gsId, 'Acciones', 'category', 'Reaccion'), 4);
  assert.equal(countSkillsByFieldValue(gsId, 'Acciones', 'category', 'Libre'), 2);
  assert.equal(countSkillsByFieldValue(gsId, 'Acciones', 'category', 'Estandar'), 12);
  assert.equal(skillValues(gsId, 'Dodge').get('coste'), 'r + 1 foco');
});

test('puebla Armas y el nuevo formato Equipo sin tocar los 2 items legacy', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));
  assert.deepEqual(itemFieldNames(gsId, 'Armas'), ['category', 'governing_skill', 'damage', 'traits']);

  seedStormlightCatalog(db, pack);

  // Fields nuevos de Armas: aditivos y al final.
  assert.deepEqual(itemFieldNames(gsId, 'Armas'), [
    'category', 'governing_skill', 'damage', 'traits', 'damage_type', 'expertise_traits', 'weight', 'cost',
  ]);
  assert.deepEqual(itemFieldNames(gsId, 'Equipo'), [
    'category', 'cost', 'weight', 'deflect', 'traits', 'expertise_traits',
  ]);

  // Los 2 items legacy quedan EXACTAMENTE como estaban (los pregens dependen de ellos).
  const espada = itemValues(gsId, 'Espada larga');
  assert.equal(espada.size, 4, 'la Espada larga conserva solo sus 4 valores legacy');
  assert.equal(espada.get('damage'), '1d8');
  assert.equal(espada.get('traits'), 'Versatil');
  assert.equal(itemValues(gsId, 'Maza pesada').get('damage'), '1d10');

  // Armas de la fuente 04-armas-armaduras.md.
  assert.equal(countItemsByFieldValue(gsId, 'Armas', 'category', 'light'), 7); // 6 + Espada larga legacy
  assert.equal(countItemsByFieldValue(gsId, 'Armas', 'category', 'heavy'), 6); // 5 + Maza pesada legacy
  const longsword = itemValues(gsId, 'Longsword');
  assert.equal(longsword.get('damage_type'), 'Keen');
  assert.equal(longsword.get('cost'), '60 mk');
  assert.equal(longsword.get('expertise_traits'), 'Pierde Two-Handed');

  // Equipo: armaduras (con deflect) + secciones de equipo del MD 06.
  assert.equal(countItemsByFieldValue(gsId, 'Equipo', 'category', 'Armadura'), 6);
  assert.equal(itemValues(gsId, 'Full Plate').get('deflect'), '4');
  assert.equal(itemValues(gsId, 'Rope (50 feet)').get('cost'), '30 mk');
  const equipoNames = new Set(
    db.prepare(
      `SELECT im.name AS n FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id
       WHERE itf.game_system_id = ? AND itf.name = 'Equipo'`
    ).all(gsId).map((r) => r.n)
  );
  for (const name of [
    'Surgical Supplies', 'Poison (potent, 1 dose)', 'Spyglass', 'Lantern (sphere)',
    'Clothing (fine)', 'Food (ration, 1 day)', 'Waterskin', 'Ink Pen', 'Whetstone',
  ]) {
    assert.ok(equipoNames.has(name), `item de equipo presente: ${name}`);
  }

  // Sin duplicados de nombre en TODO el catálogo de items del sistema (Armas + Equipo).
  const dup = db.prepare(
    `SELECT COUNT(*) AS n FROM (
       SELECT im.name FROM item_masters im JOIN item_formats itf ON itf.id = im.format_id
       WHERE itf.game_system_id = ? GROUP BY im.name HAVING COUNT(*) > 1)`
  ).get(gsId).n;
  assert.equal(dup, 0, 'no hay items duplicados por nombre');
});

test('los pregens del Puente Nueve sobreviven al seed con sus enlaces e inventario', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));

  const before = db.prepare(
    `SELECT bc.name AS name, COUNT(l.skill_id) AS links
     FROM base_characters bc
     LEFT JOIN base_character_skill_links l ON l.base_character_id = bc.id
     WHERE bc.game_system_id = ? GROUP BY bc.id ORDER BY bc.name`
  ).all(gsId);
  assert.equal(before.length, 6, 'los 6 pregens se importaron');

  seedStormlightCatalog(db, pack);

  const after = db.prepare(
    `SELECT bc.name AS name, COUNT(l.skill_id) AS links
     FROM base_characters bc
     LEFT JOIN base_character_skill_links l ON l.base_character_id = bc.id
     WHERE bc.game_system_id = ? GROUP BY bc.id ORDER BY bc.name`
  ).all(gsId);
  assert.deepEqual(after, before, 'el seed no altera pregens ni sus skill_links');

  // Los enlaces siguen apuntando a las skills del formato legacy, no a talentos homónimos.
  const abenaLinks = db.prepare(
    `SELECT s.name AS skill, sf.name AS format
     FROM base_characters bc
     JOIN base_character_skill_links l ON l.base_character_id = bc.id
     JOIN skills s ON s.id = l.skill_id
     JOIN skill_formats sf ON sf.id = s.format_id
     WHERE bc.game_system_id = ? AND bc.name = 'Abena' ORDER BY s.name`
  ).all(gsId);
  assert.deepEqual(abenaLinks.map((r) => r.format), ['Stormlight Skills', 'Stormlight Skills', 'Stormlight Skills']);

  const inv = db.prepare(
    `SELECT COUNT(*) AS n FROM base_character_inventory i
     JOIN base_characters bc ON bc.id = i.base_character_id WHERE bc.game_system_id = ?`
  ).get(gsId).n;
  assert.equal(inv, pack.base_characters.reduce((n, bc) => n + bc.inventory.length, 0));
});

test('es idempotente: dos corridas dejan el mismo estado', () => {
  const pack = loadPack();
  const gsId = importGamePack(db, dmId, makeLegacyPack(pack));

  const countValues = () => ({
    skills: db.prepare(
      `SELECT COUNT(*) AS n FROM skill_field_values v JOIN skills sk ON sk.id = v.skill_id
       JOIN skill_formats sf ON sf.id = sk.format_id WHERE sf.game_system_id = ?`
    ).get(gsId).n,
    items: db.prepare(
      `SELECT COUNT(*) AS n FROM item_master_values v JOIN item_masters im ON im.id = v.item_id
       JOIN item_formats itf ON itf.id = im.format_id WHERE itf.game_system_id = ?`
    ).get(gsId).n,
  });

  const first = seedStormlightCatalog(db, pack);
  const stateAfter1 = countEntities(gsId);
  const valuesAfter1 = countValues();

  const second = seedStormlightCatalog(db, pack);

  assert.deepEqual(countEntities(gsId), stateAfter1, 'los conteos no cambian en la 2ª corrida');
  assert.deepEqual(countValues(), valuesAfter1, 'los valores de fields no se duplican');
  assert.ok(first.perSystem[0].skills.inserted > 0);
  assert.ok(first.perSystem[0].items.inserted > 0);
  assert.equal(second.perSystem[0].skills.inserted, 0);
  assert.equal(second.perSystem[0].items.inserted, 0);
  assert.equal(second.perSystem[0].skills.valuesInserted, 0);
  assert.equal(second.perSystem[0].items.valuesInserted, 0);

  // Tampoco se duplican formatos ni fields al reejecutar.
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM skill_formats WHERE game_system_id = ?').get(gsId).n,
    pack.skill_formats.length
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM item_formats WHERE game_system_id = ?').get(gsId).n,
    pack.item_formats.length
  );
  assert.deepEqual(itemFieldNames(gsId, 'Equipo'), ['category', 'cost', 'weight', 'deflect', 'traits', 'expertise_traits']);
});

test('alcanza AMBOS sistemas Stormlight (todos los DMs) y no toca Dragonbane', () => {
  const pack = loadPack();
  const gs1 = importGamePack(db, dmId, makeLegacyPack(pack));
  const gs2 = importGamePack(db, dmId2, makeLegacyPack(pack)); // copia per-DM del mismo nombre

  // Sistema ajeno con otro nombre (en la DB real, Dragonbane son los systems 4 y 6).
  const otherPack = makeLegacyPack(pack);
  otherPack.name = 'Dragonbane';
  const gsOther = importGamePack(db, dmId, otherPack);
  const otherBefore = countEntities(gsOther);

  const res = seedStormlightCatalog(db, pack);
  assert.equal(res.systemsSeeded, 2, 'alcanza los dos sistemas Stormlight');

  const expected = expectedTotals(pack);
  assert.deepEqual(countEntities(gs1), expected);
  assert.deepEqual(countEntities(gs2), expected);
  assert.equal(countSkillsInFormat(gs1, 'Talentos'), 90);
  assert.equal(countSkillsInFormat(gs2, 'Talentos'), 90);
  assert.equal(countItemsInFormat(gs2, 'Equipo'), 76);

  // Dragonbane quedó intacto: ni entidades nuevas ni formatos nuevos.
  assert.deepEqual(countEntities(gsOther), otherBefore);
  assert.equal(countSkillsInFormat(gsOther, 'Talentos'), 0);
  assert.equal(countItemsInFormat(gsOther, 'Equipo'), 0);
  assert.deepEqual(itemFieldNames(gsOther, 'Armas'), ['category', 'governing_skill', 'damage', 'traits']);
});

test('no crea el sistema si no existe: solo enriquece los existentes', () => {
  const pack = loadPack();
  const res = seedStormlightCatalog(db, pack);
  assert.equal(res.systemsSeeded, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_system_templates').get().n, 0);
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'node:fs';

// vec0/FTS necesitan un archivo real (ver LEARNINGS): usamos DB temporal. DB_PATH debe
// fijarse ANTES de importar db/index.js.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-seed-'));
process.env.DB_PATH = join(tmpDir, 'seed-test.db');

const __dirname = dirname(fileURLToPath(import.meta.url));

// Misma resolución que el seed: env → /app/game-packs (montado en Docker) → repo local.
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

let db, dbModule;
let importGamePack, ingestDoc;
let setEmbeddingProvider, EMBEDDING_DIMS;

// Stub determinista de embeddings (mismo patrón que rag.test.js): sin red, 768 dims.
function makeDeterministicEmbedding(text, dims) {
  const v = new Array(dims).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}
async function stubProvider(texts) {
  return texts.map((t) => makeDeterministicEmbedding(t, EMBEDDING_DIMS));
}

// Lee un pack real del repo.
function loadPack(file) {
  return JSON.parse(readFileSync(join(packsDir, file), 'utf8'));
}

// Reproduce la lógica idempotente del seed: importa solo si el sistema (nombre+DM) no
// existe. Devuelve el id del sistema.
function ensureSystem(dmId, pack) {
  const existing = db
    .prepare('SELECT id FROM game_system_templates WHERE name = ? AND dm_id = ?')
    .get(pack.name, dmId);
  if (existing) return existing.id;
  return importGamePack(db, dmId, pack);
}

// Reproduce ensureDoc del seed: reusa la fila game_docs existente (por título) — la que el
// import creó como metadato — para que la ingesta sea idempotente y no duplique docs.
function ensureDoc(gameSystemId, title, content) {
  const existing = db
    .prepare('SELECT id FROM game_docs WHERE game_system_id = ? AND title = ?')
    .get(gameSystemId, title);
  return ingestDoc({ gameSystemId, title, content, docId: existing?.id ?? null });
}

let dmId;

before(async () => {
  dbModule = await import('../src/db/index.js');
  db = dbModule.default;
  ({ importGamePack } = await import('../src/services/gamePack.js'));
  ({ ingestDoc } = await import('../src/services/rag.js'));
  ({ setEmbeddingProvider, EMBEDDING_DIMS } = await import('../src/services/embeddings.js'));
});

beforeEach(() => {
  for (const row of db.prepare('SELECT id FROM game_docs').all()) {
    db.prepare('DELETE FROM game_docs WHERE id = ?').run(row.id);
  }
  db.exec('DELETE FROM doc_chunks;');
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
  setEmbeddingProvider(stubProvider);
  dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
});

test('el seed importa ambos sistemas de ejemplo', () => {
  const storm = ensureSystem(dmId, loadPack('stormlight.json'));
  const dragon = ensureSystem(dmId, loadPack('dragonbane.json'));
  assert.ok(storm > 0 && dragon > 0);
  const names = db
    .prepare('SELECT name FROM game_system_templates WHERE dm_id = ? ORDER BY name')
    .all(dmId)
    .map((r) => r.name);
  assert.deepEqual(names, ['Dragonbane', 'Stormlight RPG']);
});

test('crea los 6 pregens de Bridge Nine con atributos y skills', () => {
  const storm = ensureSystem(dmId, loadPack('stormlight.json'));
  const pregens = db
    .prepare('SELECT id, name FROM base_characters WHERE game_system_id = ? ORDER BY name')
    .all(storm);
  assert.equal(pregens.length, 6, 'los 6 de Bridge Nine');
  assert.deepEqual(
    pregens.map((p) => p.name),
    ['Abena', 'Jomari', 'Palinor', 'Talani', 'Vedd', 'Zvynda']
  );

  // Un pregen concreto tiene atributos ligados a plantilla y skills con rank.
  const abena = pregens.find((p) => p.name === 'Abena');
  const attrs = db
    .prepare('SELECT * FROM base_character_attrs WHERE base_character_id = ?')
    .all(abena.id);
  assert.ok(attrs.length >= 13, 'tiene sus atributos');
  const strength = attrs.find((a) => a.attr_name === 'Strength');
  assert.equal(strength.value, '2');
  // El attr quedó ligado a la plantilla del sistema (clave para "adopt").
  assert.ok(strength.attribute_template_id, 'atributo ligado a attribute_template_id');

  const skills = db
    .prepare(
      `SELECT s.name, l.rank FROM base_character_skill_links l
       JOIN skills s ON s.id = l.skill_id
       WHERE l.base_character_id = ? ORDER BY s.name`
    )
    .all(abena.id);
  assert.equal(skills.length, 3);
  const lw = skills.find((s) => s.name === 'Light Weaponry');
  assert.equal(lw.rank, 2);
});

test('Dragonbane trae pregens coherentes con skills enlazadas', () => {
  const dragon = ensureSystem(dmId, loadPack('dragonbane.json'));
  const pregens = db
    .prepare('SELECT id, name FROM base_characters WHERE game_system_id = ?')
    .all(dragon);
  assert.ok(pregens.length >= 1 && pregens.length <= 2, '1–2 pregens');
  const links = db
    .prepare(
      `SELECT COUNT(*) AS n FROM base_character_skill_links l
       JOIN base_characters bc ON bc.id = l.base_character_id
       WHERE bc.game_system_id = ?`
    )
    .get(dragon).n;
  assert.ok(links > 0, 'los pregens tienen skills enlazadas');
});

test('ingiere la guía de Stormlight como doc con chunks y FTS', async () => {
  const storm = ensureSystem(dmId, loadPack('stormlight.json'));
  const content = readFileSync(
    join(packsDir, 'docs/stormlight/STORMLIGHT_RPG_GUIDE.md'),
    'utf8'
  );
  const result = await ensureDoc(storm, 'Stormlight RPG — Guia Completa', content);
  assert.ok(result.reindexed);
  assert.ok(result.chunks > 5, 'la guía produce varios chunks');
  // La ingesta reusa la fila que el import creó como metadato → no hay doc duplicado.
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_docs').get().n, 1);

  const nChunks = db
    .prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?')
    .get(result.docId).n;
  assert.equal(nChunks, result.chunks);

  if (dbModule.ftsEnabled) {
    const nFts = db
      .prepare(
        `SELECT COUNT(*) AS n FROM doc_chunks_fts f
         JOIN doc_chunks dc ON dc.id = f.rowid WHERE dc.doc_id = ?`
      )
      .get(result.docId).n;
    assert.equal(nFts, result.chunks, 'cada chunk quedó en FTS');
  }
});

test('el seed es idempotente: una segunda corrida no duplica', async () => {
  const storm1 = ensureSystem(dmId, loadPack('stormlight.json'));
  const content = readFileSync(
    join(packsDir, 'docs/stormlight/STORMLIGHT_RPG_GUIDE.md'),
    'utf8'
  );
  await ensureDoc(storm1, 'Stormlight RPG — Guia Completa', content);

  // Segunda corrida: ensureSystem NO reimporta (mismo nombre+DM); ensureDoc reusa docId.
  const storm2 = ensureSystem(dmId, loadPack('stormlight.json'));
  assert.equal(storm2, storm1, 'no se creó un segundo sistema');

  const doc2 = await ensureDoc(storm2, 'Stormlight RPG — Guia Completa', content);
  assert.equal(doc2.reindexed, false, 'sin cambios → no reingiere');

  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM game_system_templates WHERE dm_id = ?').get(dmId).n,
    1
  );
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM base_characters WHERE game_system_id = ?').get(storm2).n,
    6,
    'los pregens no se duplican'
  );
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM game_docs').get().n, 1);
});

test('ingesta resiliente: sin proveedor de embeddings deja doc + chunks + FTS', async (t) => {
  // Con vec activo, la ingesta intentaría embeber; simulamos "sin Ollama" haciendo que el
  // provider lance. Si vec NO está disponible en este entorno, ingestDoc ni siquiera lo
  // llama y el resultado es el mismo: doc + chunks + FTS presentes.
  const storm = ensureSystem(dmId, loadPack('stormlight.json'));
  const content = readFileSync(
    join(packsDir, 'docs/stormlight/STORMLIGHT_RPG_GUIDE.md'),
    'utf8'
  );

  if (dbModule.vecEnabled) {
    setEmbeddingProvider(async () => {
      throw new Error('Proveedor de embeddings no disponible (ollama): fetch failed');
    });
    // Con vec activo la ingesta requiere embeddings; sin proveedor lanza SIN dejar basura.
    await assert.rejects(
      () => ingestDoc({ gameSystemId: storm, title: 'Guia sin embeddings', content }),
      /no disponible|fetch failed/
    );
    const huerfano = db
      .prepare('SELECT id FROM game_docs WHERE title = ?')
      .get('Guia sin embeddings');
    assert.equal(huerfano, undefined, 'no queda game_docs huérfano sin chunks');
    setEmbeddingProvider(stubProvider);
    return;
  }

  // Sin vec: la ingesta NO depende de embeddings → doc + chunks + FTS quedan listos.
  const result = await ingestDoc({ gameSystemId: storm, title: 'Guia sin embeddings', content });
  assert.ok(result.chunks > 0, 'chunks presentes sin embeddings');
  const n = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(result.docId).n;
  assert.equal(n, result.chunks);
  return t.diagnostic('vec deshabilitado en este entorno: ingesta sin embeddings verificada');
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// DB en archivo temporal (vec0/FTS reales). DB_PATH antes de importar db/index.js.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-aitools-'));
process.env.DB_PATH = join(tmpDir, 'aitools-test.db');

let db;
let TOOLS, TOOL_SCHEMAS, executeTool;
let ingestDoc, setEmbeddingProvider, EMBEDDING_DIMS;
let dmId, systemId, sessionId;

function deterministicEmbedding(text, dims) {
  const v = new Array(dims).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

before(async () => {
  db = (await import('../db/index.js')).default;
  ({ TOOLS, TOOL_SCHEMAS, executeTool } = await import('./aiTools.js'));
  ({ ingestDoc } = await import('./rag.js'));
  ({ setEmbeddingProvider, EMBEDDING_DIMS } = await import('./embeddings.js'));
  setEmbeddingProvider(async (texts) => texts.map((t) => deterministicEmbedding(t, EMBEDDING_DIMS)));
});

beforeEach(() => {
  db.exec(`
    DELETE FROM session_events;
    DELETE FROM session_characters;
    DELETE FROM characters;
    DELETE FROM game_docs;
    DELETE FROM doc_chunks;
    DELETE FROM sessions;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm','x','dm')").run().lastInsertRowid;
  systemId = db
    .prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Sistema', dmId).lastInsertRowid;
  sessionId = db
    .prepare('INSERT INTO sessions (name, dm_id) VALUES (?, ?)')
    .run('Sesión 1', dmId).lastInsertRowid;
});

test('los esquemas de tools cubren las cinco tools esperadas', () => {
  const names = TOOL_SCHEMAS.map((s) => s.function.name).sort();
  assert.deepEqual(names, [
    'get_character',
    'get_event_history',
    'get_session_state',
    'get_stats',
    'retrieve_rules',
  ]);
  // Cada nombre del esquema tiene su handler registrado.
  for (const name of names) assert.equal(typeof TOOLS[name], 'function', `${name} tiene handler`);
});

test('retrieve_rules devuelve chunks citados de las reglas ingeridas', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });
  const out = await executeTool('retrieve_rules', { query: 'iniciativa' }, { gameSystemId: systemId });
  assert.ok(out.chunks.length > 0);
  assert.match(out.chunks[0].heading_path, /Iniciativa/);
});

test('executeTool fusiona el contexto de scope por encima de los args del modelo', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Reglas\n\n## Salud\nPuntos de vida.',
  });
  // El modelo "propone" otro gameSystemId, pero el contexto de la mesa manda.
  const out = await executeTool(
    'retrieve_rules',
    { query: 'salud', gameSystemId: 999999 },
    { gameSystemId: systemId }
  );
  assert.ok(out.chunks.length > 0, 'usó el gameSystemId del contexto, no el del modelo');
});

test('get_character devuelve ficha estructurada con atributos', () => {
  const charId = db
    .prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(dmId, 'Kaladin', systemId).lastInsertRowid;
  const character = TOOLS.get_character({ id: charId });
  assert.equal(character.name, 'Kaladin');
  assert.ok(Array.isArray(character.attributes));
  assert.ok(Array.isArray(character.skills));
  assert.ok(Array.isArray(character.inventory));
});

test('get_character devuelve null si el personaje no existe', () => {
  assert.equal(TOOLS.get_character({ id: 999999 }), null);
});

test('get_session_state y get_event_history reflejan la sesión', () => {
  const charId = db
    .prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(dmId, 'Shallan', systemId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charId);
  db.prepare(
    "INSERT INTO session_events (session_id, type, actor_id, payload) VALUES (?, 'encounter', ?, ?)"
  ).run(sessionId, dmId, JSON.stringify({ title: 'Emboscada' }));

  const state = TOOLS.get_session_state({ sessionId });
  assert.equal(state.session.name, 'Sesión 1');
  assert.equal(state.characters.length, 1);

  const history = TOOLS.get_event_history({ sessionId });
  assert.equal(history.events.length, 1);
  assert.equal(history.events[0].payload.title, 'Emboscada');
});

test('get_stats enruta por scope y rechaza scope inválido', () => {
  const sessionStats = TOOLS.get_stats({ scope: 'session', id: sessionId });
  assert.equal(sessionStats.session_id, sessionId);
  assert.throws(() => TOOLS.get_stats({ scope: 'galaxia', id: 1 }), /no soportado/);
});

test('executeTool lanza en tool desconocida', async () => {
  await assert.rejects(() => executeTool('inexistente', {}), /desconocida/);
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

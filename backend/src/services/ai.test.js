import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// DB en archivo temporal (vec0/FTS reales). DB_PATH antes de importar db/index.js.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-ai-'));
process.env.DB_PATH = join(tmpDir, 'ai-test.db');

let db;
let answerRulesQuestion, summarizeSession, getSessionSummary, getSessionState, setLlmClient;
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
  ({ answerRulesQuestion, summarizeSession, getSessionSummary, getSessionState, setLlmClient } =
    await import('./ai.js'));
  ({ ingestDoc } = await import('./rag.js'));
  ({ setEmbeddingProvider, EMBEDDING_DIMS } = await import('./embeddings.js'));
  setEmbeddingProvider(async (texts) => texts.map((t) => deterministicEmbedding(t, EMBEDDING_DIMS)));
});

beforeEach(() => {
  db.exec(`
    DELETE FROM session_summaries;
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

test('answerRulesQuestion devuelve respuesta + citas usando reglas recuperadas', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });

  // Stub: el LLM recibe un prompt que YA incluye las reglas; devolvemos texto fijo.
  let receivedPrompt = '';
  setLlmClient(async (prompt) => {
    receivedPrompt = prompt;
    return 'La iniciativa se tira con agilidad.';
  });

  const result = await answerRulesQuestion({ query: 'cómo funciona la iniciativa', gameSystemId: systemId });
  assert.equal(result.answer, 'La iniciativa se tira con agilidad.');
  assert.ok(result.citations.length > 0, 'incluye citas');
  assert.match(result.citations[0].heading_path, /Iniciativa/);
  assert.match(receivedPrompt, /REGLAS RECUPERADAS/, 'el prompt lleva contexto estructurado');

  setLlmClient(null);
});

test('summarizeSession guarda el resumen en session_summaries', async () => {
  db.prepare(
    "INSERT INTO session_events (session_id, type, actor_id, payload) VALUES (?, 'encounter', ?, ?)"
  ).run(sessionId, dmId, JSON.stringify({ title: 'Emboscada', description: 'Goblins atacan' }));

  setLlmClient(async () => 'Resumen: los héroes sobrevivieron a una emboscada de goblins.');

  const summary = await summarizeSession(sessionId);
  assert.match(summary.body, /emboscada/i);

  const stored = getSessionSummary(sessionId);
  assert.equal(stored.body, summary.body);
  assert.equal(stored.session_id, sessionId);

  setLlmClient(null);
});

test('getSessionState arma estado estructurado de personajes', () => {
  const charId = db
    .prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(dmId, 'Kaladin', systemId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charId);

  const state = getSessionState(sessionId);
  assert.equal(state.session.name, 'Sesión 1');
  assert.equal(state.characters.length, 1);
  assert.equal(state.characters[0].name, 'Kaladin');
});

test('summarizeSession lanza error claro si la sesión no existe', async () => {
  await assert.rejects(() => summarizeSession(999999), /no encontrada/);
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

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
let streamRulesQuestion, setLlmStreamClient, getAiStatus;
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
  ({
    answerRulesQuestion, summarizeSession, getSessionSummary, getSessionState, setLlmClient,
    streamRulesQuestion, setLlmStreamClient, getAiStatus,
  } = await import('./ai.js'));
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
  // Contrato canónico: { answer, sources: [{ doc_title, heading_path, snippet }] }.
  assert.ok(result.sources.length > 0, 'incluye fuentes');
  assert.match(result.sources[0].heading_path, /Iniciativa/);
  assert.ok(result.sources[0].snippet.length > 0, 'la fuente incluye un snippet');
  assert.deepEqual(result.citations, result.sources, 'citations es alias de sources');
  assert.match(receivedPrompt, /REGLAS RECUPERADAS/, 'el prompt lleva contexto estructurado');

  setLlmClient(null);
});

test('streamRulesQuestion emite tokens y devuelve respuesta + fuentes', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });

  // Stub de streaming: emite la respuesta en fragmentos (simula tokens del LLM).
  setLlmStreamClient(async function* () {
    yield 'La iniciativa ';
    yield 'se tira ';
    yield 'con agilidad.';
  });

  const tokens = [];
  const result = await streamRulesQuestion(
    { query: 'cómo funciona la iniciativa', gameSystemId: systemId },
    (t) => tokens.push(t)
  );

  assert.equal(tokens.length, 3, 'llegaron tres tokens');
  assert.equal(result.answer, 'La iniciativa se tira con agilidad.');
  assert.ok(result.sources.length > 0, 'incluye fuentes citadas');
  assert.match(result.sources[0].heading_path, /Iniciativa/);

  setLlmStreamClient(null);
});

test('streamRulesQuestion cae al cliente no-streaming si no hay stream', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Reglas\n\n## Salud\nLos personajes tienen puntos de vida.',
  });

  // Sin stream client (null) y con un LLM no-streaming: debe degradar a un solo token.
  setLlmStreamClient(null);
  setLlmClient(async () => 'Los PJ tienen puntos de vida.');

  const tokens = [];
  const result = await streamRulesQuestion(
    { query: 'puntos de vida', gameSystemId: systemId },
    (t) => tokens.push(t)
  );

  assert.equal(result.answer, 'Los PJ tienen puntos de vida.');
  assert.equal(tokens.length, 1, 'fallback emite la respuesta como un solo token');

  setLlmClient(null);
});

test('getAiStatus reporta motor y disponibilidad (probe con stub)', async () => {
  setLlmClient(async () => 'ok');
  // probeEmbeddings usa el provider stub inyectado en before(): responde 768 dims.
  const status = await getAiStatus({ vecEnabled: true, ftsEnabled: true, probe: true });
  assert.ok(status.provider, 'incluye el proveedor activo');
  assert.equal(status.vecEnabled, true);
  assert.equal(status.ftsEnabled, true);
  assert.equal(status.llm.ok, true, 'el LLM stub responde');
  assert.equal(status.embeddings.ok, true, 'los embeddings stub responden');
  assert.equal(status.ready, true);

  // probe:false no toca la red y omite los sondeos.
  const light = await getAiStatus({ vecEnabled: true, ftsEnabled: false, probe: false });
  assert.equal(light.llm, undefined, 'sin probe no hay sondeo de LLM');
  assert.equal(light.ftsEnabled, false);

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

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync } from 'node:fs';

// DB en archivo temporal (vec0/FTS reales). DB_PATH antes de importar db/index.js.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-presets-'));
process.env.DB_PATH = join(tmpDir, 'presets-test.db');

let db;
let streamSessionPreset, getCampaignSummaries, getSessionInventories, SESSION_PRESET_KEYS;
let setLlmStreamClient, streamRulesQuestion, setEmbeddingProvider, EMBEDDING_DIMS, ingestDoc;
let dmId, playerId, systemId, campaignId, sessionId, charId;

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
    streamSessionPreset, getCampaignSummaries, getSessionInventories, SESSION_PRESET_KEYS,
    setLlmStreamClient, streamRulesQuestion,
  } = await import('./ai.js'));
  ({ setEmbeddingProvider, EMBEDDING_DIMS } = await import('./embeddings.js'));
  ({ ingestDoc } = await import('./rag.js'));
  setEmbeddingProvider(async (texts) => texts.map((t) => deterministicEmbedding(t, EMBEDDING_DIMS)));
});

beforeEach(() => {
  db.exec(`
    DELETE FROM session_summaries;
    DELETE FROM session_events;
    DELETE FROM character_inventory;
    DELETE FROM session_characters;
    DELETE FROM characters;
    DELETE FROM game_docs;
    DELETE FROM doc_chunks;
    DELETE FROM sessions;
    DELETE FROM campaigns;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm','x','dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1','x','player')").run().lastInsertRowid;
  systemId = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)').run('Sistema', dmId).lastInsertRowid;
  campaignId = db.prepare('INSERT INTO campaigns (name, dm_id, game_system_id) VALUES (?, ?, ?)')
    .run('Campaña', dmId, systemId).lastInsertRowid;
  sessionId = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id) VALUES (?, ?, ?)')
    .run('Sesión actual', dmId, campaignId).lastInsertRowid;
  charId = db.prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(playerId, 'Kaladin', systemId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charId);
});

test('SESSION_PRESET_KEYS expone los cuatro presets', () => {
  assert.deepEqual([...SESSION_PRESET_KEYS].sort(), ['cronologia', 'estado', 'inventarios', 'resumen']);
});

test('streamSessionPreset(inventarios) arma contexto desde inventario estructurado', async () => {
  db.prepare('INSERT INTO character_inventory (character_id, item_name, quantity) VALUES (?, ?, ?)')
    .run(charId, 'Lanza de esquirla', 1);
  db.prepare('INSERT INTO character_inventory (character_id, item_name, quantity) VALUES (?, ?, ?)')
    .run(charId, 'Esferas', 20);

  let received = '';
  setLlmStreamClient(async function* (messages) {
    received = messages.map((m) => m.content).join('\n');
    yield 'Inventario resumido.';
  });

  const result = await streamSessionPreset({ sessionId, preset: 'inventarios' }, () => {});
  assert.equal(result.answer, 'Inventario resumido.');
  assert.match(received, /INVENTARIOS/);
  assert.match(received, /Lanza de esquirla x1/);
  assert.match(received, /Esferas x20/);
  assert.deepEqual(result.sources, []);
  setLlmStreamClient(null);
});

test('streamSessionPreset(estado) incluye a los personajes de la sesión', async () => {
  let received = '';
  setLlmStreamClient(async function* (messages) {
    received = messages.map((m) => m.content).join('\n');
    yield 'Estado listo.';
  });
  const result = await streamSessionPreset({ sessionId, preset: 'estado' }, () => {});
  assert.equal(result.answer, 'Estado listo.');
  assert.match(received, /Kaladin/);
  setLlmStreamClient(null);
});

test('F21: el system prompt de sesión razona sobre datos de sesión y NO menciona documentos', async () => {
  let systemPrompt = '';
  setLlmStreamClient(async function* (messages) {
    const sys = messages.find((m) => m.role === 'system');
    systemPrompt = sys ? sys.content : '';
    yield 'ok';
  });
  await streamSessionPreset({ sessionId, preset: 'resumen' }, () => {});
  assert.match(systemPrompt, /contexto de la sesión/i, 'razona sobre el contexto de sesión');
  assert.doesNotMatch(systemPrompt, /documentos cargados/i, 'nunca habla de documentos cargados');
  assert.match(systemPrompt, /natural/i, 'pide tono natural');
  setLlmStreamClient(null);
});

test('streamSessionPreset con includePrevious inyecta resúmenes de sesiones anteriores', async () => {
  // Sesión anterior cerrada con resumen en la misma campaña.
  const prevSession = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id, status) VALUES (?, ?, ?, ?)')
    .run('Sesión previa', dmId, campaignId, 'closed').lastInsertRowid;
  db.prepare('INSERT INTO session_summaries (session_id, body) VALUES (?, ?)')
    .run(prevSession, 'La comitiva cruzó las Llanuras Quebradas.');

  let received = '';
  setLlmStreamClient(async function* (messages) {
    received = messages.map((m) => m.content).join('\n');
    yield 'ok';
  });
  await streamSessionPreset({ sessionId, preset: 'resumen', includePrevious: true }, () => {});
  assert.match(received, /SESIONES ANTERIORES/);
  assert.match(received, /Llanuras Quebradas/);
  setLlmStreamClient(null);
});

test('streamSessionPreset rechaza un preset desconocido', async () => {
  await assert.rejects(
    () => streamSessionPreset({ sessionId, preset: 'inexistente' }, () => {}),
    /Preset de sesión no soportado/
  );
});

test('getCampaignSummaries excluye la sesión indicada', () => {
  const s2 = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id, status) VALUES (?, ?, ?, ?)')
    .run('Otra', dmId, campaignId, 'closed').lastInsertRowid;
  db.prepare('INSERT INTO session_summaries (session_id, body) VALUES (?, ?)').run(s2, 'resumen 2');
  db.prepare('INSERT INTO session_summaries (session_id, body) VALUES (?, ?)').run(sessionId, 'resumen actual');

  const all = getCampaignSummaries(campaignId);
  assert.equal(all.length, 2);
  const excl = getCampaignSummaries(campaignId, { excludeSessionId: sessionId });
  assert.equal(excl.length, 1);
  assert.equal(excl[0].session_id, s2);
});

test('streamRulesQuestion propaga sectionType al retrieval (topics de sistema)', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });
  setLlmStreamClient(async function* () { yield 'respuesta'; });
  // sectionType válido no rompe la llamada y degrada con elegancia; el objetivo del test
  // es verificar que la firma acepta y no lanza al filtrar por metadato.
  const result = await streamRulesQuestion(
    { query: 'iniciativa', gameSystemId: systemId, sectionType: 'regla' },
    () => {}
  );
  assert.equal(result.answer, 'respuesta');
  setLlmStreamClient(null);
});

test('getSessionInventories devuelve personajes con su inventario', () => {
  db.prepare('INSERT INTO character_inventory (character_id, item_name, quantity) VALUES (?, ?, ?)')
    .run(charId, 'Pan', 3);
  const inv = getSessionInventories(sessionId);
  assert.equal(inv.length, 1);
  assert.equal(inv[0].name, 'Kaladin');
  assert.equal(inv[0].inventory[0].item_name, 'Pan');
});

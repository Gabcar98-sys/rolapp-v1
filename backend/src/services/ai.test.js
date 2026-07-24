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
let setLlmToolsClient, normalizeHistory, resolveTaskConfig, assistPlanning;
let ingestDoc, setEmbeddingProvider, EMBEDDING_DIMS;
let dmId, systemId, sessionId;

// F26: verifica que un system prompt lleve la cláusula de estilo directo compartida
// (empezar por la respuesta = sin preámbulo; cerrar al completar = sin cortesía final).
function assertDirectStyle(prompt, label = '') {
  assert.match(prompt, /directo/i, `${label} pide estilo directo`);
  assert.match(prompt, /abre con la respuesta|empieza (por|con) la respuesta/i, `${label} empieza por la respuesta (sin preámbulo)`);
  assert.match(prompt, /lo que se pregunta/i, `${label} responde solo lo que se pregunta`);
  assert.match(prompt, /frases cortas|listas/i, `${label} usa frases cortas o listas`);
  assert.match(prompt, /por terminada|quede completa/i, `${label} cierra al completar (sin cortesía final)`);
}

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
    setLlmToolsClient, normalizeHistory, resolveTaskConfig, assistPlanning,
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

  // Stub: el LLM recibe mensajes chat que YA incluyen las reglas; devolvemos texto fijo.
  let receivedPrompt = '';
  setLlmClient(async (messages) => {
    receivedPrompt = Array.isArray(messages) ? messages.map((m) => m.content).join('\n') : messages;
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

// ── F12: tool-use, fallback, prompts, follow-ups ──────────────────────────────────

test('tool-loop: el orquestador ejecuta la tool pedida y produce { answer, sources }', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });

  // Activa tool-use por env (el default es OFF).
  process.env.AI_TOOLS_ENABLED = 'true';

  // Stub de tool-use: en la 1ª llamada pide retrieve_rules; en la 2ª (ya con el
  // resultado de la tool en el historial) responde en texto.
  let call = 0;
  const seen = [];
  setLlmToolsClient(async (messages) => {
    call += 1;
    seen.push(messages);
    if (call === 1) {
      return {
        content: '',
        tool_calls: [
          { id: 'c1', name: 'retrieve_rules', arguments: { query: 'iniciativa' } },
        ],
      };
    }
    return { content: 'La iniciativa se tira con agilidad. [Combate > Iniciativa]', tool_calls: [] };
  });

  const result = await answerRulesQuestion({ query: 'cómo funciona la iniciativa', gameSystemId: systemId });

  assert.equal(call, 2, 'el orquestador hizo dos llamadas: pedir tool y responder');
  assert.match(result.answer, /agilidad/);
  assert.ok(result.sources.length > 0, 'las fuentes vienen de la tool retrieve_rules');
  assert.match(result.sources[0].heading_path, /Iniciativa/);
  // La 2ª llamada incluyó un mensaje role:'tool' con el resultado inyectado.
  const secondConvo = seen[1];
  assert.ok(secondConvo.some((m) => m.role === 'tool'), 'el resultado de la tool se inyectó como mensaje tool');

  setLlmToolsClient(null);
  delete process.env.AI_TOOLS_ENABLED;
});

test('fallback: con tools deshabilitadas usa inyección de contexto (comportamiento previo)', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });

  // Sin AI_TOOLS_ENABLED: aunque haya un tools-client inyectado, NO debe usarse.
  delete process.env.AI_TOOLS_ENABLED;
  let toolsCalled = false;
  setLlmToolsClient(async () => {
    toolsCalled = true;
    return { content: 'no debería llamarse', tool_calls: [] };
  });

  let receivedPrompt = '';
  setLlmClient(async (messages) => {
    // En fallback, el prompt es una lista de mensajes con el contexto estructurado.
    receivedPrompt = Array.isArray(messages) ? messages.map((m) => m.content).join('\n') : String(messages);
    return 'La iniciativa se tira con agilidad.';
  });

  const result = await answerRulesQuestion({ query: 'iniciativa', gameSystemId: systemId });
  assert.equal(toolsCalled, false, 'con tools OFF no se invoca el cliente de tools');
  assert.equal(result.answer, 'La iniciativa se tira con agilidad.');
  assert.match(receivedPrompt, /REGLAS RECUPERADAS/, 'usa inyección de contexto');
  assert.ok(result.sources.length > 0);

  setLlmClient(null);
  setLlmToolsClient(null);
});

test('prompts: el system prompt de reglas es directo/factual, cita y no inventa reglas oficiales', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Reglas\n\n## Salud\nLos personajes tienen puntos de vida.',
  });

  let systemPrompt = '';
  setLlmClient(async (messages) => {
    const sys = Array.isArray(messages) ? messages.find((m) => m.role === 'system') : null;
    systemPrompt = sys ? sys.content : String(messages);
    return 'ok';
  });

  await answerRulesQuestion({ query: 'salud', gameSystemId: systemId });
  // F21 (conservado): anti-alucinación + orientación no oficial, sin la frase enlatada.
  assert.match(systemPrompt, /regla oficial/i, 'no presenta como oficial algo sin respaldo');
  assert.match(systemPrompt, /sugerencia NO oficial|no oficial/i, 'ofrece orientación marcada como no oficial');
  assert.doesNotMatch(
    systemPrompt,
    /No encuentro esa información en los documentos cargados/i,
    'ya no lleva la frase enlatada robótica'
  );
  // F26: tono directo y factual; ya NO invita a divagar (conversacional).
  assert.match(systemPrompt, /directa y factual|directo|factual/i, 'pide tono directo y factual');
  assert.doesNotMatch(systemPrompt, /conversacional/i, 'ya no dice "conversacional" (invitaba a divagar)');
  // F26: cláusula de estilo directo compartida (sin preámbulo ni cierre de cortesía).
  assertDirectStyle(systemPrompt, 'reglas:');

  setLlmClient(null);
});

test('F26: los system prompts de resumen y planificación exigen estilo directo', async () => {
  // Resumen: capturamos el system prompt vía summarizeSession.
  db.prepare(
    "INSERT INTO session_events (session_id, type, actor_id, payload) VALUES (?, 'encounter', ?, ?)"
  ).run(sessionId, dmId, JSON.stringify({ title: 'Emboscada', description: 'Goblins atacan' }));
  let summarySystem = '';
  setLlmClient(async (messages) => {
    const sys = messages.find((m) => m.role === 'system');
    summarySystem = sys ? sys.content : '';
    return 'resumen';
  });
  await summarizeSession(sessionId);
  assertDirectStyle(summarySystem, 'resumen:');
  setLlmClient(null);

  // Planificación: capturamos el system prompt vía assistPlanning (sin sistema ni sesión).
  let planningSystem = '';
  setLlmClient(async (messages) => {
    const sys = messages.find((m) => m.role === 'system');
    planningSystem = sys ? sys.content : '';
    return 'idea';
  });
  await assistPlanning({ prompt: 'dame una idea de encuentro' });
  assertDirectStyle(planningSystem, 'planificación:');
  // No perdemos el carácter propositivo de la planificación (F21).
  assert.match(planningSystem, /propón/i, 'planificación sigue proponiendo ideas');
  setLlmClient(null);
});

test('prompts: sin contexto, el prompt de reglas pide ayuda honesta (no rechazo robótico)', async () => {
  // Sin ingerir docs: chunks vacío → la instrucción del mensaje user cambia de tono.
  let userMsg = '';
  setLlmClient(async (messages) => {
    const user = Array.isArray(messages) ? messages.filter((m) => m.role === 'user').pop() : null;
    userMsg = user ? user.content : String(messages);
    return 'ok';
  });

  const result = await answerRulesQuestion({ query: 'algo que no está en las reglas', gameSystemId: systemId });
  assert.equal(result.sources.length, 0, 'no hay fuentes cuando no se recupera nada');
  assert.match(userMsg, /orientación general|no oficial/i, 'pide orientación útil en vez de rechazo seco');
  assert.doesNotMatch(userMsg, /REGLAS RECUPERADAS/, 'sin bloque de reglas cuando no hay contexto');

  setLlmClient(null);
});

test('follow-up: el backend acepta historial y lo incluye acotado en el prompt', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Reglas\n\n## Salud\nLos personajes tienen puntos de vida.',
  });

  let convo = null;
  setLlmClient(async (messages) => {
    convo = messages;
    return 'respuesta de seguimiento';
  });

  const history = [
    { role: 'user', content: '¿Qué son los puntos de vida?' },
    { role: 'assistant', content: 'Son la salud del personaje.' },
  ];
  const result = await answerRulesQuestion({ query: '¿y cómo se recuperan?', gameSystemId: systemId, history });

  assert.equal(result.answer, 'respuesta de seguimiento');
  // El historial (2 turnos) aparece entre el system y la pregunta final.
  const userTurns = convo.filter((m) => m.role === 'user');
  assert.ok(userTurns.length >= 2, 'el historial de usuario se incluyó junto a la nueva pregunta');
  assert.ok(
    convo.some((m) => m.role === 'assistant' && /salud del personaje/.test(m.content)),
    'el turno previo del asistente se incluyó'
  );

  setLlmClient(null);
});

test('normalizeHistory acota turnos y descarta entradas inválidas', () => {
  const many = [];
  for (let i = 0; i < 20; i++) {
    many.push({ role: 'user', content: `q${i}` });
    many.push({ role: 'assistant', content: `a${i}` });
  }
  const norm = normalizeHistory(many);
  assert.ok(norm.length <= 6, 'acota a los últimos turnos (default 6)');
  // Descarta entradas con role/content inválidos.
  const dirty = normalizeHistory([
    { role: 'system', content: 'x' },
    { role: 'user', content: '' },
    { role: 'user', content: 'válido' },
    null,
  ]);
  assert.equal(dirty.length, 1);
  assert.equal(dirty[0].content, 'válido');
  assert.deepEqual(normalizeHistory('no-array'), []);
});

test('resolveTaskConfig respeta env por tarea con fallback al general', () => {
  process.env.AI_TEMPERATURE = '0.5';
  process.env.AI_TEMPERATURE_SUMMARY = '0.1';
  const rules = resolveTaskConfig('rules');
  const summary = resolveTaskConfig('summary');
  assert.equal(rules.temperature, 0.5, 'rules cae al general');
  assert.equal(summary.temperature, 0.1, 'summary usa su env específica');
  assert.ok(rules.model, 'incluye modelo');
  assert.ok(rules.topK > 0 && rules.contextBudget > 0);
  delete process.env.AI_TEMPERATURE;
  delete process.env.AI_TEMPERATURE_SUMMARY;
});

test('F26: rules usa un default de temperatura más bajo, con overrides con prioridad', () => {
  delete process.env.AI_TEMPERATURE;
  delete process.env.AI_TEMPERATURE_RULES;
  // Por default, rules es más determinista (seco) que las tareas creativas.
  const rules = resolveTaskConfig('rules');
  const planning = resolveTaskConfig('planning');
  assert.ok(rules.temperature < planning.temperature, 'rules arranca más bajo que planning');

  // AI_TEMPERATURE_RULES manda sobre el default de la tarea.
  process.env.AI_TEMPERATURE_RULES = '0.9';
  assert.equal(resolveTaskConfig('rules').temperature, 0.9, 'AI_TEMPERATURE_RULES tiene prioridad');
  delete process.env.AI_TEMPERATURE_RULES;

  // AI_TEMPERATURE (general) también manda sobre el default de tarea de rules.
  process.env.AI_TEMPERATURE = '0.5';
  assert.equal(resolveTaskConfig('rules').temperature, 0.5, 'el general manda sobre el default de rules');
  delete process.env.AI_TEMPERATURE;
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

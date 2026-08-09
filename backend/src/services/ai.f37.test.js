import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// F37 — la pregunta libre de modo Sesión debe ver la SESIÓN, no solo el manual.
// DB en archivo temporal (vec0/FTS reales). DB_PATH antes de importar db/index.js.
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-f37-'));
process.env.DB_PATH = join(tmpDir, 'f37-test.db');

let db;
let getEventHistory, eventActorLabel, eventParticipantNames, renderEventLine;
let packEventLines, buildSessionContext, collectSessionNpcs, streamRulesQuestion, setLlmStreamClient;
let registerAiHandlers;
let ingestDoc, setEmbeddingProvider, EMBEDDING_DIMS;
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

// Inserta un evento narrativo en el log append-only tal como lo hace POST /sessions/:id/events.
function logNarrativeEvent(type, payload) {
  return db
    .prepare('INSERT INTO session_events (session_id, type, actor_id, payload) VALUES (?, ?, ?, ?)')
    .run(sessionId, type, dmId, JSON.stringify(payload)).lastInsertRowid;
}

// Captura los `messages` que recibe el LLM en una consulta de pregunta libre.
async function captureAskMessages(args) {
  let captured = null;
  setLlmStreamClient(async function* (messages) {
    captured = messages;
    yield 'ok';
  });
  await streamRulesQuestion(args, () => {});
  setLlmStreamClient(null);
  return captured;
}

// socket falso (mismo patrón que sockets/chat.test.js).
function makeFakeSocket() {
  const handlers = new Map();
  const selfEmits = [];
  return {
    id: 'sock-f37',
    data: {},
    selfEmits,
    on(event, fn) { handlers.set(event, fn); },
    emit(event, payload) { selfEmits.push({ event, payload }); },
    fire(event, payload) {
      const fn = handlers.get(event);
      assert.ok(fn, `no hay handler para ${event}`);
      return fn(payload);
    },
  };
}

before(async () => {
  db = (await import('../db/index.js')).default;
  ({
    getEventHistory, eventActorLabel, eventParticipantNames, renderEventLine,
    packEventLines, buildSessionContext, collectSessionNpcs, streamRulesQuestion, setLlmStreamClient,
  } = await import('./ai.js'));
  ({ registerAiHandlers } = await import('../sockets/ai.js'));
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
    DELETE FROM campaigns;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('DM1','x','dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('Jugador1','x','player')").run().lastInsertRowid;
  systemId = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Stormlight', dmId).lastInsertRowid;
  campaignId = db.prepare('INSERT INTO campaigns (name, dm_id, game_system_id) VALUES (?, ?, ?)')
    .run('Honor', dmId, systemId).lastInsertRowid;
  sessionId = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id) VALUES (?, ?, ?)')
    .run('[DEMO] Asedio de la Torre', dmId, campaignId).lastInsertRowid;
  charId = db.prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(playerId, 'Talani', systemId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charId);
});

// ── (a) renderEvents ya no tira el NPC ni los participantes ───────────────────────

test('F37a: un evento de NPC se atribuye al NPC, no al username del DM', () => {
  const event = {
    type: 'interacción',
    actor: 'DM1',
    payload: {
      title: 'Amaram exige la Esquirla',
      description: 'Amaram promete gloria... y una recompensa que huele a trampa.',
      actor_type: 'npc',
      npc_id: 5,
      npc_name: 'Brightlord Amaram',
    },
  };
  assert.equal(eventActorLabel(event), 'NPC Brightlord Amaram');
  const line = renderEventLine(event);
  assert.match(line, /Brightlord Amaram/, 'el nombre del NPC llega a la línea del prompt');
  assert.ok(!line.startsWith('DM1:'), 'ya no se atribuye al DM que lo disparó');
});

test('F37a: un evento del DM (actor_type dm) sigue atribuyéndose al usuario', () => {
  const event = {
    type: 'historia',
    actor: 'DM1',
    payload: { title: 'Consejo de guerra', actor_type: 'dm', npc_name: '' },
  };
  assert.equal(eventActorLabel(event), 'DM1');
  assert.match(renderEventLine(event), /^DM1: \(historia\) Consejo de guerra$/);
});

test('F37a: los participantes específicos llegan a la línea del evento', () => {
  const event = {
    type: 'exploración',
    actor: 'DM1',
    payload: {
      title: 'El descenso al Abismo',
      participant_type: 'specific',
      participants: [{ id: 4, name: 'Talani' }, { id: 3, name: 'Buenatracio' }],
      location: 'Las Llanuras Quebradas',
      sub_location: 'El Abismo',
    },
  };
  assert.deepEqual(eventParticipantNames(event), ['Talani', 'Buenatracio']);
  const line = renderEventLine(event);
  assert.match(line, /participantes: Talani, Buenatracio/);
  assert.match(line, /Las Llanuras Quebradas › El Abismo/, 'la ubicación se conserva');
});

test('F37a: eventParticipantNames tolera payloads sin participants o con strings', () => {
  assert.deepEqual(eventParticipantNames({ payload: {} }), []);
  assert.deepEqual(eventParticipantNames({ payload: { participants: 'x' } }), []);
  assert.deepEqual(eventParticipantNames({ payload: { participants: ['Ana', null, { name: 'Bo' }] } }), ['Ana', 'Bo']);
  assert.deepEqual(eventParticipantNames({}), []);
});

// ── (a) session_reset fuera del contexto ──────────────────────────────────────────

test('F37a: getEventHistory descarta session_reset junto al resto de ruido', () => {
  logNarrativeEvent('historia', { title: 'Consejo de guerra' });
  for (let i = 0; i < 16; i++) logNarrativeEvent('session_reset', {});
  logNarrativeEvent('session_join', {});
  logNarrativeEvent('session_leave', {});
  logNarrativeEvent('session_end', {});
  logNarrativeEvent('message', { body: 'hola' });
  logNarrativeEvent('combate', { title: 'Emboscada de los Fusionados' });

  const history = getEventHistory(sessionId);
  assert.deepEqual(history.map((e) => e.type), ['historia', 'combate']);
});

// ── (c) presupuesto de tokens propio para los eventos ─────────────────────────────

test('F37c: packEventLines prioriza los eventos recientes y los devuelve en orden', () => {
  const lines = ['a'.repeat(400), 'b'.repeat(400), 'c'.repeat(400)]; // ~100 tokens cada una
  const { lines: kept, omitted } = packEventLines(lines, 250);
  assert.equal(kept.length, 2, 'entran los dos más recientes');
  assert.equal(omitted, 1);
  assert.deepEqual(kept, [lines[1], lines[2]], 'se mantiene el orden cronológico');
});

test('F37c: un presupuesto minúsculo NUNCA recorta el contexto a cero', () => {
  // Riesgo vigilado: si el presupuesto vacía los eventos, el síntoma es idéntico al bug
  // original (todo compila, los tests pasan, el LLM no ve la partida).
  const lines = ['x'.repeat(5000), 'y'.repeat(5000)];
  const { lines: kept, omitted } = packEventLines(lines, 1);
  assert.equal(kept.length, 1, 'siempre sobrevive al menos un evento');
  assert.equal(kept[0], lines[1], 'el que sobrevive es el más reciente');
  assert.equal(omitted, 1);
  assert.deepEqual(packEventLines([], 1), { lines: [], omitted: 0 }, 'sin eventos no inventa nada');
});

test('F37c: buildSessionContext trae estado + eventos y avisa de los omitidos', () => {
  logNarrativeEvent('interacción', {
    title: 'Amaram exige la Esquirla', actor_type: 'npc', npc_id: 5, npc_name: 'Brightlord Amaram',
  });
  logNarrativeEvent('NPC', {
    title: 'Vela trae noticias del frente', actor_type: 'npc', npc_id: 6, npc_name: 'Vela la mensajera',
  });

  const ctx = buildSessionContext(sessionId);
  assert.match(ctx, /ESTADO DE SESIÓN: \[DEMO\] Asedio de la Torre/);
  assert.match(ctx, /Campaña: Honor/);
  assert.match(ctx, /Talani/, 'incluye a los personajes de la sesión');
  assert.match(ctx, /HISTORIAL DE EVENTOS/);
  assert.match(ctx, /NPC Brightlord Amaram/);
  assert.match(ctx, /NPC Vela la mensajera/);

  // Con un presupuesto de 1 token solo cabe el último evento, y se declara el recorte.
  const tight = buildSessionContext(sessionId, { budget: 1 });
  assert.match(tight, /Vela la mensajera/);
  assert.match(tight, /1 eventos anteriores omitidos por espacio/);
});

test('F37c: buildSessionContext degrada a cadena vacía si la sesión no existe', () => {
  assert.equal(buildSessionContext(999999), '');
});

test('F37c: collectSessionNpcs deduplica por nombre y respeta el orden de aparición', () => {
  // El npc_id llega a veces como número y a veces como string desde el frontend: la clave
  // de deduplicación es el NOMBRE, o "Amaram" saldría dos veces en el roster.
  const events = [
    { payload: { actor_type: 'dm', npc_name: '' } },
    { payload: { actor_type: 'npc', npc_id: 5, npc_name: 'Brightlord Amaram' } },
    { payload: { actor_type: 'npc', npc_id: 6, npc_name: 'Vela la mensajera' } },
    { payload: { actor_type: 'npc', npc_id: '5', npc_name: 'Brightlord Amaram' } },
    { payload: { actor_type: 'npc', npc_name: '' } },
    { payload: {} },
  ];
  assert.deepEqual(collectSessionNpcs(events), ['Brightlord Amaram', 'Vela la mensajera']);
  assert.deepEqual(collectSessionNpcs([]), []);
});

test('F37c: el roster de NPCs sobrevive aunque el presupuesto recorte los eventos', () => {
  logNarrativeEvent('interacción', {
    title: 'Amaram exige la Esquirla', actor_type: 'npc', npc_id: 5, npc_name: 'Brightlord Amaram',
  });
  for (let i = 0; i < 5; i++) logNarrativeEvent('historia', { title: `Relleno ${i}`, description: 'x'.repeat(2000) });
  logNarrativeEvent('NPC', {
    title: 'Vela trae noticias', actor_type: 'npc', npc_id: 6, npc_name: 'Vela la mensajera',
  });

  // Con un presupuesto mínimo solo cabe el último evento, pero el roster se calcula sobre
  // TODOS: el NPC más antiguo no puede desaparecer por un recorte de espacio.
  const tight = buildSessionContext(sessionId, { budget: 1 });
  assert.match(tight, /NPCS QUE HAN APARECIDO ===\nBrightlord Amaram, Vela la mensajera/);
  assert.match(tight, /6 eventos anteriores omitidos por espacio/);
});

// ── (b)(c) streamRulesQuestion con y sin sessionId ────────────────────────────────

test('F37c: con sessionId el prompt lleva la sesión ADEMÁS de las reglas, y conserva citas y streaming', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Stormlight — Talentos',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });
  logNarrativeEvent('interacción', {
    title: 'Amaram exige la Esquirla', actor_type: 'npc', npc_id: 5, npc_name: 'Brightlord Amaram',
  });
  logNarrativeEvent('NPC', {
    title: 'Vela trae noticias del frente', actor_type: 'npc', npc_id: 6, npc_name: 'Vela la mensajera',
  });

  setLlmStreamClient(async function* () {
    yield 'Han aparecido ';
    yield 'Brightlord Amaram y Vela la mensajera.';
  });
  const tokens = [];
  const result = await streamRulesQuestion(
    { query: '¿qué NPC han aparecido hoy?', gameSystemId: systemId, sessionId },
    (t) => tokens.push(t)
  );
  assert.equal(tokens.length, 2, 'el streaming token a token sigue intacto');
  assert.equal(result.answer, 'Han aparecido Brightlord Amaram y Vela la mensajera.');
  assert.ok(result.sources.length > 0, 'las citas de reglas siguen presentes');
  assert.deepEqual(result.citations, result.sources);
  setLlmStreamClient(null);

  const messages = await captureAskMessages({
    query: '¿qué NPC han aparecido hoy?', gameSystemId: systemId, sessionId,
  });
  const system = messages.find((m) => m.role === 'system').content;
  const user = messages.at(-1).content;
  assert.match(system, /historial de eventos/i, 'el system prompt nombra el historial como fuente');
  assert.match(system, /manda/i, 'deja claro que la partida manda para preguntas de la partida');
  assert.match(system, /abre con la respuesta/i, 'conserva la cláusula DIRECT_STYLE (F26)');
  assert.match(user, /REGLAS RECUPERADAS/, 'las reglas siguen en el prompt');
  assert.match(user, /ESTADO DE SESIÓN/, 'y ahora también el estado de la sesión');
  assert.match(user, /NPCS QUE HAN APARECIDO ===\nBrightlord Amaram, Vela la mensajera/);
  assert.match(user, /NPC Brightlord Amaram/);
  assert.match(user, /NPC Vela la mensajera/);
  assert.ok(
    user.indexOf('ESTADO DE SESIÓN') > user.indexOf('REGLAS RECUPERADAS'),
    'la sesión va pegada a la pregunta (lo más cercano pesa más en modelos pequeños)'
  );
});

test('F37b: SIN sessionId el prompt es exactamente el de antes (retrocompatible)', async () => {
  logNarrativeEvent('interacción', {
    title: 'Amaram exige la Esquirla', actor_type: 'npc', npc_id: 5, npc_name: 'Brightlord Amaram',
  });

  // Sin reglas ingeridas el bloque de reglas queda vacío: el contenido del mensaje user es
  // comparable BYTE A BYTE con el contrato histórico.
  const messages = await captureAskMessages({ query: 'cómo funciona la iniciativa', gameSystemId: systemId });
  const system = messages.find((m) => m.role === 'system').content;
  const user = messages.at(-1).content;

  assert.match(system, /asistente de reglas de una mesa de rol/, 'sigue usando RULES_SYSTEM');
  assert.doesNotMatch(system, /asistente de mesa del DM/, 'no se cuela el prompt de sesión');
  assert.equal(
    user,
    '=== PREGUNTA ===\ncómo funciona la iniciativa\n\n' +
      'No se recuperaron reglas para esta consulta. Reconoce con naturalidad que eso no ' +
      'aparece en las reglas cargadas y, si puedes, ofrece una orientación general útil ' +
      'marcada claramente como sugerencia NO oficial. No inventes una regla como si fuera ' +
      'oficial ni respondas con una frase enlatada de rechazo.',
    'el prompt sin sesión y sin reglas es idéntico al histórico'
  );
  assert.doesNotMatch(user, /ESTADO DE SESIÓN|HISTORIAL DE EVENTOS|Amaram/, 'la sesión NO se filtra');
});

test('F37b: SIN sessionId y CON reglas, la instrucción histórica no cambia', async () => {
  await ingestDoc({
    gameSystemId: systemId,
    title: 'Core',
    content: '# Combate\n\n## Iniciativa\nLa iniciativa se determina con un dado de agilidad.',
  });
  const messages = await captureAskMessages({ query: 'iniciativa', gameSystemId: systemId });
  const user = messages.at(-1).content;
  assert.ok(user.startsWith('=== REGLAS RECUPERADAS ==='), 'arranca con el bloque de reglas');
  assert.ok(
    user.endsWith(
      '=== PREGUNTA ===\niniciativa\n\n' +
        'Responde la pregunta apoyándote en las reglas recuperadas y cita las secciones entre corchetes.'
    ),
    'cierra con la instrucción histórica, sin bloque de sesión intercalado'
  );
});

test('F37c: un sessionId inexistente degrada al camino de reglas sin lanzar', async () => {
  const messages = await captureAskMessages({ query: 'iniciativa', gameSystemId: systemId, sessionId: 999999 });
  const system = messages.find((m) => m.role === 'system').content;
  assert.match(system, /asistente de reglas de una mesa de rol/, 'vuelve al prompt de reglas');
  assert.doesNotMatch(messages.at(-1).content, /ESTADO DE SESIÓN/);
});

// ── (b) contrato del socket ───────────────────────────────────────────────────────

test('F37b: ai:ask acepta sessionId opcional y lo propaga al servicio', async () => {
  logNarrativeEvent('NPC', {
    title: 'Vela trae noticias del frente', actor_type: 'npc', npc_id: 6, npc_name: 'Vela la mensajera',
  });

  const seen = [];
  setLlmStreamClient(async function* (messages) {
    seen.push(messages.map((m) => m.content).join('\n'));
    yield 'ok';
  });

  // El handler no devuelve su promesa (es un listener de socket): se espera al emit final.
  async function fireAndSettle(socket, payload) {
    const settled = () => socket.selfEmits.some((e) => e.event === 'ai:answer_done' || e.event === 'ai:error');
    socket.fire('ai:ask', payload);
    for (let i = 0; i < 200 && !settled(); i++) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  const withSession = makeFakeSocket();
  registerAiHandlers({}, withSession);
  await fireAndSettle(withSession, {
    requestId: 'r1', query: '¿qué NPC han aparecido?', gameSystemId: systemId, sessionId,
  });

  const withoutSession = makeFakeSocket();
  registerAiHandlers({}, withoutSession);
  await fireAndSettle(withoutSession, {
    requestId: 'r2', query: '¿cómo va la iniciativa?', gameSystemId: systemId,
  });

  assert.ok(
    withSession.selfEmits.some((e) => e.event === 'ai:answer_done' && e.payload.requestId === 'r1'),
    'la consulta con sesión termina en ai:answer_done'
  );
  assert.ok(
    withoutSession.selfEmits.some((e) => e.event === 'ai:answer_done' && e.payload.requestId === 'r2'),
    'la consulta sin sesión sigue funcionando igual'
  );
  assert.equal(seen.length, 2);
  assert.match(seen[0], /Vela la mensajera/, 'con sessionId el prompt lleva la partida');
  assert.doesNotMatch(seen[1], /Vela la mensajera/, 'sin sessionId el prompt NO lleva la partida');

  setLlmStreamClient(null);
});

test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

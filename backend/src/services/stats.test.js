import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — aísla del archivo real. Debe fijarse ANTES
// de importar cualquier módulo que abra la conexión (db/index.js lee DB_PATH al cargar).
process.env.DB_PATH = ':memory:';

let db;
let computeSessionStats, saveSessionStats, getSessionStatsSnapshot;
let computeCampaignStats, computeCharacterStats;
let logEvent;
let createSessionsRouter;

// io falso: las stats no emiten, pero el router de sesiones lo necesita para cerrar.
function makeFakeIo() {
  return { to: () => ({ emit: () => {} }) };
}

function invokeWithParams(router, method, routePath, params, opts = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  assert.ok(layer, `no existe handler ${method.toUpperCase()} ${routePath}`);
  return new Promise((resolve) => {
    const req = { body: opts.body ?? {}, query: opts.query ?? {}, params };
    const res = {
      statusCode: 200,
      status(code) { this.statusCode = code; return this; },
      json(data) { resolve({ status: this.statusCode, data }); return this; },
    };
    layer.route.stack[0].handle(req, res, () => {});
  });
}

before(async () => {
  ({ default: db } = await import('../db/index.js'));
  ({
    computeSessionStats,
    saveSessionStats,
    getSessionStatsSnapshot,
    computeCampaignStats,
    computeCharacterStats,
  } = await import('./stats.js'));
  ({ logEvent } = await import('./events.js'));
  ({ default: createSessionsRouter } = await import('../routes/sessions.js'));
});

let dmId, playerId, campaignId, gameSystemId;

beforeEach(() => {
  db.exec(`
    DELETE FROM session_events;
    DELETE FROM session_stats;
    DELETE FROM session_notes;
    DELETE FROM messages;
    DELETE FROM session_characters;
    DELETE FROM session_members;
    DELETE FROM character_template_attr_values;
    DELETE FROM character_skill_links;
    DELETE FROM character_inventory;
    DELETE FROM characters;
    DELETE FROM skills;
    DELETE FROM skill_formats;
    DELETE FROM attribute_templates;
    DELETE FROM sessions;
    DELETE FROM campaigns;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1', 'x', 'player')").run().lastInsertRowid;
  gameSystemId = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)').run('Sistema', dmId).lastInsertRowid;
  campaignId = db.prepare('INSERT INTO campaigns (name, dm_id) VALUES (?, ?)').run('Campaña', dmId).lastInsertRowid;
});

// Crea una sesión y le vincula dos personajes; devuelve los ids.
function seedSessionWithCharacters() {
  const sessionId = db
    .prepare("INSERT INTO sessions (name, dm_id, campaign_id) VALUES ('S1', ?, ?)")
    .run(dmId, campaignId).lastInsertRowid;
  const charA = db
    .prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(playerId, 'Kaladin', gameSystemId).lastInsertRowid;
  const charB = db
    .prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(playerId, 'Shallan', gameSystemId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charA);
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charB);
  return { sessionId, charA, charB };
}

test('computeSessionStats cuenta duración, categorías, encuentros, NPCs y participación', () => {
  const { sessionId, charA } = seedSessionWithCharacters();

  // Forzamos created_at distintos para validar la duración (primer→último evento).
  db.prepare('INSERT INTO session_events (session_id, type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, 'session_start', dmId, '{}', 1000);
  // Evento de exploración dirigido a toda la mesa, con ubicación.
  db.prepare('INSERT INTO session_events (session_id, type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, 'exploration', dmId, JSON.stringify({
      category: 'exploration', title: 'Llegada', participant_type: 'all', participants: [], location: 'Kholinar',
    }), 1100);
  // Combate específico que incluye a charA.
  db.prepare('INSERT INTO session_events (session_id, type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, 'combate', dmId, JSON.stringify({
      category: 'combate', title: 'Emboscada', participant_type: 'specific', participants: [{ id: charA, name: 'Kaladin' }],
    }), 1200);
  // Evento disparado por un NPC.
  db.prepare('INSERT INTO session_events (session_id, type, actor_id, payload, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(sessionId, 'general', dmId, JSON.stringify({
      category: 'general', title: 'Aparece el mercader', actor_type: 'npc', npc_id: 42, npc_name: 'Mercader',
    }), 1300);

  // Notas y mensajes asociados a la sesión.
  db.prepare("INSERT INTO session_notes (session_id, dm_id, title, body) VALUES (?, ?, 'Nota', 'cuerpo')").run(sessionId, dmId);
  db.prepare('INSERT INTO messages (session_id, from_user_id, body) VALUES (?, ?, ?)').run(sessionId, dmId, 'hola');
  db.prepare('INSERT INTO messages (session_id, from_user_id, body) VALUES (?, ?, ?)').run(sessionId, playerId, 'qué tal');

  const stats = computeSessionStats(db, sessionId);

  assert.equal(stats.event_count, 4);
  assert.equal(stats.duration_seconds, 300, '1300 - 1000');
  assert.equal(stats.events_by_type.combate, 1);
  assert.equal(stats.events_by_category.exploration, 1);
  assert.equal(stats.events_by_category.combate, 1);
  assert.equal(stats.encounters, 1, 'solo el combate cuenta como encuentro');
  assert.equal(stats.npcs_introduced, 1);
  assert.equal(stats.notes_count, 1);
  assert.equal(stats.messages_count, 2);
  assert.equal(stats.character_count, 2);
  assert.equal(stats.all_hands_events, 1);

  // Participación: charA aparece en 1 evento específico; Shallan en 0.
  const kaladin = stats.participation.find((p) => p.character_id === charA);
  assert.ok(kaladin, 'Kaladin está en la participación');
  assert.equal(kaladin.events, 1);
  const shallan = stats.participation.find((p) => p.character_id !== charA);
  assert.equal(shallan.events, 0);
});

test('computeSessionStats con sesión sin eventos no rompe y devuelve stats vacías', () => {
  const sessionId = db
    .prepare("INSERT INTO sessions (name, dm_id) VALUES ('Vacía', ?)")
    .run(dmId).lastInsertRowid;

  const stats = computeSessionStats(db, sessionId);
  assert.equal(stats.event_count, 0);
  assert.equal(stats.duration_seconds, 0);
  assert.equal(stats.encounters, 0);
  assert.equal(stats.npcs_introduced, 0);
  assert.deepEqual(stats.events_by_type, {});
  assert.deepEqual(stats.participation, []);
});

test('computeSessionStats tolera payload JSON corrupto sin lanzar', () => {
  const sessionId = db.prepare("INSERT INTO sessions (name, dm_id) VALUES ('S', ?)").run(dmId).lastInsertRowid;
  db.prepare('INSERT INTO session_events (session_id, type, payload, created_at) VALUES (?, ?, ?, ?)')
    .run(sessionId, 'general', '{no es json', 2000);
  const stats = computeSessionStats(db, sessionId);
  assert.equal(stats.event_count, 1);
  assert.equal(stats.events_by_category.general, 1);
});

test('saveSessionStats hace UPSERT en session_stats (no duplica)', () => {
  const { sessionId } = seedSessionWithCharacters();
  logEvent(sessionId, 'general', dmId, { category: 'general' });

  saveSessionStats(db, sessionId);
  saveSessionStats(db, sessionId);

  const rows = db.prepare('SELECT COUNT(*) AS n FROM session_stats WHERE session_id = ?').get(sessionId);
  assert.equal(rows.n, 1, 'UNIQUE(session_id) → una sola fila');

  const snapshot = getSessionStatsSnapshot(db, sessionId);
  assert.ok(snapshot);
  assert.equal(snapshot.session_id, sessionId);
  assert.ok(snapshot.generated_at > 0);
});

test('cerrar una sesión crea la fila en session_stats', async () => {
  const { sessionId } = seedSessionWithCharacters();
  logEvent(sessionId, 'exploration', dmId, { category: 'exploration' });

  const router = createSessionsRouter(makeFakeIo());
  const res = await invokeWithParams(router, 'patch', '/:id/close', { id: String(sessionId) }, {
    body: { dm_id: dmId },
  });
  assert.equal(res.status, 200);

  const snapshot = getSessionStatsSnapshot(db, sessionId);
  assert.ok(snapshot, 'al cerrar se generó el snapshot');
  assert.ok(snapshot.event_count >= 1);
});

test('computeCampaignStats agrega sesiones, categorías y ubicaciones', () => {
  const { sessionId } = seedSessionWithCharacters();
  db.prepare('INSERT INTO session_events (session_id, type, payload) VALUES (?, ?, ?)')
    .run(sessionId, 'exploration', JSON.stringify({ category: 'exploration', location: 'Urithiru' }));
  db.prepare('INSERT INTO session_events (session_id, type, payload) VALUES (?, ?, ?)')
    .run(sessionId, 'combate', JSON.stringify({ category: 'combate', sub_location: 'Sala del trono' }));

  const stats = computeCampaignStats(db, campaignId);
  assert.equal(stats.sessions_played, 1);
  assert.equal(stats.total_events, 2);
  assert.equal(stats.encounters, 1);
  assert.equal(stats.events_by_category.exploration, 1);
  assert.ok(stats.locations_visited.includes('Urithiru'));
  assert.ok(stats.locations_visited.includes('Sala del trono'));
});

test('computeCharacterStats: skills, atributos, inventario y eventos participados', () => {
  const { sessionId, charA } = seedSessionWithCharacters();

  // Atributo is_core.
  const attrId = db.prepare(
    'INSERT INTO attribute_templates (game_system_id, name, type, is_core, has_max) VALUES (?, ?, ?, 1, 1)'
  ).run(gameSystemId, 'Vida', 'number').lastInsertRowid;
  db.prepare('INSERT INTO character_template_attr_values (character_id, attribute_template_id, value, max_value) VALUES (?, ?, ?, ?)')
    .run(charA, attrId, '8', '10');

  // Skill enlazada con rank.
  const formatId = db.prepare('INSERT INTO skill_formats (dm_id, name) VALUES (?, ?)').run(dmId, 'Formato').lastInsertRowid;
  const skillId = db.prepare('INSERT INTO skills (format_id, dm_id, name) VALUES (?, ?, ?)').run(formatId, dmId, 'Esgrima').lastInsertRowid;
  db.prepare('INSERT INTO character_skill_links (character_id, skill_id, rank) VALUES (?, ?, ?)').run(charA, skillId, 3);

  // Inventario.
  db.prepare('INSERT INTO character_inventory (character_id, item_name, quantity) VALUES (?, ?, ?)').run(charA, 'Espada', 1);

  // Evento que lo incluye (específico).
  db.prepare('INSERT INTO session_events (session_id, type, payload) VALUES (?, ?, ?)')
    .run(sessionId, 'combate', JSON.stringify({ participant_type: 'specific', participants: [{ id: charA, name: 'Kaladin' }] }));
  // Evento a toda la mesa (también lo incluye).
  db.prepare('INSERT INTO session_events (session_id, type, payload) VALUES (?, ?, ?)')
    .run(sessionId, 'exploration', JSON.stringify({ participant_type: 'all' }));

  const stats = computeCharacterStats(db, charA);
  assert.equal(stats.name, 'Kaladin');
  assert.equal(stats.sessions_played, 1);
  assert.equal(stats.skill_count, 1);
  assert.equal(stats.skills[0].rank, 3);
  assert.equal(stats.item_count, 1);
  assert.equal(stats.events_participated, 2, 'el específico + el de toda la mesa');
  const core = stats.attributes.find((a) => a.name === 'Vida');
  assert.ok(core);
  assert.equal(core.is_core, 1);
  assert.equal(core.max_value, '10');
});

test('computeCharacterStats devuelve null si el personaje no existe', () => {
  assert.equal(computeCharacterStats(db, 999999), null);
});

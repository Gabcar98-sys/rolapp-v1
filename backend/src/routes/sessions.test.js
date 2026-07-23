import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — aísla del archivo real. Debe fijarse ANTES
// de importar cualquier módulo que abra la conexión (db/index.js lee DB_PATH al cargar).
process.env.DB_PATH = ':memory:';

let db;
let createSessionsRouter;
let listEvents;

// io falso: captura los emits a rooms para verificar la sincronización por socket.
function makeFakeIo() {
  const emits = [];
  return {
    emits,
    to(room) {
      return {
        emit(event, payload) {
          emits.push({ room, event, payload });
        },
      };
    },
  };
}

// Invoca un handler del router de Express simulando req/res mínimos.
function invoke(router, method, path, { body = {}, query = {} } = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === path && l.route.methods[method]
  );
  assert.ok(layer, `no existe handler ${method.toUpperCase()} ${path}`);

  return new Promise((resolve) => {
    const params = {};
    // Extrae :params del patrón frente al path concreto cuando aplica.
    const req = { body, query, params };
    const res = {
      statusCode: 200,
      status(code) {
        this.statusCode = code;
        return this;
      },
      json(data) {
        resolve({ status: this.statusCode, data });
        return this;
      },
    };
    layer.route.stack[0].handle(req, res, () => {});
  });
}

// Helper que resuelve :params manualmente (Express los pone vía routing real).
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
  ({ default: createSessionsRouter } = await import('./sessions.js'));
  ({ listEvents } = await import('../services/events.js'));
});

let dmId;
let playerId;

beforeEach(() => {
  // Esquema ya aplicado por db/index.js; limpiamos datos entre tests.
  db.exec(`
    DELETE FROM session_events;
    DELETE FROM session_stats;
    DELETE FROM session_summaries;
    DELETE FROM session_characters;
    DELETE FROM characters;
    DELETE FROM session_members;
    DELETE FROM canvas_state;
    DELETE FROM sessions;
    DELETE FROM campaigns;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1', 'x', 'player')").run().lastInsertRowid;
});

test('POST /  crea una sesión activa y al DM como miembro', async () => {
  const io = makeFakeIo();
  const router = createSessionsRouter(io);

  const { status, data } = await invoke(router, 'post', '/', {
    body: { name: 'Mesa 1', dm_id: dmId },
  });

  assert.equal(status, 201);
  assert.equal(data.session.name, 'Mesa 1');
  assert.equal(data.session.status, 'active');

  const member = db
    .prepare('SELECT 1 FROM session_members WHERE session_id = ? AND user_id = ?')
    .get(data.session.id, dmId);
  assert.ok(member, 'el DM debe quedar como miembro');

  // session_start quedó en el log append-only.
  const events = listEvents(data.session.id);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, 'session_start');
});

test('POST /  responde 400 si faltan campos', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { status } = await invoke(router, 'post', '/', { body: { name: 'Sin DM' } });
  assert.equal(status, 400);
});

test('PATCH /:id/close  solo el DM dueño puede cerrar', async () => {
  const io = makeFakeIo();
  const router = createSessionsRouter(io);
  const { data } = await invoke(router, 'post', '/', { body: { name: 'M', dm_id: dmId } });
  const sessionId = data.session.id;

  // Un no-DM (jugador) intenta cerrar → 403.
  const denied = await invokeWithParams(router, 'patch', '/:id/close', { id: String(sessionId) }, {
    body: { dm_id: playerId },
  });
  assert.equal(denied.status, 403);

  // El DM dueño cierra → 200 y emite session:closed.
  const ok = await invokeWithParams(router, 'patch', '/:id/close', { id: String(sessionId) }, {
    body: { dm_id: dmId },
  });
  assert.equal(ok.status, 200);

  const closed = db.prepare('SELECT status FROM sessions WHERE id = ?').get(sessionId);
  assert.equal(closed.status, 'closed');
  assert.ok(io.emits.some((e) => e.event === 'session:closed'));
});

test('POST /:id/events  inserta evento append-only y lo emite', async () => {
  const io = makeFakeIo();
  const router = createSessionsRouter(io);
  const { data } = await invoke(router, 'post', '/', { body: { name: 'M', dm_id: dmId } });
  const sessionId = data.session.id;

  const before = listEvents(sessionId).length;
  const res = await invokeWithParams(router, 'post', '/:id/events', { id: String(sessionId) }, {
    body: { actor_id: dmId, type: 'roll', payload: { dice: 'd20', result: 17 } },
  });

  assert.equal(res.status, 201);
  assert.equal(res.data.event.type, 'roll');

  const events = listEvents(sessionId);
  assert.equal(events.length, before + 1, 'el log solo crece (append-only)');
  assert.ok(io.emits.some((e) => e.event === 'session:event_fired'));
});

test('POST /:id/members  es idempotente', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { data } = await invoke(router, 'post', '/', { body: { name: 'M', dm_id: dmId } });
  const sessionId = data.session.id;

  const first = await invokeWithParams(router, 'post', '/:id/members', { id: String(sessionId) }, {
    body: { user_id: playerId },
  });
  const second = await invokeWithParams(router, 'post', '/:id/members', { id: String(sessionId) }, {
    body: { user_id: playerId },
  });

  assert.equal(first.status, 201);
  assert.equal(second.status, 201);

  const count = db
    .prepare('SELECT COUNT(*) AS n FROM session_members WHERE session_id = ? AND user_id = ?')
    .get(sessionId, playerId);
  assert.equal(count.n, 1, 'no debe duplicar miembros');
});

test('GET /:id  404 si la sesión no existe', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const res = await invokeWithParams(router, 'get', '/:id', { id: '99999' });
  assert.equal(res.status, 404);
});

// ── F8a: coherencia de sistema de juego campaña ↔ personaje ──────────────────

// Crea sistema, campaña (con system opcional), sesión (con campaign opcional) y
// personaje (con system opcional). Devuelve los ids relevantes.
function setupCoherence({ campaignSystem, charSystem, withCampaign = true } = {}) {
  const sysA = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)').run('Sistema A', dmId).lastInsertRowid;
  const sysB = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)').run('Sistema B', dmId).lastInsertRowid;
  const systems = { A: sysA, B: sysB };

  let campaignId = null;
  if (withCampaign) {
    const campSys = campaignSystem ? systems[campaignSystem] : null;
    campaignId = db.prepare('INSERT INTO campaigns (name, dm_id, game_system_id) VALUES (?, ?, ?)')
      .run('Camp', dmId, campSys).lastInsertRowid;
  }
  const sessionId = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id) VALUES (?, ?, ?)')
    .run('Mesa', dmId, campaignId).lastInsertRowid;
  const charSys = charSystem ? systems[charSystem] : null;
  const charId = db.prepare('INSERT INTO characters (user_id, name, game_system_template_id) VALUES (?, ?, ?)')
    .run(playerId, 'Pj', charSys).lastInsertRowid;
  return { sessionId, charId, systems };
}

test('POST /:id/characters  vincula si el sistema del personaje coincide con el de la campaña', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { sessionId, charId } = setupCoherence({ campaignSystem: 'A', charSystem: 'A' });

  const res = await invokeWithParams(router, 'post', '/:id/characters', { id: String(sessionId) }, {
    body: { character_id: charId, user_id: playerId },
  });
  assert.equal(res.status, 201);
});

test('POST /:id/characters  responde 422 si el sistema del personaje NO coincide', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { sessionId, charId } = setupCoherence({ campaignSystem: 'A', charSystem: 'B' });

  const res = await invokeWithParams(router, 'post', '/:id/characters', { id: String(sessionId) }, {
    body: { character_id: charId, user_id: playerId },
  });
  assert.equal(res.status, 422);
  assert.match(res.data.error, /sistema de juego/i);

  const link = db.prepare('SELECT 1 FROM session_characters WHERE session_id = ? AND character_id = ?').get(sessionId, charId);
  assert.ok(!link, 'no debe vincular un personaje incompatible');
});

test('POST /:id/characters  permite cualquier personaje si la campaña no tiene sistema', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { sessionId, charId } = setupCoherence({ campaignSystem: null, charSystem: 'B' });

  const res = await invokeWithParams(router, 'post', '/:id/characters', { id: String(sessionId) }, {
    body: { character_id: charId, user_id: playerId },
  });
  assert.equal(res.status, 201);
});

test('POST /:id/characters  permite cualquier personaje si la sesión no tiene campaña', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const { sessionId, charId } = setupCoherence({ withCampaign: false, charSystem: 'A' });

  const res = await invokeWithParams(router, 'post', '/:id/characters', { id: String(sessionId) }, {
    body: { character_id: charId, user_id: playerId },
  });
  assert.equal(res.status, 201);
});

// ── F14: el listado de sesiones cerradas trae resumen y duración para el historial ──

test('GET /  las cerradas incluyen summary y duration_seconds (y NULL si no existen)', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const withData = db.prepare("INSERT INTO sessions (name, dm_id, status) VALUES ('Con datos', ?, 'closed')").run(dmId).lastInsertRowid;
  const bare = db.prepare("INSERT INTO sessions (name, dm_id, status) VALUES ('Sin datos', ?, 'closed')").run(dmId).lastInsertRowid;
  db.prepare('INSERT INTO session_summaries (session_id, body) VALUES (?, ?)')
    .run(withData, 'El grupo cruzó el vado.');
  db.prepare('INSERT INTO session_stats (session_id, payload) VALUES (?, ?)')
    .run(withData, JSON.stringify({ duration_seconds: 5400 }));
  db.prepare('INSERT INTO session_members (session_id, user_id) VALUES (?, ?)').run(withData, dmId);
  db.prepare('INSERT INTO session_members (session_id, user_id) VALUES (?, ?)').run(withData, playerId);

  const { status, data } = await invoke(router, 'get', '/', { query: { status: 'closed' } });
  assert.equal(status, 200);

  const rich = data.sessions.find((s) => s.id === withData);
  assert.equal(rich.summary, 'El grupo cruzó el vado.');
  assert.equal(rich.duration_seconds, 5400);
  assert.equal(rich.member_count, 2, 'los joins 1:1 no deben inflar el conteo de miembros');

  const empty = data.sessions.find((s) => s.id === bare);
  assert.equal(empty.summary, null);
  assert.equal(empty.duration_seconds, null);
});

// ── F22: la sesión expone el sistema de juego HEREDADO de su campaña ──────────────

test('GET /:id  incluye campaign_game_system_id y campaign_game_system_name de la campaña', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const sysId = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Dragonbane', dmId).lastInsertRowid;
  const campId = db.prepare('INSERT INTO campaigns (name, dm_id, game_system_id) VALUES (?, ?, ?)')
    .run('Camp con sistema', dmId, sysId).lastInsertRowid;
  const sessionId = db.prepare('INSERT INTO sessions (name, dm_id, campaign_id) VALUES (?, ?, ?)')
    .run('Mesa', dmId, campId).lastInsertRowid;

  const res = await invokeWithParams(router, 'get', '/:id', { id: String(sessionId) });
  assert.equal(res.status, 200);
  assert.equal(res.data.session.campaign_game_system_id, sysId);
  assert.equal(res.data.session.campaign_game_system_name, 'Dragonbane');
});

test('GET /:id  sesión sin campaña deja el sistema de juego en NULL', async () => {
  const router = createSessionsRouter(makeFakeIo());
  const sessionId = db.prepare('INSERT INTO sessions (name, dm_id) VALUES (?, ?)')
    .run('Sin campaña', dmId).lastInsertRowid;

  const res = await invokeWithParams(router, 'get', '/:id', { id: String(sessionId) });
  assert.equal(res.status, 200);
  assert.equal(res.data.session.campaign_game_system_id, null);
  assert.equal(res.data.session.campaign_game_system_name, null);
});

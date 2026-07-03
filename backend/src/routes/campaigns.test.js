import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let campaignsRouter;

// Invoca un handler del router resolviendo :params manualmente.
function invoke(router, method, routePath, { params = {}, body = {}, query = {} } = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  assert.ok(layer, `no existe handler ${method.toUpperCase()} ${routePath}`);
  return new Promise((resolve) => {
    const req = { body, query, params };
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
  ({ default: campaignsRouter } = await import('./campaigns.js'));
});

let dmId;
let otherDmId;
let systemId;

beforeEach(() => {
  db.exec(`
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM campaigns;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  otherDmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')").run().lastInsertRowid;
  systemId = db.prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)').run('Sistema A', dmId).lastInsertRowid;
});

test('POST /  guarda game_system_id y lo devuelve con el nombre del sistema', async () => {
  const { status, data } = await invoke(campaignsRouter, 'post', '/', {
    body: { name: 'Campaña A', dm_id: dmId, game_system_id: systemId },
  });
  assert.equal(status, 201);
  assert.equal(data.campaign.game_system_id, systemId);
  assert.equal(data.campaign.game_system_name, 'Sistema A');
});

test('POST /  permite crear sin game_system_id (NULL)', async () => {
  const { status, data } = await invoke(campaignsRouter, 'post', '/', {
    body: { name: 'Campaña sin sistema', dm_id: dmId },
  });
  assert.equal(status, 201);
  assert.equal(data.campaign.game_system_id, null);
});

test('GET /  lista las campañas del DM con el nombre del sistema', async () => {
  await invoke(campaignsRouter, 'post', '/', {
    body: { name: 'Camp', dm_id: dmId, game_system_id: systemId },
  });
  const { status, data } = await invoke(campaignsRouter, 'get', '/', { query: { dm_id: String(dmId) } });
  assert.equal(status, 200);
  assert.equal(data.campaigns.length, 1);
  assert.equal(data.campaigns[0].game_system_name, 'Sistema A');
});

test('GET /  incluye conteos de sesiones y jugadores distintos sin contar al DM (F14)', async () => {
  const created = await invoke(campaignsRouter, 'post', '/', { body: { name: 'Camp', dm_id: dmId } });
  const campaignId = created.data.campaign.id;

  const p1 = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1', 'x', 'player')").run().lastInsertRowid;
  const p2 = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p2', 'x', 'player')").run().lastInsertRowid;

  // Dos sesiones de la campaña (una activa, una cerrada) con jugadores repetidos:
  // p1 juega en ambas y debe contar UNA sola vez; el DM es miembro pero no cuenta.
  const s1 = db.prepare("INSERT INTO sessions (name, dm_id, campaign_id, status) VALUES ('S1', ?, ?, 'active')").run(dmId, campaignId).lastInsertRowid;
  const s2 = db.prepare("INSERT INTO sessions (name, dm_id, campaign_id, status) VALUES ('S2', ?, ?, 'closed')").run(dmId, campaignId).lastInsertRowid;
  const addMember = db.prepare('INSERT INTO session_members (session_id, user_id) VALUES (?, ?)');
  addMember.run(s1, dmId);
  addMember.run(s1, p1);
  addMember.run(s2, dmId);
  addMember.run(s2, p1);
  addMember.run(s2, p2);

  const { status, data } = await invoke(campaignsRouter, 'get', '/', { query: { dm_id: String(dmId) } });
  assert.equal(status, 200);
  const camp = data.campaigns.find((c) => c.id === campaignId);
  assert.equal(camp.session_count, 2);
  assert.equal(camp.active_session_count, 1);
  assert.equal(camp.player_count, 2, 'jugadores distintos, sin DM y sin duplicar entre sesiones');
});

test('GET /  campaña sin sesiones reporta conteos en cero (F14)', async () => {
  await invoke(campaignsRouter, 'post', '/', { body: { name: 'Vacía', dm_id: dmId } });
  const { data } = await invoke(campaignsRouter, 'get', '/', { query: { dm_id: String(dmId) } });
  assert.equal(data.campaigns[0].session_count, 0);
  assert.equal(data.campaigns[0].active_session_count, 0);
  assert.equal(data.campaigns[0].player_count, 0);
});

test('PUT /:id  edita el sistema de juego de la campaña (DM dueño)', async () => {
  const created = await invoke(campaignsRouter, 'post', '/', { body: { name: 'Camp', dm_id: dmId } });
  const id = created.data.campaign.id;

  const { status, data } = await invoke(campaignsRouter, 'put', '/:id', {
    params: { id: String(id) },
    body: { dm_id: dmId, game_system_id: systemId, name: 'Camp editada' },
  });
  assert.equal(status, 200);
  assert.equal(data.campaign.name, 'Camp editada');
  assert.equal(data.campaign.game_system_id, systemId);
});

test('PUT /:id  403 si otro DM intenta editar', async () => {
  const created = await invoke(campaignsRouter, 'post', '/', { body: { name: 'Camp', dm_id: dmId } });
  const id = created.data.campaign.id;

  const { status } = await invoke(campaignsRouter, 'put', '/:id', {
    params: { id: String(id) },
    body: { dm_id: otherDmId, name: 'Hackeada' },
  });
  assert.equal(status, 403);
});

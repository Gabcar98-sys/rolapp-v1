import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let npcsRouter;

// Invoca un handler del router resolviendo :params manualmente (Express los inyecta en runtime).
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
  ({ default: npcsRouter } = await import('./npcs.js'));
});

let dmId;
let otherDmId;
let campaignId;

beforeEach(() => {
  db.exec(`
    DELETE FROM npc_campaign_links;
    DELETE FROM npc_inventory;
    DELETE FROM npc_quests;
    DELETE FROM npcs;
    DELETE FROM campaigns;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  otherDmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')").run().lastInsertRowid;
  campaignId = db.prepare('INSERT INTO campaigns (dm_id, name) VALUES (?, ?)').run(dmId, 'Campaña').lastInsertRowid;
});

async function createNpc(body = {}) {
  return invoke(npcsRouter, 'post', '/', {
    body: { dm_id: dmId, name: 'El pescador ciego', ...body },
  });
}

// ── CRUD de NPC ─────────────────────────────────────────────────────────────

test('POST / crea un NPC con disposición por defecto neutral', async () => {
  const { status, data } = await createNpc();
  assert.equal(status, 201);
  assert.equal(data.npc.name, 'El pescador ciego');
  assert.equal(data.npc.disposition, 'neutral');
});

test('POST / acepta disposición válida y normaliza valores inválidos a neutral', async () => {
  const ally = await createNpc({ disposition: 'ally' });
  assert.equal(ally.data.npc.disposition, 'ally');

  const bogus = await createNpc({ name: 'Garrek', disposition: 'furioso' });
  assert.equal(bogus.data.npc.disposition, 'neutral');
});

test('POST / responde 400 sin name y 403 si el usuario no es DM', async () => {
  const missing = await createNpc({ name: undefined });
  assert.equal(missing.status, 400);

  const playerId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p', 'x', 'player')")
    .run().lastInsertRowid;
  const forbidden = await invoke(npcsRouter, 'post', '/', {
    body: { dm_id: playerId, name: 'X' },
  });
  assert.equal(forbidden.status, 403);
});

test('PUT /:id actualiza campos y disposición; 403 si el NPC es de otro DM', async () => {
  const { data } = await createNpc();
  const id = data.npc.id;

  const ok = await invoke(npcsRouter, 'put', '/:id', {
    params: { id },
    body: { dm_id: dmId, disposition: 'hostile', description: 'Cobarde' },
  });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.npc.disposition, 'hostile');
  assert.equal(ok.data.npc.description, 'Cobarde');

  const forbidden = await invoke(npcsRouter, 'put', '/:id', {
    params: { id },
    body: { dm_id: otherDmId, name: 'Robado' },
  });
  assert.equal(forbidden.status, 403);
});

test('DELETE /:id borra el NPC; 404 si no existe', async () => {
  const { data } = await createNpc();
  const del = await invoke(npcsRouter, 'delete', '/:id', {
    params: { id: data.npc.id },
    body: { dm_id: dmId },
  });
  assert.equal(del.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM npcs').get().n, 0);

  const missing = await invoke(npcsRouter, 'delete', '/:id', {
    params: { id: 9999 },
    body: { dm_id: dmId },
  });
  assert.equal(missing.status, 404);
});

// ── Sub-recurso: quests ───────────────────────────────────────────────────────

test('POST /:id/quests crea una quest y DELETE la elimina', async () => {
  const { data } = await createNpc();
  const id = data.npc.id;

  const created = await invoke(npcsRouter, 'post', '/:id/quests', {
    params: { id },
    body: { dm_id: dmId, title: 'La cripta', description: 'Guía a la cripta', reward: '50 oro' },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.quest.title, 'La cripta');
  assert.equal(created.data.quest.reward, '50 oro');

  const del = await invoke(npcsRouter, 'delete', '/:id/quests/:qid', {
    params: { id, qid: created.data.quest.id },
    body: { dm_id: dmId },
  });
  assert.equal(del.status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM npc_quests WHERE npc_id = ?').get(id).n, 0);
});

test('POST /:id/quests responde 400 sin title y 403 si el NPC es de otro DM', async () => {
  const { data } = await createNpc();
  const id = data.npc.id;

  const bad = await invoke(npcsRouter, 'post', '/:id/quests', {
    params: { id },
    body: { dm_id: dmId },
  });
  assert.equal(bad.status, 400);

  const forbidden = await invoke(npcsRouter, 'post', '/:id/quests', {
    params: { id },
    body: { dm_id: otherDmId, title: 'Intruso' },
  });
  assert.equal(forbidden.status, 403);
});

// ── Sub-recurso: inventario ─────────────────────────────────────────────────

test('POST /:id/inventory crea un objeto con cantidad y costo numéricos', async () => {
  const { data } = await createNpc();
  const id = data.npc.id;

  const created = await invoke(npcsRouter, 'post', '/:id/inventory', {
    params: { id },
    body: { dm_id: dmId, item_name: 'Poción', quantity: 3, cost: 25 },
  });
  assert.equal(created.status, 201);
  assert.equal(created.data.item.item_name, 'Poción');
  assert.equal(created.data.item.quantity, 3);
  assert.equal(created.data.item.cost, 25);
});

// ── Sub-recurso: vínculos a campaña ──────────────────────────────────────────

test('POST /:id/campaigns asocia (idempotente) y GET /:id devuelve la campaña vinculada', async () => {
  const { data } = await createNpc();
  const id = data.npc.id;

  const link = await invoke(npcsRouter, 'post', '/:id/campaigns', {
    params: { id },
    body: { dm_id: dmId, campaign_id: campaignId },
  });
  assert.equal(link.status, 201);
  // Idempotente: repetir no duplica.
  await invoke(npcsRouter, 'post', '/:id/campaigns', {
    params: { id },
    body: { dm_id: dmId, campaign_id: campaignId },
  });
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM npc_campaign_links WHERE npc_id = ?').get(id).n,
    1
  );

  const detail = await invoke(npcsRouter, 'get', '/:id', { params: { id } });
  assert.equal(detail.data.campaigns.length, 1);
  assert.equal(detail.data.campaigns[0].id, campaignId);

  const unlink = await invoke(npcsRouter, 'delete', '/:id/campaigns/:cid', {
    params: { id, cid: campaignId },
    body: { dm_id: dmId },
  });
  assert.equal(unlink.status, 200);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM npc_campaign_links WHERE npc_id = ?').get(id).n,
    0
  );
});

// ── Listado ───────────────────────────────────────────────────────────────────

test('GET / lista los NPCs del DM con conteos y filtra por sistema', async () => {
  await createNpc();
  await createNpc({ name: 'Garrek', disposition: 'hostile' });

  const { status, data } = await invoke(npcsRouter, 'get', '/', { query: { dm_id: dmId } });
  assert.equal(status, 200);
  assert.equal(data.npcs.length, 2);
  assert.ok('quest_count' in data.npcs[0]);
  assert.ok('inventory_count' in data.npcs[0]);

  const missing = await invoke(npcsRouter, 'get', '/', { query: {} });
  assert.equal(missing.status, 400);
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let createCharactersRouter;
let baseCharactersRouter;

// io falso: captura emits para verificar la sincronización por socket.
function makeFakeIo() {
  const emits = [];
  return {
    emits,
    to(room) {
      return { emit(event, payload) { emits.push({ room, event, payload }); } };
    },
  };
}

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
  ({ default: createCharactersRouter } = await import('./characters.js'));
  ({ default: baseCharactersRouter } = await import('./baseCharacters.js'));
});

let dmId;
let playerId;
let systemId;
let attrHpId;     // atributo con has_max
let attrStrId;    // atributo simple
let slotId;       // slot con max_items = 1
let itemAId;
let itemBId;
let skillId;

beforeEach(() => {
  db.exec(`
    DELETE FROM character_equipment;
    DELETE FROM character_inventory;
    DELETE FROM character_skill_links;
    DELETE FROM character_skills;
    DELETE FROM character_template_attr_values;
    DELETE FROM session_characters;
    DELETE FROM characters;
    DELETE FROM base_character_skill_links;
    DELETE FROM base_character_inventory;
    DELETE FROM base_character_attrs;
    DELETE FROM base_characters;
    DELETE FROM item_master_values;
    DELETE FROM item_masters;
    DELETE FROM item_format_fields;
    DELETE FROM item_formats;
    DELETE FROM skill_field_values;
    DELETE FROM skills;
    DELETE FROM skill_format_fields;
    DELETE FROM skill_formats;
    DELETE FROM equipment_slot_templates;
    DELETE FROM attribute_templates;
    DELETE FROM session_events;
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM game_system_templates;
    DELETE FROM users;
  `);

  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1', 'x', 'player')").run().lastInsertRowid;

  systemId = db.prepare(
    'INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)'
  ).run('Sistema Test', dmId).lastInsertRowid;

  attrHpId = db.prepare(`
    INSERT INTO attribute_templates (game_system_id, name, type, category, is_core, has_max)
    VALUES (?, 'HP', 'number', 'estado', 1, 1)
  `).run(systemId).lastInsertRowid;
  attrStrId = db.prepare(`
    INSERT INTO attribute_templates (game_system_id, name, type, category)
    VALUES (?, 'Fuerza', 'number', 'atributos')
  `).run(systemId).lastInsertRowid;

  slotId = db.prepare(`
    INSERT INTO equipment_slot_templates (game_system_id, name, slot_key, max_items)
    VALUES (?, 'Mano principal', 'main_hand', 1)
  `).run(systemId).lastInsertRowid;

  const formatId = db.prepare(
    'INSERT INTO item_formats (dm_id, game_system_id, name) VALUES (?, ?, ?)'
  ).run(dmId, systemId, 'Armas').lastInsertRowid;
  itemAId = db.prepare(
    'INSERT INTO item_masters (format_id, dm_id, name) VALUES (?, ?, ?)'
  ).run(formatId, dmId, 'Espada').lastInsertRowid;
  itemBId = db.prepare(
    'INSERT INTO item_masters (format_id, dm_id, name) VALUES (?, ?, ?)'
  ).run(formatId, dmId, 'Hacha').lastInsertRowid;

  const skFormatId = db.prepare(
    'INSERT INTO skill_formats (dm_id, game_system_id, name) VALUES (?, ?, ?)'
  ).run(dmId, systemId, 'Talentos').lastInsertRowid;
  skillId = db.prepare(
    'INSERT INTO skills (format_id, dm_id, name) VALUES (?, ?, ?)'
  ).run(skFormatId, dmId, 'Sigilo').lastInsertRowid;
});

function createChar(router, name = 'Héroe') {
  return invoke(router, 'post', '/', {
    body: { user_id: playerId, name, game_system_template_id: systemId },
  });
}

test('POST /  crea un personaje del jugador en su sistema', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { status, data } = await createChar(router);
  assert.equal(status, 201);
  assert.equal(data.character.name, 'Héroe');
  assert.equal(data.character.game_system_template_id, systemId);
  assert.deepEqual(data.character.templateAttrs, []);
});

test('POST /  responde 400 sin name', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { status } = await invoke(router, 'post', '/', { body: { user_id: playerId } });
  assert.equal(status, 400);
});

test('PUT /:id/attributes  hace upsert del valor y del máximo', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const charId = data.character.id;

  const { status, data: updated } = await invoke(router, 'put', '/:id/attributes', {
    params: { id: String(charId) },
    body: {
      user_id: playerId,
      values: [
        { attribute_template_id: attrHpId, value: '8', max_value: '12' },
        { attribute_template_id: attrStrId, value: '3' },
      ],
    },
  });

  assert.equal(status, 200);
  const hp = updated.character.templateAttrs.find((a) => a.attribute_template_id === attrHpId);
  assert.equal(hp.value, '8');
  assert.equal(hp.max_value, '12');
  assert.equal(hp.has_max, 1);
});

test('PUT /:id/attributes  403 si un extraño intenta editar', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const otherId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p2', 'x', 'player')").run().lastInsertRowid;

  const { status } = await invoke(router, 'put', '/:id/attributes', {
    params: { id: String(data.character.id) },
    body: { user_id: otherId, values: [{ attribute_template_id: attrStrId, value: '5' }] },
  });
  assert.equal(status, 403);
});

test('POST /:id/equipment  equipa y respeta max_items del slot', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const charId = data.character.id;

  const first = await invoke(router, 'post', '/:id/equipment', {
    params: { id: String(charId) },
    body: { user_id: playerId, slot_id: slotId, item_id: itemAId },
  });
  assert.equal(first.status, 201);
  assert.equal(first.data.equipment.length, 1);

  // El slot tiene max_items = 1 → un segundo item debe rechazarse con 409.
  const second = await invoke(router, 'post', '/:id/equipment', {
    params: { id: String(charId) },
    body: { user_id: playerId, slot_id: slotId, item_id: itemBId },
  });
  assert.equal(second.status, 409);
});

test('DELETE /:id/equipment/:equipId  desequipa y libera el slot', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const charId = data.character.id;

  const equipRes = await invoke(router, 'post', '/:id/equipment', {
    params: { id: String(charId) },
    body: { user_id: playerId, slot_id: slotId, item_id: itemAId },
  });
  const equipId = equipRes.data.equipment[0].id;

  const del = await invoke(router, 'delete', '/:id/equipment/:equipId', {
    params: { id: String(charId), equipId: String(equipId) },
    body: { user_id: playerId },
  });
  assert.equal(del.status, 200);
  assert.equal(del.data.equipment.length, 0);

  // Tras liberar el slot se puede volver a equipar.
  const again = await invoke(router, 'post', '/:id/equipment', {
    params: { id: String(charId) },
    body: { user_id: playerId, slot_id: slotId, item_id: itemBId },
  });
  assert.equal(again.status, 201);
});

test('POST /:id/skill-links  enlaza una skill del catálogo con rank', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const charId = data.character.id;

  const { status, data: updated } = await invoke(router, 'post', '/:id/skill-links', {
    params: { id: String(charId) },
    body: { user_id: playerId, skill_id: skillId, rank: 2 },
  });
  assert.equal(status, 201);
  assert.equal(updated.character.skillLinks.length, 1);
  assert.equal(updated.character.skillLinks[0].rank, 2);
});

test('POST /:id/sessions/:sessionId  vincula el personaje y emite por socket', async () => {
  const io = makeFakeIo();
  const router = createCharactersRouter(io);
  const { data } = await createChar(router);
  const charId = data.character.id;
  const sessionId = db.prepare('INSERT INTO sessions (name, dm_id) VALUES (?, ?)').run('Mesa', dmId).lastInsertRowid;

  const { status } = await invoke(router, 'post', '/:id/sessions/:sessionId', {
    params: { id: String(charId), sessionId: String(sessionId) },
    body: { user_id: playerId },
  });
  assert.equal(status, 201);

  const link = db.prepare(
    'SELECT 1 FROM session_characters WHERE session_id = ? AND character_id = ?'
  ).get(sessionId, charId);
  assert.ok(link, 'el personaje debe quedar vinculado a la sesión');
  assert.ok(io.emits.some((e) => e.event === 'characters:list_updated'));
});

test('DELETE /:id  borra un personaje aunque esté vinculado a una sesión', async () => {
  const router = createCharactersRouter(makeFakeIo());
  const { data } = await createChar(router);
  const charId = data.character.id;
  const sessionId = db.prepare('INSERT INTO sessions (name, dm_id) VALUES (?, ?)').run('Mesa', dmId).lastInsertRowid;
  db.prepare('INSERT INTO session_characters (session_id, character_id) VALUES (?, ?)').run(sessionId, charId);

  const { status } = await invoke(router, 'delete', '/:id', {
    params: { id: String(charId) },
    body: { user_id: playerId },
  });
  assert.equal(status, 200);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM characters WHERE id = ?').get(charId).n, 0);
  assert.equal(
    db.prepare('SELECT COUNT(*) AS n FROM session_characters WHERE character_id = ?').get(charId).n,
    0
  );
});

test('POST /base/:id/adopt  copia attrs, inventario y skills de forma transaccional', async () => {
  const charsRouter = createCharactersRouter(makeFakeIo());

  // Pregen del DM con un atributo ligado a plantilla, inventario y una skill (rank 3).
  const bcId = db.prepare(
    'INSERT INTO base_characters (dm_id, game_system_id, name) VALUES (?, ?, ?)'
  ).run(dmId, systemId, 'Pregen Pícaro').lastInsertRowid;
  db.prepare(`
    INSERT INTO base_character_attrs (base_character_id, attribute_template_id, attr_name, attr_type, value)
    VALUES (?, ?, 'Fuerza', 'number', '4')
  `).run(bcId, attrStrId);
  db.prepare(
    'INSERT INTO base_character_inventory (base_character_id, item_name, quantity) VALUES (?, ?, ?)'
  ).run(bcId, 'Daga', 2);
  db.prepare(
    'INSERT INTO base_character_skill_links (base_character_id, skill_id, rank) VALUES (?, ?, ?)'
  ).run(bcId, skillId, 3);

  const { status, data } = await invoke(baseCharactersRouter, 'post', '/:id/adopt', {
    params: { id: String(bcId) },
    body: { user_id: playerId },
  });

  assert.equal(status, 201);
  const char = data.character;
  assert.equal(char.user_id, playerId);
  assert.equal(char.game_system_template_id, systemId);

  const str = char.templateAttrs.find((a) => a.attribute_template_id === attrStrId);
  assert.equal(str.value, '4');
  assert.equal(char.inventory.length, 1);
  assert.equal(char.inventory[0].item_name, 'Daga');
  assert.equal(char.skillLinks.length, 1);
  assert.equal(char.skillLinks[0].rank, 3);

  // La ficha completa debe ser legible vía el router de characters.
  const got = await invoke(charsRouter, 'get', '/:id', { params: { id: String(char.id) } });
  assert.equal(got.status, 200);
  assert.equal(got.data.character.id, char.id);
});

test('POST /base/:id/adopt  404 si el pregen no existe', async () => {
  const { status } = await invoke(baseCharactersRouter, 'post', '/:id/adopt', {
    params: { id: '99999' },
    body: { user_id: playerId },
  });
  assert.equal(status, 404);
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test. Debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let sessionPrepsRouter;
let locationsRouter;
let subLocationsRouter;
let eventTemplatesRouter;
let createSessionsRouter;
let listEvents;

// io falso para el router de sessions (captura emits).
function makeFakeIo() {
  const emits = [];
  return {
    emits,
    to() {
      return { emit(event, payload) { emits.push({ event, payload }); } };
    },
  };
}

// Invoca un handler del router resolviendo :params manualmente.
function invoke(router, method, routePath, { params = {}, body = {}, query = {} } = {}) {
  const layer = router.stack.find(
    (l) => l.route && l.route.path === routePath && l.route.methods[method]
  );
  assert.ok(layer, `no existe handler ${method.toUpperCase()} ${routePath}`);
  return new Promise((resolve) => {
    const req = { params, body, query };
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
  ({ default: sessionPrepsRouter } = await import('./sessionPreps.js'));
  ({ default: locationsRouter } = await import('./locations.js'));
  ({ default: subLocationsRouter } = await import('./subLocations.js'));
  ({ default: eventTemplatesRouter } = await import('./eventTemplates.js'));
  ({ default: createSessionsRouter } = await import('./sessions.js'));
  ({ listEvents } = await import('../services/events.js'));
});

let dmId;

beforeEach(() => {
  db.exec(`
    DELETE FROM event_links;
    DELETE FROM event_participants;
    DELETE FROM event_templates;
    DELETE FROM sub_locations;
    DELETE FROM locations;
    DELETE FROM session_preps;
    DELETE FROM session_events;
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM users;
  `);
  dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
});

test('POST /  crea un prep (caso feliz)', async () => {
  const { status, data } = await invoke(sessionPrepsRouter, 'post', '/', {
    body: { dm_id: dmId, name: 'Prep 1' },
  });
  assert.equal(status, 201);
  assert.equal(data.prep.name, 'Prep 1');
});

test('POST /  responde 400 sin name', async () => {
  const { status } = await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId } });
  assert.equal(status, 400);
});

test('GET /:id  devuelve la jerarquía completa con branches, freeEvents y eventLinks', async () => {
  const prep = (
    await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId, name: 'P' } })
  ).data.prep;
  const loc = (
    await invoke(locationsRouter, 'post', '/', {
      body: { prep_id: prep.id, name: 'Bosque', dm_id: dmId },
    })
  ).data.location;
  const sub = (
    await invoke(subLocationsRouter, 'post', '/', {
      body: { location_id: loc.id, name: 'Claro', dm_id: dmId },
    })
  ).data.sub_location;

  // Evento raíz en la sub-ubicación + una rama hija.
  const root = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, sub_location_id: sub.id, title: 'Emboscada' },
    })
  ).data.template;
  await invoke(eventTemplatesRouter, 'post', '/', {
    body: {
      dm_id: dmId,
      prep_id: prep.id,
      sub_location_id: sub.id,
      parent_event_id: root.id,
      branch_label: 'Huir',
      title: 'Persecución',
    },
  });

  // Evento suelto (sin sub-ubicación) → freeEvents.
  const free = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'Rumor en la taberna' },
    })
  ).data.template;

  // Un enlace from→to dentro del prep.
  const link = await invoke(eventTemplatesRouter, 'post', '/links', {
    body: { dm_id: dmId, from_event_id: root.id, to_event_id: free.id, label: 'lleva a' },
  });
  assert.equal(link.status, 201);

  const { status, data } = await invoke(sessionPrepsRouter, 'get', '/:id', {
    params: { id: String(prep.id) },
  });
  assert.equal(status, 200);
  assert.equal(data.locations.length, 1);
  assert.equal(data.locations[0].sub_locations[0].events.length, 1, 'un evento raíz');
  assert.equal(
    data.locations[0].sub_locations[0].events[0].branches.length,
    1,
    'con una rama'
  );
  assert.equal(data.freeEvents.length, 1, 'un evento suelto');
  assert.equal(data.eventLinks.length, 1, 'un enlace');
  assert.equal(data.eventLinks[0].label, 'lleva a');
});

test('GET /:id  404 si el prep no existe', async () => {
  const { status } = await invoke(sessionPrepsRouter, 'get', '/:id', { params: { id: '99999' } });
  assert.equal(status, 404);
});

test('POST /links  rechaza enlace duplicado con 409', async () => {
  const prep = (
    await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId, name: 'P' } })
  ).data.prep;
  const a = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'A' },
    })
  ).data.template;
  const b = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'B' },
    })
  ).data.template;

  const first = await invoke(eventTemplatesRouter, 'post', '/links', {
    body: { dm_id: dmId, from_event_id: a.id, to_event_id: b.id },
  });
  assert.equal(first.status, 201);

  const dup = await invoke(eventTemplatesRouter, 'post', '/links', {
    body: { dm_id: dmId, from_event_id: a.id, to_event_id: b.id },
  });
  assert.equal(dup.status, 409);
});

test('DELETE /:id (evento) elimina sus ramas vía cascade', async () => {
  const prep = (
    await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId, name: 'P' } })
  ).data.prep;
  const root = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'Root' },
    })
  ).data.template;
  await invoke(eventTemplatesRouter, 'post', '/', {
    body: { dm_id: dmId, prep_id: prep.id, parent_event_id: root.id, title: 'Branch' },
  });

  await invoke(eventTemplatesRouter, 'delete', '/:id', {
    params: { id: String(root.id) },
    body: { dm_id: dmId },
  });

  const remaining = db.prepare('SELECT COUNT(*) AS n FROM event_templates').get().n;
  assert.equal(remaining, 0, 'la rama se borró junto al padre');
});

test('PUT /:id (evento) actualiza título, categoría y descripción (caso feliz)', async () => {
  const prep = (
    await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId, name: 'P' } })
  ).data.prep;
  const evt = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'Viejo', category: 'general' },
    })
  ).data.template;

  const { status, data } = await invoke(eventTemplatesRouter, 'put', '/:id', {
    params: { id: String(evt.id) },
    body: { dm_id: dmId, title: 'Nuevo', category: 'combate', description: 'desc' },
  });
  assert.equal(status, 200);
  assert.equal(data.template.title, 'Nuevo');
  assert.equal(data.template.category, 'combate');
  assert.equal(data.template.description, 'desc');
});

test('PUT /:id (evento) responde 403 si el dm_id no es el dueño', async () => {
  const otherDm = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm2', 'x', 'dm')")
    .run().lastInsertRowid;
  const prep = (
    await invoke(sessionPrepsRouter, 'post', '/', { body: { dm_id: dmId, name: 'P' } })
  ).data.prep;
  const evt = (
    await invoke(eventTemplatesRouter, 'post', '/', {
      body: { dm_id: dmId, prep_id: prep.id, title: 'X' },
    })
  ).data.template;

  const { status } = await invoke(eventTemplatesRouter, 'put', '/:id', {
    params: { id: String(evt.id) },
    body: { dm_id: otherDm, title: 'Hackeado' },
  });
  assert.equal(status, 403);
});

test('PUT /:id (evento) responde 404 si el evento no existe', async () => {
  const { status } = await invoke(eventTemplatesRouter, 'put', '/:id', {
    params: { id: '99999' },
    body: { dm_id: dmId, title: 'X' },
  });
  assert.equal(status, 404);
});

test('POST /sessions/:id/events  con template_id queda en el log y se puede reconstruir', async () => {
  const io = makeFakeIo();
  const sessionsRouter = createSessionsRouter(io);

  const session = (
    await invoke(sessionsRouter, 'post', '/', { body: { name: 'Mesa', dm_id: dmId } })
  ).data.session;

  const res = await invoke(sessionsRouter, 'post', '/:id/events', {
    params: { id: String(session.id) },
    body: {
      dm_id: dmId,
      title: 'Emboscada',
      category: 'combate',
      template_id: 42,
      branch_label: '',
    },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.event.type, 'combate', 'el type del evento = category');

  const events = listEvents(session.id);
  const fired = events.find((e) => e.type === 'combate');
  assert.ok(fired, 'el evento quedó en el log');
  const payload = JSON.parse(fired.payload);
  assert.equal(payload.template_id, 42, 'template_id reconstruible desde el payload');
  assert.ok(io.emits.some((e) => e.event === 'session:event_fired'));
});

test('POST /sessions/:id/events  evento de NPC guarda actor_type y npc_name', async () => {
  const sessionsRouter = createSessionsRouter(makeFakeIo());
  const session = (
    await invoke(sessionsRouter, 'post', '/', { body: { name: 'M', dm_id: dmId } })
  ).data.session;

  const res = await invoke(sessionsRouter, 'post', '/:id/events', {
    params: { id: String(session.id) },
    body: {
      dm_id: dmId,
      title: 'El mercader ofrece un trato',
      category: 'interacción',
      actor_type: 'npc',
      npc_id: 7,
      npc_name: 'Galanar',
    },
  });
  assert.equal(res.status, 201);
  const payload = JSON.parse(listEvents(session.id).find((e) => e.type === 'interacción').payload);
  assert.equal(payload.actor_type, 'npc');
  assert.equal(payload.npc_name, 'Galanar');
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js.
process.env.DB_PATH = ':memory:';

let db;
let createNotesRouter;

// io falso: captura emits para verificar la sincronización por socket (sin bodies).
function makeFakeIo() {
  const emits = [];
  return {
    emits,
    to(room) {
      return { emit(event, payload) { emits.push({ room, event, payload }); } };
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
  ({ default: createNotesRouter } = await import('./notes.js'));
});

let dmId;
let playerId;
let sessionId;

beforeEach(() => {
  db.exec(`
    DELETE FROM session_notes;
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM users;
  `);
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')").run().lastInsertRowid;
  playerId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('p1', 'x', 'player')").run().lastInsertRowid;
  sessionId = db.prepare('INSERT INTO sessions (name, dm_id) VALUES (?, ?)').run('Sesión 1', dmId).lastInsertRowid;
});

test('POST crea una nota y emite notes:updated sin cuerpo', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);

  const res = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'Trama secreta', body: 'El villano es el alcalde', is_public: false },
  });

  assert.equal(res.status, 201);
  assert.equal(res.data.note.title, 'Trama secreta');
  assert.equal(res.data.note.is_public, 0);
  // La señal de socket NO lleva bodies (evita fuga de notas privadas).
  assert.equal(io.emits.length, 1);
  assert.equal(io.emits[0].event, 'notes:updated');
  assert.equal(io.emits[0].room, `session:${sessionId}`);
  assert.deepEqual(Object.keys(io.emits[0].payload), ['sessionId']);
});

test('GET del DM ve todas; el jugador solo ve públicas (privada oculta)', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);

  await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'Pública', is_public: true },
  });
  await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'Privada', body: 'secreto', is_public: false },
  });

  // El DM ve las dos.
  const asDm = await invoke(router, 'get', '/', { query: { session_id: sessionId, user_id: dmId } });
  assert.equal(asDm.status, 200);
  assert.equal(asDm.data.isDM, true);
  assert.equal(asDm.data.notes.length, 2);

  // El jugador ve solo la pública; la privada (y su body) NO aparece.
  const asPlayer = await invoke(router, 'get', '/', { query: { session_id: sessionId, user_id: playerId } });
  assert.equal(asPlayer.status, 200);
  assert.equal(asPlayer.data.isDM, false);
  assert.equal(asPlayer.data.notes.length, 1);
  assert.equal(asPlayer.data.notes[0].title, 'Pública');
  assert.ok(!asPlayer.data.notes.some((n) => n.title === 'Privada'), 'la nota privada no se filtra al jugador');
});

test('PUT edita la nota (solo el DM dueño) y actualiza updated_at', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);
  const created = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'Borrador' },
  });
  const noteId = created.data.note.id;

  const res = await invoke(router, 'put', '/:id', {
    params: { id: noteId },
    body: { dm_id: dmId, title: 'Definitiva', is_public: true },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.note.title, 'Definitiva');
  assert.equal(res.data.note.is_public, 1);
});

test('PUT de otro usuario (no dueño) es 403', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);
  const created = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'X' },
  });
  const res = await invoke(router, 'put', '/:id', {
    params: { id: created.data.note.id },
    body: { dm_id: playerId, title: 'Hackeada' },
  });
  assert.equal(res.status, 403);
});

test('DELETE elimina la nota y emite señal', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);
  const created = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: 'Temporal' },
  });
  io.emits.length = 0;
  const res = await invoke(router, 'delete', '/:id', {
    params: { id: created.data.note.id },
    body: { dm_id: dmId },
  });
  assert.equal(res.status, 200);
  assert.equal(res.data.ok, true);
  assert.equal(io.emits.at(-1).event, 'notes:updated');
  const remaining = db.prepare('SELECT COUNT(*) AS n FROM session_notes WHERE session_id = ?').get(sessionId).n;
  assert.equal(remaining, 0);
});

test('POST sin título es 400 (caso de error)', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);
  const res = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: dmId, title: '   ' },
  });
  assert.equal(res.status, 400);
});

test('POST de quien no es DM dueño es 403', async () => {
  const io = makeFakeIo();
  const router = createNotesRouter(io);
  const res = await invoke(router, 'post', '/', {
    body: { session_id: sessionId, dm_id: playerId, title: 'Intruso' },
  });
  assert.equal(res.status, 403);
});

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — igual que el resto de la suite. Debe fijarse
// ANTES de importar db/index.js (lee DB_PATH al cargar).
process.env.DB_PATH = ':memory:';

let db;
let registerCanvasHandlers;

// io falso: captura los emits a rooms (io.to(room).emit(...) y socket.to(room).emit(...)).
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

// socket falso: registra los handlers en un mapa y captura sus propios emits.
function makeFakeSocket(userId) {
  const handlers = new Map();
  const selfEmits = [];
  const toEmits = [];
  return {
    data: { userId },
    selfEmits,
    toEmits,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, payload) {
      selfEmits.push({ event, payload });
    },
    to(room) {
      return {
        emit(event, payload) {
          toEmits.push({ room, event, payload });
        },
      };
    },
    fire(event, payload) {
      const fn = handlers.get(event);
      assert.ok(fn, `no hay handler para ${event}`);
      return fn(payload);
    },
  };
}

before(async () => {
  ({ default: db } = await import('../db/index.js'));
  ({ registerCanvasHandlers } = await import('./canvas.js'));
});

let sessionId;

beforeEach(() => {
  db.exec(`
    DELETE FROM canvas_state;
    DELETE FROM sessions;
    DELETE FROM users;
  `);
  const dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
  sessionId = db
    .prepare("INSERT INTO sessions (name, dm_id, status) VALUES ('Mesa', ?, 'active')")
    .run(dmId).lastInsertRowid;
});

test('canvas:update  persiste el snapshot y lo retransmite a la room (sin el emisor)', () => {
  const io = makeFakeIo();
  const socket = makeFakeSocket(1);
  registerCanvasHandlers(io, socket);

  const document = { shapes: { a: 1 } };
  socket.fire('canvas:update', { sessionId, document, version: 100 });

  // Persistencia síncrona en canvas_state.tldraw_snapshot.
  const row = db
    .prepare('SELECT tldraw_snapshot FROM canvas_state WHERE session_id = ?')
    .get(sessionId);
  assert.ok(row?.tldraw_snapshot, 'debe guardar el snapshot');
  const saved = JSON.parse(row.tldraw_snapshot);
  assert.deepEqual(saved.document, document);
  assert.equal(saved.version, 100);

  // Broadcast al resto de la room vía socket.to (excluye al emisor).
  assert.equal(socket.toEmits.length, 1);
  assert.equal(socket.toEmits[0].room, `session:${sessionId}`);
  assert.equal(socket.toEmits[0].event, 'canvas:updated');
  assert.deepEqual(socket.toEmits[0].payload.document, document);
});

test('canvas:update  ignora sesiones inexistentes o inactivas (no persiste)', () => {
  const socket = makeFakeSocket(1);
  registerCanvasHandlers(makeFakeIo(), socket);

  socket.fire('canvas:update', { sessionId: 99999, document: { x: 1 }, version: 1 });

  const count = db.prepare('SELECT COUNT(*) AS n FROM canvas_state').get().n;
  assert.equal(count, 0, 'no debe persistir para una sesión inexistente');
  assert.equal(socket.toEmits.length, 0);
});

test('canvas:update  ignora payload sin document', () => {
  const socket = makeFakeSocket(1);
  registerCanvasHandlers(makeFakeIo(), socket);

  socket.fire('canvas:update', { sessionId, version: 1 });

  const count = db.prepare('SELECT COUNT(*) AS n FROM canvas_state').get().n;
  assert.equal(count, 0);
});

test('canvas:request_snapshot  devuelve el snapshot persistido al solicitante', () => {
  const socket = makeFakeSocket(1);
  registerCanvasHandlers(makeFakeIo(), socket);

  const document = { shapes: { b: 2 } };
  db.prepare(`
    INSERT INTO canvas_state (session_id, tldraw_snapshot, updated_at)
    VALUES (?, ?, unixepoch())
  `).run(sessionId, JSON.stringify({ document, version: 42 }));

  socket.fire('canvas:request_snapshot', { sessionId });

  assert.equal(socket.selfEmits.length, 1);
  assert.equal(socket.selfEmits[0].event, 'canvas:updated');
  assert.deepEqual(socket.selfEmits[0].payload.document, document);
  assert.equal(socket.selfEmits[0].payload.version, 42);
});

test('canvas:request_snapshot  no emite nada si no hay snapshot', () => {
  const socket = makeFakeSocket(1);
  registerCanvasHandlers(makeFakeIo(), socket);

  socket.fire('canvas:request_snapshot', { sessionId });

  assert.equal(socket.selfEmits.length, 0);
});

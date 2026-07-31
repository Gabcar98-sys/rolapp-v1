import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — igual que el resto de la suite. Debe fijarse
// ANTES de importar db/index.js (lee DB_PATH al cargar).
process.env.DB_PATH = ':memory:';

let db;
let registerSessionHandlers;

// io falso: captura los emits a rooms (mismo patrón que canvas.test.js).
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

// socket falso: registra handlers, y además captura join/leave (el espectador solo
// debería tocar el room, nada más).
function makeFakeSocket(data = {}) {
  const handlers = new Map();
  const selfEmits = [];
  const joined = [];
  const left = [];
  return {
    id: 'sock-1',
    data,
    selfEmits,
    joined,
    left,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, payload) {
      selfEmits.push({ event, payload });
    },
    join(room) {
      joined.push(room);
    },
    leave(room) {
      left.push(room);
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
  ({ registerSessionHandlers } = await import('./session.js'));
});

let sessionId;
let closedSessionId;
let dmId;

beforeEach(() => {
  db.exec(`
    DELETE FROM session_events;
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM users;
  `);
  dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
  sessionId = db
    .prepare("INSERT INTO sessions (name, dm_id, status) VALUES ('Mesa', ?, 'active')")
    .run(dmId).lastInsertRowid;
  closedSessionId = db
    .prepare("INSERT INTO sessions (name, dm_id, status) VALUES ('Mesa vieja', ?, 'closed')")
    .run(dmId).lastInsertRowid;
});

test('session:spectate  une al room sin registrar miembro, sin log y sin presencia', () => {
  const io = makeFakeIo();
  const socket = makeFakeSocket();
  registerSessionHandlers(io, socket);

  socket.fire('session:spectate', { sessionId });

  // Solo se une al room de la sesión.
  assert.deepEqual(socket.joined, [`session:${sessionId}`]);
  assert.equal(socket.data.spectatingSessionId, sessionId);

  // No aparece en presencia: nadie recibe un session:users por el espectador.
  assert.equal(io.emits.length, 0, 'el espectador no debe publicar presencia');

  // No registra membresía ni escribe en el log append-only.
  const members = db
    .prepare('SELECT COUNT(*) AS n FROM session_members WHERE session_id = ?')
    .get(sessionId).n;
  assert.equal(members, 0, 'el televisor no debe ocupar un slot de session_members');

  const events = db
    .prepare('SELECT COUNT(*) AS n FROM session_events WHERE session_id = ?')
    .get(sessionId).n;
  assert.equal(events, 0, 'el espectador no debe escribir en session_events');
});

test('session:spectate  rechaza sesión inexistente, cerrada o id no numérico', () => {
  const io = makeFakeIo();

  for (const bad of [{ sessionId: 99999 }, { sessionId: closedSessionId }, { sessionId: 'abc' }, {}]) {
    const socket = makeFakeSocket();
    registerSessionHandlers(io, socket);
    socket.fire('session:spectate', bad);

    assert.equal(socket.joined.length, 0, `no debe unirse al room con ${JSON.stringify(bad)}`);
    assert.equal(socket.selfEmits.length, 1);
    assert.equal(socket.selfEmits[0].event, 'session:error');
    assert.equal(socket.data.spectatingSessionId, undefined);
  }

  assert.equal(io.emits.length, 0);
});

test('session:unspectate  suelta el room y limpia socket.data', () => {
  const socket = makeFakeSocket();
  registerSessionHandlers(makeFakeIo(), socket);

  socket.fire('session:spectate', { sessionId });
  socket.fire('session:unspectate', { sessionId });

  assert.deepEqual(socket.left, [`session:${sessionId}`]);
  assert.equal(socket.data.spectatingSessionId, null);
});

test('disconnect de un espectador no escribe session_leave ni publica presencia', () => {
  const io = makeFakeIo();
  const socket = makeFakeSocket();
  registerSessionHandlers(io, socket);

  socket.fire('session:spectate', { sessionId });
  socket.fire('disconnect', {});

  assert.deepEqual(socket.left, [`session:${sessionId}`]);
  assert.equal(io.emits.length, 0, 'no debe emitir session:users por un espectador');

  const events = db
    .prepare("SELECT COUNT(*) AS n FROM session_events WHERE session_id = ? AND type = 'session_leave'")
    .get(sessionId).n;
  assert.equal(events, 0);
});

test('session:join (jugador real) sí registra miembro, log y presencia — contraste', () => {
  const io = makeFakeIo();
  const socket = makeFakeSocket();
  registerSessionHandlers(io, socket);

  socket.fire('session:join', { sessionId, user: { id: dmId } });

  assert.deepEqual(socket.joined, [`session:${sessionId}`]);
  const members = db
    .prepare('SELECT COUNT(*) AS n FROM session_members WHERE session_id = ?')
    .get(sessionId).n;
  assert.equal(members, 1);
  const joins = db
    .prepare("SELECT COUNT(*) AS n FROM session_events WHERE session_id = ? AND type = 'session_join'")
    .get(sessionId).n;
  assert.equal(joins, 1);
  assert.equal(io.emits.length, 1);
  assert.equal(io.emits[0].event, 'session:users');
});

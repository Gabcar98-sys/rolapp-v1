import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

// DB en memoria por proceso de test — igual que el resto de la suite. Debe fijarse
// ANTES de importar db/index.js (lee DB_PATH al cargar).
process.env.DB_PATH = ':memory:';

let db;
let registerChatHandlers;

// io falso: mismo patrón que canvas.test.js / session.test.js. Para chat:history no se
// usa (el historial va solo al solicitante), pero registerChatHandlers lo exige.
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
    sockets: { adapter: { rooms: new Map() }, sockets: new Map() },
  };
}

// socket falso: `data` simula lo que fija session:join (userId). Un espectador de la
// vista TV (session:spectate, F31) NO tiene userId → se construye con data = {}.
function makeFakeSocket(data = {}) {
  const handlers = new Map();
  const selfEmits = [];
  return {
    id: 'sock-1',
    data,
    selfEmits,
    on(event, fn) {
      handlers.set(event, fn);
    },
    emit(event, payload) {
      selfEmits.push({ event, payload });
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
  ({ registerChatHandlers } = await import('./chat.js'));
});

let sessionId;
let otherSessionId;
let userA;
let userB;
let userC;
let userD;

// Pide el historial como `userId` (null = socket sin identidad) y devuelve el payload.
function historyFor(userId, id = sessionId) {
  const socket = makeFakeSocket(userId ? { userId } : {});
  registerChatHandlers(makeFakeIo(), socket);
  socket.fire('chat:history', { sessionId: id });
  assert.equal(socket.selfEmits.length, 1, 'chat:history debe responder exactamente una vez');
  assert.equal(socket.selfEmits[0].event, 'chat:history');
  return socket.selfEmits[0].payload;
}

const bodies = (payload) => payload.messages.map((m) => m.body);

beforeEach(() => {
  // messages es tabla puente hacia sessions y users: si no se limpia aquí, las FKs
  // rompen el beforeEach de otros tests del archivo (lección F14).
  db.exec(`
    DELETE FROM messages;
    DELETE FROM session_events;
    DELETE FROM session_members;
    DELETE FROM sessions;
    DELETE FROM users;
  `);

  const addUser = db.prepare('INSERT INTO users (username, pin_hash, role) VALUES (?, ?, ?)');
  userA = addUser.run('dm', 'x', 'dm').lastInsertRowid;
  userB = addUser.run('ana', 'x', 'player').lastInsertRowid;
  userC = addUser.run('caro', 'x', 'player').lastInsertRowid;
  userD = addUser.run('dario', 'x', 'player').lastInsertRowid;

  const addSession = db.prepare(
    "INSERT INTO sessions (name, dm_id, status) VALUES (?, ?, 'active')"
  );
  sessionId = addSession.run('Mesa', userA).lastInsertRowid;
  otherSessionId = addSession.run('Otra mesa', userA).lastInsertRowid;

  // 1 público + 2 susurros de parejas distintas. created_at explícito y creciente para
  // que la aserción de orden no dependa del reloj.
  const addMessage = db.prepare(
    'INSERT INTO messages (session_id, from_user_id, to_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  addMessage.run(sessionId, userA, null, 'publico para todos', 1000);
  addMessage.run(sessionId, userA, userB, 'susurro A->B', 1001);
  addMessage.run(sessionId, userC, userD, 'susurro C->D', 1002);
});

test('chat:history  el destinatario ve el público y el suyo, NO el susurro ajeno', () => {
  const payload = historyFor(userB);

  assert.deepEqual(bodies(payload), ['publico para todos', 'susurro A->B']);
  assert.ok(
    !payload.messages.some((m) => m.body === 'susurro C->D'),
    'B no debe recibir el susurro entre C y D'
  );
});

test('chat:history  el emisor del susurro también lo ve (from_user_id)', () => {
  const payload = historyFor(userA);

  assert.deepEqual(bodies(payload), ['publico para todos', 'susurro A->B']);
  assert.ok(!payload.messages.some((m) => m.body === 'susurro C->D'));
});

test('chat:history  cada pareja ve solo su susurro (C ve el suyo, no el de A->B)', () => {
  assert.deepEqual(bodies(historyFor(userC)), ['publico para todos', 'susurro C->D']);
  assert.deepEqual(bodies(historyFor(userD)), ['publico para todos', 'susurro C->D']);
});

test('chat:history  un socket SIN userId (espectador de la vista TV) solo ve el público', () => {
  const payload = historyFor(null);

  assert.deepEqual(bodies(payload), ['publico para todos']);
  assert.ok(
    payload.messages.every((m) => m.to_user_id === null),
    'un espectador nunca debe recibir mensajes privados'
  );
});

test('chat:history  ignora un userId inservible en socket.data (0, NaN, negativo)', () => {
  for (const bad of [0, -3, NaN, 'abc', null, undefined]) {
    const socket = makeFakeSocket({ userId: bad });
    registerChatHandlers(makeFakeIo(), socket);
    socket.fire('chat:history', { sessionId });

    const payload = socket.selfEmits[0].payload;
    assert.deepEqual(bodies(payload), ['publico para todos'], `userId=${String(bad)}`);
  }
});

test('chat:history  el contrato del payload y el orden no cambian', () => {
  const payload = historyFor(userB);

  // Forma del payload: exactamente { messages: [...] }.
  assert.deepEqual(Object.keys(payload), ['messages']);
  assert.ok(Array.isArray(payload.messages));

  // Columnas por mensaje (incluye el username del emisor vía JOIN).
  const [first] = payload.messages;
  assert.deepEqual(Object.keys(first).sort(), [
    'body',
    'created_at',
    'from_user_id',
    'from_username',
    'id',
    'session_id',
    'to_user_id',
  ]);
  assert.equal(first.from_username, 'dm');
  assert.equal(first.session_id, sessionId);

  // Orden ascendente por created_at (y por id como desempate), como antes del fix.
  const times = payload.messages.map((m) => m.created_at);
  assert.deepEqual(times, [...times].sort((a, b) => a - b));
  const ids = payload.messages.map((m) => m.id);
  assert.deepEqual(ids, [...ids].sort((a, b) => a - b));
});

test('chat:history  sigue acotado a la sesión pedida', () => {
  db.prepare(
    'INSERT INTO messages (session_id, from_user_id, to_user_id, body, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(otherSessionId, userA, null, 'publico de otra mesa', 1003);

  assert.deepEqual(bodies(historyFor(userB)), ['publico para todos', 'susurro A->B']);
  assert.deepEqual(bodies(historyFor(userB, otherSessionId)), ['publico de otra mesa']);
});

test('chat:history  responde con lista vacía ante una sesión inexistente o id no numérico', () => {
  assert.deepEqual(historyFor(userB, 99999).messages, []);
  assert.deepEqual(historyFor(userB, 'abc').messages, []);
  assert.deepEqual(historyFor(null, 'abc').messages, []);
});

import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';

// DB en memoria por proceso de test — debe fijarse ANTES de importar db/index.js
// (lee DB_PATH al cargar y aplica schema + migraciones).
process.env.DB_PATH = ':memory:';

let MIGRATIONS;
let db;

before(async () => {
  ({ MIGRATIONS, default: db } = await import('./index.js'));
});

// ── F22 / M003: eliminación idempotente del campo legacy campaigns.game_system ──

test('M003 elimina campaigns.game_system y es idempotente (reejecutar = no-op)', () => {
  const entry = MIGRATIONS.find(([name]) => name === 'M003_drop_campaigns_game_system');
  assert.ok(entry, 'M003 debe estar registrada en MIGRATIONS');
  const migrate = entry[1];

  // DB aislada con el esquema legacy (incluye la columna TEXT que M003 debe eliminar).
  const tmp = new Database(':memory:');
  tmp.exec(`
    CREATE TABLE campaigns (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      name           TEXT    NOT NULL,
      dm_id          INTEGER NOT NULL,
      game_system    TEXT    NOT NULL DEFAULT '',
      game_system_id INTEGER,
      description    TEXT    NOT NULL DEFAULT ''
    )
  `);

  // Primera aplicación: elimina la columna legacy.
  migrate(tmp);
  let cols = tmp.prepare('PRAGMA table_info(campaigns)').all();
  assert.ok(!cols.some((c) => c.name === 'game_system'), 'debe eliminar game_system');
  assert.ok(cols.some((c) => c.name === 'game_system_id'), 'no debe tocar game_system_id');

  // Segunda aplicación: idempotente (la columna ya no está) → no lanza y no cambia nada.
  assert.doesNotThrow(() => migrate(tmp), 'reejecutar M003 no debe lanzar');
  cols = tmp.prepare('PRAGMA table_info(campaigns)').all();
  assert.ok(!cols.some((c) => c.name === 'game_system'));

  tmp.close();
});

test('la DB cargada (schema + migraciones) ya no tiene campaigns.game_system y registró M003', () => {
  const cols = db.prepare('PRAGMA table_info(campaigns)').all();
  assert.ok(
    !cols.some((c) => c.name === 'game_system'),
    'el campo legacy game_system no debe existir tras aplicar schema + migraciones'
  );
  assert.ok(cols.some((c) => c.name === 'game_system_id'), 'game_system_id debe seguir presente');

  const ran = db
    .prepare('SELECT 1 FROM _migrations WHERE name = ?')
    .get('M003_drop_campaigns_game_system');
  assert.ok(ran, 'M003 debe quedar registrada en _migrations');
});

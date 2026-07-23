import Database from 'better-sqlite3';
import { readFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH || './data/rolapp.db';

mkdirSync(dirname(dbPath), { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── sqlite-vec (degradación elegante si no carga) ───────────────────────────────
// La búsqueda vectorial se usa desde F6. Si la extensión no carga, el resto de la
// app sigue funcionando; solo el RAG quedaría deshabilitado.
export let vecEnabled = false;
try {
  const sqliteVec = await import('sqlite-vec');
  sqliteVec.load(db);
  const { vec_version } = db.prepare('SELECT vec_version() AS vec_version').get();
  vecEnabled = true;
  console.log(`sqlite-vec cargado (versión ${vec_version})`);
} catch (err) {
  console.warn(`sqlite-vec no disponible — RAG deshabilitado por ahora: ${err.message}`);
}

// ── Esquema base ────────────────────────────────────────────────────────────────
const schema = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
db.exec(schema);

// ── Tabla virtual de vectores (solo si sqlite-vec cargó) ─────────────────────────
// No vive en schema.sql porque vec0 únicamente existe tras cargar la extensión.
// 768 dimensiones = nomic-embed-text. Idempotente; un fallo aquí no debe romper el
// arranque (la app sigue salvo el RAG).
if (vecEnabled) {
  try {
    db.exec(
      'CREATE VIRTUAL TABLE IF NOT EXISTS vec_chunks USING vec0(chunk_id INTEGER PRIMARY KEY, embedding FLOAT[768])'
    );
  } catch (err) {
    console.warn(`No se pudo crear vec_chunks — RAG vectorial deshabilitado: ${err.message}`);
    vecEnabled = false;
  }
}

// ── Índice FTS5 de chunks (keyword/BM25 para retrieval híbrido — §5.3) ───────────
// Vive aquí (no en schema.sql) por simetría con vec_chunks y porque FTS5 es una
// tabla virtual; es independiente de sqlite-vec, así que el keyword-search funciona
// aunque la búsqueda vectorial esté deshabilitada. La sincronización chunk↔FTS la
// hace services/rag.js con el mismo rowid (= doc_chunks.id). Idempotente.
export let ftsEnabled = false;
try {
  db.exec(
    "CREATE VIRTUAL TABLE IF NOT EXISTS doc_chunks_fts USING fts5(chunk_text, content='doc_chunks', content_rowid='id')"
  );
  ftsEnabled = true;
} catch (err) {
  console.warn(`No se pudo crear doc_chunks_fts — keyword search deshabilitado: ${err.message}`);
}

// ── Migraciones (baseline vacío; se llenan desde F1) ────────────────────────────
// Cada migración es `[name, fn(db)]`. Recibe la conexión por parámetro (en vez de
// cerrar sobre el `db` del módulo) para poder ejercitarla en tests sobre una DB
// aislada. Todas deben ser idempotentes: verifican el estado con PRAGMA antes de
// alterar (lección SQLite/F1), de modo que reejecutar el arreglo sea un no-op.
export const MIGRATIONS = [
  // F16: columna disposition en npcs para instalaciones previas al baseline nuevo.
  ['M001_npcs_disposition', (db) => {
    const cols = db.prepare('PRAGMA table_info(npcs)').all();
    if (cols.some((c) => c.name === 'disposition')) return;
    db.exec(
      "ALTER TABLE npcs ADD COLUMN disposition TEXT NOT NULL DEFAULT 'neutral' " +
        "CHECK(disposition IN ('ally','neutral','hostile'))"
    );
  }],
  // F18: session_notes es editable (UPDATE), a diferencia de session_events. Se añade
  // updated_at para reflejar la última edición.
  ['M002_session_notes_updated_at', (db) => {
    const cols = db.prepare('PRAGMA table_info(session_notes)').all();
    if (cols.some((c) => c.name === 'updated_at')) return;
    // SQLite no admite DEFAULT no-constante en ALTER; se añade sin default y se rellena.
    db.exec('ALTER TABLE session_notes ADD COLUMN updated_at INTEGER');
    db.exec('UPDATE session_notes SET updated_at = created_at WHERE updated_at IS NULL');
  }],
  // F22: elimina el campo legacy campaigns.game_system (TEXT). El sistema de juego se
  // referencia siempre por game_system_id (FK); el TEXT quedó muerto (ningún código lo
  // lee ni escribe — verificado por grep en F22). Idempotente: solo hace DROP si existe.
  ['M003_drop_campaigns_game_system', (db) => {
    const cols = db.prepare('PRAGMA table_info(campaigns)').all();
    if (!cols.some((c) => c.name === 'game_system')) return;
    db.exec('ALTER TABLE campaigns DROP COLUMN game_system');
  }],
];

runMigrations();

function runMigrations() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id     INTEGER PRIMARY KEY AUTOINCREMENT,
      name   TEXT    NOT NULL UNIQUE,
      ran_at INTEGER NOT NULL DEFAULT (unixepoch())
    )
  `);

  const ran = new Set(db.prepare('SELECT name FROM _migrations').all().map(r => r.name));
  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
  for (const [name, fn] of MIGRATIONS) {
    if (ran.has(name)) continue;
    db.transaction(() => {
      fn(db);
      insert.run(name);
    })();
    console.log(`Migración aplicada: ${name}`);
  }
}

export default db;

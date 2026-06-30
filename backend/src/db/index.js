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

  // Las migraciones estructurales se agregan aquí desde F1 en adelante.
  const migrations = [];

  const insert = db.prepare('INSERT INTO _migrations (name) VALUES (?)');
  for (const [name, fn] of migrations) {
    if (ran.has(name)) continue;
    db.transaction(() => {
      fn();
      insert.run(name);
    })();
    console.log(`Migración aplicada: ${name}`);
  }
}

export default db;

import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// vec0 no siempre carga en :memory: (ver LEARNINGS). Usamos un archivo temporal para
// que la extensión sqlite-vec y FTS5 funcionen igual que en producción.
// DB_PATH debe fijarse ANTES de importar db/index.js (lee la ruta al cargar el módulo).
const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-rag-'));
process.env.DB_PATH = join(tmpDir, 'rag-test.db');

let db;
let dbModule;
let ingestDoc, reindexDoc, deleteDoc, hybridSearch, chunkMarkdown;
let setEmbeddingProvider, EMBEDDING_DIMS;
let dmId, systemId;

// ── Stub determinista de embeddings ──────────────────────────────────────────────
// Hash del texto → vector fijo de 768 dims. Reparte "energía" en unas pocas dimensiones
// derivadas de las palabras, de modo que textos con palabras compartidas quedan cerca.
function makeDeterministicEmbedding(text, dims) {
  const v = new Array(dims).fill(0);
  const words = text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
  for (const w of words) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  // Normaliza para que la distancia coseno/L2 tenga sentido.
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

async function stubProvider(texts) {
  return texts.map((t) => makeDeterministicEmbedding(t, EMBEDDING_DIMS));
}

before(async () => {
  dbModule = await import('../db/index.js');
  db = dbModule.default;
  ({ ingestDoc, reindexDoc, deleteDoc, hybridSearch, chunkMarkdown } = await import('./rag.js'));
  ({ setEmbeddingProvider, EMBEDDING_DIMS } = await import('./embeddings.js'));
  setEmbeddingProvider(stubProvider);
});

beforeEach(() => {
  // doc_chunks tiene FK con ON DELETE CASCADE desde game_docs; vec/fts se purgan por
  // deleteDoc. Limpiamos en orden para no dejar huérfanos entre tests.
  for (const row of db.prepare('SELECT id FROM game_docs').all()) deleteDoc(row.id);
  db.exec('DELETE FROM game_docs; DELETE FROM doc_chunks;');
  db.exec('DELETE FROM game_system_templates; DELETE FROM users;');
  dmId = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm', 'x', 'dm')")
    .run().lastInsertRowid;
  systemId = db
    .prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Sistema test', dmId).lastInsertRowid;
});

const SAMPLE_MD = `# Reglas Core

Introducción al sistema.

## Combate

### Iniciativa
Para determinar la iniciativa cada personaje tira un dado de combate y suma su agilidad.
El orden va de mayor a menor resultado.

### Daño
El daño de un arma se resta de los puntos de golpe del objetivo.

## Magia

Los hechizos consumen puntos de poder. Lanzar un hechizo requiere concentración.
`;

test('chunkMarkdown respeta la jerarquía de headings y produce heading_path', () => {
  const chunks = chunkMarkdown(SAMPLE_MD);
  assert.ok(chunks.length >= 4, 'debe producir al menos un chunk por sección con cuerpo');

  const iniciativa = chunks.find((c) => c.headingPath.endsWith('Iniciativa'));
  assert.ok(iniciativa, 'existe un chunk para la sección Iniciativa');
  assert.equal(iniciativa.headingPath, 'Reglas Core > Combate > Iniciativa');
  assert.equal(iniciativa.sectionType, 'regla');
  assert.ok(iniciativa.tokenCount > 0);
});

test('ingestDoc indexa chunks en doc_chunks, vec_chunks y FTS', async () => {
  const result = await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: SAMPLE_MD });
  assert.ok(result.reindexed);
  assert.ok(result.chunks >= 4);

  const n = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(result.docId).n;
  assert.equal(n, result.chunks);

  if (dbModule.vecEnabled) {
    const vn = db.prepare('SELECT COUNT(*) AS n FROM vec_chunks').get().n;
    assert.equal(vn, result.chunks, 'cada chunk tiene su fila en vec_chunks');
  }
});

test('hybridSearch (vector + FTS + RRF) devuelve el chunk esperado', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: SAMPLE_MD });

  const results = await hybridSearch({ query: 'iniciativa combate agilidad', gameSystemId: systemId, k: 3 });
  assert.ok(results.length > 0, 'devuelve resultados');
  // El chunk de Iniciativa debe estar entre los top y conservar su heading_path para citar.
  const top = results[0];
  assert.match(top.heading_path, /Iniciativa/);
  assert.equal(top.doc_title, 'Manual');
  assert.ok(top.text.toLowerCase().includes('iniciativa'));
});

test('hybridSearch filtra por game_system_id', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: SAMPLE_MD });
  const otherSystem = db
    .prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Otro', dmId).lastInsertRowid;

  const results = await hybridSearch({ query: 'iniciativa combate', gameSystemId: otherSystem, k: 5 });
  assert.equal(results.length, 0, 'no devuelve chunks de otro sistema');
});

test('reindex por content_hash es idempotente y no duplica', async () => {
  const first = await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: SAMPLE_MD });
  // Reingerir el MISMO contenido en el mismo doc no debe reindexar ni duplicar.
  const second = await ingestDoc({
    gameSystemId: systemId,
    title: 'Manual',
    content: SAMPLE_MD,
    docId: first.docId,
  });
  assert.equal(second.reindexed, false, 'sin cambios → no reindexa');

  const n = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(first.docId).n;
  assert.equal(n, first.chunks, 'no se duplicaron chunks');

  // reindexDoc fuerza re-embeber pero mantiene el mismo número de chunks.
  const re = await reindexDoc(first.docId);
  assert.ok(re.reindexed);
  const n2 = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(first.docId).n;
  assert.equal(n2, first.chunks, 'reindex no duplica');
});

test('reingerir contenido distinto en el mismo doc reemplaza los chunks', async () => {
  const first = await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: SAMPLE_MD });
  const changed = SAMPLE_MD + '\n\n## Apéndice\n\nTabla de equipo y precios variados.';
  const second = await ingestDoc({
    gameSystemId: systemId,
    title: 'Manual',
    content: changed,
    docId: first.docId,
  });
  assert.ok(second.reindexed);
  assert.ok(second.chunks > first.chunks, 'el contenido nuevo añade chunks');
  // No quedan chunks viejos del doc fuera de los recién insertados.
  const docCount = db.prepare('SELECT COUNT(DISTINCT doc_id) AS n FROM doc_chunks').get().n;
  assert.equal(docCount, 1);
});

test('hybridSearch lanza error claro cuando vec y FTS están deshabilitados', async (t) => {
  if (dbModule.vecEnabled || dbModule.ftsEnabled) {
    // En este entorno ambos están activos; verificamos el contrato vía consulta vacía.
    await assert.rejects(
      () => hybridSearch({ query: '', gameSystemId: systemId }),
      /vacía/
    );
    return t.skip('vec/FTS activos: la degradación dura se valida en el código de guardia');
  }
  await assert.rejects(
    () => hybridSearch({ query: 'algo', gameSystemId: systemId }),
    /no disponible/
  );
});

// Limpieza del archivo temporal.
test('cleanup', () => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

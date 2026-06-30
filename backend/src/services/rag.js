import db from '../db/index.js';
import { vecEnabled, ftsEnabled } from '../db/index.js';
import { embedTexts, embedText } from './embeddings.js';

// ════════════════════════════════════════════════════════════════════════════════
// RAG: ingesta (chunking + embeddings) y retrieval híbrido (vector + FTS5 + RRF).
// §5 del plan. Toda la DB es síncrona (better-sqlite3); el async aparece SOLO por la
// llamada de red de embeddings.
// ════════════════════════════════════════════════════════════════════════════════

// Tamaño objetivo del chunk en "tokens" aproximados. No tokenizamos de verdad: usamos
// la heurística estándar ~4 chars/token, suficiente para acotar el tamaño del chunk.
const TARGET_TOKENS = 400;
const MAX_TOKENS = 500;
const OVERLAP_TOKENS = 60;
const CHARS_PER_TOKEN = 4;

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = OVERLAP_TOKENS * CHARS_PER_TOKEN;

export function estimateTokens(text) {
  return Math.max(1, Math.ceil(text.length / CHARS_PER_TOKEN));
}

// Hash estable del contenido para reindexado idempotente (FNV-1a en hex).
export function contentHash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

// ── Clasificación heurística de sección ─────────────────────────────────────────
// section_type: 'tabla' | 'regla' | 'lore' | 'general'. Heurística simple sobre el
// heading y el cuerpo; sirve para filtrar/explicar, no pretende ser perfecta.
function classifySection(headingPath, body) {
  const h = headingPath.toLowerCase();
  const b = body.toLowerCase();
  // Una sección con varias filas de tabla markdown se considera tabla.
  const tableLines = (body.match(/^\s*\|.*\|\s*$/gm) || []).length;
  if (tableLines >= 2) return 'tabla';
  if (/\b(regla|reglas|mecánica|mecanica|rule|combat|combate|tirada|roll|check|dc|dificultad)\b/.test(h + ' ' + b)) {
    return 'regla';
  }
  if (/\b(lore|historia|trasfondo|mundo|setting|leyenda|mito|región|region|reino)\b/.test(h)) {
    return 'lore';
  }
  return 'general';
}

// ── Chunking de Markdown respetando jerarquía de headings ────────────────────────
// Recorre el documento manteniendo una pila de headings (H1>H2>H3...). Cada sección
// (cuerpo bajo un heading) se parte en chunks de ~TARGET con solape; el heading_path
// completo se adjunta a cada chunk para poder citar la fuente.
export function chunkMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  const headingStack = []; // [{ level, text }]
  const sections = []; // [{ headingPath, body }]
  let buffer = [];

  const flush = () => {
    const body = buffer.join('\n').trim();
    if (body) {
      const headingPath = headingStack.map((h) => h.text).join(' > ');
      sections.push({ headingPath, body });
    }
    buffer = [];
  };

  for (const line of lines) {
    const m = /^(#{1,6})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      const level = m[1].length;
      const text = m[2].trim();
      while (headingStack.length && headingStack[headingStack.length - 1].level >= level) {
        headingStack.pop();
      }
      headingStack.push({ level, text });
    } else {
      buffer.push(line);
    }
  }
  flush();

  // Parte cada sección por tamaño objetivo, con solape, sin partir a mitad de palabra.
  const chunks = [];
  let sortOrder = 0;
  for (const section of sections) {
    for (const piece of splitWithOverlap(section.body)) {
      chunks.push({
        headingPath: section.headingPath || '(sin encabezado)',
        sectionType: classifySection(section.headingPath, piece),
        chunkText: piece,
        tokenCount: estimateTokens(piece),
        sortOrder: sortOrder++,
      });
    }
  }
  return chunks;
}

// Divide un texto en piezas de ~TARGET_CHARS (tope MAX_CHARS) con solape, cortando en
// fronteras de palabra. Si el texto cabe entero, devuelve una sola pieza.
function splitWithOverlap(text) {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return [trimmed];

  const pieces = [];
  let start = 0;
  while (start < trimmed.length) {
    let end = Math.min(start + TARGET_CHARS, trimmed.length);
    if (end < trimmed.length) {
      // Retrocede hasta el último espacio para no cortar palabras.
      const lastSpace = trimmed.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace;
    }
    pieces.push(trimmed.slice(start, end).trim());
    if (end >= trimmed.length) break;
    start = Math.max(end - OVERLAP_CHARS, start + 1);
  }
  return pieces.filter(Boolean);
}

// ── Statements preparados (síncronos) ────────────────────────────────────────────
const insertChunk = db.prepare(`
  INSERT INTO doc_chunks (doc_id, game_system_id, heading_path, section_type, chunk_text, token_count, sort_order)
  VALUES (?, ?, ?, ?, ?, ?, ?)
`);
const deleteChunksByDoc = db.prepare('DELETE FROM doc_chunks WHERE doc_id = ?');
const selectChunksByDoc = db.prepare('SELECT id FROM doc_chunks WHERE doc_id = ?');
const insertVec = vecEnabled
  ? db.prepare('INSERT INTO vec_chunks (chunk_id, embedding) VALUES (?, ?)')
  : null;
const deleteVec = vecEnabled ? db.prepare('DELETE FROM vec_chunks WHERE chunk_id = ?') : null;
const insertFts = ftsEnabled
  ? db.prepare('INSERT INTO doc_chunks_fts (rowid, chunk_text) VALUES (?, ?)')
  : null;
const deleteFts = ftsEnabled
  ? db.prepare("INSERT INTO doc_chunks_fts (doc_chunks_fts, rowid, chunk_text) VALUES ('delete', ?, ?)")
  : null;

const selectDoc = db.prepare('SELECT * FROM game_docs WHERE id = ?');
const insertDoc = db.prepare(`
  INSERT INTO game_docs (game_system_id, title, source_path, content_hash, created_at, updated_at)
  VALUES (?, ?, ?, ?, unixepoch(), unixepoch())
`);
const updateDocHash = db.prepare(
  'UPDATE game_docs SET content_hash = ?, title = ?, updated_at = unixepoch() WHERE id = ?'
);

// Borra los chunks de un doc de las tres tablas (doc_chunks + vec + fts) de forma atómica.
function purgeChunks(docId) {
  const rows = selectChunksByDoc.all(docId);
  for (const row of rows) {
    if (deleteVec) {
      try { deleteVec.run(BigInt(row.id)); } catch { /* vec_chunks puede no tener la fila */ }
    }
    if (deleteFts) {
      const chunk = db.prepare('SELECT chunk_text FROM doc_chunks WHERE id = ?').get(row.id);
      try { deleteFts.run(row.id, chunk?.chunk_text ?? ''); } catch { /* fts ya sin la fila */ }
    }
  }
  deleteChunksByDoc.run(docId);
}

// ── Ingesta de un documento ──────────────────────────────────────────────────────
// Crea (o reusa) la fila game_docs, chunkea, embebe y persiste en doc_chunks + vec +
// fts. Idempotente por content_hash: si el doc no cambió, no reingiere.
//
// Devuelve { docId, chunks, reindexed }.
export async function ingestDoc({ gameSystemId, title, content, sourcePath = null, docId = null }) {
  if (!content || !content.trim()) {
    throw new Error('El documento no tiene contenido');
  }
  const hash = contentHash(content);

  let doc = docId ? selectDoc.get(docId) : null;
  if (doc && doc.content_hash === hash) {
    // Sin cambios: no reingiere (idempotencia por hash).
    const n = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(doc.id).n;
    return { docId: doc.id, chunks: n, reindexed: false };
  }

  const chunks = chunkMarkdown(content);
  if (!chunks.length) {
    throw new Error('El documento no produjo chunks (¿está vacío?)');
  }

  // Embeddings ANTES de tocar la DB (es la única parte async / con red). Si Ollama está
  // caído, esto lanza aquí y NO dejamos una fila game_docs huérfana sin chunks.
  let vectors = null;
  if (vecEnabled) {
    vectors = await embedTexts(chunks.map((c) => c.chunkText));
  }

  // Persistencia atómica: crea/reusa el doc, purga lo viejo e inserta en las 3 tablas.
  const persist = db.transaction(() => {
    if (!doc) {
      const r = insertDoc.run(gameSystemId, title, sourcePath, hash);
      doc = selectDoc.get(r.lastInsertRowid);
    }
    purgeChunks(doc.id);
    chunks.forEach((c, i) => {
      const info = insertChunk.run(
        doc.id,
        gameSystemId,
        c.headingPath,
        c.sectionType,
        c.chunkText,
        c.tokenCount,
        c.sortOrder
      );
      const chunkId = Number(info.lastInsertRowid);
      if (insertVec && vectors) {
        // vec0 exige la PK como BigInt (un Number es rechazado como "no integer").
        insertVec.run(BigInt(chunkId), new Float32Array(vectors[i]));
      }
      if (insertFts) {
        insertFts.run(chunkId, c.chunkText);
      }
    });
    updateDocHash.run(hash, title, doc.id);
  });
  persist();

  return { docId: doc.id, chunks: chunks.length, reindexed: true };
}

// Reindexa un doc existente RE-EMBEBIENDO sus chunks en sitio (p. ej. tras cambiar de
// modelo de embeddings). No re-chunkea: preserva la estructura/heading_path original,
// que no podría reconstruirse desde el texto plano de los chunks. Solo refresca los
// vectores en vec_chunks (y reconstruye la fila FTS por consistencia).
export async function reindexDoc(docId) {
  const doc = selectDoc.get(docId);
  if (!doc) throw new Error('Documento no encontrado');
  const chunks = db
    .prepare('SELECT id, chunk_text FROM doc_chunks WHERE doc_id = ? ORDER BY sort_order ASC')
    .all(docId);
  if (!chunks.length) throw new Error('El documento no tiene chunks que reindexar');

  let vectors = null;
  if (vecEnabled) {
    vectors = await embedTexts(chunks.map((c) => c.chunk_text));
  }

  const persist = db.transaction(() => {
    chunks.forEach((c, i) => {
      if (insertVec && vectors) {
        try { deleteVec.run(BigInt(c.id)); } catch { /* sin fila previa */ }
        insertVec.run(BigInt(c.id), new Float32Array(vectors[i]));
      }
    });
  });
  persist();

  return { docId, chunks: chunks.length, reindexed: true };
}

export function deleteDoc(docId) {
  const doc = selectDoc.get(docId);
  if (!doc) return false;
  db.transaction(() => {
    purgeChunks(docId);
    db.prepare('DELETE FROM game_docs WHERE id = ?').run(docId);
  })();
  return true;
}

export function listDocs(gameSystemId) {
  return db
    .prepare(`
      SELECT gd.*, COUNT(dc.id) AS chunk_count
      FROM game_docs gd
      LEFT JOIN doc_chunks dc ON dc.doc_id = gd.id
      WHERE gd.game_system_id = ?
      GROUP BY gd.id
      ORDER BY gd.created_at DESC
    `)
    .all(gameSystemId);
}

// ── Retrieval híbrido (vector KNN + FTS5/BM25, fusionados con RRF) ───────────────
// RRF (Reciprocal Rank Fusion): score = Σ 1/(K + rank). Combina rankings de fuentes
// heterogéneas sin necesitar calibrar la escala de distancia vs BM25. K=60 estándar.
const RRF_K = 60;

// Sanitiza una consulta de usuario a un MATCH de FTS5 seguro: extrae términos y los une
// con OR. Evita que comillas/operadores del usuario rompan el parser de FTS5.
function toFtsQuery(query) {
  const terms = query
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2)
    .map((t) => `"${t}"`);
  return terms.length ? terms.join(' OR ') : null;
}

function vectorSearch(queryVector, gameSystemId, limit) {
  if (!vecEnabled) return [];
  // sqlite-vec exige el filtro de game_system por JOIN posterior (vec0 no filtra por
  // metadato). Recuperamos un poco de más (limit*4) y filtramos por sistema.
  const rows = db
    .prepare(`
      SELECT v.chunk_id AS id, v.distance
      FROM vec_chunks v
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `)
    .all(new Float32Array(queryVector), limit * 4);

  const filtered = [];
  const byId = db.prepare('SELECT id FROM doc_chunks WHERE id = ? AND game_system_id = ?');
  for (const r of rows) {
    // vec0 puede devolver el id como BigInt; lo normalizamos a Number para que las
    // claves del mapa de RRF coincidan con las de la búsqueda por keyword.
    const id = Number(r.id);
    if (byId.get(id, gameSystemId)) filtered.push({ id, distance: r.distance });
    if (filtered.length >= limit) break;
  }
  return filtered;
}

function keywordSearch(query, gameSystemId, limit) {
  if (!ftsEnabled) return [];
  const match = toFtsQuery(query);
  if (!match) return [];
  try {
    return db
      .prepare(`
        SELECT dc.id, bm25(doc_chunks_fts) AS score
        FROM doc_chunks_fts
        JOIN doc_chunks dc ON dc.id = doc_chunks_fts.rowid
        WHERE doc_chunks_fts MATCH ? AND dc.game_system_id = ?
        ORDER BY score
        LIMIT ?
      `)
      .all(match, gameSystemId, limit * 4);
  } catch {
    // Una query FTS malformada no debe tumbar el endpoint; degradamos a "sin keyword".
    return [];
  }
}

// Fusiona los rankings de vector y keyword con RRF y devuelve los top-k chunks con sus
// metadatos (heading_path, doc_title) para citar.
export async function hybridSearch({ query, gameSystemId, k = 5 }) {
  if (!query || !query.trim()) throw new Error('La consulta está vacía');
  if (!vecEnabled && !ftsEnabled) {
    throw new Error('Retrieval no disponible: ni búsqueda vectorial ni FTS están activas');
  }

  let vectorHits = [];
  if (vecEnabled) {
    const queryVector = await embedText(query);
    vectorHits = vectorSearch(queryVector, gameSystemId, k);
  }
  const keywordHits = keywordSearch(query, gameSystemId, k);

  // RRF: acumula 1/(K+rank) por documento a través de ambas listas.
  const scores = new Map();
  const addRanking = (hits) => {
    hits.forEach((hit, idx) => {
      const prev = scores.get(hit.id) || 0;
      scores.set(hit.id, prev + 1 / (RRF_K + idx + 1));
    });
  };
  addRanking(vectorHits);
  addRanking(keywordHits);

  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, k);

  if (!ranked.length) return [];

  const selectChunk = db.prepare(`
    SELECT dc.id, dc.heading_path, dc.section_type, dc.chunk_text, dc.token_count,
           gd.title AS doc_title
    FROM doc_chunks dc
    JOIN game_docs gd ON gd.id = dc.doc_id
    WHERE dc.id = ?
  `);

  return ranked.map(([id, score]) => {
    const row = selectChunk.get(id);
    return {
      chunk_id: id,
      score,
      heading_path: row.heading_path,
      section_type: row.section_type,
      doc_title: row.doc_title,
      text: row.chunk_text,
    };
  });
}

import db from '../db/index.js';
import { vecEnabled, ftsEnabled } from '../db/index.js';
import { embedTexts, embedQueryCached } from './embeddings.js';

// ════════════════════════════════════════════════════════════════════════════════
// RAG: ingesta (chunking + embeddings) y retrieval híbrido (vector + FTS5 + RRF).
// §5 del plan; optimizado en F11. Toda la DB es síncrona (better-sqlite3); el async
// aparece SOLO por la llamada de red de embeddings.
//
// F11 — optimizaciones de retrieval y contexto:
//   1) Chunking afinado: tamaño/solape configurables; no parte tablas Markdown ni
//      encabezados; conserva heading_path/section_type.
//   2) Fusión híbrida: normaliza distancia→similitud (vector) y BM25→[0,1] (FTS),
//      combina con RRF + pesos configurables (RAG_VECTOR_WEIGHT/RAG_KEYWORD_WEIGHT).
//   3) MMR (maximal marginal relevance) + dedup por heading_path para diversidad.
//   4) Filtros por section_type / doc.
// El empaquetado por presupuesto de tokens y la caché de queries viven en ai.js /
// embeddings.js respectivamente.
// ════════════════════════════════════════════════════════════════════════════════

// Tamaño objetivo del chunk en "tokens" aproximados. No tokenizamos de verdad: usamos
// la heurística estándar ~4 chars/token, suficiente para acotar el tamaño del chunk.
// Configurable por env con defaults sensatos (F11 §1).
const CHARS_PER_TOKEN = 4;
const TARGET_TOKENS = Math.max(50, Number(process.env.RAG_CHUNK_TARGET_TOKENS) || 400);
const MAX_TOKENS = Math.max(TARGET_TOKENS, Number(process.env.RAG_CHUNK_MAX_TOKENS) || 500);
const OVERLAP_TOKENS = Math.max(0, Number(process.env.RAG_CHUNK_OVERLAP_TOKENS) || 60);

const TARGET_CHARS = TARGET_TOKENS * CHARS_PER_TOKEN;
const MAX_CHARS = MAX_TOKENS * CHARS_PER_TOKEN;
const OVERLAP_CHARS = Math.min(OVERLAP_TOKENS * CHARS_PER_TOKEN, TARGET_CHARS - 1);

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

// ── Segmentación en bloques atómicos (no partibles) ──────────────────────────────
// Una línea de tabla Markdown empieza (tras espacios) por '|'. Agrupamos líneas de tabla
// consecutivas en un único bloque atómico para NO partir una tabla a la mitad (F11 §1).
// Cada bloque es un párrafo (separado por línea en blanco) o una tabla completa.
function isTableLine(line) {
  return /^\s*\|.*\|?\s*$/.test(line) && line.includes('|');
}

// Parte el cuerpo de una sección en bloques atómicos: párrafos y tablas completas.
// Las tablas nunca se dividen; los párrafos se separan por líneas en blanco.
function toBlocks(body) {
  const lines = body.split(/\r?\n/);
  const blocks = [];
  let current = [];
  let inTable = false;

  const flush = () => {
    const text = current.join('\n').trim();
    if (text) blocks.push(text);
    current = [];
  };

  for (const line of lines) {
    const tableLine = isTableLine(line);
    if (tableLine && !inTable) {
      // Empieza una tabla: cierra el bloque de párrafo previo.
      flush();
      inTable = true;
    } else if (!tableLine && inTable) {
      // Termina la tabla: ciérrala como bloque propio.
      flush();
      inTable = false;
    } else if (!tableLine && line.trim() === '' && !inTable) {
      // Línea en blanco entre párrafos: frontera de bloque.
      flush();
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

// Divide un texto en piezas de ~TARGET_CHARS (tope MAX_CHARS) con solape, respetando
// bloques atómicos: nunca parte una tabla Markdown ni un encabezado (los headings ya se
// separaron antes de llamar aquí). Empaqueta bloques consecutivos hasta el tamaño
// objetivo; si un bloque solo excede MAX_CHARS (párrafo enorme sin tabla), lo parte por
// fronteras de palabra como último recurso. Solapa arrastrando la cola del chunk previo.
function splitWithOverlap(text) {
  const trimmed = text.trim();
  if (trimmed.length <= MAX_CHARS) return [trimmed];

  const blocks = toBlocks(trimmed);
  const pieces = [];
  let buf = '';

  const pushBuf = () => {
    const t = buf.trim();
    if (t) pieces.push(t);
    // Solape: arrastra la cola del chunk recién cerrado (por fronteras de palabra).
    if (t && OVERLAP_CHARS > 0) {
      const tail = t.slice(Math.max(0, t.length - OVERLAP_CHARS));
      const sp = tail.indexOf(' ');
      buf = sp > 0 ? tail.slice(sp + 1) : '';
    } else {
      buf = '';
    }
  };

  for (const block of blocks) {
    // Un párrafo (no-tabla) que por sí solo excede MAX_CHARS se parte por palabras.
    const subBlocks =
      block.length > MAX_CHARS && !isTableLine(block.split('\n')[0])
        ? splitByWords(block)
        : [block];

    for (const sub of subBlocks) {
      const candidate = buf ? `${buf}\n\n${sub}` : sub;
      if (candidate.length > MAX_CHARS && buf) {
        // No cabe: cierra el chunk actual y arranca uno nuevo (con solape).
        pushBuf();
        buf = buf ? `${buf}\n\n${sub}` : sub;
      } else {
        buf = candidate;
      }
      // Si ya superamos el objetivo, cierra proactivamente para acotar el tamaño.
      if (buf.length >= TARGET_CHARS) pushBuf();
    }
  }
  if (buf.trim()) pieces.push(buf.trim());
  return pieces.filter(Boolean);
}

// Parte un texto largo por fronteras de palabra en piezas <= TARGET_CHARS (fallback para
// párrafos gigantes sin estructura). No añade solape aquí: lo gestiona splitWithOverlap.
function splitByWords(text) {
  const out = [];
  let start = 0;
  while (start < text.length) {
    let end = Math.min(start + TARGET_CHARS, text.length);
    if (end < text.length) {
      const lastSpace = text.lastIndexOf(' ', end);
      if (lastSpace > start) end = lastSpace;
    }
    out.push(text.slice(start, end).trim());
    start = end;
  }
  return out.filter(Boolean);
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
// embedMode:
//   'strict'    (default) → si vec está activo pero los embeddings fallan (Ollama caído),
//                LANZA sin dejar un game_docs huérfano. Es el contrato del endpoint REST.
//   'resilient' → embebe si puede; si el proveedor no responde, persiste doc + chunks +
//                FTS SIN vectores (quedan para reindex). Lo usa el seed para no romper
//                cuando no hay Ollama; la búsqueda por keyword/BM25 ya funciona.
//
// Devuelve { docId, chunks, reindexed, embedded }.
export async function ingestDoc({
  gameSystemId, title, content, sourcePath = null, docId = null, embedMode = 'strict',
}) {
  if (!content || !content.trim()) {
    throw new Error('El documento no tiene contenido');
  }
  const hash = contentHash(content);

  let doc = docId ? selectDoc.get(docId) : null;
  if (doc && doc.content_hash === hash) {
    // Sin cambios: no reingiere (idempotencia por hash).
    const n = db.prepare('SELECT COUNT(*) AS n FROM doc_chunks WHERE doc_id = ?').get(doc.id).n;
    return { docId: doc.id, chunks: n, reindexed: false, embedded: false };
  }

  const chunks = chunkMarkdown(content);
  if (!chunks.length) {
    throw new Error('El documento no produjo chunks (¿está vacío?)');
  }

  // Embeddings ANTES de tocar la DB (es la única parte async / con red). Si Ollama está
  // caído en modo 'strict', esto lanza aquí y NO dejamos un game_docs huérfano sin chunks.
  // En modo 'resilient' toleramos el fallo: seguimos sin vectores (quedan para reindex).
  let vectors = null;
  if (vecEnabled) {
    try {
      vectors = await embedTexts(chunks.map((c) => c.chunkText));
    } catch (err) {
      if (embedMode !== 'resilient') throw err;
      console.warn(
        `Ingesta sin vectores (proveedor de embeddings no disponible): ${err.message}. ` +
        'El doc queda con chunks + FTS; reindexa cuando Ollama esté arriba.'
      );
      vectors = null;
    }
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

  return { docId: doc.id, chunks: chunks.length, reindexed: true, embedded: !!vectors };
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

// ── Retrieval híbrido (vector KNN + FTS5/BM25, fusionados con RRF ponderado) ─────
// Fórmula de fusión (F11 §2). Para cada chunk que aparece en alguna lista:
//
//   fused(chunk) = W_vec * rrf(rank_vec) + W_kw * rrf(rank_kw)
//                + NORM_BLEND * (W_vec * sim_vec + W_kw * bm25_norm)
//
// donde:
//   rrf(rank) = 1 / (RRF_K + rank)              (Reciprocal Rank Fusion, K=60 estándar)
//   sim_vec   = 1 / (1 + distance)              (distancia L2 → similitud en (0,1])
//   bm25_norm = 1 - (score - min) / (max - min) (BM25: menor = mejor → min-max a [0,1])
//   W_vec, W_kw = RAG_VECTOR_WEIGHT / RAG_KEYWORD_WEIGHT (pesos configurables)
//
// El término RRF domina el orden (robusto a escalas heterogéneas); el término de scores
// normalizados (NORM_BLEND pequeño) desempata usando la magnitud real de similitud/BM25.
const RRF_K = 60;
const NORM_BLEND = 0.25;

// Los pesos se leen en cada llamada (no como constantes de módulo) para que un cambio de
// env — o un test — afecte el orden sin reimportar el módulo (que arrastra el singleton db).
function vectorWeight() {
  return Number(process.env.RAG_VECTOR_WEIGHT ?? 1);
}
function keywordWeight() {
  return Number(process.env.RAG_KEYWORD_WEIGHT ?? 1);
}
// Peso de la penalización por redundancia en MMR: 0 = solo relevancia, 1 = solo diversidad.
function mmrLambda() {
  return Math.min(1, Math.max(0, Number(process.env.RAG_MMR_LAMBDA ?? 0.3)));
}

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

// Aplica los filtros opcionales (section_type/doc) a una fila candidata ya materializada.
// Se hace en JS tras recuperar de vec0 (que no filtra por metadato) para mantener una
// sola ruta de filtrado coherente entre vector y keyword.
function passesFilters(row, { sectionType, docId }) {
  if (sectionType && row.section_type !== sectionType) return false;
  if (docId != null && Number(row.doc_id) !== Number(docId)) return false;
  return true;
}

function vectorSearch(queryVector, gameSystemId, limit, filters) {
  if (!vecEnabled) return [];
  // sqlite-vec exige el filtro de game_system por JOIN posterior (vec0 no filtra por
  // metadato). Recuperamos un poco de más (limit*4) y filtramos por sistema + filtros.
  const rows = db
    .prepare(`
      SELECT v.chunk_id AS id, v.distance
      FROM vec_chunks v
      WHERE v.embedding MATCH ? AND k = ?
      ORDER BY v.distance
    `)
    .all(new Float32Array(queryVector), limit * 4);

  const filtered = [];
  const byId = db.prepare(
    'SELECT id, section_type, doc_id FROM doc_chunks WHERE id = ? AND game_system_id = ?'
  );
  for (const r of rows) {
    // vec0 puede devolver el id como BigInt; lo normalizamos a Number para que las
    // claves del mapa de RRF coincidan con las de la búsqueda por keyword.
    const id = Number(r.id);
    const row = byId.get(id, gameSystemId);
    if (row && passesFilters(row, filters)) filtered.push({ id, distance: r.distance });
    if (filtered.length >= limit) break;
  }
  return filtered;
}

function keywordSearch(query, gameSystemId, limit, filters) {
  if (!ftsEnabled) return [];
  const match = toFtsQuery(query);
  if (!match) return [];
  try {
    const rows = db
      .prepare(`
        SELECT dc.id, dc.section_type, dc.doc_id, bm25(doc_chunks_fts) AS score
        FROM doc_chunks_fts
        JOIN doc_chunks dc ON dc.id = doc_chunks_fts.rowid
        WHERE doc_chunks_fts MATCH ? AND dc.game_system_id = ?
        ORDER BY score
        LIMIT ?
      `)
      .all(match, gameSystemId, limit * 4);
    return rows.filter((r) => passesFilters(r, filters)).slice(0, limit);
  } catch {
    // Una query FTS malformada no debe tumbar el endpoint; degradamos a "sin keyword".
    return [];
  }
}

// ── Similitud léxica para MMR (redundancia) ──────────────────────────────────────
// Jaccard sobre conjuntos de tokens. Sirve como señal de redundancia entre chunks sin
// leer los vectores de vec0 (frágil de deserializar) y funciona también en modo solo-FTS.
function tokenSet(text) {
  return new Set(
    text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3)
  );
}

function jaccard(setA, setB) {
  if (!setA.size || !setB.size) return 0;
  let inter = 0;
  for (const t of setA) if (setB.has(t)) inter++;
  return inter / (setA.size + setB.size - inter);
}

// Re-rank MMR: selecciona iterativamente el candidato que maximiza
//   (1 - λ) * relevancia − λ * max_sim_con_ya_seleccionados.
// Reduce redundancia manteniendo relevancia. Trabaja sobre candidatos ya materializados.
function mmrRerank(candidates, k, lambda) {
  if (lambda <= 0 || candidates.length <= 1) return candidates.slice(0, k);
  const withTokens = candidates.map((c) => ({ ...c, _tokens: tokenSet(c.text) }));
  const maxRel = Math.max(...withTokens.map((c) => c.score)) || 1;
  const selected = [];
  const pool = [...withTokens];
  while (selected.length < k && pool.length) {
    let bestIdx = 0;
    let bestVal = -Infinity;
    for (let i = 0; i < pool.length; i++) {
      const rel = pool[i].score / maxRel; // relevancia normalizada a [0,1]
      let maxSim = 0;
      for (const s of selected) maxSim = Math.max(maxSim, jaccard(pool[i]._tokens, s._tokens));
      const mmr = (1 - lambda) * rel - lambda * maxSim;
      if (mmr > bestVal) {
        bestVal = mmr;
        bestIdx = i;
      }
    }
    const [chosen] = pool.splice(bestIdx, 1);
    selected.push(chosen);
  }
  // Limpia el campo auxiliar de tokens solo al final (se necesita durante el bucle para
  // comparar cada candidato contra los ya seleccionados).
  for (const s of selected) delete s._tokens;
  return selected;
}

// Min-max de BM25 a [0,1] con "menor score = mejor" invertido (BM25 de FTS5 es negativo
// y más negativo = más relevante). Si solo hay un hit, cae a 1.
function normalizeBm25(hits) {
  if (!hits.length) return new Map();
  const scores = hits.map((h) => h.score);
  const min = Math.min(...scores);
  const max = Math.max(...scores);
  const span = max - min;
  const out = new Map();
  for (const h of hits) {
    // menor score → mejor; invertimos para que 1 sea el mejor.
    out.set(h.id, span > 0 ? 1 - (h.score - min) / span : 1);
  }
  return out;
}

// Fusiona vector + keyword (RRF ponderado + scores normalizados), aplica filtros, dedup
// por heading_path y re-rank MMR. Devuelve los top-k chunks con metadatos para citar.
//
// Opciones:
//   query, gameSystemId, k
//   sectionType?  — filtra por doc_chunks.section_type ('tabla'|'regla'|'lore'|'general')
//   docId?        — restringe a un documento concreto
//   mmr?          — activa/desactiva el re-rank MMR (default: true si λ>0)
//   dedupByHeading? — colapsa chunks del mismo heading_path (default: true)
export async function hybridSearch({
  query, gameSystemId, k = 5, sectionType = null, docId = null,
  mmr = true, dedupByHeading = true,
}) {
  if (!query || !query.trim()) throw new Error('La consulta está vacía');
  if (!vecEnabled && !ftsEnabled) {
    throw new Error('Retrieval no disponible: ni búsqueda vectorial ni FTS están activas');
  }

  const filters = { sectionType, docId };
  // Recuperamos un pool más ancho que k para dar material a dedup + MMR (F11 §3-4).
  const poolSize = Math.max(k * 4, 20);

  let vectorHits = [];
  if (vecEnabled) {
    try {
      // Caché de embeddings de queries: evita recomputar el vector de queries repetidas.
      const queryVector = await embedQueryCached(query);
      vectorHits = vectorSearch(queryVector, gameSystemId, poolSize, filters);
    } catch (err) {
      // Si el proveedor de embeddings no responde (Ollama caído) pero hay FTS, degradamos
      // a solo-keyword en vez de fallar: el BM25 ya cubre docs ingeridos sin vectores.
      if (!ftsEnabled) throw err;
      console.warn(`Búsqueda vectorial no disponible, degradando a FTS: ${err.message}`);
    }
  }
  const keywordHits = keywordSearch(query, gameSystemId, poolSize, filters);

  // ── Fusión: RRF ponderado + término de scores normalizados (ver fórmula arriba) ──
  const bm25Norm = normalizeBm25(keywordHits);
  const fused = new Map(); // id -> score
  const add = (hits, weight, normFor) => {
    hits.forEach((hit, idx) => {
      const rrf = weight / (RRF_K + idx + 1);
      const norm = NORM_BLEND * weight * normFor(hit);
      fused.set(hit.id, (fused.get(hit.id) || 0) + rrf + norm);
    });
  };
  add(vectorHits, vectorWeight(), (h) => 1 / (1 + h.distance)); // distancia L2 → similitud
  add(keywordHits, keywordWeight(), (h) => bm25Norm.get(h.id) || 0);

  if (!fused.size) return [];

  const selectChunk = db.prepare(`
    SELECT dc.id, dc.heading_path, dc.section_type, dc.chunk_text, dc.token_count,
           gd.title AS doc_title
    FROM doc_chunks dc
    JOIN game_docs gd ON gd.id = dc.doc_id
    WHERE dc.id = ?
  `);

  // Materializa candidatos ordenados por score de fusión (desc).
  let candidates = [...fused.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, score]) => {
      const row = selectChunk.get(id);
      return {
        chunk_id: id,
        score,
        heading_path: row.heading_path,
        section_type: row.section_type,
        doc_title: row.doc_title,
        text: row.chunk_text,
        token_count: row.token_count,
      };
    });

  // Dedup por heading_path: nos quedamos con el mejor chunk de cada encabezado para no
  // devolver 3 trozos del mismo heading (F11 §4). Como candidates ya viene ordenado por
  // score, el primero visto por heading es el de mayor score.
  if (dedupByHeading) {
    const seen = new Set();
    candidates = candidates.filter((c) => {
      const key = `${c.doc_title}::${c.heading_path}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // Re-rank MMR para diversidad (evita casi-duplicados semánticos). Si está desactivado,
  // devuelve el top-k por score de fusión directo.
  const lambda = mmrLambda();
  const top = mmr && lambda > 0
    ? mmrRerank(candidates, k, lambda)
    : candidates.slice(0, k);

  return top.map((c) => ({
    chunk_id: c.chunk_id,
    score: c.score,
    heading_path: c.heading_path,
    section_type: c.section_type,
    doc_title: c.doc_title,
    text: c.text,
    token_count: c.token_count,
  }));
}

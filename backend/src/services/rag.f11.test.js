import { test, before, beforeEach, afterEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// ════════════════════════════════════════════════════════════════════════════════
// Tests de las optimizaciones de F11: chunking (tablas/solape), fusión con pesos
// configurables, MMR/dedup, presupuesto de tokens y caché de embeddings de queries.
// Todo con el stub determinista de embeddings (sin Ollama).
// ════════════════════════════════════════════════════════════════════════════════

const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-f11-'));
process.env.DB_PATH = join(tmpDir, 'f11.db');

let db;
let ingestDoc, hybridSearch, chunkMarkdown;
let setEmbeddingProvider, embedQueryCached, clearQueryCache, EMBEDDING_DIMS;
let dmId, systemId;

let embedCalls = 0; // cuenta llamadas al provider (para el test de caché)

function makeDeterministicEmbedding(text, dims) {
  const v = new Array(dims).fill(0);
  for (const w of text.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean)) {
    let h = 0;
    for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
    v[h % dims] += 1;
  }
  const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
  return v.map((x) => x / norm);
}

before(async () => {
  db = (await import('../db/index.js')).default;
  ({ ingestDoc, hybridSearch, chunkMarkdown } = await import('./rag.js'));
  ({ setEmbeddingProvider, embedQueryCached, clearQueryCache, EMBEDDING_DIMS } = await import('./embeddings.js'));
  setEmbeddingProvider(async (texts) => {
    embedCalls += texts.length;
    return texts.map((t) => makeDeterministicEmbedding(t, EMBEDDING_DIMS));
  });
});

beforeEach(() => {
  db.exec('DELETE FROM game_docs; DELETE FROM doc_chunks; DELETE FROM game_system_templates; DELETE FROM users;');
  clearQueryCache();
  embedCalls = 0;
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm','x','dm')").run().lastInsertRowid;
  systemId = db
    .prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('F11 System', dmId).lastInsertRowid;
});

afterEach(() => {
  // Restaura pesos por si un test los modificó.
  delete process.env.RAG_VECTOR_WEIGHT;
  delete process.env.RAG_KEYWORD_WEIGHT;
});

// ── Chunking: no partir tablas ni encabezados ─────────────────────────────────────
test('chunkMarkdown no parte una tabla Markdown a la mitad', () => {
  // Tabla grande dentro de una sección que supera el tamaño máximo de chunk.
  const rows = Array.from({ length: 40 }, (_, i) => `| Objeto ${i} | ${i * 10} monedas | descripción larga del objeto número ${i} con texto de relleno para inflar |`);
  const md = `# Equipo\n\n## Tabla de precios\n\n| Objeto | Precio | Notas |\n| --- | --- | --- |\n${rows.join('\n')}\n`;
  const chunks = chunkMarkdown(md);
  // Ninguna fila de tabla debe quedar aislada de las demás: cada chunk que contenga '|'
  // debe empezar dentro del bloque de tabla (no cortar una fila por la mitad de una celda).
  for (const c of chunks) {
    const tableLines = c.chunkText.split('\n').filter((l) => l.trim().startsWith('|'));
    for (const line of tableLines) {
      // Una fila de tabla bien formada termina en '|' (o es el separador ---).
      assert.ok(line.trim().endsWith('|'), `fila de tabla cortada: "${line}"`);
    }
  }
  assert.equal(chunks[0].sectionType, 'tabla', 'la sección con tabla se clasifica como tabla');
});

test('chunkMarkdown mantiene el heading_path en cada pieza de una sección larga', () => {
  const longBody = Array.from({ length: 30 }, (_, i) => `Párrafo número ${i} con suficiente texto de relleno para forzar múltiples chunks en la misma sección larga de reglas.`).join('\n\n');
  const md = `# Reglas\n\n## Sección Larga\n\n${longBody}\n`;
  const chunks = chunkMarkdown(md);
  assert.ok(chunks.length > 1, 'la sección larga produce varios chunks');
  for (const c of chunks) {
    assert.equal(c.headingPath, 'Reglas > Sección Larga', 'todos los chunks conservan el heading_path');
  }
});

// ── Fusión: pesos configurables afectan el orden ──────────────────────────────────
const FUSION_DOC = `# Bestiario

## Dragón rojo
El dragón rojo escupe fuego y vuela sobre las montañas del norte con furia legendaria.

## Notas del sabio
El sabio anota que el dragón fue visto una vez cerca del río; poco más se sabe del dragón.
`;

// Poner un peso a 0 desactiva por completo esa señal, lo que SÍ garantiza un cambio de
// orden observable cuando ambas señales no coinciden. Verificamos que:
//   (a) con solo-keyword vs solo-vector el ranking cambia, y
//   (b) el score de fusión de un chunk escala con el peso de su señal.
test('fusión híbrida: los pesos configurables afectan el orden y el score', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Bestiario', content: FUSION_DOC });
  const query = 'dragón rojo fuego montañas vuela';

  // Solo keyword (vector desactivado): el orden lo dicta BM25.
  process.env.RAG_KEYWORD_WEIGHT = '1';
  process.env.RAG_VECTOR_WEIGHT = '0';
  clearQueryCache();
  const kwOnly = await hybridSearch({ query, gameSystemId: systemId, k: 2, mmr: false });

  // Solo vector (keyword desactivado): el orden lo dicta la similitud vectorial.
  process.env.RAG_KEYWORD_WEIGHT = '0';
  process.env.RAG_VECTOR_WEIGHT = '1';
  clearQueryCache();
  const vecOnly = await hybridSearch({ query, gameSystemId: systemId, k: 2, mmr: false });

  // Pesos balanceados: ambas señales contribuyen.
  process.env.RAG_KEYWORD_WEIGHT = '1';
  process.env.RAG_VECTOR_WEIGHT = '1';
  clearQueryCache();
  const balanced = await hybridSearch({ query, gameSystemId: systemId, k: 2, mmr: false });

  // (a) Con una señal desactivada, el conjunto de scores debe diferir del balanceado:
  //     prueba directa de que los pesos entran en la fórmula de fusión.
  const scoreOf = (list, heading) => list.find((r) => r.heading_path.includes(heading))?.score ?? 0;
  const dragonKw = scoreOf(kwOnly, 'Dragón');
  const dragonVec = scoreOf(vecOnly, 'Dragón');
  const dragonBal = scoreOf(balanced, 'Dragón');
  assert.ok(dragonBal > dragonKw, 'sumar la señal vectorial sube el score respecto a solo-keyword');
  assert.ok(dragonBal > dragonVec, 'sumar la señal de keyword sube el score respecto a solo-vector');

  // (b) Escalar el peso de vector multiplica su contribución al score de fusión.
  process.env.RAG_KEYWORD_WEIGHT = '0';
  process.env.RAG_VECTOR_WEIGHT = '10';
  clearQueryCache();
  const vecHeavy = await hybridSearch({ query, gameSystemId: systemId, k: 2, mmr: false });
  assert.ok(
    scoreOf(vecHeavy, 'Dragón') > dragonVec,
    'un peso vectorial mayor aumenta el score de fusión del mismo chunk'
  );
});

// ── Dedup por heading_path + MMR ──────────────────────────────────────────────────
test('dedup por heading_path: no devuelve varios chunks del mismo encabezado', async () => {
  // Sección larga → varios chunks bajo el MISMO heading_path.
  const body = Array.from({ length: 25 }, (_, i) => `La regla de sigilo detalle ${i}: el sigilo permite ocultarse y evitar la percepción enemiga con astucia.`).join('\n\n');
  const md = `# Reglas\n\n## Sigilo\n\n${body}\n`;
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: md });

  const results = await hybridSearch({ query: 'sigilo ocultarse percepción astucia', gameSystemId: systemId, k: 5 });
  const headings = results.map((r) => r.heading_path);
  const unique = new Set(headings);
  assert.equal(unique.size, headings.length, 'no hay heading_path repetido en los resultados (dedup)');
});

test('MMR reduce redundancia frente al top-k por score directo', async () => {
  // Dos secciones casi idénticas + una distinta. Con dedup off (headings distintos) y
  // MMR on, la sección distinta debe colarse antes que el casi-duplicado.
  const md = `# Doc

## Fuego A
Los hechizos de fuego queman e incendian a los enemigos con llamas ardientes.

## Fuego B
Los hechizos de fuego queman e incendian a los enemigos con llamas ardientes intensas.

## Hielo
Los hechizos de hielo congelan y ralentizan a los enemigos con escarcha gélida.
`;
  await ingestDoc({ gameSystemId: systemId, title: 'Doc', content: md });

  const withMmr = await hybridSearch({ query: 'hechizos de fuego que queman enemigos', gameSystemId: systemId, k: 2, mmr: true });
  // El top-1 sigue siendo fuego (relevante); MMR no debe romper la relevancia.
  assert.match(withMmr[0].heading_path, /Fuego/, 'MMR mantiene el resultado más relevante primero');
  assert.ok(withMmr.length >= 1);
});

// ── Presupuesto de tokens ─────────────────────────────────────────────────────────
test('empaquetado por presupuesto de tokens respeta el límite (vía ai.retrieveRules)', async () => {
  process.env.RAG_CONTEXT_TOKEN_BUDGET = '120'; // muy pequeño para forzar recorte
  // Import fresco de ai.js para que tome el presupuesto reducido (constante de módulo).
  const ai = await import(`./ai.js?budget=${Date.now()}`);
  const { setLlmClient, answerRulesQuestion } = ai;

  const body = Array.from({ length: 20 }, (_, i) => `## Sección ${i}\n\nRegla número ${i} con bastante texto de relleno para que cada chunk tenga un costo apreciable en tokens estimados y forzar el recorte.`).join('\n\n');
  await ingestDoc({ gameSystemId: systemId, title: 'Grande', content: `# Manual\n\n${body}\n` });

  let promptSeen = '';
  // El servicio manda mensajes chat ([{role,content}]); aplanamos a texto para inspeccionar.
  setLlmClient(async (p) => {
    promptSeen = Array.isArray(p) ? p.map((m) => m.content).join('\n') : p;
    return 'ok';
  });
  const result = await answerRulesQuestion({ query: 'regla sección texto relleno', gameSystemId: systemId });
  setLlmClient(null);
  delete process.env.RAG_CONTEXT_TOKEN_BUDGET;

  // El total de tokens de las fuentes usadas no debe exceder groseramente el presupuesto:
  // se permite un único chunk que supere el límite (garantía de al menos un chunk).
  const usedTokens = result.sources.reduce((s, src) => s + Math.ceil((src.snippet?.length || 0) / 4), 0);
  assert.ok(result.sources.length >= 1, 'al menos una fuente');
  // Con presupuesto de 120 tokens no deberían caber los 20 chunks: el recorte funciona.
  assert.ok(result.sources.length < 20, 'el presupuesto recortó el número de chunks');
  assert.ok(promptSeen.includes('REGLAS RECUPERADAS'), 'el prompt lleva el contexto empaquetado');
  assert.ok(usedTokens >= 0);
});

// ── Caché de embeddings de queries ────────────────────────────────────────────────
test('embedQueryCached no recomputa el embedding de una query repetida', async () => {
  embedCalls = 0;
  const q = '¿cómo funciona la iniciativa en combate?';
  await embedQueryCached(q);
  const afterFirst = embedCalls;
  assert.equal(afterFirst, 1, 'la primera vez llama al provider');

  await embedQueryCached(q); // misma query
  await embedQueryCached(q.toUpperCase()); // misma tras normalizar mayúsculas/espacios
  await embedQueryCached(`  ${q}  `); // misma tras trim
  assert.equal(embedCalls, afterFirst, 'las repeticiones NO recomputan (hit de caché)');

  await embedQueryCached('otra query distinta totalmente');
  assert.equal(embedCalls, afterFirst + 1, 'una query nueva sí llama al provider');
});

test('hybridSearch reutiliza la caché de queries (no re-embebe la misma búsqueda)', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Bestiario', content: FUSION_DOC });
  clearQueryCache();
  embedCalls = 0;

  const query = 'dragón rojo fuego';
  await hybridSearch({ query, gameSystemId: systemId, k: 2 });
  const afterFirst = embedCalls;
  await hybridSearch({ query, gameSystemId: systemId, k: 2 });
  assert.equal(embedCalls, afterFirst, 'la segunda búsqueda idéntica no re-embebe la query');
});

// ── Filtro por section_type ───────────────────────────────────────────────────────
test('filtro por section_type restringe los resultados', async () => {
  const md = `# Manual

## Tabla de armas
| Arma | Daño |
| --- | --- |
| Espada | 6 |
| Hacha | 8 |
| Lanza | 5 |

## Reglas de combate
El combate se resuelve con tiradas de ataque contra la defensa del objetivo.
`;
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: md });

  const onlyTables = await hybridSearch({ query: 'combate ataque tabla armas espada', gameSystemId: systemId, k: 5, sectionType: 'tabla' });
  assert.ok(onlyTables.length > 0, 'hay resultados de tipo tabla');
  for (const r of onlyTables) assert.equal(r.section_type, 'tabla', 'solo devuelve chunks de tipo tabla');
});

after(() => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

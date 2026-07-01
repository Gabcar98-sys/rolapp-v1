import { test, before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtempSync, rmSync } from 'node:fs';

// ════════════════════════════════════════════════════════════════════════════════
// Eval anti-regresión del retrieval (F11 §7). Ingiere un corpus determinista y mide el
// hit-rate@k: para cada query, ¿aparece el chunk esperado entre los top-k? Falla si el
// hit-rate baja del umbral. Sirve para no regresar al optimizar el retrieval en el futuro.
//
// Todo corre SIN Ollama: un stub determinista mapea texto → vector de 768 dims. Textos
// que comparten palabras quedan cerca en el espacio, así el retrieval vectorial + FTS
// tiene señal real que fusionar.
// ════════════════════════════════════════════════════════════════════════════════

const tmpDir = mkdtempSync(join(tmpdir(), 'rolapp-rageval-'));
process.env.DB_PATH = join(tmpDir, 'rag-eval.db');

let db;
let ingestDoc, hybridSearch;
let setEmbeddingProvider, clearQueryCache, EMBEDDING_DIMS;
let dmId, systemId;

// Umbral de hit-rate@3: el retrieval debe acertar al menos este porcentaje de queries.
const HIT_RATE_THRESHOLD = 0.8;
const EVAL_K = 3;

// Stub determinista: reparte energía en dimensiones derivadas de las palabras. Textos
// con vocabulario compartido quedan cerca (coseno/L2). Es el mismo esquema que rag.test.js.
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
  ({ ingestDoc, hybridSearch } = await import('./rag.js'));
  ({ setEmbeddingProvider, clearQueryCache, EMBEDDING_DIMS } = await import('./embeddings.js'));
  setEmbeddingProvider(async (texts) => texts.map((t) => makeDeterministicEmbedding(t, EMBEDDING_DIMS)));
});

beforeEach(() => {
  db.exec('DELETE FROM game_docs; DELETE FROM doc_chunks; DELETE FROM game_system_templates; DELETE FROM users;');
  clearQueryCache();
  dmId = db.prepare("INSERT INTO users (username, pin_hash, role) VALUES ('dm','x','dm')").run().lastInsertRowid;
  systemId = db
    .prepare('INSERT INTO game_system_templates (name, dm_id) VALUES (?, ?)')
    .run('Eval System', dmId).lastInsertRowid;
});

// Corpus del eval: cada sección tiene vocabulario distintivo para que las queries la
// identifiquen inequívocamente. El heading (marcador esperado) va en cada query.
const EVAL_DOC = `# Manual del Juego

## Combate

### Iniciativa
Para determinar la iniciativa cada personaje tira un dado y suma su agilidad reflejos.
El orden de turno va de mayor a menor resultado en la tirada de iniciativa.

### Ataque cuerpo a cuerpo
Un ataque cuerpo a cuerpo usa fuerza contra la defensa del objetivo con una tirada.
Si el ataque supera la defensa, el arma inflige daño.

### Ataque a distancia
Los ataques a distancia con arco o ballesta usan puntería y consideran el alcance.
La cobertura del objetivo penaliza la tirada de disparo.

## Magia

### Lanzar hechizos
Lanzar un hechizo consume puntos de poder mágico y exige concentración del mago.
Un hechizo interrumpido durante la concentración se pierde sin efecto.

### Escuela de fuego
Los hechizos de fuego incendian y provocan daño ardiente por varios turnos.
El piromante domina las llamas y la combustión de sus enemigos.

## Exploración

### Sigilo
El sigilo permite moverse sin ser detectado usando ocultación y silencio.
Una tirada de sigilo se enfrenta a la percepción de los guardias enemigos.

### Trampas
Detectar trampas requiere una tirada de percepción y astucia del explorador.
Desactivar una trampa mecánica usa destreza manual y herramientas finas.

## Descanso

### Recuperación
Durante un descanso largo los personajes recuperan puntos de vida y fatiga.
El descanso restaura también los puntos de poder mágico gastados.
`;

// Queries de eval: { query, expectedHeadingSubstr }. La query usa vocabulario de la
// sección objetivo; el marcador esperado es un fragmento único de su heading_path.
const EVAL_QUERIES = [
  { query: 'cómo se determina la iniciativa y el orden de turno', expected: 'Iniciativa' },
  { query: 'ataque cuerpo a cuerpo con fuerza contra defensa', expected: 'cuerpo a cuerpo' },
  { query: 'disparar con arco a distancia y cobertura', expected: 'distancia' },
  { query: 'lanzar un hechizo consume puntos de poder y concentración', expected: 'Lanzar hechizos' },
  { query: 'hechizos de fuego que incendian y queman enemigos', expected: 'fuego' },
  { query: 'moverse con sigilo sin ser detectado por guardias', expected: 'Sigilo' },
  { query: 'detectar y desactivar trampas con percepción y destreza', expected: 'Trampas' },
  { query: 'recuperar puntos de vida durante un descanso largo', expected: 'Recuperación' },
];

test('hit-rate@k del retrieval supera el umbral (anti-regresión)', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: EVAL_DOC });

  let hits = 0;
  const misses = [];
  for (const { query, expected } of EVAL_QUERIES) {
    const results = await hybridSearch({ query, gameSystemId: systemId, k: EVAL_K });
    const hit = results.some((r) => r.heading_path.toLowerCase().includes(expected.toLowerCase()));
    if (hit) hits++;
    else misses.push(query);
  }
  const hitRate = hits / EVAL_QUERIES.length;

  assert.ok(
    hitRate >= HIT_RATE_THRESHOLD,
    `hit-rate@${EVAL_K} = ${(hitRate * 100).toFixed(1)}% (umbral ${(HIT_RATE_THRESHOLD * 100)}%). ` +
      `Queries fallidas: ${misses.join(' | ')}`
  );
});

test('hit-rate@1 (posición top) se mantiene razonable', async () => {
  await ingestDoc({ gameSystemId: systemId, title: 'Manual', content: EVAL_DOC });

  let top1 = 0;
  for (const { query, expected } of EVAL_QUERIES) {
    const results = await hybridSearch({ query, gameSystemId: systemId, k: 1 });
    if (results[0]?.heading_path.toLowerCase().includes(expected.toLowerCase())) top1++;
  }
  const rate = top1 / EVAL_QUERIES.length;
  // Umbral más laxo en @1: basta que la mitad quede exactamente en primera posición.
  assert.ok(rate >= 0.5, `hit-rate@1 = ${(rate * 100).toFixed(1)}% (umbral 50%)`);
});

after(() => {
  try {
    db.close();
    rmSync(tmpDir, { recursive: true, force: true });
  } catch { /* best-effort */ }
});

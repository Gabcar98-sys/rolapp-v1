// Seed idempotente de sistemas de ejemplo + contenido para la IA (F10).
//
// Qué hace (idempotente: correrlo dos veces no duplica nada):
//   1. Asegura un usuario DM (--dm <username>, default "dm"; PIN por defecto "0000").
//   2. Importa los packs JSON de game-packs/ (Stormlight, Dragonbane) con importGamePack.
//      Si ya existe un sistema con ese nombre para ese DM, NO lo reimporta.
//   3. Los pregens (base_characters) van embebidos en los packs → los crea el import.
//   4. Ingiere la guía de Stormlight como game_doc (chunks + FTS siempre; embeddings solo
//      si hay proveedor disponible). Sin Ollama NO falla: doc+chunks+FTS quedan listos y
//      los vectores se generan luego con el reindex documentado en game-packs/README.md.
//
// Correr (entorno canónico Docker):
//   docker compose exec backend node scripts/seed-examples.js --dm dm
//
// better-sqlite3 es SÍNCRONO; la única parte async es la ingesta RAG (llamada de red de
// embeddings, que además está protegida para degradar sin Ollama).

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

import db from '../src/db/index.js';
import { importGamePack } from '../src/services/gamePack.js';
import { ingestDoc } from '../src/services/rag.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// PIN por defecto del DM sembrado. Documentado en README; es red local, hash SHA-256.
const DEFAULT_DM_PIN = '0000';

// Packs a importar. `docs` lista los .md a ingerir tras importar el sistema; cada uno se
// asocia por su `title` a la fila game_docs que el import ya creó (o se crea si falta).
const SEED_PACKS = [
  {
    file: 'stormlight.json',
    docs: [
      { title: 'Stormlight RPG — Guia Completa', path: 'docs/stormlight/STORMLIGHT_RPG_GUIDE.md' },
    ],
  },
  { file: 'dragonbane.json', docs: [] },
];

// Mismo hash de PIN que routes/auth.js (SHA-256, sin sal — red local).
function hashPin(pin) {
  return createHash('sha256').update(String(pin)).digest('hex');
}

// Resuelve el directorio de game-packs. Prioridad: env GAME_PACKS_DIR → /app/game-packs
// (montado en el contenedor) → ../../game-packs (repo local, junto a backend/).
function resolveGamePacksDir() {
  const candidates = [
    process.env.GAME_PACKS_DIR,
    resolve('/app/game-packs'),
    resolve(__dirname, '../../game-packs'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, 'stormlight.json'))) return dir;
  }
  throw new Error(
    `No se encontró el directorio game-packs. Probados: ${candidates.join(', ')}. ` +
    'Define GAME_PACKS_DIR o monta game-packs en el contenedor.'
  );
}

// Lee --dm <username> del argv; default "dm".
function parseDmUsername(argv) {
  const idx = argv.indexOf('--dm');
  if (idx !== -1 && argv[idx + 1]) return argv[idx + 1];
  return 'dm';
}

// Asegura el usuario DM (idempotente). Devuelve su id. Si existe pero no es DM, aborta.
function ensureDm(username) {
  const existing = db.prepare('SELECT id, role FROM users WHERE username = ?').get(username);
  if (existing) {
    if (existing.role !== 'dm') {
      throw new Error(`El usuario "${username}" existe pero no es un DM (role=${existing.role})`);
    }
    return existing.id;
  }
  const info = db
    .prepare("INSERT INTO users (username, pin_hash, role) VALUES (?, ?, 'dm')")
    .run(username, hashPin(DEFAULT_DM_PIN));
  console.log(`DM creado: "${username}" (PIN por defecto ${DEFAULT_DM_PIN})`);
  return Number(info.lastInsertRowid);
}

// Importa un pack si el sistema (por nombre + DM) no existe aún. Devuelve el id del
// sistema (nuevo o existente) y si fue creado en esta corrida.
function ensureSystem(dmId, pack) {
  const existing = db
    .prepare('SELECT id FROM game_system_templates WHERE name = ? AND dm_id = ?')
    .get(pack.name, dmId);
  if (existing) {
    return { gameSystemId: existing.id, created: false };
  }
  const gameSystemId = importGamePack(db, dmId, pack);
  return { gameSystemId, created: true };
}

// Ingesta idempotente de un doc de juego: busca la fila game_docs existente (por título)
// para reusar su id (ingestDoc no reingiere si el content_hash coincide). Resiliente sin
// embeddings: ingestDoc solo embebe si vecEnabled; si no, deja doc+chunks+FTS.
async function ensureDoc(gameSystemId, doc, packsDir) {
  const fullPath = join(packsDir, doc.path);
  if (!existsSync(fullPath)) {
    console.warn(`  ⚠ doc no encontrado, se omite: ${fullPath}`);
    return;
  }
  const content = readFileSync(fullPath, 'utf8');
  const existing = db
    .prepare('SELECT id FROM game_docs WHERE game_system_id = ? AND title = ?')
    .get(gameSystemId, doc.title);
  const result = await ingestDoc({
    gameSystemId,
    title: doc.title,
    content,
    sourcePath: doc.path,
    docId: existing?.id ?? null,
    embedMode: 'resilient',
  });
  const verb = result.reindexed ? (existing ? 'reingerido' : 'ingerido') : 'sin cambios';
  const vec = result.reindexed
    ? (result.embedded ? 'con vectores' : 'sin vectores (pendiente reindex)')
    : '';
  console.log(`  doc "${doc.title}": ${verb} (${result.chunks} chunks, docId=${result.docId}) ${vec}`.trim());
}

async function main() {
  const dmUsername = parseDmUsername(process.argv);
  const packsDir = resolveGamePacksDir();
  console.log(`Seed de ejemplos — DM="${dmUsername}", packs en ${packsDir}`);

  const dmId = ensureDm(dmUsername);

  for (const spec of SEED_PACKS) {
    const pack = JSON.parse(readFileSync(join(packsDir, spec.file), 'utf8'));
    const { gameSystemId, created } = ensureSystem(dmId, pack);
    const pregens = db
      .prepare('SELECT COUNT(*) AS n FROM base_characters WHERE game_system_id = ?')
      .get(gameSystemId).n;
    console.log(
      `Sistema "${pack.name}" (id=${gameSystemId}): ${created ? 'importado' : 'ya existía'}, ${pregens} pregens`
    );

    for (const doc of spec.docs) {
      await ensureDoc(gameSystemId, doc, packsDir);
    }
  }

  console.log('Seed completado.');
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('Seed falló:', err.message);
    process.exit(1);
  });

// Seed idempotente del CATÁLOGO de Dragonbane — F28 (Habilidades + Equipo), F29 (Magia + más items).
//
// Contexto: importGamePack solo puebla skills/items al CREAR un sistema nuevo. Los sistemas
// "Dragonbane" ya existen (uno por DM, copias per-DM — ver LEARNINGS "ingerir por NOMBRE de
// sistema"), así que aquí ENRIQUECEMOS los sistemas existentes sin reimportarlos: aseguramos
// el formato + sus fields e insertamos las skills/items FALTANTES por nombre, con sus valores
// de fields dinámicos.
//
// La lógica es GENÉRICA sobre los formatos del pack: itera todos los skill_formats e
// item_formats. Por eso F29 solo añadió el skill_format "Magia" (56 hechizos) y más items al
// pack (fuente de verdad); este seed los recoge sin cambios de lógica.
//
// Idempotencia:
//   - El formato se busca por (game_system_id, name); se crea si falta (p. ej. "Magia" nueva).
//   - Los fields se añaden solo si su field_name no existe aún (aditivo).
//   - Skills/items se insertan solo si no existe uno con ese nombre en el formato.
//   - Los valores de fields se insertan con INSERT OR IGNORE respetando el UNIQUE
//     (skill_id/item_id, field_id): la primera corrida los rellena; corridas siguientes son
//     no-op y NUNCA se sobrescriben ediciones del DM.
//
// Este seed NO requiere embeddings/Ollama: es catálogo estructurado, todo síncrono
// (better-sqlite3 es SÍNCRONO). Alcanza a TODOS los sistemas "Dragonbane" (todos los DMs).
//
// Correr (entorno canónico Docker):
//   docker compose exec backend node scripts/seed-dragonbane-catalog.js

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Nombre del sistema y de los formatos a poblar. Deben coincidir con el pack.
const SYSTEM_NAME = 'Dragonbane';
const PACK_FILE = 'dragonbane.json';

// Config de cada tipo de formato (skills / items) para reutilizar la misma lógica.
const SKILL_TABLES = {
  formatsTable: 'skill_formats',
  fieldsTable: 'skill_format_fields',
  entitiesTable: 'skills',
  valuesTable: 'skill_field_values',
  entityFk: 'skill_id',
  formatsKey: 'skill_formats',
  entitiesKey: 'skills',
  extraCols: [], // skills no tienen columnas extra
};

const ITEM_TABLES = {
  formatsTable: 'item_formats',
  fieldsTable: 'item_format_fields',
  entitiesTable: 'item_masters',
  valuesTable: 'item_master_values',
  entityFk: 'item_id',
  formatsKey: 'item_formats',
  entitiesKey: 'items',
  extraCols: ['equippable'], // item_masters tiene la columna equippable
};

// Resuelve el directorio de game-packs (mismo criterio que seed-examples.js).
function resolveGamePacksDir() {
  const candidates = [
    process.env.GAME_PACKS_DIR,
    resolve('/app/game-packs'),
    resolve(__dirname, '../../game-packs'),
  ].filter(Boolean);
  for (const dir of candidates) {
    if (existsSync(join(dir, PACK_FILE))) return dir;
  }
  throw new Error(
    `No se encontró el directorio game-packs con ${PACK_FILE}. Probados: ${candidates.join(', ')}.`
  );
}

// Asegura que exista el formato (por game_system_id + name) y devuelve su id. Lo crea con el
// dm_id del sistema si falta.
function ensureFormat(db, gameSystemId, dmId, cfg, formatSpec) {
  const existing = db
    .prepare(`SELECT id FROM ${cfg.formatsTable} WHERE game_system_id = ? AND name = ?`)
    .get(gameSystemId, formatSpec.name);
  if (existing) return existing.id;
  return Number(
    db
      .prepare(`INSERT INTO ${cfg.formatsTable} (dm_id, game_system_id, name, description) VALUES (?, ?, ?, ?)`)
      .run(dmId, gameSystemId, formatSpec.name, formatSpec.description ?? '').lastInsertRowid
  );
}

// Asegura los fields del formato (aditivo: solo inserta los que faltan por field_name).
// Devuelve un Map field_name → field_id con TODOS los fields del formato.
function ensureFields(db, formatId, cfg, fieldSpecs) {
  const byName = new Map();
  for (const row of db
    .prepare(`SELECT id, field_name FROM ${cfg.fieldsTable} WHERE format_id = ?`)
    .all(formatId)) {
    byName.set(row.field_name, row.id);
  }
  // sort_order del siguiente field nuevo = después de los existentes.
  let nextSort = db
    .prepare(`SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM ${cfg.fieldsTable} WHERE format_id = ?`)
    .get(formatId).n;
  const insertField = db.prepare(
    `INSERT INTO ${cfg.fieldsTable} (format_id, field_name, field_type, sort_order) VALUES (?, ?, ?, ?)`
  );
  fieldSpecs.forEach((f) => {
    if (byName.has(f.name)) return;
    const id = Number(insertField.run(formatId, f.name, f.type ?? 'text', nextSort++).lastInsertRowid);
    byName.set(f.name, id);
  });
  return byName;
}

// Inserta las entidades (skills/items) faltantes por nombre y rellena sus valores de field.
// Devuelve { inserted, valuesInserted } para trazabilidad.
function seedEntities(db, formatId, dmId, cfg, fieldIdByName, entitySpecs) {
  const existingByName = new Map();
  for (const row of db
    .prepare(`SELECT id, name FROM ${cfg.entitiesTable} WHERE format_id = ?`)
    .all(formatId)) {
    existingByName.set(row.name, row.id);
  }

  const extraCols = cfg.extraCols;
  const insertEntity = db.prepare(
    `INSERT INTO ${cfg.entitiesTable} (format_id, dm_id, name, description${extraCols.length ? ', ' + extraCols.join(', ') : ''})
     VALUES (?, ?, ?, ?${extraCols.map(() => ', ?').join('')})`
  );
  // INSERT OR IGNORE respeta el UNIQUE(entity_id, field_id): no sobrescribe valores previos.
  const insertValue = db.prepare(
    `INSERT OR IGNORE INTO ${cfg.valuesTable} (${cfg.entityFk}, field_id, value) VALUES (?, ?, ?)`
  );

  let inserted = 0;
  let valuesInserted = 0;
  for (const ent of entitySpecs) {
    let entId = existingByName.get(ent.name);
    if (entId === undefined) {
      const extraVals = extraCols.map((col) => (col === 'equippable' ? (ent.equippable === false ? 0 : 1) : null));
      entId = Number(insertEntity.run(formatId, dmId, ent.name, ent.description ?? '', ...extraVals).lastInsertRowid);
      inserted += 1;
    }
    for (const [fieldName, value] of Object.entries(ent.values ?? {})) {
      const fieldId = fieldIdByName.get(fieldName);
      if (fieldId === undefined) continue; // field no declarado en el formato → se ignora
      const info = insertValue.run(entId, fieldId, String(value ?? ''));
      if (info.changes > 0) valuesInserted += 1;
    }
  }
  return { inserted, valuesInserted };
}

// Enriquece UN sistema con el catálogo del pack (skills + items). Todo en el caller dentro
// de una transacción. Devuelve conteos por trazabilidad.
export function seedCatalogForSystem(db, gameSystemId, dmId, pack) {
  const result = { skills: { inserted: 0, valuesInserted: 0 }, items: { inserted: 0, valuesInserted: 0 } };

  for (const fmt of pack[SKILL_TABLES.formatsKey] ?? []) {
    const formatId = ensureFormat(db, gameSystemId, dmId, SKILL_TABLES, fmt);
    const fieldIdByName = ensureFields(db, formatId, SKILL_TABLES, fmt.fields ?? []);
    const r = seedEntities(db, formatId, dmId, SKILL_TABLES, fieldIdByName, fmt[SKILL_TABLES.entitiesKey] ?? []);
    result.skills.inserted += r.inserted;
    result.skills.valuesInserted += r.valuesInserted;
  }

  for (const fmt of pack[ITEM_TABLES.formatsKey] ?? []) {
    const formatId = ensureFormat(db, gameSystemId, dmId, ITEM_TABLES, fmt);
    const fieldIdByName = ensureFields(db, formatId, ITEM_TABLES, fmt.fields ?? []);
    const r = seedEntities(db, formatId, dmId, ITEM_TABLES, fieldIdByName, fmt[ITEM_TABLES.entitiesKey] ?? []);
    result.items.inserted += r.inserted;
    result.items.valuesInserted += r.valuesInserted;
  }

  return result;
}

// Enriquece TODOS los sistemas con el nombre del pack (todos los DMs). Envuelve cada sistema
// en su propia transacción para atomicidad. Devuelve el número de sistemas tocados.
export function seedDragonbaneCatalog(db, pack) {
  const systems = db
    .prepare('SELECT id, dm_id FROM game_system_templates WHERE name = ?')
    .all(pack.name ?? SYSTEM_NAME);
  const perSystem = [];
  for (const sys of systems) {
    const run = db.transaction(() => seedCatalogForSystem(db, sys.id, sys.dm_id, pack));
    perSystem.push({ gameSystemId: sys.id, dmId: sys.dm_id, ...run() });
  }
  return { systemsSeeded: systems.length, perSystem };
}

// ── CLI ─────────────────────────────────────────────────────────────────────
// Solo corre main() cuando el archivo se invoca directamente (no al importarlo en tests).
const invokedDirectly = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

async function main() {
  const { default: db } = await import('../src/db/index.js');
  const packsDir = resolveGamePacksDir();
  const pack = JSON.parse(readFileSync(join(packsDir, PACK_FILE), 'utf8'));

  const systems = db.prepare('SELECT id FROM game_system_templates WHERE name = ?').all(pack.name);
  console.log(`Seed catálogo Dragonbane — ${systems.length} sistema(s) "${pack.name}" (packs en ${packsDir})`);

  const { systemsSeeded, perSystem } = seedDragonbaneCatalog(db, pack);
  for (const s of perSystem) {
    console.log(
      `  sistema id=${s.gameSystemId} (dm ${s.dmId}): +${s.skills.inserted} skills (+${s.skills.valuesInserted} valores), ` +
      `+${s.items.inserted} items (+${s.items.valuesInserted} valores)`
    );
  }
  console.log(`Seed completado en ${systemsSeeded} sistema(s).`);
}

if (invokedDirectly) {
  main()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed de catálogo Dragonbane falló:', err.message);
      process.exit(1);
    });
}

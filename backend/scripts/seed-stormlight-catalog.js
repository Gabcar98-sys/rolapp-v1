// Seed idempotente del CATÁLOGO de Stormlight — F34 (Caminos Heroicos, Talentos, Acciones,
// Armas y Equipo). Simétrico a seed-dragonbane-catalog.js: la lógica vive en
// scripts/seed-catalog.js (genérica sobre los formatos del pack) y aquí solo se fija el pack.
//
// La fuente de verdad es game-packs/stormlight.json. El sistema se resuelve por NOMBRE
// ("Stormlight RPG"), así que alcanza las copias per-DM de TODOS los DMs.
//
// Correr (entorno canónico Docker):
//   docker compose exec backend node scripts/seed-stormlight-catalog.js

import { isInvokedDirectly, runCatalogSeedCli, seedPackCatalog } from './seed-catalog.js';

const PACK_FILE = 'stormlight.json';

// Enriquece todos los sistemas "Stormlight RPG" (uno por DM) con el catálogo del pack.
export const seedStormlightCatalog = seedPackCatalog;

export { seedCatalogForSystem } from './seed-catalog.js';

if (isInvokedDirectly(import.meta.url)) {
  runCatalogSeedCli(PACK_FILE)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed de catálogo Stormlight falló:', err.message);
      process.exit(1);
    });
}

// Seed idempotente del CATÁLOGO de Dragonbane — F28 (Habilidades + Equipo), F29 (Magia + más
// items). Desde F34 la lógica vive en scripts/seed-catalog.js (genérica sobre los formatos del
// pack); este archivo es solo el punto de entrada por juego, que se mantiene por
// retrocompatibilidad: el comando documentado
//
//   docker compose exec backend node scripts/seed-dragonbane-catalog.js
//
// sigue funcionando igual. La fuente de verdad es game-packs/dragonbane.json.

import { isInvokedDirectly, runCatalogSeedCli, seedPackCatalog } from './seed-catalog.js';

const PACK_FILE = 'dragonbane.json';

// Alias histórico (lo usan los tests de F28/F29): enriquece todos los sistemas "Dragonbane".
export const seedDragonbaneCatalog = seedPackCatalog;

export { seedCatalogForSystem } from './seed-catalog.js';

if (isInvokedDirectly(import.meta.url)) {
  runCatalogSeedCli(PACK_FILE)
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed de catálogo Dragonbane falló:', err.message);
      process.exit(1);
    });
}

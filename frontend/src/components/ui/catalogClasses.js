// Clases compartidas de las páginas de catálogo (F15).
// IMPORTANTE (lección F14): las listas son ESTÁTICAS y con clases literales para
// que el JIT de Tailwind las genere; se eligen por índice estable (lib/catalog.js).

// Input estándar de formularios sobre superficie (mismo look que CampaignsPage/F14).
export const inputCls =
  'w-full rounded-[10px] border border-[#37312A] bg-bg px-3.5 py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-accent';

// Cuadro-glifo coloreado (fondo tinte + texto de categoría).
export const GLYPH_CLASSES = [
  'bg-cat-combat-bg text-cat-combat-text',
  'bg-cat-explore-bg text-cat-explore-text',
  'bg-cat-social-bg text-cat-social-text',
  'bg-cat-discovery-bg text-cat-discovery-text',
  'bg-cat-extra-bg text-cat-extra-text',
];

// Badge pill coloreado (tipos de habilidad, badges de mecánica…).
export const BADGE_CLASSES = GLYPH_CLASSES;

// Relleno de barras (atributos de plantillas, con el color del glifo).
export const BAR_FILL_CLASSES = [
  'bg-cat-combat-bar',
  'bg-cat-explore-bar',
  'bg-cat-social-bar',
  'bg-cat-discovery-bar',
  'bg-cat-extra-text',
];

// Punto de rareza (esquina de la tarjeta de item) con halo del tinte de la categoría.
export const RARITY_DOT_CLASSES = [
  'bg-[#9A9182] shadow-[0_0_0_3px_#2E2A23]',
  'bg-cat-explore-text shadow-[0_0_0_3px_#22301E]',
  'bg-cat-social-text shadow-[0_0_0_3px_#312330]',
  'bg-cat-discovery-text shadow-[0_0_0_3px_#332B17]',
  'bg-cat-combat-text shadow-[0_0_0_3px_#38241B]',
];

// ── Disposición de NPC (F16) ─────────────────────────────────────────────────
// Clases LITERALES por disposición (lección F14: nada de bg-${x}). El mapeo
// value → índice lo hace lib/catalog.js (dispositionIndex), sin interpolar.
// Orden: ally · neutral · hostile (mismos tonos del mockup NPCs.dc.html).
export const NPC_GLYPH_CLASSES = [
  'bg-cat-explore-bg text-cat-explore-text', // ally
  'bg-cat-discovery-bg text-cat-discovery-text', // neutral
  'bg-cat-combat-bg text-cat-combat-text', // hostile
];
export const NPC_BADGE_CLASSES = NPC_GLYPH_CLASSES;

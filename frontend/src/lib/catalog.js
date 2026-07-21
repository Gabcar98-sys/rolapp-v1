// Lógica pura de las páginas de catálogo (F15): habilidades, items, sistemas,
// personajes base y personajes. Sin React ni fetch: testeable con vitest en node.

// Tamaño de la paleta de glifos/acentos por entidad. Las clases Tailwind concretas
// viven en las páginas (deben ser literales para el JIT); aquí solo el índice estable.
export const GLYPH_ACCENT_COUNT = 5;

// Índice de acento estable a partir del id numérico de la entidad.
export function glyphAccentIndex(id) {
  const n = Math.abs(Number(id));
  if (!Number.isFinite(n)) return 0;
  return n % GLYPH_ACCENT_COUNT;
}

// Inicial del nombre para los cuadros-glifo (sin emojis: letra en Newsreader).
export function initialGlyph(name) {
  const trimmed = String(name ?? '').trim();
  return trimmed ? trimmed[0].toUpperCase() : '?';
}

// Abreviatura para el cuadro de atributo (FUE, DES…): primeras 3 letras en mayúscula.
export function abbreviate(name, len = 3) {
  return String(name ?? '').trim().slice(0, len).toUpperCase();
}

function norm(s) {
  return String(s ?? '').trim().toLowerCase();
}

// Nombres de campo que las páginas reconocen para enriquecer la UI.
export const TYPE_FIELD_NAMES = ['tipo', 'type', 'categoria', 'categoría', 'category'];
export const RARITY_FIELD_NAMES = ['rareza', 'rarity'];
export const VALUE_FIELD_NAMES = ['valor', 'value', 'precio', 'price', 'oro', 'gold', 'coste', 'costo', 'cost'];

// Busca un campo del formato por lista de nombres candidatos (normalizados).
export function findField(fields, candidates) {
  const set = new Set(candidates.map(norm));
  return (fields ?? []).find((f) => set.has(norm(f.field_name))) ?? null;
}

// Valores distintos (no vacíos) de un campo entre las entidades, en orden de aparición.
// Sirve para los chips de filtro por tipo y para indexar colores de rareza.
export function distinctFieldValues(entities, fieldId) {
  const seen = [];
  for (const e of entities ?? []) {
    const v = String(e.values?.[fieldId] ?? '').trim();
    if (v && !seen.includes(v)) seen.push(v);
  }
  return seen;
}

// Filtro de catálogo: búsqueda por texto (nombre + descripción + valores) y,
// opcionalmente, coincidencia exacta en un campo (chip de tipo activo).
export function filterEntities(entities, { query = '', fieldId = null, fieldValue = '' } = {}) {
  const q = norm(query);
  return (entities ?? []).filter((e) => {
    if (fieldId != null && fieldValue) {
      if (norm(e.values?.[fieldId]) !== norm(fieldValue)) return false;
    }
    if (!q) return true;
    const haystack = [e.name, e.description, ...Object.values(e.values ?? {})]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return haystack.includes(q);
  });
}

// Paginación simple: página 1-indexada, acotada al rango válido.
export function paginate(list, page = 1, perPage = 50) {
  const total = (list ?? []).length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const current = Math.min(Math.max(1, Number(page) || 1), totalPages);
  const start = (current - 1) * perPage;
  return { items: (list ?? []).slice(start, start + perPage), page: current, totalPages, total };
}

// Agrupa formatos por sistema de juego (orden estable, "Sin sistema" al final).
export function groupFormatsBySystem(formats) {
  const groups = new Map();
  for (const f of formats ?? []) {
    const key = f.game_system_id ?? null;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(f);
  }
  const result = [];
  for (const [systemId, list] of groups) {
    if (systemId != null) result.push({ systemId, formats: list });
  }
  if (groups.has(null)) result.push({ systemId: null, formats: groups.get(null) });
  return result;
}

// ── Validación cliente de la importación masiva de habilidades ────────────────

// Parsea y valida el texto JSON pegado/cargado. Estructura esperada:
// { "Nombre": { campo: valor, description?: "…" } }. Devuelve { ok, data, count }
// o { ok:false, error }.
export function parseBulkSkillsText(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return { ok: false, error: 'El texto no es JSON válido.' };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'La raíz debe ser un objeto { "Nombre": { campo: valor } }.' };
  }
  const entries = Object.entries(data);
  if (entries.length === 0) {
    return { ok: false, error: 'El JSON está vacío: no hay habilidades que importar.' };
  }
  const invalid = entries.filter(([, v]) => !v || typeof v !== 'object' || Array.isArray(v));
  if (invalid.length === entries.length) {
    return { ok: false, error: 'Ninguna entrada es válida: cada valor debe ser un objeto de campos.' };
  }
  return { ok: true, data, count: entries.length, invalidCount: invalid.length };
}

// ── Disposición de NPC (F16) ──────────────────────────────────────────────────
// Valores en inglés en código; la UI muestra estas etiquetas en español.
// El orden coincide con NPC_GLYPH_CLASSES/NPC_BADGE_CLASSES (ally·neutral·hostile).
export const DISPOSITIONS = [
  { value: 'ally', label: 'Aliado' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'hostile', label: 'Hostil' },
];

// Índice estable de la disposición para elegir clase literal (fallback neutral = 1).
export function dispositionIndex(value) {
  const idx = DISPOSITIONS.findIndex((d) => d.value === value);
  return idx === -1 ? 1 : idx;
}

// Etiqueta en español de una disposición (fallback Neutral).
export function dispositionLabel(value) {
  return DISPOSITIONS[dispositionIndex(value)].label;
}

// ── Atributos de personajes (barras PV/EXP, stats core) ───────────────────────

export const HP_ATTR_NAMES = ['pv', 'hp', 'vida', 'salud', 'health', 'puntos de vida', 'hit points'];
export const XP_ATTR_NAMES = ['exp', 'xp', 'experiencia', 'experience'];
export const LEVEL_ATTR_NAMES = ['nivel', 'level', 'lvl'];

// Busca un valor de atributo de la ficha (templateAttrs) por nombres candidatos.
export function findAttr(templateAttrs, candidates) {
  const set = new Set(candidates.map(norm));
  return (templateAttrs ?? []).find((a) => set.has(norm(a.attr_name))) ?? null;
}

// Porcentaje 0-100 acotado, o null si no es computable (degradación elegante).
export function percent(value, max) {
  const v = Number(value);
  const m = Number(max);
  if (!Number.isFinite(v) || !Number.isFinite(m) || m <= 0) return null;
  return Math.max(0, Math.min(100, Math.round((v / m) * 100)));
}

// Ancho de barra en pasos de 10% con clases Tailwind LITERALES (sin inline styles).
const BAR_WIDTHS = [
  'w-0', 'w-[10%]', 'w-1/5', 'w-[30%]', 'w-2/5', 'w-1/2',
  'w-3/5', 'w-[70%]', 'w-4/5', 'w-[90%]', 'w-full',
];
export function barWidthClass(pct) {
  const step = Math.max(0, Math.min(10, Math.round((Number(pct) || 0) / 10)));
  return BAR_WIDTHS[step];
}

// Primeros N atributos core numéricos de la ficha (pie de la tarjeta de personaje).
export function coreStats(templateAttrs, n = 4) {
  return (templateAttrs ?? [])
    .filter((a) => a.is_core && a.attr_type === 'number')
    .slice(0, n)
    .map((a) => ({ label: abbreviate(a.attr_name), value: a.value ?? '—' }));
}

// Barras de la tarjeta de personaje base: primeros N atributos numéricos.
// La escala es el mayor valor del grupo (mínimo 10) para que las barras comparen.
export function baseCharBars(attrs, n = 4) {
  const numeric = (attrs ?? [])
    .filter((a) => a.attr_type === 'number' && a.value !== '' && !Number.isNaN(Number(a.value)))
    .slice(0, n);
  const scale = Math.max(10, ...numeric.map((a) => Number(a.value)));
  return numeric.map((a) => ({
    label: a.attr_name,
    value: Number(a.value),
    pct: percent(a.value, scale) ?? 0,
  }));
}

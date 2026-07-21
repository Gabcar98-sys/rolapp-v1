import { describe, expect, it } from 'vitest';
import {
  abbreviate,
  barWidthClass,
  baseCharBars,
  coreStats,
  distinctFieldValues,
  filterEntities,
  findAttr,
  findField,
  glyphAccentIndex,
  groupFormatsBySystem,
  initialGlyph,
  paginate,
  parseBulkSkillsText,
  percent,
  HP_ATTR_NAMES,
  TYPE_FIELD_NAMES,
} from './catalog.js';

describe('glifos y acentos', () => {
  it('el índice de acento es estable y está acotado a la paleta', () => {
    expect(glyphAccentIndex(7)).toBe(glyphAccentIndex(7));
    expect(glyphAccentIndex(12)).toBeGreaterThanOrEqual(0);
    expect(glyphAccentIndex(12)).toBeLessThan(5);
    expect(glyphAccentIndex('no-numérico')).toBe(0);
  });

  it('initialGlyph devuelve la inicial en mayúscula con fallback', () => {
    expect(initialGlyph('espada del vado')).toBe('E');
    expect(initialGlyph('  tajo')).toBe('T');
    expect(initialGlyph('')).toBe('?');
    expect(initialGlyph(null)).toBe('?');
  });

  it('abbreviate corta a 3 letras en mayúscula', () => {
    expect(abbreviate('Fuerza')).toBe('FUE');
    expect(abbreviate('PV')).toBe('PV');
  });
});

describe('campos de formato', () => {
  const fields = [
    { id: 1, field_name: 'Tipo' },
    { id: 2, field_name: 'coste' },
    { id: 3, field_name: 'Rareza' },
  ];

  it('findField casa por nombre normalizado', () => {
    expect(findField(fields, TYPE_FIELD_NAMES)?.id).toBe(1);
    expect(findField(fields, ['rareza'])?.id).toBe(3);
    expect(findField(fields, ['peso'])).toBeNull();
  });

  it('distinctFieldValues devuelve valores únicos no vacíos en orden', () => {
    const skills = [
      { values: { 1: 'Ataque' } },
      { values: { 1: 'Defensa' } },
      { values: { 1: 'Ataque' } },
      { values: { 1: '' } },
      { values: {} },
    ];
    expect(distinctFieldValues(skills, 1)).toEqual(['Ataque', 'Defensa']);
  });
});

describe('filtro y paginación', () => {
  const skills = [
    { name: 'Tajo demoledor', description: 'Golpe pesado', values: { 1: 'Ataque' } },
    { name: 'Muro de escudos', description: 'Reduce daño', values: { 1: 'Defensa' } },
    { name: 'Palabra sanadora', description: 'Cura aliados', values: { 1: 'Apoyo' } },
  ];

  it('filtra por texto en nombre, descripción y valores', () => {
    expect(filterEntities(skills, { query: 'muro' })).toHaveLength(1);
    expect(filterEntities(skills, { query: 'cura' })).toHaveLength(1);
    expect(filterEntities(skills, { query: 'apoyo' })).toHaveLength(1);
    expect(filterEntities(skills, { query: '' })).toHaveLength(3);
  });

  it('combina chip de tipo con búsqueda', () => {
    expect(filterEntities(skills, { fieldId: 1, fieldValue: 'Ataque' })).toHaveLength(1);
    expect(filterEntities(skills, { query: 'muro', fieldId: 1, fieldValue: 'Ataque' })).toHaveLength(0);
  });

  it('pagina en bloques y acota la página al rango válido', () => {
    const list = Array.from({ length: 120 }, (_, i) => ({ name: `s${i}` }));
    const p1 = paginate(list, 1, 50);
    expect(p1.items).toHaveLength(50);
    expect(p1.totalPages).toBe(3);
    const p3 = paginate(list, 3, 50);
    expect(p3.items).toHaveLength(20);
    // Página fuera de rango se acota.
    expect(paginate(list, 99, 50).page).toBe(3);
    expect(paginate([], 1, 50).totalPages).toBe(1);
  });
});

describe('agrupación de formatos por sistema', () => {
  it('agrupa por game_system_id y deja "Sin sistema" al final', () => {
    const formats = [
      { id: 1, game_system_id: 10 },
      { id: 2, game_system_id: null },
      { id: 3, game_system_id: 10 },
      { id: 4, game_system_id: 20 },
    ];
    const groups = groupFormatsBySystem(formats);
    expect(groups.map((g) => g.systemId)).toEqual([10, 20, null]);
    expect(groups[0].formats).toHaveLength(2);
  });
});

describe('validación de importación masiva (cliente)', () => {
  it('acepta la estructura { nombre: { campo: valor } }', () => {
    const r = parseBulkSkillsText('{"Tajo":{"tipo":"Ataque","coste":2}}');
    expect(r.ok).toBe(true);
    expect(r.count).toBe(1);
    expect(r.invalidCount).toBe(0);
  });

  it('rechaza JSON inválido, arrays y objetos vacíos', () => {
    expect(parseBulkSkillsText('no-json').ok).toBe(false);
    expect(parseBulkSkillsText('[1,2]').ok).toBe(false);
    expect(parseBulkSkillsText('{}').ok).toBe(false);
    expect(parseBulkSkillsText('"texto"').ok).toBe(false);
  });

  it('rechaza cuando ninguna entrada es un objeto de campos', () => {
    expect(parseBulkSkillsText('{"A":"x","B":3}').ok).toBe(false);
    // Mixto: pasa (el backend reporta las omitidas).
    const mixed = parseBulkSkillsText('{"A":"x","B":{"tipo":"Apoyo"}}');
    expect(mixed.ok).toBe(true);
    expect(mixed.invalidCount).toBe(1);
  });
});

describe('atributos de personaje (barras y stats)', () => {
  const templateAttrs = [
    { attr_name: 'PV', attr_type: 'number', is_core: 1, has_max: 1, value: '24', max_value: '30' },
    { attr_name: 'Experiencia', attr_type: 'number', is_core: 0, has_max: 1, value: '40', max_value: '100' },
    { attr_name: 'Fuerza', attr_type: 'number', is_core: 1, value: '9' },
    { attr_name: 'Destreza', attr_type: 'number', is_core: 1, value: '5' },
    { attr_name: 'Mente', attr_type: 'number', is_core: 1, value: '3' },
    { attr_name: 'Notas', attr_type: 'text', is_core: 1, value: 'x' },
  ];

  it('findAttr localiza PV/EXP por nombres candidatos', () => {
    expect(findAttr(templateAttrs, HP_ATTR_NAMES)?.value).toBe('24');
    expect(findAttr(templateAttrs, ['experiencia'])?.value).toBe('40');
    expect(findAttr(templateAttrs, ['maná'])).toBeNull();
  });

  it('percent degrada a null sin datos y acota 0-100', () => {
    expect(percent(24, 30)).toBe(80);
    expect(percent(50, 30)).toBe(100);
    expect(percent('x', 30)).toBeNull();
    expect(percent(5, 0)).toBeNull();
  });

  it('barWidthClass devuelve clases estáticas por pasos de 10%', () => {
    expect(barWidthClass(0)).toBe('w-0');
    expect(barWidthClass(80)).toBe('w-4/5');
    expect(barWidthClass(100)).toBe('w-full');
    expect(barWidthClass(999)).toBe('w-full');
  });

  it('coreStats toma solo los core numéricos (máx 4) con abreviatura', () => {
    const stats = coreStats(templateAttrs);
    expect(stats.map((s) => s.label)).toEqual(['PV', 'FUE', 'DES', 'MEN']);
  });

  it('baseCharBars escala al mayor valor del grupo (mínimo 10)', () => {
    const bars = baseCharBars([
      { attr_name: 'Fuerza', attr_type: 'number', value: '9' },
      { attr_name: 'Destreza', attr_type: 'number', value: '5' },
      { attr_name: 'Notas', attr_type: 'text', value: 'x' },
    ]);
    expect(bars).toHaveLength(2);
    expect(bars[0].pct).toBe(90);
    expect(bars[1].pct).toBe(50);
  });
});

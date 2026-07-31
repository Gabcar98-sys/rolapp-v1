import { describe, expect, it } from 'vitest';
import { barWidthClass, pickVitals } from './vitals.js';

// pickVitals deriva los vitales del SISTEMA (is_core || has_max), sin hardcodear "HP".
// OJO: `is_core`/`has_max` llegan como ENTEROS 0/1 desde SQLite (regresión F30).

const defs = [
  { id: 1, name: 'Health', is_core: 1, has_max: 1 }, // máximo pequeño → puntos
  { id: 2, name: 'Deflect', is_core: 1, has_max: 0 }, // core sin máximo → solo cifra
  { id: 3, name: 'Vitality', is_core: 0, has_max: 1 }, // máximo grande → barra
  { id: 4, name: 'Strength', is_core: 0, has_max: 0 }, // ni core ni con máximo → fuera
];

const character = {
  id: 5,
  templateAttrs: [
    { attribute_template_id: 1, value: '5', max_value: '8', attr_name: 'Health', is_core: 1, has_max: 1 },
    { attribute_template_id: 2, value: '7', max_value: null, attr_name: 'Deflect', is_core: 1, has_max: 0 },
    { attribute_template_id: 3, value: '30', max_value: '60', attr_name: 'Vitality', is_core: 0, has_max: 1 },
    { attribute_template_id: 4, value: '3', max_value: null, attr_name: 'Strength', is_core: 0, has_max: 0 },
  ],
};

describe('pickVitals', () => {
  it('selecciona solo los atributos is_core || has_max', () => {
    const vitals = pickVitals(character, defs);
    expect(vitals.map((v) => v.name)).toEqual(['Health', 'Deflect', 'Vitality']);
  });

  it('máximo <= 20 se muestra como puntos', () => {
    const [health] = pickVitals(character, defs);
    expect(health).toMatchObject({ name: 'Health', current: 5, max: 8, mode: 'dots' });
  });

  it('máximo > 20 se muestra como barra con su porcentaje', () => {
    const vitality = pickVitals(character, defs).find((v) => v.name === 'Vitality');
    expect(vitality).toMatchObject({ current: 30, max: 60, mode: 'bar', pct: 50 });
  });

  it('core SIN máximo: modo plano, max null (nunca 0) y sin porcentaje', () => {
    const deflect = pickVitals(character, defs).find((v) => v.name === 'Deflect');
    expect(deflect).toMatchObject({ current: 7, mode: 'plain' });
    // max/pct deben ser null: un 0 se colaría a un guard `{v.max && …}` y React lo
    // pintaría literal (bug F30).
    expect(deflect.max).toBeNull();
    expect(deflect.pct).toBeNull();
  });

  it('sin atributos (o personaje vacío) devuelve lista vacía, sin romper', () => {
    expect(pickVitals({ id: 1, templateAttrs: [] }, defs)).toEqual([]);
    expect(pickVitals({ id: 1 }, defs)).toEqual([]);
    expect(pickVitals(null, defs)).toEqual([]);
    expect(pickVitals(character, [])).not.toEqual([]); // sin defs cae a los del personaje
    expect(pickVitals({ id: 1, templateAttrs: [] }, [])).toEqual([]);
  });

  it('sin attrDefs deriva las definiciones de los templateAttrs del personaje', () => {
    const vitals = pickVitals(character);
    expect(vitals.map((v) => v.name)).toEqual(['Health', 'Deflect', 'Vitality']);
  });

  it('un valor no numérico o ausente cuenta como 0', () => {
    const weird = {
      templateAttrs: [
        { attribute_template_id: 1, value: '', max_value: '8', attr_name: 'Health', is_core: 1, has_max: 1 },
      ],
    };
    expect(pickVitals(weird)[0]).toMatchObject({ current: 0, max: 8, mode: 'dots', pct: 0 });
  });

  it('un máximo vacío o 0 degrada a modo plano (no divide por cero)', () => {
    const noMax = {
      templateAttrs: [
        { attribute_template_id: 1, value: '4', max_value: '', attr_name: 'Health', is_core: 1, has_max: 1 },
      ],
    };
    expect(pickVitals(noMax)[0]).toMatchObject({ current: 4, mode: 'plain' });
    expect(pickVitals(noMax)[0].max).toBeNull();
  });
});

describe('barWidthClass', () => {
  it('devuelve clases Tailwind literales por pasos de 10%', () => {
    expect(barWidthClass(0)).toBe('w-0');
    expect(barWidthClass(50)).toBe('w-1/2');
    expect(barWidthClass(100)).toBe('w-full');
    expect(barWidthClass(999)).toBe('w-full'); // acotado
    expect(barWidthClass(-10)).toBe('w-0');
  });
});

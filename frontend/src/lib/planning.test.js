import { describe, it, expect } from 'vitest';
import {
  flattenPrepEvents,
  computeGraphLayout,
  categoryBucket,
  categoryLabel,
  eventCategoryClasses,
} from './planning.js';

describe('flattenPrepEvents', () => {
  it('aplana ubicaciones, sub-ubicaciones, ramas y eventos sueltos con su etiqueta', () => {
    const locations = [
      {
        name: 'Bosque',
        sub_locations: [
          {
            name: 'Claro',
            events: [
              { id: 1, title: 'Emboscada', branches: [{ id: 2, title: 'Huir', branches: [] }] },
            ],
          },
        ],
      },
    ];
    const freeEvents = [{ id: 3, title: 'Rumor', branches: [] }];

    const flat = flattenPrepEvents(locations, freeEvents);
    expect(flat.map((e) => e.id)).toEqual([1, 2, 3]);
    expect(flat[0].locationLabel).toBe('Bosque › Claro');
    expect(flat[1].locationLabel).toBe('Bosque › Claro'); // la rama hereda la etiqueta del padre
    expect(flat[2].locationLabel).toBe(''); // evento suelto sin ubicación
  });
});

describe('computeGraphLayout', () => {
  it('coloca los nodos en capas según las aristas (sucesor por debajo del predecesor)', () => {
    const events = [{ id: 1 }, { id: 2 }, { id: 3 }];
    const edges = [
      { from: 1, to: 2, kind: 'link' },
      { from: 2, to: 3, kind: 'link' },
    ];
    const { positions } = computeGraphLayout(events, edges);
    expect(positions.get(1).y).toBeLessThan(positions.get(2).y);
    expect(positions.get(2).y).toBeLessThan(positions.get(3).y);
  });

  it('no entra en bucle infinito con un ciclo y posiciona todos los nodos', () => {
    const events = [{ id: 1 }, { id: 2 }];
    const edges = [
      { from: 1, to: 2, kind: 'link' },
      { from: 2, to: 1, kind: 'link' },
    ];
    const { positions } = computeGraphLayout(events, edges);
    expect(positions.has(1)).toBe(true);
    expect(positions.has(2)).toBe(true);
  });

  it('ignora aristas hacia nodos inexistentes', () => {
    const events = [{ id: 1 }];
    const edges = [{ from: 1, to: 999, kind: 'link' }];
    const { positions } = computeGraphLayout(events, edges);
    expect(positions.size).toBe(1);
    expect(positions.get(1)).toEqual({ x: 0, y: 0 });
  });
});

describe('mapeo de categorías v1 → 4 colores del handoff', () => {
  it('agrupa las 8 categorías v1 en los 4 cubos (0=combat…3=discovery)', () => {
    // Caso feliz: cada categoría cae en un índice 0..3.
    for (const cat of [
      'general',
      'combate',
      'exploración',
      'interacción',
      'trampa',
      'recompensa',
      'historia',
      'NPC',
    ]) {
      const i = categoryBucket(cat);
      expect(i).toBeGreaterThanOrEqual(0);
      expect(i).toBeLessThanOrEqual(3);
    }
    // Anclas concretas del mapeo.
    expect(categoryBucket('combate')).toBe(0);
    expect(categoryBucket('exploración')).toBe(2);
  });

  it('cae a discovery (índice de general) para categorías desconocidas', () => {
    expect(categoryBucket('inexistente')).toBe(categoryBucket('general'));
  });

  it('devuelve clases LITERALES de barra/badge/borde sin interpolar', () => {
    const cls = eventCategoryClasses('combate');
    expect(cls.barClass).toBe('bg-cat-combat-bar');
    expect(cls.badgeClass).toContain('bg-cat-combat-bg');
    expect(cls.borderClass).toBe('border-cat-combat-bar');
    expect(cls.label).toBe('Combate');
  });

  it('etiqueta legible con fallback al valor crudo', () => {
    expect(categoryLabel('NPC')).toBe('NPC');
    expect(categoryLabel('rara')).toBe('rara');
  });
});

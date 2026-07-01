import { describe, it, expect } from 'vitest';
import { flattenPrepEvents, computeGraphLayout } from './planning.js';

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

import { describe, it, expect } from 'vitest';
import {
  flattenPrepEvents,
  computeGraphLayout,
  computeSubLocFlows,
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

// La lógica Inicio/Próximo de la pestaña "Prep." (cuando hay enlaces) vive en este
// helper puro; el useMemo de PlanningPanel solo lo envuelve. Testeamos el helper sin
// DOM (el runner de vitest no tiene jsdom — lección F20). El regresión clave de F24:
// los eventos sueltos enlazados deben aparecer como grupo "Sin ubicación".
describe('computeSubLocFlows (F24)', () => {
  // Construye el allEventsMap ({ id → { event, locName, subLocName } }) que produce
  // reloadPrep, a partir de una lista de eventos anotados con su ubicación.
  const buildMap = (entries) => {
    const map = new Map();
    for (const { event, locName = '', subLocName = '' } of entries) {
      map.set(event.id, { event, locName, subLocName });
    }
    return map;
  };

  it('eventos sueltos enlazados (A→B→C): grupo "Sin ubicación" con Inicio=A', () => {
    const freeEvents = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ];
    const eventLinks = [
      { id: 10, from_event_id: 1, to_event_id: 2, label: 'luego' },
      { id: 11, from_event_id: 2, to_event_id: 3, label: 'después' },
    ];
    const allEventsMap = buildMap(freeEvents.map((event) => ({ event })));

    const flows = computeSubLocFlows({
      freeEvents,
      eventLinks,
      allEventsMap,
      firedTemplateIds: new Set(),
    });

    expect(flows).toHaveLength(1);
    const free = flows[0];
    expect(free.kind).toBe('free');
    expect(free.mode).toBe('initial');
    // Inicio = A (único sin enlace entrante); B y C tienen entrante.
    expect(free.initialEntries.map((e) => e.event.id)).toEqual([1]);
    expect(free.nextEntries).toEqual([]);
  });

  it('con A disparado: el próximo del grupo "Sin ubicación" es B (por el enlace)', () => {
    const freeEvents = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
      { id: 3, title: 'C' },
    ];
    const eventLinks = [
      { id: 10, from_event_id: 1, to_event_id: 2, label: 'luego' },
      { id: 11, from_event_id: 2, to_event_id: 3, label: 'después' },
    ];
    const allEventsMap = buildMap(freeEvents.map((event) => ({ event })));

    const flows = computeSubLocFlows({
      freeEvents,
      eventLinks,
      allEventsMap,
      firedTemplateIds: new Set([1]),
    });

    const free = flows[0];
    expect(free.mode).toBe('active');
    expect(free.initialEntries.map((e) => e.event.id)).toEqual([1]);
    // Próximo = B (enlazado desde la hoja disparada A y aún sin disparar), con etiqueta.
    expect(free.nextEntries.map((e) => e.event.id)).toEqual([2]);
    expect(free.nextEntries[0].linkLabel).toBe('luego');
  });

  it('eventos en ubicación + eventos sueltos: ambos grupos presentes', () => {
    const locations = [
      { id: 100, name: 'Cripta', sub_locations: [{ id: 200, name: 'Entrada' }] },
    ];
    const freeEvents = [
      { id: 1, title: 'Rumor' },
      { id: 2, title: 'Encuentro' },
    ];
    const eventLinks = [
      { id: 10, from_event_id: 5, to_event_id: 6, label: 'avanza' },
      { id: 11, from_event_id: 1, to_event_id: 2, label: 'sigue' },
    ];
    const allEventsMap = buildMap([
      { event: { id: 5, title: 'Guardia' }, locName: 'Cripta', subLocName: 'Entrada' },
      { event: { id: 6, title: 'Trampa' }, locName: 'Cripta', subLocName: 'Entrada' },
      { event: freeEvents[0] },
      { event: freeEvents[1] },
    ]);

    const flows = computeSubLocFlows({
      locations,
      freeEvents,
      eventLinks,
      allEventsMap,
      firedTemplateIds: new Set(),
    });

    expect(flows.map((f) => f.kind)).toEqual(['subloc', 'free']);
    const [subloc, free] = flows;
    expect(subloc.subLocName).toBe('Entrada');
    expect(subloc.initialEntries.map((e) => e.event.id)).toEqual([5]);
    expect(free.initialEntries.map((e) => e.event.id)).toEqual([1]);
  });

  it('las ramas no cuentan como Inicio del grupo "Sin ubicación"', () => {
    // Un evento suelto (1) con una rama (2): la rama se recorre pero nunca es Inicio.
    const branch = { id: 2, title: 'A.rama', parent_event_id: 1 };
    const freeEvents = [{ id: 1, title: 'A', branches: [branch] }];
    const allEventsMap = buildMap([{ event: freeEvents[0] }, { event: branch }]);

    const flows = computeSubLocFlows({
      freeEvents,
      eventLinks: [],
      allEventsMap,
      firedTemplateIds: new Set(),
    });

    const free = flows[0];
    // La rama (2) tiene parent_event_id → nunca es Inicio; solo el raíz A (1) lo es.
    expect(free.initialEntries.map((e) => e.event.id)).toEqual([1]);
    expect(free.nextEntries).toEqual([]);
  });

  it('sin enlaces: no rompe y devuelve el grupo "Sin ubicación" con todos como Inicio', () => {
    const freeEvents = [
      { id: 1, title: 'A' },
      { id: 2, title: 'B' },
    ];
    const allEventsMap = buildMap(freeEvents.map((event) => ({ event })));

    const flows = computeSubLocFlows({
      freeEvents,
      eventLinks: [],
      allEventsMap,
      firedTemplateIds: new Set(),
    });

    expect(flows).toHaveLength(1);
    expect(flows[0].kind).toBe('free');
    expect(flows[0].mode).toBe('initial');
    // Sin enlaces todos son raíz (ninguno tiene entrante).
    expect(flows[0].initialEntries.map((e) => e.event.id)).toEqual([1, 2]);
  });

  it('sin argumentos: degrada a lista vacía sin lanzar', () => {
    expect(computeSubLocFlows()).toEqual([]);
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

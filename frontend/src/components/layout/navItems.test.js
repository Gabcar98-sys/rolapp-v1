import { describe, expect, it } from 'vitest';
import { getNavGroups } from './navItems.js';
import { ICON_NAMES } from '../ui/Icon.jsx';

// La navegación del shell es configuración pura: validamos ids, orden por rol
// y que cada ítem apunte a un icono que realmente existe en el set.

describe('getNavGroups', () => {
  it('el DM ve las 9 secciones principales + historial, en el orden del handoff', () => {
    const groups = getNavGroups('dm');
    expect(groups.map((g) => g.label)).toEqual(['Principal', 'Historial']);
    expect(groups[0].items.map((i) => i.id)).toEqual([
      'dashboard',
      'campaigns',
      'prep',
      'skills',
      'base-characters',
      'attributes',
      'characters',
      'items',
      'npcs',
    ]);
    expect(groups[1].items.map((i) => i.id)).toEqual(['history']);
  });

  it('el jugador ve el sidebar reducido: dashboard, personajes e historial', () => {
    const groups = getNavGroups('player');
    const ids = groups.flatMap((g) => g.items.map((i) => i.id));
    expect(ids).toEqual(['dashboard', 'characters', 'history']);
    // Su etiqueta de personajes es "Mis Personajes".
    const characters = groups[0].items.find((i) => i.id === 'characters');
    expect(characters.label).toBe('Mis Personajes');
  });

  it('todos los ítems tienen icono existente en el set y label sin emojis', () => {
    for (const role of ['dm', 'player']) {
      for (const group of getNavGroups(role)) {
        for (const item of group.items) {
          expect(ICON_NAMES).toContain(item.icon);
          // Rango de emojis y pictogramas: no debe aparecer en labels.
          expect(item.label).not.toMatch(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u);
        }
      }
    }
  });

  it('los ids son únicos dentro de cada rol', () => {
    for (const role of ['dm', 'player']) {
      const ids = getNavGroups(role).flatMap((g) => g.items.map((i) => i.id));
      expect(new Set(ids).size).toBe(ids.length);
    }
  });
});

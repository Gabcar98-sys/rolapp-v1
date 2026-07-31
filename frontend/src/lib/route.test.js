import { describe, expect, it } from 'vitest';
import { buildHash, parseHash } from './route.js';
import { getNavGroups } from '../components/layout/navItems.js';

// Helpers PUROS del enrutado por hash (F31). Sin DOM ni React: el runner de vitest no
// tiene jsdom (lección F20), así que la lógica load-bearing vive en funciones puras.

describe('parseHash', () => {
  it('mapea las páginas del sidebar', () => {
    for (const page of [
      'dashboard',
      'campaigns',
      'prep',
      'skills',
      'base-characters',
      'attributes',
      'characters',
      'items',
      'npcs',
      'history',
    ]) {
      expect(parseHash(`#/${page}`)).toEqual({ page, sessionId: null });
    }
  });

  it('mapea la sesión en vivo y la vista TV con su id', () => {
    expect(parseHash('#/session/7')).toEqual({ page: 'session', sessionId: 7 });
    expect(parseHash('#/tv/12')).toEqual({ page: 'tv', sessionId: 12 });
  });

  it('tolera hash vacío, "#", "#/" y barras finales', () => {
    const dashboard = { page: 'dashboard', sessionId: null };
    expect(parseHash('')).toEqual(dashboard);
    expect(parseHash('#')).toEqual(dashboard);
    expect(parseHash('#/')).toEqual(dashboard);
    expect(parseHash(undefined)).toEqual(dashboard);
    expect(parseHash('#/history/')).toEqual({ page: 'history', sessionId: null });
    expect(parseHash('#//tv/12/')).toEqual({ page: 'tv', sessionId: 12 });
    expect(parseHash('campaigns')).toEqual({ page: 'campaigns', sessionId: null });
  });

  it('una ruta desconocida cae al dashboard', () => {
    expect(parseHash('#/no-existe')).toEqual({ page: 'dashboard', sessionId: null });
    expect(parseHash('#/settings/9')).toEqual({ page: 'dashboard', sessionId: null });
  });

  it('un id no numérico, ausente o <= 0 no es ruta de sesión', () => {
    for (const bad of ['#/session/abc', '#/session/', '#/session', '#/tv/0', '#/tv/-3', '#/tv/1x']) {
      expect(parseHash(bad)).toEqual({ page: 'dashboard', sessionId: null });
    }
  });
});

describe('buildHash', () => {
  it('construye las rutas con y sin id', () => {
    expect(buildHash({ page: 'session', sessionId: 12 })).toBe('#/session/12');
    expect(buildHash({ page: 'tv', sessionId: 3 })).toBe('#/tv/3');
    expect(buildHash({ page: 'history' })).toBe('#/history');
    expect(buildHash({})).toBe('#/dashboard');
    expect(buildHash()).toBe('#/dashboard');
  });

  it('una página desconocida o una ruta de sesión sin id caen al dashboard', () => {
    expect(buildHash({ page: 'inventado' })).toBe('#/dashboard');
    expect(buildHash({ page: 'session' })).toBe('#/dashboard');
    expect(buildHash({ page: 'tv', sessionId: 'abc' })).toBe('#/dashboard');
  });

  it('es la inversa de parseHash para las rutas válidas', () => {
    for (const hash of ['#/dashboard', '#/npcs', '#/session/7', '#/tv/12']) {
      expect(buildHash(parseHash(hash))).toBe(hash);
    }
  });
});

// Guard de regresión: si algún día se añade una sección al sidebar y se olvida en
// PAGES, `onNavigate` la mandaría en silencio al dashboard.
describe('cobertura de la navegación', () => {
  it('cada página del sidebar (DM y jugador) es una ruta válida ida y vuelta', () => {
    for (const role of ['dm', 'player']) {
      for (const group of getNavGroups(role)) {
        for (const item of group.items) {
          expect(parseHash(buildHash({ page: item.id }))).toEqual({
            page: item.id,
            sessionId: null,
          });
        }
      }
    }
  });
});

import { describe, expect, it } from 'vitest';
import {
  CAMPAIGN_ACCENT_COUNT,
  campaignAccentIndex,
  campaignIsActive,
  deriveDashboardMetrics,
  filterClosedSessions,
  formatDate,
  formatDuration,
  playersInSession,
} from './metrics.js';

describe('campaignAccentIndex', () => {
  it('es estable para el mismo id y cae dentro de la paleta', () => {
    expect(campaignAccentIndex(7)).toBe(campaignAccentIndex(7));
    expect(campaignAccentIndex(7)).toBeGreaterThanOrEqual(0);
    expect(campaignAccentIndex('12')).toBeLessThan(CAMPAIGN_ACCENT_COUNT);
  });

  it('devuelve -1 cuando no hay campaña y 0 con id no numérico', () => {
    expect(campaignAccentIndex(null)).toBe(-1);
    expect(campaignAccentIndex('')).toBe(-1);
    expect(campaignAccentIndex('abc')).toBe(0);
  });
});

describe('playersInSession', () => {
  it('descuenta al DM del conteo de miembros y nunca es negativo', () => {
    expect(playersInSession({ member_count: 5 })).toBe(4);
    expect(playersInSession({ member_count: 1 })).toBe(0);
    expect(playersInSession({ member_count: 0 })).toBe(0);
    expect(playersInSession({})).toBe(0);
  });
});

describe('deriveDashboardMetrics', () => {
  it('compone las 4 métricas a partir de los listados', () => {
    const metrics = deriveDashboardMetrics({
      campaigns: [{ player_count: 4 }, { player_count: 3 }, { player_count: 0 }],
      activeSessions: [{ id: 1 }],
      closedSessions: [{ id: 2 }, { id: 3 }],
    });
    expect(metrics).toEqual({
      campaignCount: 3,
      activeSessionCount: 1,
      closedSessionCount: 2,
      totalPlayers: 7,
    });
  });

  it('tolera listados vacíos o ausentes', () => {
    expect(deriveDashboardMetrics({})).toEqual({
      campaignCount: 0,
      activeSessionCount: 0,
      closedSessionCount: 0,
      totalPlayers: 0,
    });
  });
});

describe('campaignIsActive', () => {
  it('activa solo si tiene sesiones activas', () => {
    expect(campaignIsActive({ active_session_count: 2 })).toBe(true);
    expect(campaignIsActive({ active_session_count: 0 })).toBe(false);
    expect(campaignIsActive({})).toBe(false);
  });
});

describe('filterClosedSessions', () => {
  const sessions = [
    { id: 1, name: 'El pacto del pescador', campaign_id: 10, campaign_name: 'La Cripta', summary: 'Garrek fue derrotado en el vado.' },
    { id: 2, name: 'Cenizas en el puerto', campaign_id: 20, campaign_name: 'Mareas', summary: null },
    { id: 3, name: 'Sesión suelta', campaign_id: null, campaign_name: null, summary: 'Emboscada de bandidos.' },
  ];

  it('sin filtros devuelve todo', () => {
    expect(filterClosedSessions(sessions)).toHaveLength(3);
  });

  it('busca por nombre, campaña y resumen sin distinguir mayúsculas', () => {
    expect(filterClosedSessions(sessions, { query: 'PESCADOR' }).map((s) => s.id)).toEqual([1]);
    expect(filterClosedSessions(sessions, { query: 'mareas' }).map((s) => s.id)).toEqual([2]);
    expect(filterClosedSessions(sessions, { query: 'bandidos' }).map((s) => s.id)).toEqual([3]);
    expect(filterClosedSessions(sessions, { query: 'no existe' })).toHaveLength(0);
  });

  it('filtra por campaña y combina con la búsqueda', () => {
    expect(filterClosedSessions(sessions, { campaignId: 10 }).map((s) => s.id)).toEqual([1]);
    expect(filterClosedSessions(sessions, { campaignId: '20', query: 'puerto' }).map((s) => s.id)).toEqual([2]);
    expect(filterClosedSessions(sessions, { campaignId: 10, query: 'puerto' })).toHaveLength(0);
  });
});

describe('formatDuration', () => {
  it('formatea horas y minutos como en el handoff', () => {
    expect(formatDuration(9600)).toBe('2h 40m');
    expect(formatDuration(2100)).toBe('35m');
    expect(formatDuration(3660)).toBe('1h 01m');
  });

  it('degrada a "—" sin dato y a "<1m" con segundos residuales', () => {
    expect(formatDuration(null)).toBe('—');
    expect(formatDuration(0)).toBe('—');
    expect(formatDuration(undefined)).toBe('—');
    expect(formatDuration(10)).toBe('<1m');
  });
});

describe('formatDate', () => {
  it('produce fecha corta en español', () => {
    // 2026-06-28 12:00 UTC — el día puede variar ±1 según el huso del runner,
    // así que se valida la forma general (dd mes yyyy).
    expect(formatDate(1782648000)).toMatch(/^\d{2} \S{3,5} 2026$/u);
  });

  it('degrada a "—" sin dato o entrada corrupta', () => {
    expect(formatDate(null)).toBe('—');
    expect(formatDate('no-fecha')).toBe('—');
  });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import SessionDetail from './SessionDetail.jsx';
import SessionEventsPanel, { FiredEventCard } from '../components/Session/SessionEventsPanel.jsx';
import NotesPanel from '../components/Session/NotesPanel.jsx';
import StatTile from '../components/Stats/StatTile.jsx';

// Smoke SSR (sin efectos) del detalle de sesión finalizada (F19). renderToStaticMarkup
// no ejecuta useEffect, así que no dispara fetch/socket: valida el árbol inicial, el
// gating por rol/readOnly, la extracción del render de eventos y la ausencia de emojis.

const dm = { id: 1, username: 'dm1', role: 'dm' };
const player = { id: 2, username: 'ana', role: 'player' };
const session = {
  id: 42,
  name: 'La cripta olvidada',
  campaign_id: 5,
  campaign_name: 'Las Tormentas',
  created_at: 1719600000,
  duration_seconds: 9600,
  member_count: 4,
};
const noop = () => {};

// Rango de emojis (mismo criterio que el smoke del Login y de F18).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('SessionDetail (F19)', () => {
  it('pinta el botón volver, el nombre de la sesión y los 4 tabs, sin emojis', () => {
    const html = renderToStaticMarkup(<SessionDetail session={session} user={dm} onBack={noop} />);
    expect(html).toContain('Volver a Sesiones Finalizadas');
    expect(html).toContain('La cripta olvidada');
    for (const label of ['Notas', 'Eventos', 'Resumen', 'IA']) {
      expect(html).toContain(label);
    }
    // Metadatos del encabezado.
    expect(html).toContain('Las Tormentas');
    expect(html).toContain('jugadores');
    expect(html).not.toMatch(EMOJI);
  });

  it('el tab inicial es Notas en modo lectura (embebe NotesPanel readOnly)', () => {
    const html = renderToStaticMarkup(<SessionDetail session={session} user={dm} onBack={noop} />);
    // El tab por defecto ('notes') monta NotesPanel con readOnly: en SSR (sin fetch) el
    // estado vacío de solo-lectura confirma que va montado y en modo lectura.
    expect(html).toContain('Esta sesión no tiene notas.');
  });
});

describe('NotesPanel readOnly (F19)', () => {
  it('el DM en modo lectura NO ve el botón de crear nota', () => {
    const live = renderToStaticMarkup(<NotesPanel sessionId={session.id} user={dm} />);
    const ro = renderToStaticMarkup(<NotesPanel sessionId={session.id} user={dm} readOnly />);
    // En vivo el DM ve el botón "+ Nota"; en readOnly no.
    expect(live).toContain('Nota');
    // El botón de crear ("+ Nota") desaparece: el único texto de acción del DM.
    expect(ro).toContain('Esta sesión no tiene notas.');
    expect(ro).not.toMatch(EMOJI);
  });

  it('el jugador solo ve públicas (mismo gating) en readOnly', () => {
    const html = renderToStaticMarkup(<NotesPanel sessionId={session.id} user={player} readOnly />);
    expect(html).toContain('Esta sesión no tiene notas.');
    expect(html).not.toMatch(EMOJI);
  });
});

describe('FiredEventCard (extraído de PlanningPanel, F19)', () => {
  const npcEvent = {
    id: 1,
    type: 'NPC',
    actor_username: 'dm1',
    payload: JSON.stringify({
      title: 'Encuentro con el mercader',
      description: 'Ofrece un mapa',
      actor_type: 'npc',
      npc_name: 'Vex el Tuerto',
      location: 'Mercado',
      sub_location: 'Puesto de reliquias',
      participant_type: 'specific',
      participants: [{ name: 'Ana' }, { name: 'Beto' }],
    }),
  };

  it('renderiza badge NPC, categoría, título, ubicación y participantes específicos', () => {
    const html = renderToStaticMarkup(<FiredEventCard event={npcEvent} showLocation />);
    expect(html).toContain('NPC');
    expect(html).toContain('Encuentro con el mercader');
    expect(html).toContain('Vex el Tuerto');
    expect(html).toContain('Mercado');
    expect(html).toContain('Puesto de reliquias');
    expect(html).toContain('Ana');
    expect(html).toContain('Beto');
    expect(html).not.toMatch(EMOJI);
  });

  it('sin showLocation no pinta la ubicación', () => {
    const html = renderToStaticMarkup(<FiredEventCard event={npcEvent} />);
    expect(html).not.toContain('Mercado');
  });

  it('tolera payload no parseable sin romper', () => {
    const bad = { id: 2, type: 'combate', actor_username: 'dm1', payload: '{no-json' };
    const html = renderToStaticMarkup(<FiredEventCard event={bad} showLocation />);
    // Cae al type como título y al actor.
    expect(html).toContain('combate');
    expect(html).toContain('dm1');
  });
});

describe('SessionEventsPanel (F19)', () => {
  it('monta en estado de carga sin efectos (SSR)', () => {
    const html = renderToStaticMarkup(<SessionEventsPanel sessionId={session.id} />);
    expect(html).toContain('Cargando eventos…');
  });
});

describe('StatTile sin emojis (restyle F19)', () => {
  it('usa icono de línea, no emoji', () => {
    const html = renderToStaticMarkup(<StatTile label="Eventos" value={7} icon="zap" />);
    expect(html).toContain('Eventos');
    expect(html).toContain('7');
    expect(html).toContain('<svg'); // Icon renderiza un svg
    expect(html).not.toMatch(EMOJI);
  });
});

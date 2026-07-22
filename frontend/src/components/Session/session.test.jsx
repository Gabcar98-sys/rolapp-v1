import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NotesPanel from './NotesPanel.jsx';
import SessionToolbar from './SessionToolbar.jsx';
import AIPanel from '../AI/AIPanel.jsx';

// Smoke SSR (sin efectos) de los paneles nuevos/ampliados de la sesión en vivo (F18).
// renderToStaticMarkup no ejecuta useEffect, así que no dispara fetch/socket: sólo valida
// que el árbol inicial monta sin errores, respeta el gating por rol y no usa emojis.

const dm = { id: 1, username: 'dm1', role: 'dm' };
const player = { id: 2, username: 'ana', role: 'player' };
const session = { id: 10, name: 'La cripta', campaign_id: 5 };
const noop = () => {};

// Rango de emojis (mismo criterio que el smoke del Login).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

describe('NotesPanel (F18)', () => {
  it('el DM ve el botón para crear notas', () => {
    const html = renderToStaticMarkup(<NotesPanel sessionId={session.id} user={dm} />);
    expect(html).toContain('Notas');
    expect(html).toContain('Nota'); // botón "+ Nota"
    expect(html).not.toMatch(EMOJI);
  });

  it('el jugador NO ve el botón de crear (solo lectura de públicas)', () => {
    const html = renderToStaticMarkup(<NotesPanel sessionId={session.id} user={player} />);
    // El estado inicial vacío para el jugador menciona que el DM aún no publicó.
    expect(html).toContain('El DM aún no ha publicado notas.');
    expect(html).not.toMatch(EMOJI);
  });
});

describe('SessionToolbar (F18)', () => {
  it('el DM ve las acciones de sesión (mapa/evento/NPC/finalizar)', () => {
    const html = renderToStaticMarkup(
      <SessionToolbar
        session={session}
        user={dm}
        currentImageUrl={null}
        onSetImage={noop}
        onOpenPlanning={noop}
        onReset={noop}
        onClose={noop}
        onLeave={noop}
      />
    );
    expect(html).toContain('Cambiar mapa');
    expect(html).toContain('Nuevo Evento');
    expect(html).toContain('Evento NPC');
    expect(html).toContain('Finalizar');
    expect(html).not.toMatch(EMOJI);
  });

  it('el jugador solo ve Salir', () => {
    const html = renderToStaticMarkup(
      <SessionToolbar
        session={session}
        user={player}
        currentImageUrl={null}
        onSetImage={noop}
        onOpenPlanning={noop}
        onReset={noop}
        onClose={noop}
        onLeave={noop}
      />
    );
    expect(html).toContain('Salir');
    expect(html).not.toContain('Cambiar mapa');
    expect(html).not.toContain('Finalizar');
  });
});

describe('AIPanel v2 (F18)', () => {
  it('muestra los modos Sesión/Sistema y los presets de sesión, sin emojis', () => {
    const html = renderToStaticMarkup(
      <AIPanel sessionId={session.id} user={dm} campaignId={session.campaign_id} />
    );
    expect(html).toContain('Sesión');
    expect(html).toContain('Sistema');
    // Presets de sesión.
    for (const label of ['Pregunta libre', 'Resumen', 'Cronología', 'Estado de personajes', 'Inventarios']) {
      expect(html).toContain(label);
    }
    // Conserva el bloque de resumen de sesión de F9-F12.
    expect(html).toContain('Resumen de sesión');
    // Checkbox de sesiones anteriores (hay campaignId).
    expect(html).toContain('Incluir sesiones anteriores');
    expect(html).not.toMatch(EMOJI);
  });

  it('sin campaignId no ofrece "incluir sesiones anteriores"', () => {
    const html = renderToStaticMarkup(<AIPanel sessionId={session.id} user={dm} campaignId={null} />);
    expect(html).not.toContain('Incluir sesiones anteriores');
  });
});

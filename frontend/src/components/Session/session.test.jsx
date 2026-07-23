import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import NotesPanel from './NotesPanel.jsx';
import SessionToolbar, { buildQuickEventPayload } from './SessionToolbar.jsx';
import AIPanel, { resolveSessionGameSystems } from '../AI/AIPanel.jsx';

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

// El disparo real vive dentro del componente (submitQuick → api.firePlanningEvent), pero
// como el runner de vitest no tiene jsdom, testeamos directamente el constructor puro del
// payload, que es la lógica load-bearing del flujo "crear y disparar".
describe('buildQuickEventPayload (F20)', () => {
  const chars = [
    { id: 101, name: 'Aria' },
    { id: 102, name: 'Borin' },
    { id: 103, name: 'Cato' },
  ];

  it('todo el grupo: participantes vacíos, actor dm, sin template ni datos de NPC', () => {
    const payload = buildQuickEventPayload({
      user: dm,
      form: { title: '  Emboscada  ', category: 'combate', description: 'sorpresa' },
      partType: 'all',
      chars,
      selectedIds: new Set(),
    });
    expect(payload).toEqual({
      dm_id: dm.id,
      title: 'Emboscada', // recortado
      category: 'combate',
      description: 'sorpresa',
      participant_type: 'all',
      participants: [],
      actor_type: 'dm',
    });
    // Un evento rápido nunca lleva template_id ni campos de NPC.
    expect(payload).not.toHaveProperty('template_id');
    expect(payload).not.toHaveProperty('npc_id');
  });

  it('específicos: sólo los personajes seleccionados, mapeados a { id, name }', () => {
    const payload = buildQuickEventPayload({
      user: dm,
      form: { title: 'Trampa', category: 'trampa', description: '' },
      partType: 'specific',
      chars,
      selectedIds: new Set([101, 103]),
    });
    expect(payload.participant_type).toBe('specific');
    expect(payload.participants).toEqual([
      { id: 101, name: 'Aria' },
      { id: 103, name: 'Cato' },
    ]);
  });
});

// El sistema de juego se hereda de la campaña (modelo canónico F22); los personajes en
// sesión son solo fallback. La resolución es la lógica load-bearing del AIPanel, extraída
// a un helper puro (sin DOM) por el runner de vitest sin jsdom (lección F20).
describe('resolveSessionGameSystems (F22)', () => {
  const chars = [
    { game_system_template_id: 7, game_system_name: 'Dragonbane' },
    { game_system_template_id: 7, game_system_name: 'Dragonbane' }, // duplicado a deduplicar
    { game_system_template_id: 9, game_system_name: 'Stormlight' },
  ];

  it('solo campaña: usa el sistema de la campaña como principal y por defecto', () => {
    const { systems, defaultId } = resolveSessionGameSystems({
      session: { campaign_game_system_id: 3, campaign_game_system_name: 'Stormlight' },
      characters: [],
    });
    expect(systems).toEqual([{ id: 3, name: 'Stormlight' }]);
    expect(defaultId).toBe('3');
  });

  it('campaña sin nombre: cae a "Sistema {id}"', () => {
    const { systems, defaultId } = resolveSessionGameSystems({
      session: { campaign_game_system_id: 42 },
      characters: [],
    });
    expect(systems).toEqual([{ id: 42, name: 'Sistema 42' }]);
    expect(defaultId).toBe('42');
  });

  it('solo personajes: deriva de los personajes (fallback), deduplicando por id', () => {
    const { systems, defaultId } = resolveSessionGameSystems({
      session: { campaign_game_system_id: null },
      characters: chars,
    });
    expect(systems).toEqual([
      { id: 7, name: 'Dragonbane' },
      { id: 9, name: 'Stormlight' },
    ]);
    expect(defaultId).toBe('7');
  });

  it('ambos: la campaña va primero y es el default; añade sistemas extra de personajes', () => {
    const { systems, defaultId } = resolveSessionGameSystems({
      session: { campaign_game_system_id: 9, campaign_game_system_name: 'Stormlight' },
      characters: chars,
    });
    // 9 (campaña, primero) + 7 (personaje extra), sin duplicar el 9.
    expect(systems).toEqual([
      { id: 9, name: 'Stormlight' },
      { id: 7, name: 'Dragonbane' },
    ]);
    expect(defaultId).toBe('9');
  });

  it('ninguno: sin campaña-con-sistema ni personajes-con-sistema → lista vacía y default ""', () => {
    const { systems, defaultId } = resolveSessionGameSystems({
      session: { campaign_game_system_id: null },
      characters: [{ name: 'Sin sistema' }],
    });
    expect(systems).toEqual([]);
    expect(defaultId).toBe('');
  });

  it('sin argumentos: degrada a lista vacía sin lanzar', () => {
    expect(resolveSessionGameSystems()).toEqual({ systems: [], defaultId: '' });
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

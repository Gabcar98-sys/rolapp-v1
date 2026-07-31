import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { PregenCard, CharacterRow } from './MyCharacters.jsx';

const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
const V0_PALETTE = /(bg|text|border)-(gold|ink-(?:\d{3}|line)|gray-\d{2,3})\b/u;

describe('PregenCard (F35 — contadores con iconos, no emojis)', () => {
  const pregen = {
    id: 1,
    name: 'Talani',
    game_system_name: 'Stormlight RPG',
    avatar_icon: '',
    attrs: [{}, {}, {}],
    skillLinks: [{}, {}],
    inventory: [{}],
  };

  it('muestra los tres contadores con icono SVG y sin emojis', () => {
    const html = renderToStaticMarkup(<PregenCard baseChar={pregen} onAdopt={() => {}} />);
    expect(html).toContain('Talani');
    expect(html).toContain('Stormlight RPG');
    // Un SVG por contador (atributos / habilidades / inventario).
    expect(html.match(/<svg/g)?.length).toBe(3);
    expect(html).toContain('title="Atributos"');
    expect(html).toContain('title="Habilidades"');
    expect(html).toContain('title="Inventario"');
    expect(html).not.toMatch(EMOJI);
  });

  it('conserva los conteos reales y degrada a 0 si faltan las listas', () => {
    const text = renderToStaticMarkup(
      <PregenCard baseChar={pregen} onAdopt={() => {}} />,
    ).replace(/<[^>]*>/g, '');
    expect(text).toContain('3');
    expect(text).toContain('2');
    expect(text).toContain('1');

    const bare = renderToStaticMarkup(
      <PregenCard baseChar={{ id: 2, name: 'Sin datos' }} onAdopt={() => {}} />,
    ).replace(/<[^>]*>/g, '');
    expect(bare).toContain('Sin datos');
    expect(bare).toContain('0');
  });

  it('usa tokens del handoff, no la paleta v0', () => {
    const html = renderToStaticMarkup(<PregenCard baseChar={pregen} onAdopt={() => {}} />);
    expect(html).not.toMatch(V0_PALETTE);
  });
});

describe('CharacterRow (F35 — botones de icono con etiqueta accesible)', () => {
  const char = { id: 9, name: 'Vedd', game_system_name: 'Stormlight RPG' };

  it('los botones de solo-icono conservan su aria-label y pierden el emoji', () => {
    const html = renderToStaticMarkup(
      <CharacterRow char={char} onOpen={() => {}} onStats={() => {}} onDelete={() => {}} />,
    );
    expect(html).toContain('aria-label="Ver estadísticas de Vedd"');
    expect(html).toContain('aria-label="Eliminar Vedd"');
    expect(html).toContain('Ver ficha');
    expect(html.match(/<svg/g)?.length).toBe(2); // estadísticas + eliminar
    expect(html).not.toMatch(EMOJI);
  });

  it('sin sistema de juego muestra el texto de reserva y ningún token v0', () => {
    const html = renderToStaticMarkup(
      <CharacterRow
        char={{ id: 10, name: 'Anónimo' }}
        onOpen={() => {}}
        onStats={() => {}}
        onDelete={() => {}}
      />,
    );
    expect(html).toContain('Sin sistema');
    expect(html).not.toMatch(V0_PALETTE);
  });
});

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Sparkline from './Sparkline.jsx';
import { LocationChip } from './CampaignStatsPanel.jsx';
import { AttributeRow } from './CharacterStatsPanel.jsx';

// Mismo criterio de emoji que chatPanel.test.jsx (F32) + el bloque de símbolos
// misceláneos y flechas que usó el censo de F35.
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}]/u;
// Paleta v0 con forma de clase Tailwind (los alias retirados en F35).
const V0_PALETTE = /(bg|text|border)-(gold|ink-(?:\d{3}|line)|gray-\d{2,3})\b/u;

describe('Sparkline (F35 — tokens del handoff)', () => {
  it('con menos de 2 valores pinta el guion en texto terciario, sin paleta v0', () => {
    const html = renderToStaticMarkup(<Sparkline values={[3]} />);
    expect(html).toContain('text-faint');
    expect(html).not.toMatch(V0_PALETTE);
  });

  it('con la serie completa usa el acento del handoff y conserva la polilínea', () => {
    const html = renderToStaticMarkup(<Sparkline values={[1, 5, 3]} />);
    expect(html).toContain('text-accent-text');
    expect(html).toContain('<polyline');
    expect(html).toContain('aria-label="Tendencia"');
    expect(html).not.toMatch(V0_PALETTE);
  });
});

describe('LocationChip (F35 — chincheta con icono, no emoji)', () => {
  it('muestra el nombre con un icono SVG y cero emojis', () => {
    const html = renderToStaticMarkup(<LocationChip name="La Cripta" />);
    expect(html).toContain('La Cripta');
    expect(html).toContain('<svg'); // Icon name="pin"
    expect(html).not.toMatch(EMOJI);
  });

  it('usa tokens del handoff (border-line/bg-bg/text-sub), no la paleta v0', () => {
    const html = renderToStaticMarkup(<LocationChip name="La Cripta" />);
    expect(html).toContain('border-line');
    expect(html).toContain('bg-bg');
    expect(html).not.toMatch(V0_PALETTE);
  });
});

describe('AttributeRow (F35 — atributo principal con icono, no emoji)', () => {
  it('atributo principal: pinta el icono de estrella y el nombre', () => {
    const html = renderToStaticMarkup(
      <AttributeRow attr={{ name: 'Fuerza', value: 12, is_core: 1, has_max: 0 }} />,
    );
    expect(html).toContain('Fuerza');
    expect(html).toContain('<svg');
    expect(html).toContain('text-accent-text');
    expect(html).not.toMatch(EMOJI);
  });

  it('atributo NO principal: sin icono y SIN el 0 fantasma de is_core (lección F30)', () => {
    const html = renderToStaticMarkup(
      <AttributeRow attr={{ name: 'Deflect', value: 4, is_core: 0, has_max: 0 }} />,
    );
    expect(html).not.toContain('<svg');
    // El texto plano debe ser exactamente nombre + valor: ni "0Deflect" ni un 0 suelto.
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toBe('Deflect4');
  });

  it('has_max=0 (entero de SQLite) no imprime un 0 ni la barra de máximo', () => {
    const html = renderToStaticMarkup(
      <AttributeRow attr={{ name: 'Salud', value: 7, is_core: 0, has_max: 0, max_value: 10 }} />,
    );
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toBe('Salud7');
  });

  it('has_max=1 con máximo definido muestra "valor / máximo"', () => {
    const html = renderToStaticMarkup(
      <AttributeRow attr={{ name: 'Salud', value: 7, is_core: 1, has_max: 1, max_value: 10 }} />,
    );
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toBe('Salud7 / 10');
  });
});

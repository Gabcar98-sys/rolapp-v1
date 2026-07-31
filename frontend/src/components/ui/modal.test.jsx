import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import Modal from './Modal.jsx';
import Sheet from './Sheet.jsx';

// El runner no tiene jsdom (SSR con renderToStaticMarkup, sin efectos): el listener de
// Escape no se puede ejercitar aquí, así que se comprueba lo observable en el markup
// (role/aria-modal/aria-label) y se contrasta con Sheet, de donde viene el patrón.
describe('Modal (F33 — accesibilidad)', () => {
  const noop = () => {};

  it('declara role="dialog" y aria-modal="true" en el panel', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={noop} title="Nuevo Evento">
        <p>contenido</p>
      </Modal>,
    );
    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('aria-label="Nuevo Evento"');
  });

  it('sin título usa una etiqueta accesible de respaldo y no pinta cabecera', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={noop}>
        <p>contenido</p>
      </Modal>,
    );
    expect(html).toContain('aria-modal="true"');
    expect(html).toMatch(/aria-label="Di[áa]logo"/u);
    expect(html).not.toContain('aria-label="Cerrar"');
  });

  it('cerrado no renderiza nada', () => {
    const html = renderToStaticMarkup(
      <Modal open={false} onClose={noop} title="Nuevo Evento">
        <p>contenido</p>
      </Modal>,
    );
    expect(html).toBe('');
  });

  it('conserva el markup visible: backdrop, panel, título, botón de cerrar e hijos', () => {
    const html = renderToStaticMarkup(
      <Modal open onClose={noop} title="Cambiar mapa">
        <p>contenido</p>
      </Modal>,
    );
    expect(html).toContain('fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4');
    expect(html).toContain('w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-card');
    expect(html).toContain('Cambiar mapa');
    expect(html).toContain('aria-label="Cerrar"');
    expect(html).toContain('<svg'); // Icon name="x"
    expect(html).toContain('<p>contenido</p>');
  });

  it('usa los mismos atributos de diálogo que Sheet (patrón portado)', () => {
    const modal = renderToStaticMarkup(
      <Modal open onClose={noop} title="X">
        <span />
      </Modal>,
    );
    const sheet = renderToStaticMarkup(
      <Sheet open onClose={noop} title="X">
        <span />
      </Sheet>,
    );
    for (const attr of ['role="dialog"', 'aria-modal="true"', 'aria-label="X"']) {
      expect(sheet).toContain(attr);
      expect(modal).toContain(attr);
    }
  });
});

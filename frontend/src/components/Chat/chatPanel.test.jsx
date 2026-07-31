import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import ChatPanel, { ChatMessage, formatMessageTime } from './ChatPanel.jsx';

// Rango de emojis (mismo criterio que el smoke de sesión/Login).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// Timestamp local construido con el MISMO reloj que usa el helper (getHours/getMinutes),
// para que la aserción no dependa de la zona horaria del contenedor.
function localUnix(y, monthIndex, d, h, min) {
  return Math.floor(new Date(y, monthIndex, d, h, min, 0).getTime() / 1000);
}

describe('formatMessageTime (F32 — hora del mensaje)', () => {
  it('formatea un unixepoch en SEGUNDOS como HH:MM con relleno de ceros', () => {
    expect(formatMessageTime(localUnix(2026, 6, 30, 9, 5))).toBe('09:05');
    expect(formatMessageTime(localUnix(2026, 6, 30, 21, 42))).toBe('21:42');
  });

  it('medianoche se muestra como 00:00 (no como 24:00 ni vacío)', () => {
    expect(formatMessageTime(localUnix(2026, 6, 30, 0, 0))).toBe('00:00');
  });

  it('devuelve cadena vacía —nunca un número— ante datos inservibles', () => {
    for (const bad of [null, undefined, 0, -1, '', 'ayer', NaN]) {
      const out = formatMessageTime(bad);
      expect(out).toBe('');
      expect(typeof out).toBe('string');
    }
  });

  it('no interpreta el timestamp como milisegundos', () => {
    // Si tratara los segundos como ms, 1782648000 caería en 1970.
    const unix = localUnix(2026, 6, 30, 13, 7);
    expect(formatMessageTime(unix)).toBe('13:07');
    expect(formatMessageTime(unix * 1000)).not.toBe('13:07');
  });
});

describe('ChatMessage (F32 — burbuja de mensaje)', () => {
  const publicMsg = {
    id: 1,
    from_user_id: 2,
    from_username: 'ana',
    to_user_id: null,
    body: 'Entramos a la cripta',
    created_at: localUnix(2026, 6, 30, 18, 3),
  };

  it('mensaje ajeno: muestra autor, hora y cuerpo, sin emojis', () => {
    const html = renderToStaticMarkup(<ChatMessage message={publicMsg} isMine={false} />);
    expect(html).toContain('ana');
    expect(html).toContain('18:03');
    expect(html).toContain('Entramos a la cripta');
    expect(html).not.toMatch(EMOJI);
  });

  it('mensaje propio: no repite el autor pero conserva la hora', () => {
    const html = renderToStaticMarkup(<ChatMessage message={publicMsg} isMine />);
    expect(html).not.toContain('ana');
    expect(html).toContain('18:03');
  });

  it('mensaje privado: marca "privado" con icono SVG en vez del candado emoji', () => {
    const html = renderToStaticMarkup(
      <ChatMessage message={{ ...publicMsg, to_user_id: 7 }} isMine={false} />,
    );
    expect(html).toContain('privado');
    expect(html).toContain('<svg'); // Icon name="pin"
    expect(html).not.toMatch(EMOJI);
    expect(html).toContain('border-accent'); // realce lateral del privado
  });

  it('sin created_at no pinta hora ni deja un literal suelto', () => {
    const html = renderToStaticMarkup(
      <ChatMessage message={{ ...publicMsg, created_at: null }} isMine={false} />,
    );
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).toBe('anaEntramos a la cripta');
  });

  it('usa tokens del handoff, no la paleta v0 (gold/ink-*/gray-*)', () => {
    const html = renderToStaticMarkup(<ChatMessage message={publicMsg} isMine={false} />);
    expect(html).not.toMatch(/\b(bg|text|border)-(gold|ink-\d{3}|ink-line|gray-\d{3})\b/u);
  });
});

describe('ChatPanel (F32 — accesibilidad y cero emojis)', () => {
  const player = { id: 2, username: 'ana', role: 'player' };
  const connected = [{ userId: 1, username: 'dm1', role: 'dm' }];

  it('el input de mensaje y el botón de enviar tienen etiqueta accesible', () => {
    const html = renderToStaticMarkup(<ChatPanel sessionId={10} user={player} />);
    expect(html).toContain('aria-label="Escribir mensaje para todos"');
    expect(html).toContain('aria-label="Enviar mensaje"');
    expect(html).not.toMatch(EMOJI);
  });

  it('el selector de destinatario tiene aria-label y opciones sin emojis', () => {
    const html = renderToStaticMarkup(
      <ChatPanel sessionId={10} user={player} connectedUsers={connected} />,
    );
    expect(html).toContain('aria-label="Destinatario del mensaje"');
    expect(html).toContain('Todos');
    expect(html).toContain('Privado');
    expect(html).toContain('dm1');
    expect(html).not.toMatch(EMOJI);
  });
});

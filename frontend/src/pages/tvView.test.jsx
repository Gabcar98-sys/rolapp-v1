import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { TvScreen, formatElapsed, toTvEvent } from './TvView.jsx';
import PartyVitals from '../components/Session/PartyVitals.jsx';

// SSR estático (sin jsdom ni efectos, patrón F20): se testea el componente de
// PRESENTACIÓN `TvScreen` con datos stub, que es donde vive todo lo que se ve en el
// televisor. El contenedor `TvView` solo hace fetch + socket.

const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// Texto visible: las clases Tailwind llevan dígitos (w-1/2, py-0.5…), así que las
// aserciones sobre números se hacen SIEMPRE sobre el texto sin tags (lección F30).
const visibleText = (html) => html.replace(/<[^>]*>/g, '');

const session = {
  id: 12,
  name: 'Asedio de la Torre',
  status: 'active',
  campaign_name: 'Honor',
  campaign_game_system_name: 'Stormlight RPG',
  created_at: 1719600000,
};

// attrDefs del sistema: un core CON máximo pequeño, un core SIN máximo (has_max=0) y
// un atributo normal que NO es vital (is_core=0, has_max=0) — los enteros 0/1 son los
// que provocaron el bug F30.
const attrDefs = [
  { id: 1, name: 'Health', is_core: 1, has_max: 1 },
  { id: 2, name: 'Deflect', is_core: 1, has_max: 0 },
  { id: 3, name: 'Strength', is_core: 0, has_max: 0 },
];

const characters = [
  {
    id: 101,
    user_id: 2,
    name: 'Talani',
    username: 'ana',
    templateAttrs: [
      { attribute_template_id: 1, value: '5', max_value: '8', attr_name: 'Health', is_core: 1, has_max: 1 },
      { attribute_template_id: 2, value: '7', max_value: null, attr_name: 'Deflect', is_core: 1, has_max: 0 },
      { attribute_template_id: 3, value: '4', max_value: null, attr_name: 'Strength', is_core: 0, has_max: 0 },
    ],
  },
  { id: 102, user_id: 3, name: 'Buenatracio', username: 'beto', templateAttrs: [] },
];

const users = [{ userId: 2, username: 'ana', role: 'player' }];

const events = [
  { id: 1, category: 'exploración', title: 'Emboscada en el puente', description: 'Los bandidos cortan el paso' },
  { id: 2, category: 'combate', title: 'Persecución', description: '' },
];

const baseProps = {
  session,
  elapsedSeconds: 134,
  characters,
  attrDefs,
  users,
  events,
  inviteUrl: 'http://192.168.1.42:3000',
};

describe('TvScreen (vista de televisor, F31)', () => {
  it('pinta la sesión, la campaña · sistema y el reloj de sesión', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} />);
    expect(html).toContain('Asedio de la Torre');
    expect(html).toContain('Honor · Stormlight RPG');
    expect(visibleText(html)).toContain('02:14'); // 134 s
    expect(html).not.toMatch(EMOJI);
  });

  it('pinta la party con su estado de conexión cruzando session:users', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} />);
    expect(html).toContain('Talani');
    expect(html).toContain('Buenatracio');
    expect(html).toContain('Conectado'); // ana (user_id 2) está en users
    expect(html).toContain('Desconectado'); // beto (user_id 3) no
  });

  it('pinta los últimos eventos disparados en la franja inferior', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} />);
    expect(html).toContain('Emboscada en el puente');
    expect(html).toContain('Persecución');
    expect(html).toContain('Exploración'); // etiqueta de categoría
    expect(html).toContain('Combate');
  });

  it('sin imagen del canvas muestra la tarjeta del ÚLTIMO evento disparado', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} />);
    // El último evento (Persecución) va en grande; la imagen no existe.
    expect(html).not.toContain('<img');
    expect(html.indexOf('Persecución')).toBeGreaterThan(-1);
  });

  it('con imagen del canvas la muestra sin recortar (object-contain) y sin controles', () => {
    const html = renderToStaticMarkup(
      <TvScreen {...baseProps} imageUrl="http://mapa.local/torre.png" />
    );
    expect(html).toContain('object-contain');
    expect(html).toContain('http://mapa.local/torre.png');
    // Vista de solo lectura: ni botones, ni inputs, ni formularios.
    expect(html).not.toContain('<button');
    expect(html).not.toContain('<input');
    expect(html).not.toContain('<form');
  });

  it('muestra la URL de invitación en el pie', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} />);
    expect(html).toContain('Únete desde tu móvil');
    expect(html).toContain('http://192.168.1.42:3000');
  });

  it('al cerrarse la sesión muestra el estado final en vez de romperse', () => {
    const html = renderToStaticMarkup(<TvScreen {...baseProps} closed />);
    expect(html).toContain('Sesión finalizada');
    expect(html).toContain('Talani'); // la party sigue visible
  });

  it('aguanta una sesión sin campaña, sin personajes y sin eventos', () => {
    const html = renderToStaticMarkup(
      <TvScreen session={{ id: 1, name: 'Mesa suelta' }} inviteUrl="http://x" />
    );
    expect(html).toContain('Mesa suelta');
    expect(html).toContain('Aún no hay personajes en la mesa.');
    expect(html).toContain('Sin eventos todavía.');
  });

  // Regresión F30: is_core/has_max son ENTEROS 0/1 de SQLite. Un guard `{flag && …}`
  // pintaría el 0 literal. Los valores de este stub (5/8 y 7) no contienen ceros, así
  // que cualquier '0' del texto de la party sería espurio.
  it('no pinta un 0 espurio por is_core=0 / has_max=0', () => {
    const html = renderToStaticMarkup(
      <PartyVitals character={characters[0]} attrDefs={attrDefs} size="lg" />
    );
    const text = visibleText(html);
    expect(text).toContain('Health');
    expect(text).toContain('5/8');
    expect(text).toContain('Deflect');
    expect(text).toContain('7');
    expect(text).not.toContain('Strength'); // no es vital: no se pinta
    expect(text).not.toContain('0');
  });

  it('PartyVitals no renderiza nada si el personaje no tiene atributos', () => {
    expect(renderToStaticMarkup(<PartyVitals character={characters[1]} attrDefs={attrDefs} />)).toBe('');
    expect(renderToStaticMarkup(<PartyVitals character={{ id: 9 }} />)).toBe('');
  });
});

describe('formatElapsed', () => {
  it('formatea MM:SS y H:MM:SS', () => {
    expect(formatElapsed(0)).toBe('00:00');
    expect(formatElapsed(134)).toBe('02:14');
    expect(formatElapsed(3600)).toBe('1:00:00');
    expect(formatElapsed(9045)).toBe('2:30:45');
  });

  it('tolera valores negativos o no numéricos', () => {
    expect(formatElapsed(-5)).toBe('00:00');
    expect(formatElapsed(undefined)).toBe('00:00');
    expect(formatElapsed('abc')).toBe('00:00');
  });
});

describe('toTvEvent', () => {
  it('extrae título, categoría, descripción y NPC del payload', () => {
    const event = {
      id: 7,
      type: 'NPC',
      payload: JSON.stringify({
        title: 'Encuentro con el mercader',
        description: 'Ofrece un mapa',
        npc_name: 'Vex el Tuerto',
      }),
    };
    expect(toTvEvent(event)).toEqual({
      id: 7,
      category: 'NPC',
      title: 'Encuentro con el mercader',
      description: 'Ofrece un mapa',
      npcName: 'Vex el Tuerto',
    });
  });

  it('degrada al type cuando el payload no parsea', () => {
    expect(toTvEvent({ id: 8, type: 'combate', payload: '{no-json' })).toMatchObject({
      title: 'combate',
      description: '',
      npcName: '',
    });
  });
});

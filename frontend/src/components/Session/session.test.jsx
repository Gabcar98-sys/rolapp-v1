import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { renderToStaticMarkup } from 'react-dom/server';
import NotesPanel from './NotesPanel.jsx';
import SessionToolbar, { buildQuickEventPayload, MapResetConfirm, resolveMapReset } from './SessionToolbar.jsx';
import AIPanel, { freeAskSessionId, resolveSessionGameSystems } from '../AI/AIPanel.jsx';
import Icon, { ICON_NAMES } from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';

// Smoke SSR (sin efectos) de los paneles nuevos/ampliados de la sesión en vivo (F18).
// renderToStaticMarkup no ejecuta useEffect, así que no dispara fetch/socket: sólo valida
// que el árbol inicial monta sin errores, respeta el gating por rol y no usa emojis.

const dm = { id: 1, username: 'dm1', role: 'dm' };
const player = { id: 2, username: 'ana', role: 'player' };
const session = { id: 10, name: 'La cripta', campaign_id: 5 };
const noop = () => {};

// Rango de emojis (mismo criterio que el smoke del Login).
const EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}]/u;

// Texto que el usuario VE de verdad: se borran todas las etiquetas, así que los atributos
// (aria-label, title, alt…) se van con ellas y no pueden hacer pasar en verde una aserción
// de "esto se lee en pantalla". Preferido a anclar la cadena entre dos etiquetas concretas
// (p. ej. /<\/svg>\s*Texto<\/button>/): esa forma se rompe con un `<span>` neutro que no
// cambia un píxel — y `<span className="hidden sm:inline">` es justo el retoque que invita
// una toolbar apretada.
const visibleText = (html) => html.replace(/<[^>]*>/g, '');

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

// F38: el control de reset era un `Icon name="arrow-left"` sin etiqueta (solo un title) que
// se leía como "volver" y ejecutaba el PATCH de reset a la primera, borrando el canvas de
// TODA la mesa. Ahora lleva icono de reinicio, texto visible y confirmación.
describe('Reiniciar mapa (F38)', () => {
  const TOOLBAR_SRC = readFileSync(fileURLToPath(new URL('./SessionToolbar.jsx', import.meta.url)), 'utf8');
  // Fuente con los espacios colapsados: así ni Prettier ni un salto de línea abren un hueco
  // en los guards de abajo (`onClick={\n  () => onReset()\n}` seguiría siendo una sola línea).
  const FLAT_SRC = TOOLBAR_SRC.replace(/\s+/g, ' ');
  // Cualquier manejador de eventos JSX (onClick, onMouseDown, onKeyDown…) que referencie el
  // símbolo dentro de sus llaves. Cubre `onX={sym}` Y `onX={() => sym()}`, que es la forma
  // que esquivaba el guard literal anterior y es exactamente la regresión que F38 arregla.
  const HANDLER_WITH = (sym) => new RegExp(`on[A-Z]\\w*=\\{[^}]*${sym}`);
  // Misma forma que se escribe en el JSX: <Icon name="…"
  const ICON_LITERAL = /<Icon\s+name="([^"]+)"/g;

  function dmToolbar() {
    return renderToStaticMarkup(
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
  }

  it('el botón lleva texto visible y aria-label, no solo un title al pasar el ratón', () => {
    const html = dmToolbar();
    // Texto VISIBLE: tras borrar las etiquetas, la cadena tiene que seguir ahí. No basta
    // con buscarla en el HTML crudo (el aria-label y el title la contienen y convertían el
    // test en tautología), ni con anclarla al cierre del <svg> (un <span> inocuo la rompe).
    expect(html).toContain('aria-label="Reiniciar mapa"');
    expect(visibleText(html)).toContain('Reiniciar mapa');
    expect(html).not.toContain('Reiniciar canvas'); // el title mudo de antes
  });

  it('visibleText no se deja engañar por atributos ni por etiquetas extra (control del arnés)', () => {
    // Control negativo: un botón mudo cuya única "Etiqueta" vive en atributos NO la tiene
    // como texto visible…
    expect(visibleText('<button aria-label="Etiqueta" title="Etiqueta"><svg></svg></button>')).not.toContain(
      'Etiqueta'
    );
    // …y envolverla en un <span> (o en cualquier otra etiqueta) NO debe romper la aserción.
    expect(
      visibleText('<button aria-label="Etiqueta"><svg></svg><span class="hidden sm:inline">Etiqueta</span></button>')
    ).toContain('Etiqueta');
  });

  it('ya no usa la flecha que se confundía con un "volver"', () => {
    // El path se extrae del propio set: si arrow-left cambia, el test sigue siendo válido.
    const arrowLeftPath = renderToStaticMarkup(<Icon name="arrow-left" size={15} />).match(/d="([^"]+)"/)[1];
    expect(dmToolbar()).not.toContain(arrowLeftPath);
  });

  it('el icono "refresh" existe DE VERDAD en el set y pinta svg (uno inventado no)', () => {
    expect(ICON_NAMES).toContain('refresh');
    const real = renderToStaticMarkup(<Icon name="refresh" size={15} />);
    expect(real).toContain('<svg');
    expect(real).toContain('<path');
    // Control negativo (lección F35): un nombre inexistente NO rompe el build ni lanza,
    // Icon devuelve null y el botón queda sin glifo. Regresión puramente visual.
    expect(renderToStaticMarkup(<Icon name="reiniciar" size={15} />)).not.toContain('<svg');
  });

  it('todos los iconos literales de la toolbar existen en el set', () => {
    const used = [...TOOLBAR_SRC.matchAll(ICON_LITERAL)].map((m) => m[1]);
    expect(used.length).toBeGreaterThan(4); // el censo mira un árbol no vacío
    expect(used.filter((n) => !ICON_NAMES.includes(n))).toEqual([]);
    // Control positivo del patrón: sobre una fuente con un icono falso, lo pilla.
    const fake = [...'<Icon name="no-existe" size={15} />'.matchAll(ICON_LITERAL)].map((m) => m[1]);
    expect(fake).toEqual(['no-existe']);
    expect(ICON_NAMES).not.toContain('no-existe');
  });

  // El helper puro sería inútil si el componente dejara de invocarlo (el reset volvería a
  // colgar del onClick y nada se pondría rojo). Se vigila sobre la fuente real, y se vigila
  // el CONJUNTO de apariciones del símbolo peligroso, no una forma sintáctica concreta.
  it('el botón abre la confirmación en vez de ejecutar el reset directamente', () => {
    expect(FLAT_SRC).toMatch(/resolveMapReset\(\{/);

    // Censo COMPLETO de `onReset`: exactamente 4 sitios, y ni uno más.
    //   1) firma del helper resolveMapReset       3) firma de props de SessionToolbar
    //   2) cuerpo del helper (`if (confirmed)`)   4) la única llamada al helper
    // Una quinta aparición es una vía nueva hacia el reset y hay que justificarla aquí.
    expect(FLAT_SRC.match(/onReset/g)).toHaveLength(4);

    // Ninguna de ellas cuelga de un manejador de eventos.
    expect(FLAT_SRC).not.toMatch(HANDLER_WITH('onReset'));
  });

  it('el guard de cableado pilla también la forma envuelta en arrow (control positivo)', () => {
    // Sin esto el guard es papel mojado: la versión anterior buscaba el literal
    // `onClick={onReset}` y `onClick={() => onReset()}` pasaba por delante.
    expect('<Button onClick={onReset}>x</Button>').toMatch(HANDLER_WITH('onReset'));
    expect('<Button onClick={() => onReset()}>x</Button>').toMatch(HANDLER_WITH('onReset'));
    expect('<Button onMouseDown={() => { onReset(); }}>x</Button>').toMatch(HANDLER_WITH('onReset'));
    // Y no marca lo que sí es legítimo: pasar el símbolo al helper por nombre de campo.
    expect('resolveMapReset({ confirmed, onReset, closeModal });').not.toMatch(HANDLER_WITH('onReset'));
  });

  // Cableado (lección F5): el diálogo extraído es inútil si la toolbar deja de montarlo.
  // Borrar la confirmación entera dejaría el botón abriendo la nada, en silencio.
  it('la toolbar monta de verdad la confirmación, con su estado y su resolvedor', () => {
    expect(FLAT_SRC).toMatch(/<MapResetConfirm[^>]*open=\{showReset\}/);
    expect(FLAT_SRC).toMatch(/<MapResetConfirm[^>]*onResolve=\{closeReset\}/);
  });

  it('al montar, la confirmación está cerrada (el reset no puede dispararse solo)', () => {
    const html = dmToolbar();
    expect(html).not.toContain('role="dialog"'); // Modal cerrado devuelve null
    expect(html).not.toContain('no solo en tu pantalla'); // el cuerpo del aviso
  });
});

// El helper decide bien, pero quien ELIGE el booleano son los tres onClick del diálogo, y
// eso es lo que ningún test cubría: cambiar el `false` de Cancelar por `true` —una errata de
// un carácter que convierte el botón de escape en el destructivo— pasaba la suite entera.
// Sin jsdom (lección F20) se ejercita el componente como función pura: se invoca, se recorre
// el árbol de elementos que devuelve y se disparan sus manejadores de verdad.
describe('MapResetConfirm: los tres caminos de salida (F38)', () => {
  // Aplana el árbol de elementos React (los hijos pueden ser nodo, array o string).
  function flattenTree(node, out = []) {
    if (node === null || node === undefined || typeof node !== 'object') return out;
    if (Array.isArray(node)) {
      for (const child of node) flattenTree(child, out);
      return out;
    }
    out.push(node);
    return flattenTree(node.props?.children, out);
  }

  // Etiqueta de un nodo = sus hijos de tipo string (así se escriben los dos botones).
  function labelOf(node) {
    const children = node.props?.children;
    return (Array.isArray(children) ? children : [children]).filter((c) => typeof c === 'string').join('').trim();
  }

  // Dispara el onClick REAL del botón cuya etiqueta visible es `label` y devuelve los
  // argumentos con los que el diálogo llamó a onResolve.
  function clickAndCollect(label) {
    const calls = [];
    const tree = MapResetConfirm({ open: true, onResolve: (confirmed) => calls.push(confirmed) });
    const button = flattenTree(tree).find((n) => n.props?.onClick && labelOf(n) === label);
    expect(button).toBeTruthy(); // si el botón desapareció, el test no puede pasar en vacío
    button.props.onClick();
    return calls;
  }

  it('usa el Modal del proyecto, no un window.confirm', () => {
    const tree = MapResetConfirm({ open: true, onResolve: noop });
    expect(tree.type).toBe(Modal);
    expect(tree.props.title).toBe('Reiniciar mapa');
  });

  it('"Cancelar" resuelve en false: el botón de escape NUNCA reinicia el canvas', () => {
    expect(clickAndCollect('Cancelar')).toEqual([false]);
  });

  it('"Sí, reiniciar mapa" resuelve en true: es el único camino destructivo', () => {
    expect(clickAndCollect('Sí, reiniciar mapa')).toEqual([true]);
  });

  it('cerrar por backdrop/Escape/aspa resuelve en false (cerrar sin querer no destruye)', () => {
    const calls = [];
    const tree = MapResetConfirm({ open: true, onResolve: (confirmed) => calls.push(confirmed) });
    expect(typeof tree.props.onClose).toBe('function'); // los tres caminos van por aquí
    tree.props.onClose();
    expect(calls).toEqual([false]);
  });

  it('un solo clic resuelve una sola vez (ni el confirmar ni el cancelar duplican)', () => {
    expect(clickAndCollect('Cancelar')).toHaveLength(1);
    expect(clickAndCollect('Sí, reiniciar mapa')).toHaveLength(1);
  });

  // La copy ES la feature: el founder decidió que el texto nombrara el alcance. Hoy se
  // podía borrar entera sin que nada se pusiera rojo.
  it('la copy nombra el alcance real y dice la verdad sobre el endpoint', () => {
    const text = visibleText(renderToStaticMarkup(<MapResetConfirm open onResolve={noop} />)).replace(/\s+/g, ' ');

    // Qué se borra y para quién: el emit de session:reset va a TODO el room.
    expect(text).toContain('Se borrarán el mapa de fondo y los dibujos del canvas');
    expect(text).toContain('para toda la mesa');
    expect(text).toContain('no solo en tu pantalla');
    expect(text).toContain('el Modo TV');

    // Qué NO se borra. "No afecta a eventos" era FALSO: el endpoint escribe una fila
    // session_reset en session_events y stats.event_count la cuenta sin filtrar.
    expect(text).toContain('No borra eventos, notas, chat ni personajes');
    expect(text).toContain('queda registrado en el historial de la sesión');
    expect(text).not.toContain('No afecta a');

    // Y los dos botones se leen (no son iconos mudos ni un "Aceptar" genérico).
    expect(text).toContain('Cancelar');
    expect(text).toContain('Sí, reiniciar mapa');
    expect(text).not.toMatch(EMOJI);
  });
});

// La confirmación es la lógica load-bearing del arreglo, y el runner no tiene jsdom
// (lección F20): se testea el helper puro que el propio componente invoca.
describe('resolveMapReset (F38)', () => {
  function spy() {
    const calls = [];
    const fn = (...args) => calls.push(args);
    fn.calls = calls;
    return fn;
  }

  it('confirmar: cierra el modal y dispara el reset UNA sola vez', () => {
    const onReset = spy();
    const closeModal = spy();
    resolveMapReset({ confirmed: true, onReset, closeModal });
    expect(onReset.calls).toHaveLength(1);
    expect(closeModal.calls).toHaveLength(1);
  });

  it('cancelar (o cerrar por backdrop/Escape): cierra sin tocar el canvas de la mesa', () => {
    const onReset = spy();
    const closeModal = spy();
    resolveMapReset({ confirmed: false, onReset, closeModal });
    expect(onReset.calls).toHaveLength(0);
    expect(closeModal.calls).toHaveLength(1);
  });

  it('solo `confirmed === true` dispara: ningún valor laxo cuela un reset', () => {
    for (const confirmed of [undefined, null, 0, '', NaN]) {
      const onReset = spy();
      resolveMapReset({ confirmed, onReset, closeModal: noop });
      expect(onReset.calls).toHaveLength(0);
    }
  });

  it('sin callbacks no lanza', () => {
    expect(() => resolveMapReset({ confirmed: true })).not.toThrow();
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

// F37: en modo Sesión la pregunta libre debe mandar el sessionId para que el backend
// inyecte el contexto de la partida; en modo Sistema debe seguir yendo SIN él (el camino
// retrocompatible que solo consulta el manual).
describe('freeAskSessionId (F37)', () => {
  it('modo Sesión: manda el sessionId de la sesión en curso', () => {
    expect(freeAskSessionId('session', 17)).toBe(17);
  });

  it('modo Sistema: nunca manda sessionId (consulta solo el manual)', () => {
    expect(freeAskSessionId('system', 17)).toBeNull();
  });

  it('sin sessionId resuelto degrada a null en vez de undefined', () => {
    expect(freeAskSessionId('session', undefined)).toBeNull();
    expect(freeAskSessionId('session', null)).toBeNull();
  });
});

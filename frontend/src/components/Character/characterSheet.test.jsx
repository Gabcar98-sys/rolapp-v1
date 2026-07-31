import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { coreMarker, StatusRow } from './CharacterSheet.jsx';

const noop = () => {};

// Regresión F30: `is_core` llega como ENTERO 0/1 desde SQLite. El guard previo
// `{def.is_core && <span/>}` renderizaba el literal 0 pegado al nombre del atributo
// en los no-core ("0Deflect", "0Health"). coreMarker() coerciona a booleano: pinta la
// ★ para core y NADA (ni la estrella ni un 0 espurio) para los no-core.
// El runner es SSR (renderToStaticMarkup, sin jsdom) → testeamos el helper puro.
describe('coreMarker (F30 — is_core entero de SQLite)', () => {
  it('is_core = 1 pinta la estrella de atributo principal', () => {
    const html = renderToStaticMarkup(<>{coreMarker(1)}</>);
    expect(html).toContain('★');
    expect(html).toContain('atributo principal');
  });

  it('is_core = 0 NO pinta la estrella ni el 0 literal (bug F30)', () => {
    const html = renderToStaticMarkup(<>{coreMarker(0)}</>);
    expect(html).not.toContain('★');
    // La causa raíz: {0 && <span/>} devolvía 0 y React lo renderizaba.
    expect(html).not.toContain('0');
    expect(html).toBe('');
  });

  it('devuelve null (no un número) para los valores falsy', () => {
    expect(coreMarker(0)).toBeNull();
    expect(coreMarker(undefined)).toBeNull();
    expect(coreMarker(null)).toBeNull();
  });

  it('el nombre del atributo no-core queda limpio, sin 0 pegado', () => {
    // Simula el fragmento real de la etiqueta: marcador + nombre del atributo.
    const html = renderToStaticMarkup(
      <span>
        {coreMarker(0)}
        Deflect
      </span>,
    );
    expect(html).not.toContain('0Deflect');
    expect(html).toContain('Deflect');
  });
});

// Regresión F30 (segunda pasada): `has_max` también es ENTERO 0/1 de SQLite. StatusRow
// se renderiza para `is_core || has_max`, así que un atributo CORE SIN máximo (has_max=0)
// pasaba por los guards `{def.has_max && <label/>}` y `{useDots && <div/>}` (con useDots
// heredando el 0 de has_max) → pintaban un `0` literal en la pestaña Estado. Usamos un
// valor actual NO-cero (7) para que el único `0` posible sea el espurio del guard.
describe('StatusRow (F30 — has_max entero sin máximo)', () => {
  const coreNoMaxDef = { id: 1, name: 'Deflect', category: 'Defensa', type: 'number', is_core: 1, has_max: 0 };
  const character = {
    id: 5,
    templateAttrs: [{ attribute_template_id: 1, value: '7' }],
  };
  const user = { id: 9 };

  it('atributo core sin máximo NO pinta un 0 espurio en la pestaña Estado', () => {
    const html = renderToStaticMarkup(
      <StatusRow
        def={coreNoMaxDef}
        character={character}
        user={user}
        canEdit
        onSaved={noop}
        setError={noop}
      />,
    );
    // Aserción sobre el TEXTO visible (sin tags): las clases Tailwind de Button/Card
    // contienen dígitos (opacity-50, duration-150) que envenenarían un toContain('0')
    // sobre el HTML crudo. Con valor actual 7 y has_max=0, ningún 0 de texto debe salir
    // (ni del guard `def.has_max`, ni de `useDots` heredando el 0).
    const text = html.replace(/<[^>]*>/g, '');
    expect(text).not.toContain('0');
    expect(text).toContain('7'); // el valor actual legítimo sí se muestra
    expect(text).toContain('★'); // is_core=1 → estrella
    expect(text).toContain('Deflect');
  });

  it('atributo core CON máximo numérico renderiza el tracker sin literales sueltos', () => {
    const withMaxDef = { id: 2, name: 'Health', category: 'Estado', type: 'number', is_core: 1, has_max: 1 };
    const chWithMax = { id: 5, templateAttrs: [{ attribute_template_id: 2, value: '3', max_value: '6' }] };
    const html = renderToStaticMarkup(
      <StatusRow def={withMaxDef} character={chWithMax} user={user} canEdit onSaved={noop} setError={noop} />,
    );
    expect(html).toContain('Health');
    expect(html).toContain('★');
    expect(html).toContain('/6'); // muestra actual/máx
  });
});

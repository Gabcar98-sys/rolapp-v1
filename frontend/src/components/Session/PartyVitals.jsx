import { barWidthClass, pickVitals } from '../../lib/vitals.js';

// Vitales de un personaje en modo SOLO PRESENTACIÓN (sin edición): puntos para
// máximos pequeños, barra para los grandes y solo la cifra para los core sin máximo.
// Se usa en la columna de la party de la vista TV (`size="lg"`) y en las tarjetas del
// panel de personajes de la sesión (`size="sm"`), para que el DM vea el estado del
// grupo sin abrir cada ficha.
//
// Si el personaje no tiene atributos (o el sistema no define vitales) no renderiza
// nada: `pickVitals` devuelve [] y el componente sale con null.
export default function PartyVitals({ character, attrDefs = null, size = 'sm', className = '' }) {
  const vitals = pickVitals(character, attrDefs);
  if (vitals.length === 0) return null;

  const large = size === 'lg';
  return (
    <div className={`flex flex-col ${large ? 'gap-2' : 'gap-1'} ${className}`}>
      {vitals.map((vital) => (
        <VitalRow key={vital.id} vital={vital} large={large} />
      ))}
    </div>
  );
}

// Un vital bajo (<= 25%) se pinta en rojo para que se lea de lejos en el televisor.
// Clases literales (el JIT solo genera lo que ve escrito, lección F14).
function fillClasses(pct) {
  return pct !== null && pct <= 25
    ? { bar: 'bg-danger-text', dot: 'border-danger-text bg-danger-text' }
    : { bar: 'bg-accent', dot: 'border-accent bg-accent' };
}

function VitalRow({ vital, large }) {
  const fill = fillClasses(vital.pct);
  return (
    <div className={`flex items-center ${large ? 'gap-3' : 'gap-2'}`}>
      <span
        className={`flex-shrink-0 truncate uppercase tracking-wider text-faint ${
          large ? 'w-24 text-sm' : 'w-14 text-[10px]'
        }`}
      >
        {vital.name}
      </span>

      <div className="flex min-w-0 flex-1 items-center">
        {vital.mode === 'dots' ? (
          <div className="flex flex-wrap gap-1">
            {Array.from({ length: vital.max }, (_, i) => (
              <span
                key={i}
                className={`rounded-full border ${large ? 'h-3 w-3' : 'h-2 w-2'} ${
                  i < vital.current ? fill.dot : 'border-line-hover bg-transparent'
                }`}
              />
            ))}
          </div>
        ) : null}

        {vital.mode === 'bar' ? (
          <div
            className={`w-full overflow-hidden rounded-full bg-bg ${large ? 'h-2.5' : 'h-1.5'}`}
          >
            <div
              className={`${large ? 'h-2.5' : 'h-1.5'} rounded-full ${fill.bar} ${barWidthClass(
                vital.pct
              )}`}
            />
          </div>
        ) : null}
      </div>

      <span
        className={`num flex-shrink-0 font-semibold text-title ${large ? 'text-xl' : 'text-xs'}`}
      >
        {vital.current}
        {vital.max === null ? null : (
          <span className={large ? 'text-base text-faint' : 'text-[10px] text-faint'}>
            /{vital.max}
          </span>
        )}
      </span>
    </div>
  );
}

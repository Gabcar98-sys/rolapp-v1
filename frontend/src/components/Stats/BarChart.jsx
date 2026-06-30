// Gráfico de barras horizontales sin librerías ni estilos inline: el relleno se
// expresa con clases de ancho de Tailwind (fracciones de 1/12), redondeando el
// valor relativo al doceavo más cercano. data: [{ label, value }].
const WIDTH_CLASSES = [
  'w-0', 'w-1/12', 'w-2/12', 'w-3/12', 'w-4/12', 'w-5/12', 'w-6/12',
  'w-7/12', 'w-8/12', 'w-9/12', 'w-10/12', 'w-11/12', 'w-full',
];

// Mapea un valor relativo (0..1) a una de las 13 clases de ancho disponibles.
function widthClass(ratio) {
  const idx = Math.max(0, Math.min(12, Math.round(ratio * 12)));
  return WIDTH_CLASSES[idx];
}

export default function BarChart({ data = [], emptyLabel = 'Sin datos' }) {
  if (!data.length) {
    return <p className="text-sm text-gray-500">{emptyLabel}</p>;
  }
  const max = Math.max(...data.map((d) => d.value), 1);

  return (
    <ul className="flex flex-col gap-2">
      {data.map((d) => (
        <li key={d.label} className="flex items-center gap-3">
          <span className="w-28 flex-shrink-0 truncate text-xs text-gray-300" title={d.label}>
            {d.label}
          </span>
          <span className="relative h-4 flex-1 overflow-hidden rounded-md bg-ink-900">
            <span className={`block h-full rounded-md bg-gold transition-all ${widthClass(d.value / max)}`} />
          </span>
          <span className="w-8 flex-shrink-0 text-right text-xs font-semibold text-gray-200">
            {d.value}
          </span>
        </li>
      ))}
    </ul>
  );
}

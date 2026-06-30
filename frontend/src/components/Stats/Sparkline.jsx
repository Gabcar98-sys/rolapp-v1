// Mini-gráfico de línea en SVG inline (sin librerías). values: number[].
// Útil para mostrar progresión (p. ej. eventos por sesión a lo largo de la campaña).
// El SVG escala con viewBox; el color usa currentColor para heredar del contenedor.
export default function Sparkline({ values = [], width = 120, height = 32 }) {
  if (values.length < 2) {
    return <span className="text-xs text-gray-500">—</span>;
  }
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = max - min || 1;
  const step = width / (values.length - 1);

  const points = values
    .map((v, i) => {
      const x = i * step;
      // Invertimos Y: en SVG el origen está arriba.
      const y = height - ((v - min) / range) * height;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="h-8 w-full text-gold"
      role="img"
      aria-label="Tendencia"
      preserveAspectRatio="none"
    >
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

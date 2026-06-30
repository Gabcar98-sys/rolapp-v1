// Convierte un objeto-contador { clave: n } en datos ordenados para BarChart.
export function countsToBarData(counts = {}) {
  return Object.entries(counts)
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value);
}

// Formatea una duración en segundos como "Xh Ym" / "Ym Zs" / "Zs".
export function formatDuration(seconds = 0) {
  if (!seconds || seconds < 0) return '0s';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

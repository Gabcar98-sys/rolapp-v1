// Tarjeta compacta de una métrica única (número grande + etiqueta). Reutilizable
// en los paneles de estadísticas de sesión, campaña y personaje.
export default function StatTile({ label, value, icon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-ink-line bg-ink-900 p-3 text-center">
      <span className="text-2xl font-bold text-gold">
        {icon ? <span className="mr-1">{icon}</span> : null}
        {value}
      </span>
      <span className="mt-1 text-xs text-gray-400">{label}</span>
    </div>
  );
}

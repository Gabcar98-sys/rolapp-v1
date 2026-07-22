import Icon from '../ui/Icon.jsx';

// Tarjeta compacta de una métrica única (icono de línea + número grande + etiqueta).
// Reutilizable en los paneles de estadísticas de sesión, campaña y personaje.
// `icon` es el nombre de un icono del set (Icon.jsx), no un emoji (cero emojis, handoff).
export default function StatTile({ label, value, icon }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-line bg-surface-2 p-3 text-center">
      {icon && <Icon name={icon} size={18} className="mb-1 text-accent-text" />}
      <span className="num text-2xl font-bold text-title">{value}</span>
      <span className="mt-1 text-xs text-faint">{label}</span>
    </div>
  );
}

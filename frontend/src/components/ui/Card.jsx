// Superficie/panel reutilizable. Usa los tokens ink/line del diseño.
export default function Card({ className = '', children, ...props }) {
  return (
    <div
      className={`rounded-card border border-ink-line bg-ink-700 ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

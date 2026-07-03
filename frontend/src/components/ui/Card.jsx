// Superficie/panel reutilizable con los tokens del handoff.
// hoverable: sube el borde y añade sombra al pasar el cursor (tarjetas clicables).
export default function Card({ className = '', hoverable = false, children, ...props }) {
  return (
    <div
      className={`rounded-card border border-line bg-surface transition-[border-color,box-shadow] duration-150 ${
        hoverable ? 'hover:border-line-hover hover:shadow-card' : ''
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

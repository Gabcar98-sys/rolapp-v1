// Botón reutilizable con variantes basadas en tokens Tailwind del proyecto.
// Reemplaza los estilos inline duplicados de la v0.
const VARIANTS = {
  primary: 'bg-gold text-ink-900 font-semibold hover:opacity-90',
  secondary: 'border border-ink-line text-gray-200 hover:border-gold hover:text-gold',
  ghost: 'text-gray-300 hover:text-gold',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
};

const SIZES = {
  sm: 'px-3 py-1.5 text-sm',
  md: 'px-4 py-2 text-sm',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  type = 'button',
  ...props
}) {
  return (
    <button
      type={type}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md transition-all disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

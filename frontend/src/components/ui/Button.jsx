// Botón reutilizable con variantes basadas en los tokens del handoff.
const VARIANTS = {
  primary: 'bg-accent font-bold text-bg hover:bg-accent-hover',
  secondary: 'border border-line bg-surface text-ink hover:border-accent',
  ghost: 'text-sub hover:text-title',
  danger: 'bg-danger-tint text-danger-text hover:bg-danger-wash',
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
      className={`inline-flex items-center justify-center gap-1.5 rounded-btn transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
      {...props}
    />
  );
}

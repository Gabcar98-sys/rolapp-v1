// Modal centrado con backdrop. Cierra al hacer clic fuera o en el botón de cerrar.
export default function Modal({ open, onClose, title, children }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-card border border-ink-line bg-ink-700 p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gold">{title}</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gold"
              aria-label="Cerrar"
            >
              ✕
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

import { useEffect } from 'react';
import Icon from './Icon.jsx';

// Modal centrado con backdrop. Cierra al hacer clic fuera, en el botón de cerrar o con
// Escape. role="dialog" + aria-modal para accesibilidad (mismo patrón que Sheet.jsx).
export default function Modal({ open, onClose, title, children }) {
  // Escape cierra el modal; el listener solo vive mientras está abierto.
  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Diálogo'}
        className="w-full max-w-md rounded-card border border-line bg-surface p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="mb-4 flex items-center justify-between">
            <h2 className="font-serif text-lg font-semibold text-title">{title}</h2>
            <button
              type="button"
              onClick={onClose}
              className="rounded-btn p-1 text-faint transition-colors hover:bg-hover hover:text-title"
              aria-label="Cerrar"
            >
              <Icon name="x" size={16} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

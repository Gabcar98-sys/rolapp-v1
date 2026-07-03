import { useEffect } from 'react';
import Icon from './Icon.jsx';

// Bottom-sheet para móvil: panel anclado al borde inferior que sube desde abajo.
// Cierra al tocar el backdrop, el botón de cerrar o Escape. role="dialog" + foco
// para accesibilidad. Tokens del handoff (cero estilos inline).
export default function Sheet({ open, onClose, title, children }) {
  // Escape cierra el sheet; el listener solo vive mientras está abierto.
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
      className="fixed inset-0 z-50 flex flex-col justify-end bg-black/70"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title || 'Panel'}
        className="flex max-h-[85vh] flex-col rounded-t-card border-t border-line bg-surface shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-line px-4 py-3">
          <h2 className="font-serif text-base font-semibold text-title">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-btn p-1.5 text-faint transition-colors hover:bg-hover hover:text-title focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            aria-label="Cerrar panel"
          >
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

import { useEffect } from 'react';

// Bottom-sheet para móvil: panel anclado al borde inferior que sube desde abajo.
// Cierra al tocar el backdrop, el botón de cerrar o Escape. role="dialog" + foco
// para accesibilidad. Reutiliza los tokens ink/gold del diseño (cero estilos inline).
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
        className="flex max-h-[85vh] flex-col rounded-t-card border-t border-ink-line bg-ink-700 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center justify-between border-b border-ink-line px-4 py-3">
          <h2 className="text-base font-semibold text-gold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 text-gray-400 hover:text-gold focus-visible:outline focus-visible:outline-2 focus-visible:outline-gold"
            aria-label="Cerrar panel"
          >
            ✕
          </button>
        </div>
        <div className="flex flex-1 flex-col overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

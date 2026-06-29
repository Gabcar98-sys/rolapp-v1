// Barra de tabs controlada. tabs: [{ id, label, badge? }]. El contenido lo renderiza
// el padre según activeId — este componente solo dibuja la cabecera.
export default function Tabs({ tabs, activeId, onChange, className = '' }) {
  return (
    <div className={`flex border-b border-ink-line ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative flex-1 px-2 py-2 text-base transition-colors ${
              active
                ? 'border-b-2 border-gold text-gold'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[0.6rem] font-bold text-white">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

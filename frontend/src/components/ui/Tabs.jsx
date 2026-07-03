// Barra de tabs controlada. tabs: [{ id, label, badge? }]. El contenido lo renderiza
// el padre según activeId — este componente solo dibuja la cabecera.
export default function Tabs({ tabs, activeId, onChange, className = '' }) {
  return (
    <div className={`flex border-b border-line ${className}`} role="tablist">
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tab.id)}
            className={`relative min-h-[44px] flex-1 px-2 py-2 text-sm transition-colors focus-visible:outline focus-visible:-outline-offset-2 focus-visible:outline-2 focus-visible:outline-accent ${
              active
                ? 'border-b-2 border-accent font-semibold text-accent-text'
                : 'text-faint hover:text-sub'
            }`}
          >
            {tab.label}
            {tab.badge > 0 && (
              <span className="num absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-pill bg-accent px-1 text-[0.6rem] font-bold text-bg">
                {tab.badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

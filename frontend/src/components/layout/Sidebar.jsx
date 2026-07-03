import Icon from '../ui/Icon.jsx';
import Logo from '../ui/Logo.jsx';
import { getNavGroups } from './navItems.js';

// Sidebar fijo de 236px según el handoff (Sidebar.dc.html): cabecera con logo +
// wordmark, bloque de usuario, grupos de navegación y pie "Cerrar Sesión".
function NavItem({ item, active, onNavigate }) {
  return (
    <button
      type="button"
      onClick={() => onNavigate(item.id)}
      aria-current={active ? 'page' : undefined}
      className={`mx-[10px] my-px flex w-[calc(100%-20px)] items-center gap-[11px] rounded-btn px-3 py-2 text-left text-[13.5px] transition-colors ${
        active
          ? 'bg-accent-tint font-semibold text-accent-text shadow-[inset_3px_0_0_#CE6A3A]'
          : 'font-medium text-idle hover:bg-hover-2 hover:text-title-2'
      }`}
    >
      <Icon name={item.icon} size={18} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

export default function Sidebar({ user, active, onNavigate, onLogout }) {
  const groups = getNavGroups(user.role);
  const roleLabel = user.role === 'dm' ? 'Dungeon Master' : 'Jugador';
  const initial = (user.username || '?').charAt(0).toUpperCase();

  return (
    <aside className="flex w-[236px] flex-shrink-0 flex-col border-r border-line bg-nav">
      {/* Cabecera: logo + wordmark */}
      <div className="flex items-center gap-2.5 px-[18px] pb-3.5 pt-[18px]">
        <Logo />
        <span className="font-serif text-xl font-semibold tracking-[0.3px] text-title">
          RolApp
        </span>
      </div>

      {/* Bloque de usuario */}
      <div className="flex items-center gap-[11px] px-[18px] pb-4">
        <div className="flex h-[38px] w-[38px] flex-shrink-0 items-center justify-center rounded-full bg-accent text-[15px] font-bold text-bg">
          {initial}
        </div>
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold leading-tight text-ink">
            {user.username}
          </div>
          <div className="text-xs text-faint">{roleLabel}</div>
        </div>
      </div>

      {/* Grupos de navegación */}
      <nav className="flex-1 overflow-y-auto pb-2">
        {groups.map((group) => (
          <div key={group.label}>
            <div className="px-5 pb-1.5 pt-3 text-[10px] font-bold uppercase tracking-[1.3px] text-muted">
              {group.label}
            </div>
            {group.items.map((item) => (
              <NavItem
                key={item.id}
                item={item}
                active={item.id === active}
                onNavigate={onNavigate}
              />
            ))}
          </div>
        ))}
      </nav>

      {/* Pie: cerrar sesión en tono peligro */}
      <div className="border-t border-line-2 px-2.5 py-3">
        <button
          type="button"
          onClick={onLogout}
          className="flex w-full items-center gap-[11px] rounded-btn px-3 py-2 text-left text-[13.5px] font-medium text-danger-idle transition-colors hover:bg-danger-wash hover:text-danger-text"
        >
          <Icon name="logout" size={18} />
          Cerrar Sesión
        </button>
      </div>
    </aside>
  );
}

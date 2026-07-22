import Icon from '../ui/Icon.jsx';
import Logo from '../ui/Logo.jsx';
import { getNavGroups } from '../layout/navItems.js';

// Rail compacto de 62px (réplica solo-iconos del sidebar) para la pantalla
// full-bleed de Preparar Sesión. Reutiliza los mismos ítems de navegación que el
// Sidebar; al pulsar uno vuelve al AppShell con esa página activa (onNavigate).
export default function PrepRail({ user, active = 'prep', onNavigate, onLogout }) {
  const items = getNavGroups(user.role).flatMap((g) => g.items);
  const initial = (user.username || '?').charAt(0).toUpperCase();

  return (
    <nav className="flex w-[62px] flex-shrink-0 flex-col items-center gap-1 border-r border-line bg-rail py-3.5">
      <div className="mb-3.5">
        <Logo />
      </div>
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            title={item.label}
            aria-label={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.id)}
            className={`relative flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors ${
              isActive
                ? 'bg-accent-tint text-accent-text'
                : 'text-muted-2 hover:bg-hover-2 hover:text-title-2'
            }`}
          >
            {isActive && (
              <span className="absolute -left-[11px] top-[9px] h-[22px] w-[3px] rounded bg-accent" />
            )}
            <Icon name={item.icon} size={19} strokeWidth={1.6} />
          </button>
        );
      })}
      <div className="flex-1" />
      <button
        type="button"
        title="Cerrar sesión"
        aria-label="Cerrar sesión"
        onClick={onLogout}
        className="mb-1 flex h-10 w-10 items-center justify-center rounded-[10px] text-muted-2 hover:bg-danger-wash hover:text-danger-text"
      >
        <Icon name="logout" size={18} />
      </button>
      <div
        title={`${user.username} · ${user.role === 'dm' ? 'Dungeon Master' : 'Jugador'}`}
        className="flex h-9 w-9 items-center justify-center rounded-full bg-accent text-sm font-bold text-bg"
      >
        {initial}
      </div>
    </nav>
  );
}

import Sidebar from './Sidebar.jsx';

// Layout global del handoff: [ sidebar 236px | main flex-1 scrollable ].
// El shell solo aporta el contenedor scrollable; cada página define su propio
// padding y max-width (ver Page.jsx). SessionView (sesión en vivo) queda fuera.
export default function AppShell({ user, active, onNavigate, onLogout, children }) {
  return (
    <div className="flex h-full bg-bg">
      <Sidebar user={user} active={active} onNavigate={onNavigate} onLogout={onLogout} />
      <main className="min-w-0 flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}

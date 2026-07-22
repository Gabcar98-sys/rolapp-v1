import { useState } from 'react';
import Login from './pages/Login.jsx';
import SessionView from './pages/SessionView.jsx';
import AppShell from './components/layout/AppShell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import CampaignsPage from './pages/CampaignsPage.jsx';
import PrepPage from './pages/PrepPage.jsx';
import SkillsPage from './pages/SkillsPage.jsx';
import BaseCharactersPage from './pages/BaseCharactersPage.jsx';
import AttributesPage from './pages/AttributesPage.jsx';
import CharactersPage from './pages/CharactersPage.jsx';
import ItemsPage from './pages/ItemsPage.jsx';
import NpcsPage from './pages/NpcsPage.jsx';
import HistoryPage from './pages/HistoryPage.jsx';

// Enrutado simple por estado (sin router): AppShell + página activa del sidebar.
// SessionView (sesión en vivo) queda fuera del shell, como pantalla completa.
export default function App() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);
  const [page, setPage] = useState('dashboard');

  if (!user) {
    return (
      <Login
        onAuth={(u) => {
          setUser(u);
          setPage('dashboard');
        }}
      />
    );
  }

  if (session) {
    return (
      <SessionView session={session} user={user} onLeave={() => setSession(null)} />
    );
  }

  // Páginas exclusivas del DM; si un jugador cae en una (no navegable desde su
  // sidebar), se le muestra el dashboard.
  const dmOnly = new Set(['campaigns', 'prep', 'skills', 'base-characters', 'attributes', 'items', 'npcs']);
  const isDM = user.role === 'dm';
  const active = !isDM && dmOnly.has(page) ? 'dashboard' : page;

  const logout = () => {
    setSession(null);
    setUser(null);
    setPage('dashboard');
  };

  // Preparar Sesión es full-bleed (rail 62px propio), fuera del AppShell — igual
  // que SessionView. El resto de páginas viven dentro del shell.
  if (active === 'prep') {
    return <PrepPage user={user} onNavigate={setPage} onLogout={logout} />;
  }

  function renderPage() {
    switch (active) {
      case 'campaigns':
        return <CampaignsPage user={user} />;
      case 'skills':
        return <SkillsPage user={user} />;
      case 'base-characters':
        return <BaseCharactersPage user={user} />;
      case 'attributes':
        return <AttributesPage user={user} onNavigate={setPage} />;
      case 'characters':
        return <CharactersPage user={user} />;
      case 'items':
        return <ItemsPage user={user} />;
      case 'npcs':
        return <NpcsPage user={user} />;
      case 'history':
        return <HistoryPage user={user} />;
      default:
        return <DashboardPage user={user} onEnterSession={setSession} onNavigate={setPage} />;
    }
  }

  return (
    <AppShell
      user={user}
      active={active}
      onNavigate={setPage}
      onLogout={logout}
    >
      {renderPage()}
    </AppShell>
  );
}

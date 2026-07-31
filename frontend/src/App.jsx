import { useEffect, useState } from 'react';
import { api } from './lib/api.js';
import { buildHash, navigate, useHashRoute } from './lib/route.js';
import {
  clearStoredSessionId,
  clearStoredUser,
  loadStoredSessionId,
  loadStoredUser,
  saveStoredSessionId,
  saveStoredUser,
} from './lib/storage.js';
import Login from './pages/Login.jsx';
import SessionView from './pages/SessionView.jsx';
import TvView from './pages/TvView.jsx';
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

// Enrutado por hash (F31): la página activa deriva de `#/…` en vez de un useState suelto,
// así la app es enlazable (móvil, segunda pantalla, televisor) y sobrevive a un F5.
// Las páginas NO cambian: siguen recibiendo `onNavigate(page)`; lo único distinto es que
// esa función escribe el hash. SessionView y PrepPage siguen full-bleed fuera del AppShell.
export default function App() {
  const route = useHashRoute();
  const [user, setUser] = useState(() => loadStoredUser());
  const [session, setSession] = useState(null);
  // Se lee una sola vez al arrancar: el efecto de sincronización limpia la clave al salir
  // de una sesión, así que leerla más tarde daría un valor ya borrado.
  const [initialSessionId] = useState(() => loadStoredSessionId());

  // Auto-rejoin tras recargar: solo si se abrió la URL "pelada" (sin ruta). Cualquier
  // hash explícito (#/dashboard, #/tv/3…) manda sobre la sesión guardada.
  useEffect(() => {
    const hash = window.location.hash;
    const bare = !hash || hash === '#' || hash === '#/';
    if (initialSessionId && bare) {
      navigate(buildHash({ page: 'session', sessionId: initialSessionId }));
    }
  }, [initialSessionId]);

  // Sincroniza el estado de sesión con la ruta: #/session/:id entra (si la sesión sigue
  // activa) y cualquier otra ruta sale. Una sesión cerrada o inexistente limpia la
  // persistencia y cae al dashboard en vez de dejar la vista colgada.
  useEffect(() => {
    if (!user) return undefined;
    const wantedId = route.page === 'session' ? route.sessionId : null;

    if (!wantedId) {
      if (session) {
        setSession(null);
        clearStoredSessionId();
      }
      return undefined;
    }
    if (session?.id === wantedId) return undefined;

    let cancelled = false;
    api
      .getSession(wantedId)
      .then(({ session: loaded }) => {
        if (cancelled) return;
        if (loaded?.status === 'active') {
          setSession(loaded);
          saveStoredSessionId(loaded.id);
        } else {
          clearStoredSessionId();
          navigate(buildHash({ page: 'dashboard' }));
        }
      })
      .catch(() => {
        if (cancelled) return;
        clearStoredSessionId();
        navigate(buildHash({ page: 'dashboard' }));
      });

    return () => {
      cancelled = true;
    };
  }, [user, route.page, route.sessionId, session]);

  const go = (page) => navigate(buildHash({ page }));

  // Vista de televisor: espectador de solo lectura, ANTES del gate de login.
  if (route.page === 'tv' && route.sessionId) {
    return <TvView sessionId={route.sessionId} />;
  }

  if (!user) {
    return (
      <Login
        onAuth={(u) => {
          setUser(u);
          saveStoredUser(u);
          // Si el enlace ya apuntaba a una sesión, se respeta (se entra tras el login).
          if (route.page !== 'session') go('dashboard');
        }}
      />
    );
  }

  if (session) {
    return (
      <SessionView
        session={session}
        user={user}
        onLeave={() => go('dashboard')}
      />
    );
  }

  // Ruta de sesión con la sesión aún sin resolver (fetch en curso tras un F5).
  if (route.page === 'session') {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <p className="font-serif text-xl text-sub">Entrando a la sesión…</p>
      </div>
    );
  }

  // Páginas exclusivas del DM; si un jugador cae en una (no navegable desde su
  // sidebar), se le muestra el dashboard.
  const dmOnly = new Set(['campaigns', 'prep', 'skills', 'base-characters', 'attributes', 'items', 'npcs']);
  const isDM = user.role === 'dm';
  // Aquí la ruta ya solo puede ser una página del shell ('session' y 'tv' salieron antes).
  const active = !isDM && dmOnly.has(route.page) ? 'dashboard' : route.page;

  const logout = () => {
    setSession(null);
    setUser(null);
    clearStoredUser();
    clearStoredSessionId();
    go('dashboard');
  };

  // Entrar a una sesión = navegar a su ruta. El estado lo pone SIEMPRE el efecto de
  // sincronización (fuente única: la ruta), así se evita la carrera entre `setSession` y
  // el `hashchange` —que llega en otra tarea— y de paso la sesión llega enriquecida
  // (campaña y sistema de juego) aunque venga de un POST /sessions recién creado.
  const enterSession = (s) => navigate(buildHash({ page: 'session', sessionId: s.id }));

  // Preparar Sesión es full-bleed (rail 62px propio), fuera del AppShell — igual
  // que SessionView. El resto de páginas viven dentro del shell.
  if (active === 'prep') {
    return <PrepPage user={user} onNavigate={go} onLogout={logout} />;
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
        return <AttributesPage user={user} onNavigate={go} />;
      case 'characters':
        return <CharactersPage user={user} />;
      case 'items':
        return <ItemsPage user={user} />;
      case 'npcs':
        return <NpcsPage user={user} />;
      case 'history':
        return <HistoryPage user={user} />;
      default:
        return <DashboardPage user={user} onEnterSession={enterSession} onNavigate={go} />;
    }
  }

  return (
    <AppShell
      user={user}
      active={active}
      onNavigate={go}
      onLogout={logout}
    >
      {renderPage()}
    </AppShell>
  );
}

import { useState } from 'react';
import Login from './pages/Login.jsx';
import Lobby from './pages/Lobby.jsx';
import SessionView from './pages/SessionView.jsx';

// Enrutado simple por estado en App. La decisión Context vs Zustand es de F3;
// por ahora basta con user + sesión activa en memoria local.
export default function App() {
  const [user, setUser] = useState(null);
  const [session, setSession] = useState(null);

  if (!user) {
    return <Login onAuth={setUser} />;
  }

  if (session) {
    return (
      <SessionView
        session={session}
        user={user}
        onLeave={() => setSession(null)}
      />
    );
  }

  return (
    <Lobby
      user={user}
      onEnterSession={setSession}
      onLogout={() => {
        setSession(null);
        setUser(null);
      }}
    />
  );
}

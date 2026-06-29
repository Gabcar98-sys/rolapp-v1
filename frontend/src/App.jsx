import { useState } from 'react';
import Login from './pages/Login.jsx';

export default function App() {
  const [user, setUser] = useState(null);

  if (!user) {
    return <Login onAuth={setUser} />;
  }

  // Placeholder de lobby — se construye en F4 (motor de sesión).
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-2xl font-bold text-gold">
        ¡Hola, {user.username}!
      </h1>
      <p className="text-gray-400">
        Rol: {user.role === 'dm' ? '🎲 DM' : '⚔️ Jugador'}
      </p>
      <p className="max-w-sm text-sm text-gray-500">
        Andamiaje F0 listo. El lobby y las sesiones llegan en las siguientes fases del plan.
      </p>
      <button
        onClick={() => setUser(null)}
        className="mt-2 rounded-md border border-ink-line px-4 py-2 text-sm text-gray-300 hover:border-gold hover:text-gold"
      >
        Salir
      </button>
    </div>
  );
}

import { useState } from 'react';
import { api } from '../lib/api.js';

export default function Login({ onAuth }) {
  const [mode, setMode] = useState('login'); // 'login' | 'register'
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [role, setRole] = useState('player');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { user } =
        mode === 'login'
          ? await api.login(username, pin)
          : await api.register(username, pin, role);
      onAuth(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-card border border-ink-line bg-ink-700 p-6 shadow-xl">
        <h1 className="mb-1 text-center text-2xl font-bold text-gold">RolApp</h1>
        <p className="mb-6 text-center text-sm text-gray-400">
          {mode === 'login' ? 'Entra a tu mesa' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">Usuario</span>
            <input
              className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-gray-100 outline-none focus:border-gold"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-gray-400">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-gray-100 outline-none focus:border-gold"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-gray-400">Rol</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['player', '⚔️ Jugador'],
                  ['dm', '🎲 DM'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setRole(value)}
                    className={`rounded-md border px-3 py-2 transition-colors ${
                      role === value
                        ? 'border-gold bg-ink-600 text-gold'
                        : 'border-ink-line text-gray-400 hover:border-gold/50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-md bg-gold py-2 font-semibold text-ink-900 transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            {busy ? '…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setError('');
          }}
          className="mt-4 w-full text-center text-sm text-gray-400 hover:text-gold"
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </button>
      </div>
    </div>
  );
}

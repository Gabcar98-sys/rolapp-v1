import { useState } from 'react';
import { api } from '../lib/api.js';
import Logo from '../components/ui/Logo.jsx';

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-ink outline-none placeholder:text-faint focus:border-accent';

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
    <div className="flex min-h-full items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm rounded-card border border-line bg-surface p-7 shadow-card">
        <div className="mb-1 flex items-center justify-center gap-2.5">
          <Logo />
          <span className="font-serif text-2xl font-semibold tracking-[0.3px] text-title">
            RolApp
          </span>
        </div>
        <p className="mb-6 text-center text-sm text-sub">
          {mode === 'login' ? 'Entra a tu mesa' : 'Crea tu cuenta'}
        </p>

        <form onSubmit={submit} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-faint">Usuario</span>
            <input
              className={inputCls}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </label>

          <label className="flex flex-col gap-1 text-sm">
            <span className="text-faint">PIN</span>
            <input
              type="password"
              inputMode="numeric"
              className={inputCls}
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {mode === 'register' && (
            <div className="flex flex-col gap-1 text-sm">
              <span className="text-faint">Rol</span>
              <div className="grid grid-cols-2 gap-2">
                {[
                  ['player', 'Jugador'],
                  ['dm', 'Dungeon Master'],
                ].map(([value, label]) => (
                  <button
                    type="button"
                    key={value}
                    onClick={() => setRole(value)}
                    className={`rounded-btn border px-3 py-2 transition-colors ${
                      role === value
                        ? 'border-accent bg-accent-tint font-semibold text-accent-text'
                        : 'border-line text-sub hover:border-line-hover'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="mt-1 rounded-btn bg-accent py-2 font-bold text-bg transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {busy ? 'Un momento…' : mode === 'login' ? 'Entrar' : 'Crear cuenta'}
          </button>
        </form>

        <button
          type="button"
          onClick={() => {
            setMode((m) => (m === 'login' ? 'register' : 'login'));
            setError('');
          }}
          className="mt-4 w-full text-center text-sm text-sub transition-colors hover:text-accent-text"
        >
          {mode === 'login' ? '¿No tienes cuenta? Regístrate' : '¿Ya tienes cuenta? Entra'}
        </button>
      </div>
    </div>
  );
}

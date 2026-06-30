import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import SessionPrepPanel from '../components/DMMaster/SessionPrepPanel.jsx';
import EventTemplatePanel from '../components/DMMaster/EventTemplatePanel.jsx';
import GameSystemPanel from '../components/DMMaster/GameSystemPanel.jsx';

// Agrupa sesiones por campaña; las que no tienen campaña van bajo "Sin campaña".
function groupByCampaign(sessions) {
  const groups = new Map();
  for (const s of sessions) {
    const key = s.campaign_name || 'Sin campaña';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(s);
  }
  return Array.from(groups.entries());
}

export default function Lobby({ user, onEnterSession, onLogout }) {
  const isDM = user.role === 'dm';
  const [sessions, setSessions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [preps, setPreps] = useState([]);
  const [newName, setNewName] = useState('');
  const [newCampaignId, setNewCampaignId] = useState('');
  const [newPrepId, setNewPrepId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  // Vista del lobby: 'sessions' (por defecto) o 'prep' (constructor de preparación, solo DM).
  const [view, setView] = useState('sessions');
  const [editingPrep, setEditingPrep] = useState(null);

  async function loadSessions() {
    try {
      const { sessions: list } = await api.listSessions('active');
      setSessions(list);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadPreps() {
    try {
      const { preps: list } = await api.listPreps(user.id);
      setPreps(list);
    } catch {
      // Sin preps no bloquea el lobby; el selector queda vacío.
    }
  }

  useEffect(() => {
    loadSessions();
    if (isDM) {
      api
        .listCampaigns(user.id)
        .then(({ campaigns: list }) => setCampaigns(list))
        .catch(() => {});
      loadPreps();
    }
    // Solo recarga al cambiar el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isDM]);

  async function createSession(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { session } = await api.createSession(
        newName.trim(),
        user.id,
        newCampaignId || null,
        newPrepId || null
      );
      setNewName('');
      setNewCampaignId('');
      setNewPrepId('');
      onEnterSession(session);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function join(session) {
    setError('');
    try {
      await api.joinSession(session.id, user.id);
      onEnterSession(session);
    } catch (err) {
      setError(err.message);
    }
  }

  const grouped = groupByCampaign(sessions);

  // ── Vista del constructor de preparación (solo DM) ──────────────────────────
  if (isDM && view === 'prep') {
    return (
      <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gold">Preparar sesión</h1>
            <p className="text-sm text-gray-400">Constructor de eventos y enlaces</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setView('sessions');
              setEditingPrep(null);
              loadPreps();
            }}
          >
            ← Lobby
          </Button>
        </header>

        {editingPrep ? (
          <EventTemplatePanel user={user} prep={editingPrep} onBack={() => setEditingPrep(null)} />
        ) : (
          <SessionPrepPanel user={user} onEditPrep={setEditingPrep} />
        )}
      </div>
    );
  }

  // ── Vista del builder de sistemas de juego (solo DM) ────────────────────────
  if (isDM && view === 'systems') {
    return (
      <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gold">Sistemas de juego</h1>
            <p className="text-sm text-gray-400">Builder de atributos, habilidades, objetos y packs</p>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setView('sessions')}>
            ← Lobby
          </Button>
        </header>

        <GameSystemPanel user={user} />
      </div>
    );
  }

  // ── Vista de sesiones (por defecto) ─────────────────────────────────────────
  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gold">Sesiones</h1>
          <p className="text-sm text-gray-400">
            {user.username} · {isDM ? '🎲 DM' : '⚔️ Jugador'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isDM && (
            <>
              <Button variant="secondary" size="sm" onClick={() => setView('systems')}>
                🎲 Sistemas de juego
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setView('prep')}>
                📋 Preparar sesión
              </Button>
            </>
          )}
          <Button variant="secondary" size="sm" onClick={onLogout}>
            Salir
          </Button>
        </div>
      </header>

      {error && (
        <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      {isDM && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold text-gray-200">Nueva sesión</h2>
          <form onSubmit={createSession} className="flex flex-col gap-3">
            <div className="flex flex-col gap-3 md:flex-row">
              <input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre de la sesión"
                className="flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
              />
              <select
                value={newCampaignId}
                onChange={(e) => setNewCampaignId(e.target.value)}
                className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold md:w-56"
              >
                <option value="">— Sin campaña —</option>
                {campaigns.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-3 md:flex-row">
              <select
                value={newPrepId}
                onChange={(e) => setNewPrepId(e.target.value)}
                className="flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
              >
                <option value="">— Sin preparación —</option>
                {preps.map((p) => (
                  <option key={p.id} value={p.id}>
                    📋 {p.name} ({p.event_count})
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={busy}>
                {busy ? '…' : 'Crear'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <section className="flex flex-col gap-5">
        {sessions.length === 0 ? (
          <p className="text-center text-sm text-gray-500">No hay sesiones activas.</p>
        ) : (
          grouped.map(([campaignName, items]) => (
            <div key={campaignName} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                {campaignName}
              </h3>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {items.map((session) => (
                  <Card key={session.id} className="flex items-center justify-between p-4">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-gray-100">
                        {session.name}
                      </p>
                      <p className="mt-0.5 text-xs text-gray-400">
                        DM: {session.dm_username} · {session.member_count} miembros
                      </p>
                    </div>
                    <Button size="sm" className="ml-3 flex-shrink-0" onClick={() => join(session)}>
                      {String(session.dm_id) === String(user.id) ? 'Entrar' : 'Unirse'}
                    </Button>
                  </Card>
                ))}
              </div>
            </div>
          ))
        )}
      </section>
    </div>
  );
}

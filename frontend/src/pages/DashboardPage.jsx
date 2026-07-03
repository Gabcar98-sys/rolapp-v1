import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// Dashboard (placeholder de F14): conserva la funcionalidad de la vista de
// sesiones del Lobby v0 — crear campaña/sesión (DM) y unirse a sesiones activas.
// El rediseño fino con métricas llega en F14.

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

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-accent';

export default function DashboardPage({ user, onEnterSession }) {
  const isDM = user.role === 'dm';
  const [sessions, setSessions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [gameSystems, setGameSystems] = useState([]);
  const [preps, setPreps] = useState([]);
  const [newName, setNewName] = useState('');
  const [newCampaignId, setNewCampaignId] = useState('');
  const [newPrepId, setNewPrepId] = useState('');
  // Formulario de nueva campaña (solo DM).
  const [newCampaignName, setNewCampaignName] = useState('');
  const [newCampaignSystemId, setNewCampaignSystemId] = useState('');
  const [busy, setBusy] = useState(false);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadSessions() {
    try {
      const { sessions: list } = await api.listSessions('active');
      setSessions(list);
    } catch (err) {
      setError(err.message);
    }
  }

  async function loadCampaigns() {
    try {
      const { campaigns: list } = await api.listCampaigns(user.id);
      setCampaigns(list);
    } catch {
      // Sin campañas no bloquea el dashboard.
    }
  }

  useEffect(() => {
    loadSessions();
    if (isDM) {
      loadCampaigns();
      api
        .listGameSystems(user.id)
        .then(({ systems }) => setGameSystems(systems))
        .catch(() => {});
      api
        .listPreps(user.id)
        .then(({ preps: list }) => setPreps(list))
        .catch(() => {});
    }
    // Solo recarga al cambiar el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isDM]);

  async function createCampaign(e) {
    e.preventDefault();
    if (!newCampaignName.trim()) return;
    setCampaignBusy(true);
    setError('');
    try {
      await api.createCampaign(
        newCampaignName.trim(),
        user.id,
        '',
        newCampaignSystemId || null
      );
      setNewCampaignName('');
      setNewCampaignSystemId('');
      await loadCampaigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setCampaignBusy(false);
    }
  }

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

  return (
    <Page>
      <PageHeader
        title="Panel"
        subtitle={isDM ? 'Resumen de tu mesa y sesiones activas' : 'Sesiones activas para unirte'}
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {isDM && (
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
              Nueva campaña
            </h2>
            <form onSubmit={createCampaign} className="flex flex-col gap-3 md:flex-row">
              <input
                value={newCampaignName}
                onChange={(e) => setNewCampaignName(e.target.value)}
                placeholder="Nombre de la campaña"
                className={`flex-1 ${inputCls}`}
              />
              <select
                value={newCampaignSystemId}
                onChange={(e) => setNewCampaignSystemId(e.target.value)}
                className={`${inputCls} md:w-56`}
              >
                <option value="">Sin sistema de juego</option>
                {gameSystems.map((gs) => (
                  <option key={gs.id} value={gs.id}>
                    {gs.name}
                  </option>
                ))}
              </select>
              <Button type="submit" disabled={campaignBusy}>
                {campaignBusy ? 'Creando…' : 'Crear campaña'}
              </Button>
            </form>
          </Card>
        )}

        {isDM && (
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
              Nueva sesión
            </h2>
            <form onSubmit={createSession} className="flex flex-col gap-3">
              <div className="flex flex-col gap-3 md:flex-row">
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Nombre de la sesión"
                  className={`flex-1 ${inputCls}`}
                />
                <select
                  value={newCampaignId}
                  onChange={(e) => setNewCampaignId(e.target.value)}
                  className={`${inputCls} md:w-56`}
                >
                  <option value="">Sin campaña</option>
                  {campaigns.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.game_system_name ? ` (${c.game_system_name})` : ''}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-3 md:flex-row">
                <select
                  value={newPrepId}
                  onChange={(e) => setNewPrepId(e.target.value)}
                  className={`flex-1 ${inputCls}`}
                >
                  <option value="">Sin preparación</option>
                  {preps.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.event_count})
                    </option>
                  ))}
                </select>
                <Button type="submit" disabled={busy}>
                  {busy ? 'Creando…' : 'Crear'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        <section className="flex flex-col gap-5">
          <h2 className="text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
            Sesiones activas
          </h2>
          {sessions.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-faint">
              No hay sesiones activas.
            </div>
          ) : (
            grouped.map(([campaignName, items]) => (
              <div key={campaignName} className="flex flex-col gap-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-faint">
                  {campaignName}
                </h3>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                  {items.map((session) => (
                    <Card
                      key={session.id}
                      hoverable
                      className="flex items-center justify-between p-4"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-title">
                          {session.name}
                        </p>
                        <p className="mt-0.5 text-xs text-sub">
                          DM: {session.dm_username} · {session.member_count} miembros
                        </p>
                      </div>
                      <Button
                        size="sm"
                        className="ml-3 flex-shrink-0"
                        onClick={() => join(session)}
                      >
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
    </Page>
  );
}

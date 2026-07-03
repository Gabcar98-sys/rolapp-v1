import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  deriveDashboardMetrics,
  formatDate,
  formatDuration,
  playersInSession,
} from '../lib/metrics.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

const inputCls =
  'rounded-[10px] border border-[#37312A] bg-bg px-3.5 py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-accent';

// Tarjeta de métrica: icono de línea coloreado + label muted + cifra Newsreader 38px.
function MetricCard({ icon, iconClass, label, value }) {
  return (
    <Card className="p-[18px]">
      <div className="mb-3.5 flex items-center gap-2 text-[12.5px] text-faint">
        <Icon name={icon} size={16} className={iconClass} />
        {label}
      </div>
      <div className="num font-serif text-[38px] font-semibold leading-none text-title">
        {value}
      </div>
    </Card>
  );
}

// Fila de sesión activa: punto verde con halo + título + campaña · nº jugadores.
function ActiveSessionRow({ session, actionLabel, onAction }) {
  return (
    <div className="flex items-center gap-3 border-t border-line-2 p-3">
      <span className="h-[9px] w-[9px] flex-shrink-0 rounded-full bg-cat-explore-bar shadow-[0_0_0_3px_#22301E]" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-ink">{session.name}</div>
        <div className="text-xs text-faint">
          {session.campaign_name || 'Sin campaña'} · {playersInSession(session)} jugadores
        </div>
      </div>
      <button
        type="button"
        onClick={onAction}
        className="flex flex-shrink-0 items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:text-accent-hover"
      >
        {actionLabel}
        <Icon name="arrow-right" size={12} />
      </button>
    </div>
  );
}

// Panel del Dashboard con título Newsreader y pie de enlace opcional.
function DashPanel({ title, footer, onFooter, children }) {
  return (
    <Card className="overflow-hidden">
      <div className="px-[22px] pb-3 pt-[18px] font-serif text-lg font-semibold text-title-2">
        {title}
      </div>
      <div className="px-3.5">{children}</div>
      {footer && (
        <button
          type="button"
          onClick={onFooter}
          className="flex w-full items-center gap-1 border-t border-line-2 px-[22px] py-[13px] text-left text-[13px] font-semibold text-accent-text hover:text-accent-hover"
        >
          {footer}
          <Icon name="arrow-right" size={12} />
        </button>
      )}
    </Card>
  );
}

// Dashboard (F14): métricas derivadas de los listados existentes, bloque Nueva
// sesión (solo DM) y paneles de sesiones activas (Reanudar/Unirse) y recientes.
export default function DashboardPage({ user, onEnterSession, onNavigate }) {
  const isDM = user.role === 'dm';
  const [activeSessions, setActiveSessions] = useState([]);
  const [closedSessions, setClosedSessions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [preps, setPreps] = useState([]);
  const [newName, setNewName] = useState('');
  const [newCampaignId, setNewCampaignId] = useState('');
  const [newPrepId, setNewPrepId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listSessions('active')
      .then(({ sessions }) => setActiveSessions(sessions))
      .catch((err) => setError(err.message));
    api
      .listSessions('closed')
      .then(({ sessions }) => setClosedSessions(sessions))
      .catch(() => {});
    if (isDM) {
      api
        .listCampaigns(user.id)
        .then(({ campaigns: list }) => setCampaigns(list))
        .catch(() => {});
      api
        .listPreps(user.id)
        .then(({ preps: list }) => setPreps(list))
        .catch(() => {});
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

  const metrics = deriveDashboardMetrics({ campaigns, activeSessions, closedSessions });
  const recent = closedSessions.slice(0, 5);

  return (
    <Page>
      <PageHeader title="Panel" subtitle="Gestiona tus campañas y sesiones." />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      {isDM && (
        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            icon="book"
            iconClass="text-cat-social-bar"
            label="Campañas activas"
            value={metrics.campaignCount}
          />
          <MetricCard
            icon="map"
            iconClass="text-cat-explore-bar"
            label="Sesiones activas"
            value={metrics.activeSessionCount}
          />
          <MetricCard
            icon="clock"
            iconClass="text-cat-discovery-bar"
            label="Sesiones finalizadas"
            value={metrics.closedSessionCount}
          />
          <MetricCard
            icon="users"
            iconClass="text-cat-combat-bar"
            label="Total jugadores"
            value={metrics.totalPlayers}
          />
        </div>
      )}

      {isDM && (
        <Card className="mb-6 px-6 py-[22px]">
          <div className="mb-4 font-serif text-[19px] font-semibold text-title-2">
            Nueva sesión
          </div>
          <form onSubmit={createSession} className="flex flex-wrap items-center gap-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Nombre de la sesión"
              className={`min-w-[200px] flex-1 ${inputCls}`}
            />
            <select
              value={newCampaignId}
              onChange={(e) => setNewCampaignId(e.target.value)}
              className={`min-w-[180px] ${inputCls} text-idle`}
            >
              <option value="">— Sin campaña —</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                  {c.game_system_name ? ` (${c.game_system_name})` : ''}
                </option>
              ))}
            </select>
            <select
              value={newPrepId}
              onChange={(e) => setNewPrepId(e.target.value)}
              className={`min-w-[180px] ${inputCls} text-idle`}
            >
              <option value="">— Sin preparación —</option>
              {preps.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.event_count})
                </option>
              ))}
            </select>
            <Button type="submit" disabled={busy} className="px-[22px] py-[11px]">
              {busy ? 'Creando…' : 'Crear'}
            </Button>
          </form>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-[18px] lg:grid-cols-2">
        <DashPanel
          title="Sesiones activas"
          footer={isDM ? 'Ver campañas' : undefined}
          onFooter={isDM ? () => onNavigate('campaigns') : undefined}
        >
          {activeSessions.length === 0 ? (
            <p className="border-t border-line-2 p-4 text-sm text-faint">
              No hay sesiones activas ahora mismo.
            </p>
          ) : (
            activeSessions.map((session) => (
              <ActiveSessionRow
                key={session.id}
                session={session}
                actionLabel={String(session.dm_id) === String(user.id) ? 'Reanudar' : 'Unirse'}
                onAction={() => join(session)}
              />
            ))
          )}
        </DashPanel>

        <DashPanel
          title="Sesiones recientes"
          footer="Ver historial completo"
          onFooter={() => onNavigate('history')}
        >
          {recent.length === 0 ? (
            <p className="border-t border-line-2 p-4 text-sm text-faint">
              Aún no hay sesiones finalizadas.
            </p>
          ) : (
            recent.map((session) => (
              <div key={session.id} className="flex items-center gap-3 border-t border-line-2 p-3">
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-ink">{session.name}</div>
                  <div className="text-xs text-faint">
                    Cerrada · {formatDate(session.created_at)} ·{' '}
                    {formatDuration(session.duration_seconds)}
                  </div>
                </div>
                <span className="flex-shrink-0 text-[12.5px] font-semibold text-faint">
                  {session.campaign_name || 'Sin campaña'}
                </span>
              </div>
            ))
          )}
        </DashPanel>
      </div>
    </Page>
  );
}

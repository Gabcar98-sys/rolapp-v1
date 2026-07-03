import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SessionStatsPanel from '../components/Stats/SessionStatsPanel.jsx';
import CampaignStatsPanel from '../components/Stats/CampaignStatsPanel.jsx';

// Sesiones Finalizadas: historial de sesiones cerradas + estadísticas (F7).
// El rediseño fino (timeline, búsqueda, filtro) llega en F14.
export default function HistoryPage({ user }) {
  const isDM = user.role === 'dm';
  const [closedSessions, setClosedSessions] = useState([]);
  const [campaigns, setCampaigns] = useState([]);
  const [openStatsSessionId, setOpenStatsSessionId] = useState(null);
  const [statsCampaignId, setStatsCampaignId] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listSessions('closed')
      .then(({ sessions }) => setClosedSessions(sessions))
      .catch((err) => setError(err.message));
    if (isDM) {
      api
        .listCampaigns(user.id)
        .then(({ campaigns: list }) => setCampaigns(list))
        .catch(() => {});
    }
    // Solo recarga al cambiar el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, isDM]);

  return (
    <Page>
      <PageHeader
        title="Sesiones Finalizadas"
        subtitle="Historial de sesiones cerradas y métricas de campaña"
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-5">
        {isDM && campaigns.length > 0 && (
          <Card className="p-5">
            <h2 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
              Estadísticas de campaña
            </h2>
            <select
              value={statsCampaignId}
              onChange={(e) => setStatsCampaignId(e.target.value)}
              className="mb-4 w-full rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent md:w-72"
            >
              <option value="">Elige una campaña</option>
              {campaigns.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {statsCampaignId && <CampaignStatsPanel campaignId={statsCampaignId} />}
          </Card>
        )}

        <section className="flex flex-col gap-3">
          {closedSessions.length === 0 ? (
            <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-faint">
              No hay sesiones cerradas.
            </div>
          ) : (
            closedSessions.map((session) => (
              <Card key={session.id} hoverable className="p-4">
                <div className="flex items-center justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-title">{session.name}</p>
                    <p className="mt-0.5 text-xs text-sub">
                      {session.campaign_name || 'Sin campaña'} · DM: {session.dm_username}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="secondary"
                    className="ml-3 flex-shrink-0"
                    onClick={() =>
                      setOpenStatsSessionId((cur) => (cur === session.id ? null : session.id))
                    }
                  >
                    {openStatsSessionId === session.id ? 'Ocultar' : 'Ver stats'}
                  </Button>
                </div>
                {openStatsSessionId === session.id && (
                  <div className="mt-4 border-t border-line pt-4">
                    <SessionStatsPanel sessionId={session.id} />
                  </div>
                )}
              </Card>
            ))
          )}
        </section>
      </div>
    </Page>
  );
}

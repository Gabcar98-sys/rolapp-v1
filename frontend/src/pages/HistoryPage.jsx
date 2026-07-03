import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api.js';
import {
  campaignAccentIndex,
  filterClosedSessions,
  formatDate,
  formatDuration,
  playersInSession,
} from '../lib/metrics.js';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import SessionStatsPanel from '../components/Stats/SessionStatsPanel.jsx';
import CampaignStatsPanel from '../components/Stats/CampaignStatsPanel.jsx';

// Punto del timeline: borde en el color de acento de la campaña de la sesión
// (clases estáticas para el JIT; índice estable de metrics.js; -1 = sin campaña).
const DOT_CLASSES = [
  'border-accent',
  'border-cat-social-bar',
  'border-cat-explore-bar',
  'border-cat-discovery-bar',
  'border-cat-extra-text',
];

const inputCls =
  'rounded-[10px] border border-[#37312A] bg-bg py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-accent';

// Metadato del pie de la tarjeta: icono de línea coloreado + texto muted.
function Meta({ icon, iconClass, children }) {
  return (
    <div className="flex items-center gap-[7px] text-[12.5px] text-faint">
      <Icon name={icon} size={14} strokeWidth={1.8} className={iconClass} />
      {children}
    </div>
  );
}

// Sesiones Finalizadas (F14): timeline vertical con búsqueda por texto y filtro
// por campaña. "Ver resumen" expande el resumen completo + stats (detalle con tabs
// llega en F19). Estadísticas de campaña (F7) accesibles arriba (solo DM).
export default function HistoryPage({ user }) {
  const isDM = user.role === 'dm';
  const [closedSessions, setClosedSessions] = useState([]);
  const [query, setQuery] = useState('');
  const [campaignId, setCampaignId] = useState('');
  const [openSessionId, setOpenSessionId] = useState(null);
  const [statsCampaignId, setStatsCampaignId] = useState('');
  const [showCampaignStats, setShowCampaignStats] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .listSessions('closed')
      .then(({ sessions }) => setClosedSessions(sessions))
      .catch((err) => setError(err.message));
  }, []);

  // Opciones del filtro derivadas de las propias sesiones cerradas: funciona igual
  // para DM y jugador (listCampaigns solo devuelve campañas propias del DM).
  const campaignOptions = useMemo(() => {
    const map = new Map();
    for (const s of closedSessions) {
      if (s.campaign_id != null && !map.has(s.campaign_id)) {
        map.set(s.campaign_id, s.campaign_name || `Campaña ${s.campaign_id}`);
      }
    }
    return Array.from(map.entries());
  }, [closedSessions]);

  const filtered = filterClosedSessions(closedSessions, { query, campaignId });

  return (
    <Page maxWidthClass="max-w-[920px]">
      <PageHeader
        title="Sesiones Finalizadas"
        subtitle="El registro de todo lo que ya ha ocurrido en la mesa."
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      <div className="mb-6 flex flex-col gap-3 md:flex-row">
        <div className="relative flex-1">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted"
          />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre, campaña o resumen…"
            className={`w-full pl-10 pr-3.5 ${inputCls}`}
          />
        </div>
        <select
          value={campaignId}
          onChange={(e) => setCampaignId(e.target.value)}
          className={`px-3.5 md:w-64 ${inputCls} text-idle`}
        >
          <option value="">Todas las campañas</option>
          {campaignOptions.map(([id, name]) => (
            <option key={id} value={id}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {isDM && campaignOptions.length > 0 && (
        <Card className="mb-6 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowCampaignStats((v) => !v)}
            className="flex w-full items-center justify-between px-5 py-3.5 text-left"
          >
            <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
              Estadísticas de campaña
            </span>
            <Icon
              name="chevron-down"
              size={16}
              className={`text-faint transition-transform ${showCampaignStats ? 'rotate-180' : ''}`}
            />
          </button>
          {showCampaignStats && (
            <div className="border-t border-line-2 p-5">
              <select
                value={statsCampaignId}
                onChange={(e) => setStatsCampaignId(e.target.value)}
                className={`mb-4 w-full px-3.5 md:w-72 ${inputCls} text-idle`}
              >
                <option value="">Elige una campaña</option>
                {campaignOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </select>
              {statsCampaignId && <CampaignStatsPanel campaignId={statsCampaignId} />}
            </div>
          )}
        </Card>
      )}

      {closedSessions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="clock" size={28} className="text-muted-2" />
          <p className="text-sm text-faint">Aún no hay sesiones finalizadas.</p>
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line p-8 text-center text-sm text-faint">
          Ninguna sesión coincide con la búsqueda.
        </div>
      ) : (
        <div className="relative pl-[26px]">
          {/* Línea vertical del timeline */}
          <div className="absolute bottom-1.5 left-1.5 top-1.5 w-[2px] bg-line" />
          {filtered.map((session) => {
            const idx = campaignAccentIndex(session.campaign_id);
            const dot = idx === -1 ? 'border-[#5A5348]' : DOT_CLASSES[idx];
            const open = openSessionId === session.id;
            return (
              <div key={session.id} className="relative mb-4">
                <span
                  className={`absolute -left-[26px] top-5 h-3 w-3 rounded-full border-2 bg-bg ${dot}`}
                />
                <Card className="px-5 py-[18px] transition-colors hover:border-line-hover">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <span className="font-serif text-lg font-semibold text-title-2">
                      {session.name}
                    </span>
                    <span className="whitespace-nowrap text-xs text-faint">
                      {formatDate(session.created_at)}
                    </span>
                  </div>
                  {session.summary ? (
                    <p className="mb-3.5 line-clamp-2 text-[13.5px] leading-relaxed text-sub">
                      {session.summary}
                    </p>
                  ) : (
                    <p className="mb-3.5 text-[13.5px] italic text-faint">Sin resumen.</p>
                  )}
                  <div className="flex flex-wrap items-center gap-5 border-t border-line-2 pt-3">
                    <Meta icon="clock" iconClass="text-cat-discovery-bar">
                      {formatDuration(session.duration_seconds)}
                    </Meta>
                    <Meta icon="users" iconClass="text-cat-explore-bar">
                      {playersInSession(session)} jugadores
                    </Meta>
                    <Meta icon="book" iconClass="text-cat-social-bar">
                      {session.campaign_name || 'Sin campaña'}
                    </Meta>
                    <button
                      type="button"
                      onClick={() => setOpenSessionId(open ? null : session.id)}
                      className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-accent-text hover:text-accent-hover"
                    >
                      {open ? 'Ocultar resumen' : 'Ver resumen'}
                      <Icon name={open ? 'chevron-down' : 'arrow-right'} size={12} />
                    </button>
                  </div>
                  {open && (
                    <div className="mt-4 border-t border-line-2 pt-4">
                      {session.summary && (
                        <p className="mb-4 text-[13.5px] leading-relaxed text-sub">
                          {session.summary}
                        </p>
                      )}
                      <SessionStatsPanel sessionId={session.id} />
                    </div>
                  )}
                </Card>
              </div>
            );
          })}
        </div>
      )}
    </Page>
  );
}

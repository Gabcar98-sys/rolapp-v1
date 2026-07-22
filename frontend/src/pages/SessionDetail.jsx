import { useEffect, useState } from 'react';
import socket from '../lib/socket.js';
import { api } from '../lib/api.js';
import { campaignAccentIndex, formatDate, formatDuration, playersInSession } from '../lib/metrics.js';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Page from '../components/layout/Page.jsx';
import NotesPanel from '../components/Session/NotesPanel.jsx';
import SessionEventsPanel from '../components/Session/SessionEventsPanel.jsx';
import SessionStatsPanel from '../components/Stats/SessionStatsPanel.jsx';
import AIPanel from '../components/AI/AIPanel.jsx';

// Punto de acento de la campaña junto al título (clases literales para el JIT, lección F14).
const DOT_CLASSES = [
  'border-accent',
  'border-cat-social-bar',
  'border-cat-explore-bar',
  'border-cat-discovery-bar',
  'border-cat-extra-text',
];

// Metadato del encabezado: icono de línea coloreado + texto.
function Meta({ icon, iconClass, children }) {
  return (
    <span className="flex items-center gap-1.5 text-[12.5px] text-faint">
      <Icon name={icon} size={14} strokeWidth={1.8} className={iconClass} />
      {children}
    </span>
  );
}

// Tab Resumen: resumen IA de cierre de la sesión (GET /api/sessions/:id/summary).
function SummaryTab({ sessionId }) {
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getSessionSummary(sessionId)
      .then(({ summary: s }) => active && setSummary(s))
      .catch(() => {})
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (loading) return <p className="text-sm text-faint">Cargando resumen…</p>;
  if (!summary)
    return (
      <p className="text-center text-sm italic text-faint">
        Esta sesión no tiene resumen generado.
      </p>
    );

  return (
    <Card className="p-5">
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold text-title">
        <Icon name="file" size={15} className="text-accent-text" /> Resumen de la sesión
      </h3>
      <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-sub">{summary.body}</p>
    </Card>
  );
}

// Detalle de una sesión finalizada (F19). Contenedor de 4 tabs sobre datos ya
// existentes (backend 100% listo): Notas (readOnly, filtradas por rol), Eventos (log
// append-only disparado), Resumen (IA de cierre) e IA (consulta sobre la sesión + stats
// de F7). Se abre desde "Ver resumen →" en Sesiones Finalizadas.
//
// Socket para el tab IA: al montar conectamos el socket (SIN session:join — el streaming
// de IA se emite al socket solicitante, no a la sala), y lo cerramos al desmontar. Así el
// AIPanel conserva su streaming; si Ollama está caído degrada por sí mismo (ai:error →
// banner "IA no disponible"), sin romper el resto de tabs.
export default function SessionDetail({ session, user, onBack }) {
  const [tab, setTab] = useState('notes');

  useEffect(() => {
    socket.connect();
    return () => socket.disconnect();
  }, []);

  const accentIdx = campaignAccentIndex(session.campaign_id);
  const dot = accentIdx === -1 ? 'border-[#5A5348]' : DOT_CLASSES[accentIdx];

  const tabs = [
    { id: 'notes', label: <TabLabel icon="file" text="Notas" /> },
    { id: 'events', label: <TabLabel icon="zap" text="Eventos" /> },
    { id: 'summary', label: <TabLabel icon="book" text="Resumen" /> },
    { id: 'ai', label: <TabLabel icon="cube" text="IA" /> },
  ];

  return (
    <Page maxWidthClass="max-w-[920px]">
      <button
        type="button"
        onClick={onBack}
        className="mb-5 flex items-center gap-1.5 text-[12.5px] font-semibold text-accent-text hover:text-accent-hover"
      >
        <Icon name="arrow-left" size={14} /> Volver a Sesiones Finalizadas
      </button>

      <header className="mb-6">
        <div className="mb-2 flex items-center gap-2.5">
          <span className={`h-3 w-3 flex-shrink-0 rounded-full border-2 bg-bg ${dot}`} />
          <h1 className="font-serif text-[26px] font-semibold leading-tight text-title md:text-[32px]">
            {session.name}
          </h1>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pl-[22px]">
          <Meta icon="clock" iconClass="text-cat-discovery-bar">
            {formatDate(session.created_at)}
          </Meta>
          <Meta icon="clock" iconClass="text-cat-discovery-bar">
            {formatDuration(session.duration_seconds)}
          </Meta>
          <Meta icon="users" iconClass="text-cat-explore-bar">
            {playersInSession(session)} jugadores
          </Meta>
          <Meta icon="book" iconClass="text-cat-social-bar">
            {session.campaign_name || 'Sin campaña'}
          </Meta>
        </div>
      </header>

      <Card className="overflow-hidden">
        <Tabs tabs={tabs} activeId={tab} onChange={setTab} />
        <div className="p-4 md:p-5">
          {tab === 'notes' && (
            <div className="max-h-[70vh] overflow-hidden rounded-card border border-line-2">
              <NotesPanel sessionId={session.id} user={user} readOnly />
            </div>
          )}
          {tab === 'events' && <SessionEventsPanel sessionId={session.id} />}
          {tab === 'summary' && <SummaryTab sessionId={session.id} />}
          {tab === 'ai' && (
            <div className="flex flex-col gap-6">
              <SessionStatsPanel sessionId={session.id} />
              <div className="rounded-card border border-line-2">
                <AIPanel
                  sessionId={session.id}
                  user={user}
                  campaignId={session.campaign_id ?? null}
                />
              </div>
            </div>
          )}
        </div>
      </Card>
    </Page>
  );
}

// Etiqueta de tab: icono de línea + texto (patrón de tabs del handoff).
function TabLabel({ icon, text }) {
  return (
    <span className="flex items-center justify-center gap-1.5">
      <Icon name={icon} size={16} />
      <span className="hidden sm:inline">{text}</span>
    </span>
  );
}

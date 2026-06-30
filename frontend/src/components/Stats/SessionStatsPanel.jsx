import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Card from '../ui/Card.jsx';
import BarChart from './BarChart.jsx';
import StatTile from './StatTile.jsx';
import { countsToBarData, formatDuration } from './statUtils.js';

// Panel de estadísticas de una sesión (cerrada o en curso). Muestra el snapshot
// (o el cálculo al vuelo) y, si existe, el resumen generado por IA.
export default function SessionStatsPanel({ sessionId }) {
  const [stats, setStats] = useState(null);
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getSessionStats(sessionId)
      .then(({ stats: s }) => active && setStats(s))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    api
      .getSessionSummary(sessionId)
      .then(({ summary: sum }) => active && setSummary(sum))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (loading) return <p className="text-sm text-gray-400">Cargando estadísticas…</p>;
  if (error) return <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500">Sin estadísticas.</p>;

  const participation = (stats.participation ?? [])
    .map((p) => ({ label: p.name, value: p.events }))
    .sort((a, b) => b.value - a.value);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <StatTile label="Eventos" value={stats.event_count ?? 0} icon="📜" />
        <StatTile label="Duración" value={formatDuration(stats.duration_seconds)} icon="⏱️" />
        <StatTile label="Encuentros" value={stats.encounters ?? 0} icon="⚔️" />
        <StatTile label="NPCs" value={stats.npcs_introduced ?? 0} icon="🧑" />
        <StatTile label="Notas" value={stats.notes_count ?? 0} icon="📝" />
        <StatTile label="Mensajes" value={stats.messages_count ?? 0} icon="💬" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Eventos por categoría</h3>
          <BarChart data={countsToBarData(stats.events_by_category)} emptyLabel="Sin eventos categorizados" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Participación por personaje</h3>
          <BarChart data={participation} emptyLabel="Sin personajes en la sesión" />
        </Card>
      </div>

      {summary && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-gray-200">Resumen de la sesión</h3>
          <p className="whitespace-pre-wrap text-sm text-gray-300">{summary.body}</p>
        </Card>
      )}
    </div>
  );
}

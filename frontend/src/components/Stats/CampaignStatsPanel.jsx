import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import BarChart from './BarChart.jsx';
import StatTile from './StatTile.jsx';
import Sparkline from './Sparkline.jsx';
import { countsToBarData } from './statUtils.js';

// Panel de estadísticas agregadas de una campaña.
export default function CampaignStatsPanel({ campaignId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getCampaignStats(campaignId)
      .then(({ stats: s }) => active && setStats(s))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [campaignId]);

  if (loading) return <p className="text-sm text-sub">Cargando estadísticas…</p>;
  if (error)
    return <p className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>;
  if (!stats) return <p className="text-sm text-faint">Sin estadísticas.</p>;

  const sessionTrend = (stats.sessions ?? []).map((s) => s.event_count);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sesiones" value={stats.sessions_played ?? 0} icon="dice" />
        <StatTile label="Cerradas" value={stats.sessions_closed ?? 0} icon="check" />
        <StatTile label="Eventos" value={stats.total_events ?? 0} icon="zap" />
        <StatTile label="Encuentros" value={stats.encounters ?? 0} icon="swords" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-title">Eventos por categoría</h3>
          <BarChart data={countsToBarData(stats.events_by_category)} emptyLabel="Sin eventos" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-title">Actividad por sesión</h3>
          {sessionTrend.length >= 2 ? (
            <Sparkline values={sessionTrend} />
          ) : (
            <p className="text-sm text-faint">Se necesita más de una sesión para la tendencia.</p>
          )}
          <p className="mt-2 text-xs text-faint">Eventos registrados en cada sesión, en orden cronológico.</p>
        </Card>
      </div>

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-title">Ubicaciones visitadas</h3>
        {(stats.locations_visited ?? []).length === 0 ? (
          <p className="text-sm text-faint">Aún no hay ubicaciones registradas.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {stats.locations_visited.map((loc) => (
              <LocationChip key={loc} name={loc} />
            ))}
          </ul>
        )}
      </Card>

      {(stats.core_progress ?? []).length > 0 && (
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-title">Atributos clave por personaje</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {stats.core_progress.map((char) => (
              <div key={char.character_id} className="rounded-card border border-line bg-bg p-3">
                <p className="text-sm font-medium text-title">{char.name}</p>
                <ul className="mt-2 flex flex-col gap-1">
                  {char.attrs.map((a) => (
                    <li key={a.name} className="flex justify-between text-xs text-sub">
                      <span>{a.name}</span>
                      <span className="font-semibold text-title">
                        {a.value}
                        {a.max_value != null ? ` / ${a.max_value}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

// Chip de ubicación visitada. Exportado para SSR-test sin jsdom (lección F20):
// el marcador de ubicación es un icono de línea (F35), no el emoji de chincheta.
export function LocationChip({ name }) {
  return (
    <li className="flex items-center gap-1 rounded-md border border-line bg-bg px-2 py-1 text-xs text-sub">
      <Icon name="pin" size={12} />
      {name}
    </li>
  );
}

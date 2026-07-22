import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Card from '../ui/Card.jsx';
import BarChart from './BarChart.jsx';
import StatTile from './StatTile.jsx';

// Panel de estadísticas de un personaje: sesiones, participación, skills (con rank),
// atributos actuales (is_core/has_max) e inventario.
export default function CharacterStatsPanel({ characterId }) {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getCharacterStats(characterId)
      .then(({ stats: s }) => active && setStats(s))
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [characterId]);

  if (loading) return <p className="text-sm text-gray-400">Cargando estadísticas…</p>;
  if (error) return <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>;
  if (!stats) return <p className="text-sm text-gray-500">Sin estadísticas.</p>;

  const skillData = (stats.skills ?? []).map((s) => ({ label: s.name, value: s.rank }));

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Sesiones" value={stats.sessions_played ?? 0} icon="dice" />
        <StatTile label="Eventos" value={stats.events_participated ?? 0} icon="zap" />
        <StatTile label="Habilidades" value={stats.skill_count ?? 0} icon="skills" />
        <StatTile label="Objetos" value={stats.item_count ?? 0} icon="bag" />
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Habilidades por rango</h3>
          <BarChart data={skillData} emptyLabel="Sin habilidades del catálogo" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-gray-200">Atributos</h3>
          {(stats.attributes ?? []).length === 0 ? (
            <p className="text-sm text-gray-500">Sin atributos.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.attributes.map((a) => (
                <li key={a.name} className="flex justify-between text-xs text-gray-300">
                  <span>
                    {a.is_core ? '⭐ ' : ''}
                    {a.name}
                  </span>
                  <span className="font-semibold text-gray-100">
                    {a.value}
                    {a.has_max && a.max_value != null ? ` / ${a.max_value}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

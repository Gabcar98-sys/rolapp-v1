import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
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

  if (loading) return <p className="text-sm text-sub">Cargando estadísticas…</p>;
  if (error)
    return <p className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>;
  if (!stats) return <p className="text-sm text-faint">Sin estadísticas.</p>;

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
          <h3 className="mb-3 text-sm font-semibold text-title">Habilidades por rango</h3>
          <BarChart data={skillData} emptyLabel="Sin habilidades del catálogo" />
        </Card>
        <Card className="p-4">
          <h3 className="mb-3 text-sm font-semibold text-title">Atributos</h3>
          {(stats.attributes ?? []).length === 0 ? (
            <p className="text-sm text-faint">Sin atributos.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {stats.attributes.map((a) => (
                <AttributeRow key={a.name} attr={a} />
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

// Fila de atributo. Exportada para SSR-test sin jsdom (lección F20).
// OJO (lección F30): `is_core` y `has_max` llegan como ENTEROS 0/1 desde SQLite,
// así que ambos se leen como CONDICIÓN de un ternario — nunca `{flag && <…/>}`,
// que pintaría un 0 literal.
export function AttributeRow({ attr }) {
  return (
    <li className="flex justify-between text-xs text-sub">
      <span className="flex items-center gap-1">
        {attr.is_core ? (
          <Icon name="skills" size={12} className="text-accent-text" />
        ) : null}
        {attr.name}
      </span>
      <span className="font-semibold text-title">
        {attr.value}
        {attr.has_max && attr.max_value != null ? ` / ${attr.max_value}` : ''}
      </span>
    </li>
  );
}

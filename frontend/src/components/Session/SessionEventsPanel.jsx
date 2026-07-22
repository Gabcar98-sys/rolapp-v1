import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { eventCategoryClasses, isPlanningEvent } from '../../lib/planning.js';
import Icon from '../ui/Icon.jsx';

// Parsea el payload JSON de un evento del log de forma tolerante (degrada a {}).
function parsePayload(evt) {
  try {
    return JSON.parse(evt.payload);
  } catch {
    return {};
  }
}

// Tarjeta de un evento disparado del log de sesión. Reutilizada por la pestaña
// "Disparados" de PlanningPanel (sesión en vivo) y por el tab Eventos del detalle de
// historial (F19). `showLocation` añade la ubicación/sub-ubicación (útil en el detalle,
// donde no hay árbol de planificación a la vista). Muestra badge NPC, badge de categoría,
// actor, participantes específicos y, opcionalmente, la ubicación.
export function FiredEventCard({ event, showLocation = false }) {
  const payload = parsePayload(event);
  const cat = eventCategoryClasses(event.type);
  const isNpc = payload.actor_type === 'npc';
  const hasSpecific =
    payload.participant_type === 'specific' &&
    Array.isArray(payload.participants) &&
    payload.participants.length > 0;
  const locationLabel = [payload.location, payload.sub_location].filter(Boolean).join(' › ');

  return (
    <div
      className={`flex flex-col gap-1 rounded-btn border bg-bg p-2 ${
        isNpc ? 'border-l-2 border-accent' : 'border-line'
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        {isNpc && (
          <span className="flex items-center gap-0.5 rounded-pill border border-accent px-1.5 text-[0.66rem] text-accent-text">
            <Icon name="user" size={11} /> NPC
          </span>
        )}
        <span className={`rounded-pill px-2 py-0.5 text-[0.66rem] ${cat.badgeClass}`}>{cat.label}</span>
        <span className="text-sm font-semibold text-sub">{payload.title || event.type}</span>
      </div>
      {payload.description && <p className="text-xs leading-snug text-sub">{payload.description}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[0.68rem] text-muted">
          {isNpc ? payload.npc_name || 'NPC' : event.actor_username || 'sistema'}
        </span>
        {showLocation && locationLabel && (
          <span className="flex items-center gap-0.5 text-[0.68rem] text-faint">
            <Icon name="pin" size={11} /> {locationLabel}
          </span>
        )}
        {hasSpecific && (
          <span className="text-[0.68rem] text-cat-social-text">
            Solo: {payload.participants.map((p) => p.name ?? p).join(', ')}
          </span>
        )}
      </div>
    </div>
  );
}

// Tab Eventos del detalle de sesión finalizada (F19). Log append-only de eventos
// disparados en orden cronológico (ascendente, como llega del backend). Sólo eventos
// de planificación/NPC (se filtran presencia/sistema/chat con isPlanningEvent), igual
// que la pestaña "Disparados" en vivo, pero mostrando además la ubicación.
export default function SessionEventsPanel({ sessionId }) {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .listEvents(sessionId)
      .then(({ events: list }) => {
        if (active) setEvents((list ?? []).filter(isPlanningEvent));
      })
      .catch((err) => active && setError(err.message))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [sessionId]);

  if (loading) return <p className="text-sm text-faint">Cargando eventos…</p>;
  if (error)
    return <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>;
  if (events.length === 0)
    return <p className="text-center text-sm italic text-faint">No se dispararon eventos en esta sesión.</p>;

  return (
    <div className="flex flex-col gap-2">
      {events.map((evt) => (
        <FiredEventCard key={evt.id} event={evt} showLocation />
      ))}
    </div>
  );
}

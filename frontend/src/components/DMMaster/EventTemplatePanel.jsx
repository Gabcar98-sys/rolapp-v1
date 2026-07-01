import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../lib/api.js';
import { categoryClasses, EVENT_CATEGORIES } from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Modal from '../ui/Modal.jsx';
import EventFlowGraph from './EventFlowGraph.jsx';

// Editor de una preparación: ubicaciones → sub-ubicaciones → eventos (con categoría,
// descripción y rama) y enlaces from→to entre eventos. Dos modos: vista visual de
// grafo (F8b, por defecto) y vista de listas como alternativa.
export default function EventTemplatePanel({ user, prep, onBack }) {
  const [hierarchy, setHierarchy] = useState(null); // { locations, freeEvents }
  const [eventLinks, setEventLinks] = useState([]);
  const [error, setError] = useState('');
  // Modo de edición: 'graph' (visual) o 'list' (listas/selects).
  const [mode, setMode] = useState('graph');

  // Formularios ligeros (drafts) por sección.
  const [locName, setLocName] = useState('');
  const [subDraft, setSubDraft] = useState({}); // locationId → name
  const [eventModal, setEventModal] = useState(null); // { subLocationId, parentEventId, branchLabel }
  const [eventForm, setEventForm] = useState({ title: '', category: 'general', description: '' });
  const [linkModal, setLinkModal] = useState(false);
  const [linkForm, setLinkForm] = useState({ from_event_id: '', to_event_id: '', label: '' });

  const load = useCallback(async () => {
    try {
      const data = await api.getPrep(prep.id);
      setHierarchy({ locations: data.locations ?? [], freeEvents: data.freeEvents ?? [] });
      setEventLinks(data.eventLinks ?? []);
    } catch (err) {
      setError(err.message);
    }
  }, [prep.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Lista plana de eventos (para el selector de enlaces).
  const flatEvents = useMemo(() => {
    if (!hierarchy) return [];
    const out = [];
    const recurse = (events, prefix) => {
      for (const e of events) {
        out.push({ id: e.id, label: `${prefix}${e.title}` });
        if (e.branches?.length) recurse(e.branches, `${prefix}${e.title} → `);
      }
    };
    for (const loc of hierarchy.locations) {
      for (const sub of loc.sub_locations ?? []) recurse(sub.events ?? [], `${sub.name}: `);
    }
    recurse(hierarchy.freeEvents, '');
    return out;
  }, [hierarchy]);

  const eventTitleById = useMemo(() => {
    const map = new Map(flatEvents.map((e) => [String(e.id), e.label]));
    return (id) => map.get(String(id)) ?? `#${id}`;
  }, [flatEvents]);

  async function addLocation(e) {
    e.preventDefault();
    if (!locName.trim()) return;
    setError('');
    try {
      await api.createLocation(prep.id, locName.trim(), user.id);
      setLocName('');
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addSubLocation(locationId) {
    const name = (subDraft[locationId] ?? '').trim();
    if (!name) return;
    setError('');
    try {
      await api.createSubLocation(locationId, name, user.id);
      setSubDraft((d) => ({ ...d, [locationId]: '' }));
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function openEventModal(target) {
    setEventModal(target);
    setEventForm({ title: '', category: 'general', description: '' });
  }

  async function saveEvent() {
    if (!eventForm.title.trim()) {
      setError('El título del evento es requerido');
      return;
    }
    setError('');
    try {
      await api.createEventTemplate({
        dm_id: user.id,
        prep_id: prep.id,
        sub_location_id: eventModal.subLocationId ?? null,
        parent_event_id: eventModal.parentEventId ?? null,
        branch_label: eventModal.branchLabel ?? '',
        title: eventForm.title.trim(),
        category: eventForm.category,
        description: eventForm.description.trim(),
      });
      setEventModal(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeEvent(eventId) {
    if (!window.confirm('¿Eliminar este evento y sus ramas?')) return;
    setError('');
    try {
      await api.deleteEventTemplate(eventId, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLocation(id) {
    if (!window.confirm('¿Eliminar la ubicación y todo su contenido?')) return;
    setError('');
    try {
      await api.deleteLocation(id, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSubLocation(id) {
    if (!window.confirm('¿Eliminar la sub-ubicación y sus eventos?')) return;
    setError('');
    try {
      await api.deleteSubLocation(id, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function saveLink() {
    if (!linkForm.from_event_id || !linkForm.to_event_id) {
      setError('Selecciona evento origen y destino');
      return;
    }
    setError('');
    try {
      await api.createEventLink(
        Number(linkForm.from_event_id),
        Number(linkForm.to_event_id),
        user.id,
        linkForm.label.trim()
      );
      setLinkModal(false);
      setLinkForm({ from_event_id: '', to_event_id: '', label: '' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeLink(id) {
    setError('');
    try {
      await api.deleteEventLink(id, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  function EventRow({ event }) {
    const cls = categoryClasses(event.category);
    return (
      <div className="flex flex-col gap-1 rounded-md border border-ink-line bg-ink-800 p-2">
        <div className="flex items-start gap-2">
          <div className={`w-1 flex-shrink-0 self-stretch rounded-sm border-l-2 ${cls}`} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              {event.branch_label && (
                <span className="text-[0.66rem] font-bold uppercase text-gold">⌥ {event.branch_label}</span>
              )}
              <strong className="text-sm text-gray-100">{event.title}</strong>
              <span className={`rounded border px-1.5 text-[0.66rem] ${cls}`}>{event.category}</span>
            </div>
            {event.description && (
              <p className="mt-0.5 text-xs leading-snug text-gray-400">{event.description}</p>
            )}
          </div>
          <div className="flex flex-shrink-0 gap-1">
            <Button
              variant="ghost"
              size="sm"
              title="Añadir rama"
              onClick={() =>
                openEventModal({
                  subLocationId: event.sub_location_id,
                  parentEventId: event.id,
                  branchLabel: '',
                })
              }
            >
              ⌥
            </Button>
            <Button variant="ghost" size="sm" title="Eliminar" onClick={() => removeEvent(event.id)}>
              🗑
            </Button>
          </div>
        </div>
        {event.branches?.length > 0 && (
          <div className="flex flex-col gap-1 border-l border-ink-line pl-3">
            {event.branches.map((b) => (
              <EventRow key={b.id} event={b} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-bold text-gold">{prep.name}</h2>
          <p className="text-xs text-gray-500">Constructor de preparación · grafo de eventos</p>
        </div>
        <div className="flex flex-shrink-0 items-center gap-2">
          <Button
            variant={mode === 'graph' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('graph')}
          >
            🕸 Grafo
          </Button>
          <Button
            variant={mode === 'list' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setMode('list')}
          >
            ☰ Lista
          </Button>
          <Button variant="secondary" size="sm" onClick={onBack}>
            ← Volver
          </Button>
        </div>
      </div>

      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      {/* Vista visual del grafo (recupera la experiencia de la v0). La edición de
          ubicaciones/sub-ubicaciones/ramas sigue en la vista de lista. */}
      {mode === 'graph' && hierarchy && (
        <div className="h-[70vh] min-h-[420px]">
          <EventFlowGraph
            locations={hierarchy.locations}
            freeEvents={hierarchy.freeEvents}
            eventLinks={eventLinks}
            dmId={user.id}
            prepId={prep.id}
            onChange={load}
          />
        </div>
      )}

      {/* La gestión de ubicaciones/sub-ubicaciones/ramas vive en la vista de lista. */}
      {mode === 'graph' && (
        <p className="text-xs text-gray-500">
          ¿Necesitas ubicaciones, sub-ubicaciones o ramas? Cambia a la vista{' '}
          <button className="text-gold underline hover:text-gold-soft" onClick={() => setMode('list')}>
            ☰ Lista
          </button>
          .
        </p>
      )}

      {mode === 'list' && (
        <>
      <Card className="p-4">
        <form onSubmit={addLocation} className="flex flex-col gap-2 md:flex-row">
          <input
            value={locName}
            onChange={(e) => setLocName(e.target.value)}
            placeholder="Nueva ubicación (p. ej. La Cripta)"
            className="flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <Button type="submit">+ Ubicación</Button>
        </form>
      </Card>

      {hierarchy && hierarchy.locations.length === 0 && hierarchy.freeEvents.length === 0 && (
        <p className="text-center text-sm text-gray-500">
          Crea una ubicación para empezar a colocar eventos.
        </p>
      )}

      {hierarchy?.locations.map((loc) => (
        <Card key={loc.id} className="flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-bold text-gold">📍 {loc.name}</h3>
            <Button variant="ghost" size="sm" onClick={() => removeLocation(loc.id)}>
              🗑
            </Button>
          </div>

          {(loc.sub_locations ?? []).map((sub) => (
            <div key={sub.id} className="flex flex-col gap-2 border-l-2 border-ink-line pl-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-gray-300">📌 {sub.name}</h4>
                <div className="flex gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    title="Añadir evento"
                    onClick={() => openEventModal({ subLocationId: sub.id })}
                  >
                    + Evento
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => removeSubLocation(sub.id)}>
                    🗑
                  </Button>
                </div>
              </div>
              {(sub.events ?? []).length === 0 ? (
                <p className="text-xs italic text-gray-600">Sin eventos.</p>
              ) : (
                sub.events.map((evt) => <EventRow key={evt.id} event={evt} />)
              )}
            </div>
          ))}

          <div className="flex gap-2">
            <input
              value={subDraft[loc.id] ?? ''}
              onChange={(e) => setSubDraft((d) => ({ ...d, [loc.id]: e.target.value }))}
              placeholder="Nueva sub-ubicación"
              className="flex-1 rounded-md border border-ink-line bg-ink-900 px-2.5 py-1.5 text-xs text-gray-100 outline-none focus:border-gold"
            />
            <Button size="sm" variant="secondary" onClick={() => addSubLocation(loc.id)}>
              + Sub
            </Button>
          </div>
        </Card>
      ))}

      {/* Eventos sueltos del prep (sin ubicación) */}
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gold">📋 Eventos sin ubicación</h3>
          <Button variant="ghost" size="sm" onClick={() => openEventModal({})}>
            + Evento
          </Button>
        </div>
        {hierarchy?.freeEvents.length === 0 ? (
          <p className="text-xs italic text-gray-600">Sin eventos sueltos.</p>
        ) : (
          hierarchy?.freeEvents.map((evt) => <EventRow key={evt.id} event={evt} />)
        )}
      </Card>

      {/* Enlaces entre eventos */}
      <Card className="flex flex-col gap-2 p-4">
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-gold">🔗 Enlaces (from → to)</h3>
          <Button size="sm" onClick={() => setLinkModal(true)} disabled={flatEvents.length < 2}>
            + Enlace
          </Button>
        </div>
        {eventLinks.length === 0 ? (
          <p className="text-xs italic text-gray-600">Sin enlaces. Conecta eventos para definir el flujo.</p>
        ) : (
          eventLinks.map((link) => (
            <div
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-md border border-ink-line bg-ink-800 px-3 py-1.5 text-xs text-gray-300"
            >
              <span className="min-w-0 truncate">
                {eventTitleById(link.from_event_id)}{' '}
                <span className="text-gold">→{link.label ? ` ${link.label} →` : ''}</span>{' '}
                {eventTitleById(link.to_event_id)}
              </span>
              <Button variant="ghost" size="sm" onClick={() => removeLink(link.id)}>
                ✕
              </Button>
            </div>
          ))
        )}
      </Card>
        </>
      )}

      {/* Modal: nuevo evento / rama */}
      <Modal
        open={!!eventModal}
        onClose={() => setEventModal(null)}
        title={eventModal?.parentEventId ? 'Nueva rama' : 'Nuevo evento'}
      >
        <div className="flex flex-col gap-2.5">
          {eventModal?.parentEventId && (
            <input
              value={eventModal.branchLabel}
              onChange={(e) => setEventModal((m) => ({ ...m, branchLabel: e.target.value }))}
              placeholder="Etiqueta de la rama (p. ej. Huir)"
              className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
            />
          )}
          <input
            value={eventForm.title}
            onChange={(e) => setEventForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <select
            value={eventForm.category}
            onChange={(e) => setEventForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <textarea
            value={eventForm.description}
            onChange={(e) => setEventForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="min-h-[60px] resize-y rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEventModal(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={saveEvent}>
              Guardar
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: nuevo enlace */}
      <Modal open={linkModal} onClose={() => setLinkModal(false)} title="Nuevo enlace">
        <div className="flex flex-col gap-2.5">
          <select
            value={linkForm.from_event_id}
            onChange={(e) => setLinkForm((f) => ({ ...f, from_event_id: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            <option value="">— Evento origen —</option>
            {flatEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <select
            value={linkForm.to_event_id}
            onChange={(e) => setLinkForm((f) => ({ ...f, to_event_id: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            <option value="">— Evento destino —</option>
            {flatEvents.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
              </option>
            ))}
          </select>
          <input
            value={linkForm.label}
            onChange={(e) => setLinkForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="Etiqueta del enlace (opcional)"
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setLinkModal(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={saveLink}>
              Crear enlace
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

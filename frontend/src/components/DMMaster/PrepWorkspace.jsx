import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import { EVENT_CATEGORIES, categoryLabel } from '../../lib/planning.js';
import Icon from '../ui/Icon.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import LocationTree from './LocationTree.jsx';
import EventListView from './EventListView.jsx';
import EventFlowGraph from './EventFlowGraph.jsx';

// Espacio de trabajo de una preparación: panel de ubicaciones (266px) + main con
// toolbar 60px y las vistas Lista / Grafo. Es dueño de la jerarquía cargada, de la
// ubicación seleccionada y del modo de vista.
export default function PrepWorkspace({ prep, user, onBack }) {
  const [hierarchy, setHierarchy] = useState(null); // { locations, freeEvents, eventLinks }
  const [error, setError] = useState('');
  const [view, setView] = useState('lista'); // 'lista' | 'grafo'
  const [selected, setSelected] = useState({ type: 'none' });

  // Modal de nuevo evento (toolbar + CTA del estado vacío en la vista Lista).
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', category: 'general', description: '' });
  const [busy, setBusy] = useState(false);

  // El grafo expone su propio openCreate (incluye el select de sub-ubicación).
  const graphCreateRef = useRef(null);

  const load = useCallback(async () => {
    try {
      const data = await api.getPrep(prep.id);
      setHierarchy({
        locations: data.locations ?? [],
        freeEvents: data.freeEvents ?? [],
        eventLinks: data.eventLinks ?? [],
      });
    } catch (err) {
      setError(err.message);
    }
  }, [prep.id]);

  useEffect(() => {
    load();
  }, [load]);

  const locations = hierarchy?.locations ?? [];
  const freeEvents = hierarchy?.freeEvents ?? [];
  const eventLinks = hierarchy?.eventLinks ?? [];

  // Total de eventos (raíz + ramas) para el contador del toolbar.
  const totalEvents = useMemo(() => {
    let n = 0;
    const count = (evts) => {
      for (const e of evts) {
        n += 1;
        if (e.branches?.length) count(e.branches);
      }
    };
    for (const loc of locations) for (const sub of loc.sub_locations ?? []) count(sub.events ?? []);
    count(freeEvents);
    return n;
  }, [locations, freeEvents]);

  // Mapa from_event_id → enlace (etiqueta narrativa en la tarjeta de la lista).
  const linkByFrom = useMemo(() => {
    const m = new Map();
    for (const lk of eventLinks) if (!m.has(lk.from_event_id)) m.set(lk.from_event_id, lk);
    return m;
  }, [eventLinks]);

  // Datos de la ubicación seleccionada para la vista Lista.
  const selectedData = useMemo(() => {
    if (selected.type === 'none') {
      return {
        kicker: 'General',
        title: 'Sin ubicación',
        subtitle: 'Eventos sueltos, listos para colocarse en el mapa.',
        events: freeEvents,
        subLocId: null,
      };
    }
    for (const loc of locations) {
      const sub = (loc.sub_locations ?? []).find((s) => s.id === selected.id);
      if (sub) {
        return {
          kicker: loc.name,
          title: sub.name,
          subtitle: sub.description || '',
          events: sub.events ?? [],
          subLocId: sub.id,
        };
      }
    }
    // La sub-ubicación seleccionada ya no existe (borrada): cae a "Sin ubicación".
    return {
      kicker: 'General',
      title: 'Sin ubicación',
      subtitle: 'Eventos sueltos, listos para colocarse en el mapa.',
      events: freeEvents,
      subLocId: null,
    };
  }, [selected, locations, freeEvents]);

  function openCreate() {
    if (view === 'grafo') {
      graphCreateRef.current?.(selectedData.subLocId ?? '');
      return;
    }
    setForm({ title: '', category: 'general', description: '' });
    setCreating(true);
  }

  async function saveEvent() {
    if (!form.title.trim()) {
      setError('El título es requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.createEventTemplate({
        dm_id: user.id,
        prep_id: prep.id,
        sub_location_id: selectedData.subLocId,
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
      });
      setCreating(false);
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const tabCls = (on) =>
    `flex items-center gap-1.5 rounded-[7px] px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors ${
      on ? 'bg-line-hover text-title-2 shadow-card' : 'text-faint hover:text-title-2'
    }`;

  return (
    <div className="flex min-w-0 flex-1">
      <LocationTree
        prep={prep}
        locations={locations}
        freeEvents={freeEvents}
        dmId={user.id}
        selected={selected}
        onSelect={setSelected}
        onChange={load}
      />

      <main className="flex min-w-0 flex-1 flex-col">
        {/* Toolbar 60px */}
        <header className="flex h-[60px] flex-shrink-0 items-center justify-between gap-3 border-b border-line px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={onBack}
              className="flex items-center gap-1.5 text-[13px] text-faint hover:text-title-2"
            >
              <Icon name="chevron-right" size={15} className="rotate-180" />
              Preparaciones
            </button>
            <span className="text-line-hover">/</span>
            <span className="truncate font-serif text-[19px] font-semibold text-title-2">
              {prep.name}
            </span>
          </div>
          <div className="flex flex-shrink-0 items-center gap-3.5">
            <span className="whitespace-nowrap text-[12.5px] tabular-nums text-faint">
              {totalEvents} evento{totalEvents !== 1 ? 's' : ''}
            </span>
            <div className="flex gap-0.5 rounded-[9px] bg-hover-2 p-[3px]">
              <button type="button" onClick={() => setView('lista')} className={tabCls(view === 'lista')}>
                <Icon name="sliders" size={14} /> Lista
              </button>
              <button type="button" onClick={() => setView('grafo')} className={tabCls(view === 'grafo')}>
                <Icon name="link" size={14} /> Grafo
              </button>
            </div>
            <Button size="sm" onClick={openCreate}>
              <Icon name="plus" size={15} strokeWidth={2.3} /> Evento
            </Button>
          </div>
        </header>

        {error && (
          <p className="mx-5 mt-3 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        {/* Vistas */}
        {view === 'lista' ? (
          <div className="flex-1 overflow-y-auto">
            <EventListView
              kicker={selectedData.kicker}
              title={selectedData.title}
              subtitle={selectedData.subtitle}
              events={selectedData.events}
              linkByFrom={linkByFrom}
              dmId={user.id}
              onChange={load}
              onCreate={openCreate}
            />
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {hierarchy && (
              <EventFlowGraph
                locations={locations}
                freeEvents={freeEvents}
                eventLinks={eventLinks}
                dmId={user.id}
                prepId={prep.id}
                onChange={load}
                showToolbar={false}
                openCreateRef={graphCreateRef}
              />
            )}
          </div>
        )}
      </main>

      {/* Modal de nuevo evento (vista Lista: hereda la ubicación seleccionada) */}
      <Modal open={creating} onClose={() => setCreating(false)} title="Nuevo evento">
        <div className="flex flex-col gap-2.5">
          <p className="text-xs text-faint">
            Se creará en: <span className="text-sub">{selectedData.title}</span>
          </p>
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            autoFocus
            className="rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="min-h-[60px] resize-y rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={saveEvent} disabled={busy}>
              {busy ? '…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

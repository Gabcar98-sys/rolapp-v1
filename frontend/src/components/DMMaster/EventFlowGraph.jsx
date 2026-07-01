import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  categoryClasses,
  EVENT_CATEGORIES,
  flattenPrepEvents,
  computeGraphLayout,
} from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

// Editor visual del grafo de eventos de un prep (recupera la vista de la v0 sin
// dependencias pesadas: SVG para las aristas + divs posicionados para los nodos,
// con layout automático por capas y posición local arrastrable).
//
// Props:
//   locations, freeEvents, eventLinks → jerarquía del prep (de api.getPrep).
//   dmId    → DM dueño del prep (autoriza las mutaciones).
//   prepId  → prep donde se crean los eventos nuevos.
//   onChange → callback para que el padre recargue la jerarquía tras una mutación.
//   compact → modo reducido (en sesión): oculta el panel lateral, deja el lienzo.
export default function EventFlowGraph({
  locations = [],
  freeEvents = [],
  eventLinks = [],
  dmId,
  prepId,
  onChange,
  compact = false,
}) {
  const events = useMemo(() => flattenPrepEvents(locations, freeEvents), [locations, freeEvents]);

  // Sub-ubicaciones disponibles para asignar al crear un evento.
  const subLocations = useMemo(() => {
    const out = [];
    for (const loc of locations) {
      for (const sub of loc.sub_locations ?? []) out.push({ id: sub.id, label: `${loc.name} › ${sub.name}` });
    }
    return out;
  }, [locations]);

  // Aristas: ramas (parent→hijo) + enlaces cruzados (event_links).
  const edges = useMemo(() => {
    const branchEdges = events
      .filter((e) => e.parent_event_id != null)
      .map((e) => ({
        key: `tree-${e.parent_event_id}-${e.id}`,
        from: e.parent_event_id,
        to: e.id,
        label: e.branch_label || '',
        kind: 'branch',
      }));
    const linkEdges = eventLinks.map((lk) => ({
      key: `link-${lk.id}`,
      from: lk.from_event_id,
      to: lk.to_event_id,
      label: lk.label || '',
      kind: 'link',
      linkId: lk.id,
    }));
    return [...branchEdges, ...linkEdges];
  }, [events, eventLinks]);

  const layout = useMemo(() => computeGraphLayout(events, edges), [events, edges]);

  // Posiciones locales: arrancan del layout automático; el DM puede arrastrarlas.
  const [positions, setPositions] = useState({});
  useEffect(() => {
    // Reaplica el layout cuando cambian los nodos/aristas (conserva nada para evitar
    // nodos fantasma; el arrastre es una preferencia visual efímera de la sesión).
    const next = {};
    for (const [id, pos] of layout.positions) next[id] = pos;
    setPositions(next);
  }, [layout]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // Estado de "enlazar": primer nodo elegido como origen.
  const [linkFrom, setLinkFrom] = useState(null);
  const [pendingLink, setPendingLink] = useState(null); // { from, to }
  const [linkLabel, setLinkLabel] = useState('');

  // Modal de creación / edición de evento.
  const [eventModal, setEventModal] = useState(null); // { mode:'create'|'edit', ... }
  const [form, setForm] = useState({ title: '', category: 'general', description: '', subLocId: '' });

  // ── Arrastre de nodos (posición local) ───────────────────────────────────────
  const dragState = useRef(null);

  const onNodePointerDown = useCallback((e, id) => {
    // Solo arrastre con botón principal; ignora clics en botones internos.
    if (e.button !== 0) return;
    dragState.current = {
      id,
      startX: e.clientX,
      startY: e.clientY,
      origin: positions[id] ?? { x: 0, y: 0 },
      moved: false,
    };
  }, [positions]);

  useEffect(() => {
    function onMove(e) {
      const st = dragState.current;
      if (!st) return;
      const dx = e.clientX - st.startX;
      const dy = e.clientY - st.startY;
      if (Math.abs(dx) > 3 || Math.abs(dy) > 3) st.moved = true;
      setPositions((prev) => ({
        ...prev,
        [st.id]: { x: Math.max(0, st.origin.x + dx), y: Math.max(0, st.origin.y + dy) },
      }));
    }
    function onUp() {
      dragState.current = null;
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, []);

  // ── Selección de nodo para enlazar ───────────────────────────────────────────
  function handleNodeClick(id) {
    // Si veníamos de arrastrar, no tratamos el clic como selección.
    if (dragState.current?.moved) return;
    if (linkFrom == null) {
      setLinkFrom(id);
      return;
    }
    if (linkFrom === id) {
      setLinkFrom(null);
      return;
    }
    setPendingLink({ from: linkFrom, to: id });
    setLinkLabel('');
    setLinkFrom(null);
  }

  async function confirmLink() {
    if (!pendingLink) return;
    setBusy(true);
    setError('');
    try {
      await api.createEventLink(pendingLink.from, pendingLink.to, dmId, linkLabel.trim());
      setPendingLink(null);
      setLinkLabel('');
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeLink(linkId) {
    setError('');
    try {
      await api.deleteEventLink(linkId, dmId);
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeEvent(id) {
    if (!window.confirm('¿Eliminar este evento, sus ramas y sus enlaces?')) return;
    setError('');
    try {
      await api.deleteEventTemplate(id, dmId);
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  function openCreate() {
    setForm({ title: '', category: 'general', description: '', subLocId: '' });
    setEventModal({ mode: 'create' });
  }

  function openEdit(evt) {
    setForm({
      title: evt.title,
      category: evt.category,
      description: evt.description || '',
      subLocId: '',
    });
    setEventModal({ mode: 'edit', id: evt.id });
  }

  async function saveEvent() {
    if (!form.title.trim()) {
      setError('El título es requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      if (eventModal.mode === 'create') {
        await api.createEventTemplate({
          dm_id: dmId,
          prep_id: prepId,
          sub_location_id: form.subLocId || null,
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim(),
        });
      } else {
        await api.updateEventTemplate(eventModal.id, dmId, {
          title: form.title.trim(),
          category: form.category,
          description: form.description.trim(),
        });
      }
      setEventModal(null);
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  // Centro de un nodo (para trazar las aristas).
  const center = (id) => {
    const p = positions[id];
    if (!p) return null;
    return { cx: p.x + layout.nodeW / 2, cy: p.y + layout.nodeH / 2 };
  };

  const padding = 40;
  const canvasW = layout.width + layout.nodeW + padding * 2;
  const canvasH = layout.height + layout.nodeH + padding * 2;

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Barra de acciones */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={openCreate}>
          + Evento
        </Button>
        {linkFrom != null ? (
          <span className="rounded bg-ink-900 px-2 py-1 text-xs text-gold">
            🔗 Elige el evento destino… ·{' '}
            <button className="underline hover:text-gold-soft" onClick={() => setLinkFrom(null)}>
              cancelar
            </button>
          </span>
        ) : (
          <span className="text-xs text-gray-500">
            Toca un evento y luego otro para enlazarlos.
          </span>
        )}
        <span className="ml-auto text-xs text-gray-500">
          {events.length} evento{events.length !== 1 ? 's' : ''}
        </span>
      </div>

      {error && <p className="rounded-md bg-danger/20 px-2 py-1 text-xs text-red-300">{error}</p>}

      {/* Lienzo: scrollable; las aristas van en SVG y los nodos en HTML posicionado. */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-card border border-ink-line bg-ink-900">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-gray-600">
            <span className="text-3xl">📋</span>
            <span className="text-sm">Sin eventos. Crea el primero con “+ Evento”.</span>
          </div>
        ) : (
          /* SVG único: aristas con line/text y nodos con foreignObject. La posición
             es geometría SVG (atributos x/y), no CSS inline — cumple "cero estilos
             inline". El alto/ancho del SVG fija el área de scroll del lienzo. */
          <svg width={canvasW} height={canvasH} className="block">

            <defs>
              <marker
                id="ffg-arrow-link"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-gold" />
              </marker>
              <marker
                id="ffg-arrow-branch"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0,0 L10,5 L0,10 z" className="fill-ink-600" />
              </marker>
            </defs>

            {/* Aristas */}
            {edges.map((edge) => {
              const a = center(edge.from);
              const b = center(edge.to);
              if (!a || !b) return null;
              const ax = a.cx + padding;
              const ay = a.cy + padding;
              const bx = b.cx + padding;
              const by = b.cy + padding;
              const mx = (ax + bx) / 2;
              const my = (ay + by) / 2;
              const isLink = edge.kind === 'link';
              return (
                <g key={edge.key}>
                  <line
                    x1={ax}
                    y1={ay}
                    x2={bx}
                    y2={by}
                    className={isLink ? 'stroke-gold' : 'stroke-ink-600'}
                    strokeWidth={isLink ? 2.5 : 2}
                    markerEnd={`url(#${isLink ? 'ffg-arrow-link' : 'ffg-arrow-branch'})`}
                  />
                  {edge.label && (
                    <text
                      x={mx}
                      y={my}
                      className={`fill-gold text-[10px] font-bold ${isLink ? 'cursor-pointer' : ''}`}
                      textAnchor="middle"
                      onClick={() => isLink && removeLink(edge.linkId)}
                    >
                      {edge.label}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Nodos (HTML dentro de foreignObject; la posición es x/y del SVG) */}
            {events.map((evt) => {
              const p = positions[evt.id];
              if (!p) return null;
              const cls = categoryClasses(evt.category);
              const selected = linkFrom === evt.id;
              return (
                <foreignObject
                  key={evt.id}
                  x={p.x + padding}
                  y={p.y + padding}
                  width="190"
                  height="118"
                >
                  <div
                    role="button"
                    tabIndex={0}
                    onPointerDown={(e) => onNodePointerDown(e, evt.id)}
                    onClick={() => handleNodeClick(evt.id)}
                    onKeyDown={(e) => e.key === 'Enter' && handleNodeClick(evt.id)}
                    className={`relative flex cursor-grab touch-none select-none flex-col gap-1 rounded-md border bg-ink-800 p-2 pl-3 shadow-lg active:cursor-grabbing ${
                      selected ? 'border-gold ring-2 ring-gold/50' : 'border-ink-line'
                    }`}
                  >
                    <div className={`absolute bottom-2 left-0 top-2 w-1 rounded-sm border-l-2 ${cls}`} />
                    {evt.branch_label && (
                      <span className="text-[0.6rem] font-bold uppercase tracking-wide text-gold">
                        ⌥ {evt.branch_label}
                      </span>
                    )}
                    <strong className="truncate text-sm leading-tight text-gray-100">{evt.title}</strong>
                    <div className="flex flex-wrap items-center gap-1">
                      <span className={`rounded border px-1.5 text-[0.6rem] ${cls}`}>{evt.category}</span>
                      {evt.locationLabel && (
                        <span className="truncate text-[0.58rem] text-gray-500">📌 {evt.locationLabel}</span>
                      )}
                    </div>
                    <div className="flex justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5 py-0.5 text-xs"
                        title="Editar"
                        onClick={(e) => {
                          e.stopPropagation();
                          openEdit(evt);
                        }}
                      >
                        ✏️
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="px-1.5 py-0.5 text-xs"
                        title="Eliminar"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeEvent(evt.id);
                        }}
                      >
                        🗑
                      </Button>
                    </div>
                  </div>
                </foreignObject>
              );
            })}
          </svg>
        )}
      </div>

      {/* Leyenda */}
      {!compact && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.65rem] text-gray-500">
          <span>
            <span className="text-ink-600">━</span> rama (parent)
          </span>
          <span>
            <span className="text-gold">━</span> enlace (toca su etiqueta para eliminar)
          </span>
          <span>Arrastra los nodos para organizarlos.</span>
        </div>
      )}

      {/* Modal: etiqueta del enlace */}
      <Modal open={!!pendingLink} onClose={() => setPendingLink(null)} title="🔗 Etiqueta del enlace">
        <div className="flex flex-col gap-3">
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder='ej: "Si huyen…", "Continúa"'
            autoFocus
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setPendingLink(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={confirmLink} disabled={busy}>
              {busy ? '…' : 'Crear enlace'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Modal: crear / editar evento */}
      <Modal
        open={!!eventModal}
        onClose={() => setEventModal(null)}
        title={eventModal?.mode === 'edit' ? 'Editar evento' : 'Nuevo evento'}
      >
        <div className="flex flex-col gap-2.5">
          <input
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            autoFocus
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <select
            value={form.category}
            onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
            className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          {eventModal?.mode === 'create' && subLocations.length > 0 && (
            <select
              value={form.subLocId}
              onChange={(e) => setForm((f) => ({ ...f, subLocId: e.target.value }))}
              className="rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
            >
              <option value="">— Sin ubicación —</option>
              {subLocations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          )}
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="min-h-[60px] resize-y rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEventModal(null)}>
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

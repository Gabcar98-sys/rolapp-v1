import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import {
  eventCategoryClasses,
  EVENT_CATEGORIES,
  categoryLabel,
  flattenPrepEvents,
  computeGraphLayout,
} from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';

// Editor visual del grafo de eventos de un prep. Las aristas van en un SVG (curvas
// Bézier) y los nodos en HTML posicionado dentro del mismo lienzo escalable.
//
// Props:
//   locations, freeEvents, eventLinks → jerarquía del prep (de api.getPrep).
//   dmId    → DM dueño del prep (autoriza las mutaciones).
//   prepId  → prep donde se crean los eventos nuevos.
//   onChange → callback para que el padre recargue la jerarquía tras una mutación.
//   compact → modo reducido (en sesión, F8b): oculta el zoom/leyenda y usa un
//             lienzo más pequeño. NO cambiar esta firma: PlanningPanel la usa.
//   showToolbar → muestra la barra interna de "+ Evento" / ayuda de enlace. En la
//             pantalla rediseñada (F17) el toolbar vive en el padre, así que se
//             puede ocultar y controlar la creación con `openCreateRef`.
//   openCreateRef → ref opcional que el padre rellena con la función `openCreate`
//             para disparar el modal de nuevo evento desde su propio botón.
const NODE_W = 186;
const NODE_H = 84; // altura aproximada del nodo (barra + contenido) para centrar aristas
const CANVAS_PAD = 40;
const ZOOM_MIN = 0.6;
const ZOOM_MAX = 1.5;
const ZOOM_STEP = 0.15;

export default function EventFlowGraph({
  locations = [],
  freeEvents = [],
  eventLinks = [],
  dmId,
  prepId,
  onChange,
  compact = false,
  showToolbar = true,
  openCreateRef = null,
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

  // Aristas: ramas (parent→hijo, "misma ubicación") + enlaces cruzados (event_links).
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

  const layout = useMemo(
    () => computeGraphLayout(events, edges, { nodeW: NODE_W, nodeH: NODE_H }),
    [events, edges]
  );

  // Posiciones locales: arrancan del layout automático; el DM puede arrastrarlas.
  const [positions, setPositions] = useState({});
  useEffect(() => {
    // Reaplica el layout cuando cambian los nodos/aristas (el arrastre es efímero).
    const next = {};
    for (const [id, pos] of layout.positions) next[id] = pos;
    setPositions(next);
  }, [layout]);

  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scale, setScale] = useState(1);

  // Selección: primer nodo elegido = origen del enlace; también resalta el nodo.
  const [selected, setSelected] = useState(null);
  const [pendingLink, setPendingLink] = useState(null); // { from, to }
  const [linkLabel, setLinkLabel] = useState('');

  // Modal de creación / edición de evento.
  const [eventModal, setEventModal] = useState(null); // { mode:'create'|'edit', ... }
  const [form, setForm] = useState({ title: '', category: 'general', description: '', subLocId: '' });

  // ── Arrastre de nodos (posición local; corrige por la escala del zoom) ────────
  const dragState = useRef(null);
  const scaleRef = useRef(scale);
  scaleRef.current = scale;

  const onNodePointerDown = useCallback((e, id) => {
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
      const sc = scaleRef.current || 1;
      const dx = (e.clientX - st.startX) / sc;
      const dy = (e.clientY - st.startY) / sc;
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

  // ── Selección de nodo (resaltar + enlazar dos nodos) ─────────────────────────
  function handleNodeClick(id) {
    if (dragState.current?.moved) return;
    if (selected == null) {
      setSelected(id);
      return;
    }
    if (selected === id) {
      setSelected(null);
      return;
    }
    setPendingLink({ from: selected, to: id });
    setLinkLabel('');
  }

  async function confirmLink() {
    if (!pendingLink) return;
    setBusy(true);
    setError('');
    try {
      await api.createEventLink(pendingLink.from, pendingLink.to, dmId, linkLabel.trim());
      setPendingLink(null);
      setLinkLabel('');
      setSelected(null);
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

  const openCreate = useCallback((subLocId = '') => {
    setForm({ title: '', category: 'general', description: '', subLocId: subLocId || '' });
    setEventModal({ mode: 'create' });
  }, []);

  // Expone openCreate al padre (toolbar externo de F17).
  useEffect(() => {
    if (openCreateRef) openCreateRef.current = openCreate;
  }, [openCreateRef, openCreate]);

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

  // Centro de un nodo (para trazar las aristas), en coordenadas del lienzo.
  const center = (id) => {
    const p = positions[id];
    if (!p) return null;
    return { x: p.x + CANVAS_PAD + NODE_W / 2, y: p.y + CANVAS_PAD + NODE_H / 2 };
  };

  // Curva Bézier cúbica vertical entre dos centros (como el mockup).
  const edgePath = (a, b) => {
    const my = (a.y + b.y) / 2;
    return { d: `M${a.x},${a.y} C${a.x},${my} ${b.x},${my} ${b.x},${b.y}`, mx: (a.x + b.x) / 2, midy: my };
  };

  const canvasW = layout.width + NODE_W + CANVAS_PAD * 2;
  const canvasH = layout.height + NODE_H + CANVAS_PAD * 2 + 120;

  const zoomIn = () => setScale((s) => Math.min(ZOOM_MAX, +(s + ZOOM_STEP).toFixed(2)));
  const zoomOut = () => setScale((s) => Math.max(ZOOM_MIN, +(s - ZOOM_STEP).toFixed(2)));
  const zoomReset = () => setScale(1);

  return (
    <div className="flex h-full min-h-0 flex-col gap-2">
      {/* Barra de acciones interna (opcional; F17 usa su propio toolbar) */}
      {showToolbar && (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => openCreate()}>
            <Icon name="plus" size={14} /> Evento
          </Button>
          {selected != null ? (
            <span className="inline-flex items-center gap-1 rounded-btn bg-accent-tint px-2 py-1 text-xs text-accent-text">
              <Icon name="link" size={13} /> Elige otro evento para enlazar ·{' '}
              <button className="underline hover:text-accent" onClick={() => setSelected(null)}>
                cancelar
              </button>
            </span>
          ) : (
            <span className="text-xs text-faint">Toca un evento y luego otro para enlazarlos.</span>
          )}
          <span className="ml-auto text-xs text-faint">
            {events.length} evento{events.length !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {error && (
        <p className="rounded-btn bg-danger-tint px-2 py-1 text-xs text-danger-text">{error}</p>
      )}

      {/* Lienzo con fondo de puntos radial; nodos y aristas se escalan juntos. */}
      <div className="relative min-h-0 flex-1 overflow-auto rounded-card border border-line bg-bg bg-[radial-gradient(#2E2A22_1.2px,transparent_1.2px)] bg-[length:26px_26px]">
        {events.length === 0 ? (
          <div className="flex h-full min-h-[180px] flex-col items-center justify-center gap-2 text-faint">
            <Icon name="map" size={30} className="text-muted" />
            <span className="text-sm">Sin eventos. Crea el primero con “+ Evento”.</span>
          </div>
        ) : (
          <div
            className="relative origin-top-left"
            style={{ width: canvasW, height: canvasH, transform: `scale(${scale})` }}
          >
            {/* Aristas Bézier: rama = gris sólida; enlace = terracota punteada. */}
            <svg
              width={canvasW}
              height={canvasH}
              className="pointer-events-none absolute left-0 top-0 overflow-visible"
            >
              {edges.map((edge) => {
                const a = center(edge.from);
                const b = center(edge.to);
                if (!a || !b) return null;
                const { d } = edgePath(a, b);
                const isLink = edge.kind === 'link';
                return (
                  <path
                    key={edge.key}
                    d={d}
                    fill="none"
                    strokeLinecap="round"
                    strokeWidth={2.2}
                    className={isLink ? 'stroke-accent' : 'stroke-[#5A5348]'}
                    strokeDasharray={isLink ? '5 4' : undefined}
                  />
                );
              })}
            </svg>

            {/* Etiquetas de enlace como píldoras (clic para eliminar el enlace). */}
            {edges
              .filter((edge) => edge.kind === 'link' && edge.label)
              .map((edge) => {
                const a = center(edge.from);
                const b = center(edge.to);
                if (!a || !b) return null;
                const { mx, midy } = edgePath(a, b);
                return (
                  <button
                    key={`lbl-${edge.key}`}
                    type="button"
                    onClick={() => removeLink(edge.linkId)}
                    title="Eliminar enlace"
                    className="absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap rounded-pill border border-[#4A2E20] bg-[#241E19] px-2 py-0.5 text-[10.5px] font-semibold text-accent-text hover:border-accent"
                    style={{ left: mx, top: midy }}
                  >
                    {edge.label}
                  </button>
                );
              })}

            {/* Nodos 186px arrastrables: barra de categoría 4px + badge píldora. */}
            {events.map((evt) => {
              const p = positions[evt.id];
              if (!p) return null;
              const cat = eventCategoryClasses(evt.category);
              const isSel = selected === evt.id;
              return (
                <div
                  key={evt.id}
                  role="button"
                  tabIndex={0}
                  onPointerDown={(e) => onNodePointerDown(e, evt.id)}
                  onClick={() => handleNodeClick(evt.id)}
                  onKeyDown={(e) => e.key === 'Enter' && handleNodeClick(evt.id)}
                  className={`group absolute w-[186px] cursor-grab touch-none select-none overflow-hidden rounded-[12px] border-[1.5px] bg-surface-2 active:cursor-grabbing ${
                    isSel ? `${cat.borderClass} shadow-node` : 'border-line shadow-card'
                  }`}
                  style={{ left: p.x + CANVAS_PAD, top: p.y + CANVAS_PAD }}
                >
                  <div className={`h-1 ${cat.barClass}`} />
                  <div className="px-3 pb-3 pt-2.5">
                    <div className="mb-1.5 flex items-start justify-between gap-1">
                      <span className="text-sm font-semibold leading-tight text-title-2">
                        {evt.title}
                      </span>
                      <span className="flex flex-shrink-0 gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <button
                          type="button"
                          title="Editar"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEdit(evt);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-faint hover:bg-hover hover:text-title-2"
                        >
                          <Icon name="edit" size={12} />
                        </button>
                        <button
                          type="button"
                          title="Eliminar"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeEvent(evt.id);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded text-danger-idle hover:bg-danger-tint hover:text-danger-text"
                        >
                          <Icon name="trash" size={12} />
                        </button>
                      </span>
                    </div>
                    {evt.branch_label && (
                      <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-accent-text">
                        {evt.branch_label}
                      </span>
                    )}
                    <div className="flex items-center gap-1.5">
                      <span
                        className={`rounded-pill px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide ${cat.badgeClass}`}
                      >
                        {cat.label}
                      </span>
                      {evt.locationLabel && (
                        <span className="inline-flex min-w-0 items-center gap-1 truncate text-[10.5px] text-faint">
                          <Icon name="pin" size={11} />
                          <span className="truncate">{evt.locationLabel}</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Leyenda sticky (oculta en compacto) */}
        {!compact && events.length > 0 && (
          <div className="pointer-events-none sticky bottom-4 left-4 z-10 m-4 inline-flex w-max flex-col gap-1.5 rounded-[11px] border border-line-hover bg-surface px-3.5 py-3 shadow-card">
            <span className="text-[10px] font-bold uppercase tracking-[1px] text-muted-2">Leyenda</span>
            <span className="flex items-center gap-2 text-xs text-sub">
              <svg width="26" height="8" aria-hidden="true">
                <line x1="1" y1="4" x2="25" y2="4" stroke="#5A5348" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
              Misma ubicación
            </span>
            <span className="flex items-center gap-2 text-xs text-sub">
              <svg width="26" height="8" aria-hidden="true">
                <line
                  x1="1"
                  y1="4"
                  x2="25"
                  y2="4"
                  className="stroke-accent"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeDasharray="5 4"
                />
              </svg>
              Enlace narrativo
            </span>
          </div>
        )}

        {/* Controles de zoom sticky (ocultos en compacto) */}
        {!compact && events.length > 0 && (
          <div className="sticky bottom-4 left-full z-10 float-right m-4 flex w-max flex-col overflow-hidden rounded-[10px] border border-line-hover bg-surface shadow-card">
            <button
              type="button"
              onClick={zoomIn}
              title="Acercar"
              className="flex h-9 w-9 items-center justify-center border-b border-line text-idle hover:bg-hover hover:text-title-2"
            >
              <Icon name="plus" size={15} strokeWidth={2} />
            </button>
            <button
              type="button"
              onClick={zoomOut}
              title="Alejar"
              className="flex h-9 w-9 items-center justify-center border-b border-line text-idle hover:bg-hover hover:text-title-2"
            >
              <span className="h-[2px] w-3.5 rounded bg-current" />
            </button>
            <button
              type="button"
              onClick={zoomReset}
              title="Restablecer zoom"
              className="flex h-9 w-9 items-center justify-center text-idle hover:bg-hover hover:text-title-2"
            >
              <Icon name="search" size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Modal: etiqueta del enlace */}
      <Modal open={!!pendingLink} onClose={() => setPendingLink(null)} title="Etiqueta del enlace">
        <div className="flex flex-col gap-3">
          <input
            value={linkLabel}
            onChange={(e) => setLinkLabel(e.target.value)}
            placeholder='ej: "Si huyen…", "Continúa"'
            autoFocus
            className="rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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
          {eventModal?.mode === 'create' && subLocations.length > 0 && (
            <select
              value={form.subLocId}
              onChange={(e) => setForm((f) => ({ ...f, subLocId: e.target.value }))}
              className="rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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
            className="min-h-[60px] resize-y rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
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

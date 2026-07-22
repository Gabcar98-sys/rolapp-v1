import { useState } from 'react';
import { api } from '../../lib/api.js';
import { eventCategoryClasses, EVENT_CATEGORIES, categoryLabel } from '../../lib/planning.js';
import Icon from '../ui/Icon.jsx';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';

// Vista de lista (columna 820px) de los eventos de la ubicación seleccionada.
// Kicker (ubicación padre) + H1 (sub-ubicación) + tarjetas con barra de categoría
// 4px, badge píldora, etiqueta de enlace narrativo y acciones al hover
// (subir/bajar por swap de order_index · editar · eliminar).
//
// Props:
//   kicker, title, subtitle → cabecera editorial.
//   events   → eventos de la ubicación (ordenados por order_index).
//   linkByFrom → Map<from_event_id, {label}> para la etiqueta de enlace en la tarjeta.
//   dmId, onChange → mutaciones + recarga.
//   onCreate → abre el modal de nuevo evento (delegado al padre/toolbar).
export default function EventListView({
  kicker,
  title,
  subtitle,
  events = [],
  linkByFrom = new Map(),
  dmId,
  onChange,
  onCreate,
}) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(null); // evento en edición
  const [form, setForm] = useState({ title: '', category: 'general', description: '' });

  async function run(fn) {
    setError('');
    try {
      await fn();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  // Reordena por SWAP de order_index con los PUT existentes (sin endpoint nuevo).
  async function move(index, dir) {
    const other = index + dir;
    if (other < 0 || other >= events.length) return;
    const a = events[index];
    const b = events[other];
    setBusy(true);
    setError('');
    try {
      await api.updateEventTemplate(a.id, dmId, { order_index: b.order_index });
      await api.updateEventTemplate(b.id, dmId, { order_index: a.order_index });
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeEvent(id) {
    if (!window.confirm('¿Eliminar este evento, sus ramas y sus enlaces?')) return;
    await run(() => api.deleteEventTemplate(id, dmId));
  }

  function openEdit(evt) {
    setForm({ title: evt.title, category: evt.category, description: evt.description || '' });
    setEditing(evt);
  }

  async function saveEdit() {
    if (!form.title.trim()) {
      setError('El título es requerido');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await api.updateEventTemplate(editing.id, dmId, {
        title: form.title.trim(),
        category: form.category,
        description: form.description.trim(),
      });
      setEditing(null);
      onChange?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  const actBtn =
    'flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-faint hover:bg-hover hover:text-title-2 disabled:opacity-40';

  return (
    <div className="mx-auto w-full max-w-[820px] px-8 py-8 pb-16">
      <div className="mb-1 flex items-baseline gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-accent-text">
          {kicker}
        </span>
      </div>
      <h1 className="mb-1 font-serif text-[30px] font-semibold leading-tight tracking-[-0.2px] text-title">
        {title}
      </h1>
      {subtitle && <p className="mb-6 text-sm text-faint">{subtitle}</p>}

      {error && (
        <p className="mb-3 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      {events.length === 0 ? (
        <div className="rounded-card border border-dashed border-line-hover px-5 py-12 text-center">
          <Icon name="file" size={30} className="mx-auto mb-2.5 text-muted" />
          <div className="mb-3.5 text-sm text-faint">Aún no hay eventos en esta ubicación.</div>
          <Button variant="secondary" size="sm" onClick={onCreate}>
            <Icon name="plus" size={13} strokeWidth={2.1} /> Añadir el primero
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {events.map((evt, i) => {
            const cat = eventCategoryClasses(evt.category);
            const link = linkByFrom.get(evt.id);
            return (
              <div
                key={evt.id}
                className="group flex overflow-hidden rounded-card border border-line bg-surface-2 transition-colors hover:border-line-hover hover:shadow-card"
              >
                <div className={`w-1 flex-shrink-0 self-stretch ${cat.barClass}`} />
                <div className="min-w-0 flex-1 px-4 py-3.5">
                  <div className="mb-1.5 flex flex-wrap items-center gap-2.5">
                    <span className="text-[15.5px] font-semibold text-title-2">{evt.title}</span>
                    <span
                      className={`rounded-pill px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide ${cat.badgeClass}`}
                    >
                      {cat.label}
                    </span>
                    {evt.branch_label && (
                      <span className="text-[11px] font-bold uppercase tracking-wide text-accent-text">
                        {evt.branch_label}
                      </span>
                    )}
                    {link && (
                      <span className="inline-flex items-center gap-1 text-[11px] text-faint">
                        <Icon name="link" size={12} />
                        {link.label || 'Enlace'}
                      </span>
                    )}
                  </div>
                  {evt.description && (
                    <p className="text-[13.5px] leading-relaxed text-sub">{evt.description}</p>
                  )}
                </div>
                <div className="flex items-center gap-0.5 px-3 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    title="Subir"
                    aria-label="Subir evento"
                    disabled={busy || i === 0}
                    onClick={() => move(i, -1)}
                    className={actBtn}
                  >
                    <Icon name="arrow-left" size={14} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    title="Bajar"
                    aria-label="Bajar evento"
                    disabled={busy || i === events.length - 1}
                    onClick={() => move(i, 1)}
                    className={actBtn}
                  >
                    <Icon name="arrow-right" size={14} className="rotate-90" />
                  </button>
                  <button
                    type="button"
                    title="Editar"
                    aria-label="Editar evento"
                    onClick={() => openEdit(evt)}
                    className={actBtn}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    title="Eliminar"
                    aria-label="Eliminar evento"
                    onClick={() => removeEvent(evt.id)}
                    className="flex h-[26px] w-[26px] items-center justify-center rounded-[7px] text-danger-idle hover:bg-danger-tint hover:text-danger-text"
                  >
                    <Icon name="trash" size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de edición */}
      <Modal open={!!editing} onClose={() => setEditing(null)} title="Editar evento">
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
          <textarea
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            className="min-h-[60px] resize-y rounded-btn border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-accent"
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button size="sm" onClick={saveEdit} disabled={busy}>
              {busy ? '…' : 'Guardar'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

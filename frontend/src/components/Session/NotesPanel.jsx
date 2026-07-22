import { useCallback, useEffect, useState } from 'react';
import socket from '../../lib/socket.js';
import { api } from '../../lib/api.js';
import { EVENT_CATEGORIES, eventCategoryClasses } from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Panel de Notas de sesión (F18). El DM crea/edita/borra notas (públicas o privadas) y
// las ve todas; el jugador ve SOLO las públicas. Sincroniza por socket: al recibir
// `notes:updated` (señal sin bodies), re-consulta por REST, que filtra por rol. Así el
// cuerpo de una nota privada nunca llega al jugador por socket.
export default function NotesPanel({ sessionId, user }) {
  const isDM = user.role === 'dm';
  const [notes, setNotes] = useState([]);
  const [error, setError] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ title: '', body: '', event_type: 'general', is_public: false });
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api
      .listNotes(sessionId, user.id)
      .then(({ notes: list }) => setNotes(list ?? []))
      .catch((err) => setError(err.message));
  }, [sessionId, user.id]);

  useEffect(() => {
    load();
    // Señal de cambio sin bodies: cada cliente refetch con su rol (visibilidad segura).
    const onUpdated = ({ sessionId: sid }) => {
      if (Number(sid) === Number(sessionId)) load();
    };
    socket.on('notes:updated', onUpdated);
    return () => socket.off('notes:updated', onUpdated);
  }, [load, sessionId]);

  function resetForm() {
    setForm({ title: '', body: '', event_type: 'general', is_public: false });
    setEditingId(null);
    setShowForm(false);
  }

  function startEdit(note) {
    setForm({
      title: note.title,
      body: note.body ?? '',
      event_type: note.event_type ?? 'general',
      is_public: !!note.is_public,
    });
    setEditingId(note.id);
    setShowForm(true);
  }

  async function save(e) {
    e.preventDefault();
    if (!form.title.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (editingId) {
        await api.updateNote(editingId, user.id, form);
      } else {
        await api.createNote(sessionId, user.id, form);
      }
      resetForm();
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(id) {
    setError('');
    try {
      await api.deleteNote(id, user.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-shrink-0 items-center justify-between px-3 py-2.5">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Notas</span>
        {isDM && !showForm && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Icon name="plus" size={16} className="mr-1" /> Nota
          </Button>
        )}
      </div>

      {error && (
        <p className="mx-3 mb-2 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-3 pb-3">
        {isDM && showForm && (
          <Card className="p-3">
            <form onSubmit={save} className="flex flex-col gap-2">
              <input
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                placeholder="Título"
                className={inputCls}
                autoFocus
              />
              <textarea
                value={form.body}
                onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
                placeholder="Contenido de la nota…"
                rows={3}
                className={`resize-y ${inputCls}`}
              />
              <div className="flex flex-wrap items-center gap-2">
                <select
                  value={form.event_type}
                  onChange={(e) => setForm((f) => ({ ...f, event_type: e.target.value }))}
                  className={`flex-1 ${inputCls}`}
                  aria-label="Tipo de nota"
                >
                  {EVENT_CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-sub">
                  <input
                    type="checkbox"
                    checked={form.is_public}
                    onChange={(e) => setForm((f) => ({ ...f, is_public: e.target.checked }))}
                    className="h-4 w-4 accent-accent"
                  />
                  Pública
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button type="submit" size="sm" disabled={busy || !form.title.trim()}>
                  {editingId ? 'Guardar' : 'Crear'}
                </Button>
              </div>
            </form>
          </Card>
        )}

        {notes.length === 0 && !showForm && (
          <p className="mt-4 text-center text-sm text-faint">
            {isDM ? 'Sin notas. Crea la primera.' : 'El DM aún no ha publicado notas.'}
          </p>
        )}

        {notes.map((note) => {
          const cat = eventCategoryClasses(note.event_type);
          return (
            <Card key={note.id} className="p-3">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className={`rounded-pill px-2 py-0.5 text-[0.66rem] font-medium ${cat.badgeClass}`}>
                      {cat.label}
                    </span>
                    {isDM && !note.is_public && (
                      <span className="rounded-pill bg-line px-2 py-0.5 text-[0.66rem] text-faint">
                        Privada
                      </span>
                    )}
                    <strong className="text-sm text-title">{note.title}</strong>
                  </div>
                  {note.body && (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-snug text-sub">{note.body}</p>
                  )}
                </div>
                {isDM && (
                  <div className="flex flex-shrink-0 gap-1">
                    <button
                      onClick={() => startEdit(note)}
                      className="text-faint hover:text-accent-text"
                      aria-label={`Editar ${note.title}`}
                    >
                      <Icon name="edit" size={15} />
                    </button>
                    <button
                      onClick={() => remove(note.id)}
                      className="text-faint hover:text-danger-text"
                      aria-label={`Eliminar ${note.title}`}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

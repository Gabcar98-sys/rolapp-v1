import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { EVENT_CATEGORIES } from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';

const inputCls =
  'w-full rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Construye el payload de un EVENTO RÁPIDO ad-hoc (sin template ni NPC): el DM crea y
// dispara un evento genérico al instante. Se exporta aparte del componente para poder
// testear la forma del payload sin montar la UI (no hay jsdom en el runner de vitest).
export function buildQuickEventPayload({ user, form, partType, chars, selectedIds }) {
  const participants =
    partType === 'specific'
      ? chars.filter((c) => selectedIds.has(c.id)).map((c) => ({ id: c.id, name: c.name }))
      : [];
  return {
    dm_id: user.id,
    title: form.title.trim(),
    category: form.category,
    description: form.description,
    participant_type: partType,
    participants,
    actor_type: 'dm',
  };
}

// Toolbar de la sesión en vivo (F18 + F20). Expone como barra las acciones ya existentes:
//   DM: Cambiar mapa (modal), Nuevo Evento (modal de evento rápido: crear-y-disparar al
//       instante, F20), Nuevo Evento NPC (modal con catálogo F16), Reset, Finalizar.
//   Jugador: Salir.
// El evento rápido y el evento NPC se disparan aquí porque son flujos cortos y aislados;
// el disparo de eventos YA planificados sigue viviendo en PlanningPanel, accesible desde
// el enlace secundario "¿Evento planificado?" del modal de evento rápido (onOpenPlanning).
// `characters` es opcional: si el consumidor ya la tiene, se pasa como prop para evitar el
// fetch; si no, se carga con api.getSession (mismo patrón que PlanningPanel).
export default function SessionToolbar({
  session,
  user,
  currentImageUrl,
  onSetImage,
  onOpenPlanning,
  onReset,
  onClose,
  onLeave,
  characters = null,
}) {
  const isDM = user.role === 'dm';
  const [showMap, setShowMap] = useState(false);
  const [imageDraft, setImageDraft] = useState('');
  const [showNpc, setShowNpc] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [npcForm, setNpcForm] = useState({ npc_id: '', category: 'general', title: '', description: '' });
  const [npcBusy, setNpcBusy] = useState(false);

  // Evento rápido (F20): crear-y-disparar un evento genérico al instante.
  const [showQuick, setShowQuick] = useState(false);
  const [quickForm, setQuickForm] = useState({ title: '', category: 'general', description: '' });
  const [quickBusy, setQuickBusy] = useState(false);
  const [quickPartType, setQuickPartType] = useState('all');
  const [quickPartSelected, setQuickPartSelected] = useState(new Set());
  const [sessionChars, setSessionChars] = useState([]);

  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDM || !user?.id) return;
    api.listNpcs(user.id).then(({ npcs: list }) => setNpcs(list ?? [])).catch(() => {});
  }, [isDM, user?.id]);

  // Personajes de la sesión (selector de participantes específicos del evento rápido).
  // Si el consumidor ya la aporta como prop, la usamos sin volver a pedirla.
  useEffect(() => {
    if (!isDM) return;
    if (characters) {
      setSessionChars(characters.map((c) => ({ id: c.id, name: c.name })));
      return;
    }
    let active = true;
    api
      .getSession(session.id)
      .then(({ characters: list }) => active && setSessionChars((list ?? []).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [isDM, session.id, characters]);

  function openMap() {
    setImageDraft(currentImageUrl ?? '');
    setError('');
    setShowMap(true);
  }

  function submitMap(e) {
    e.preventDefault();
    onSetImage(imageDraft.trim());
    setShowMap(false);
  }

  function resetQuick() {
    setQuickForm({ title: '', category: 'general', description: '' });
    setQuickPartType('all');
    setQuickPartSelected(new Set());
  }

  function openQuick() {
    resetQuick();
    setError('');
    setShowQuick(true);
  }

  function toggleQuickParticipant(id) {
    setQuickPartSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function submitQuick() {
    if (!quickForm.title.trim()) {
      setError('Escribe el título del evento');
      return;
    }
    setQuickBusy(true);
    setError('');
    try {
      await api.firePlanningEvent(
        session.id,
        buildQuickEventPayload({
          user,
          form: quickForm,
          partType: quickPartType,
          chars: sessionChars,
          selectedIds: quickPartSelected,
        })
      );
      setShowQuick(false);
      resetQuick();
    } catch (err) {
      setError(err.message);
    } finally {
      setQuickBusy(false);
    }
  }

  async function submitNpc() {
    if (!npcForm.title.trim() || !npcForm.npc_id) {
      setError('Selecciona un NPC y escribe el título');
      return;
    }
    setNpcBusy(true);
    setError('');
    const selectedNpc = npcs.find((n) => String(n.id) === String(npcForm.npc_id));
    try {
      await api.firePlanningEvent(session.id, {
        dm_id: user.id,
        title: npcForm.title.trim(),
        category: npcForm.category,
        description: npcForm.description,
        actor_type: 'npc',
        npc_id: npcForm.npc_id,
        npc_name: selectedNpc?.name ?? '',
        participant_type: 'all',
        participants: [],
      });
      setShowNpc(false);
      setNpcForm({ npc_id: '', category: 'general', title: '', description: '' });
    } catch (err) {
      setError(err.message);
    } finally {
      setNpcBusy(false);
    }
  }

  return (
    <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
      {isDM ? (
        <>
          <Button variant="secondary" size="sm" onClick={openMap}>
            <Icon name="map" size={15} className="mr-1" /> Cambiar mapa
          </Button>
          <Button variant="secondary" size="sm" onClick={openQuick}>
            <Icon name="plus" size={15} className="mr-1" /> Nuevo Evento
          </Button>
          <Button variant="secondary" size="sm" onClick={() => { setShowNpc(true); setError(''); }}>
            <Icon name="user" size={15} className="mr-1" /> Evento NPC
          </Button>
          <div className="ml-auto flex items-center gap-2">
            <Button variant="secondary" size="sm" onClick={onReset} title="Reiniciar canvas">
              <Icon name="arrow-left" size={15} />
            </Button>
            <Button variant="success" size="sm" onClick={onClose}>
              <Icon name="check" size={15} className="mr-1" /> Finalizar
            </Button>
            <Button variant="danger" size="sm" onClick={onLeave} aria-label="Salir de la sesión">
              <Icon name="logout" size={15} />
            </Button>
          </div>
        </>
      ) : (
        <Button variant="danger" size="sm" className="ml-auto" onClick={onLeave}>
          <Icon name="logout" size={15} className="mr-1" /> Salir
        </Button>
      )}

      {/* Modal Cambiar mapa (reutiliza el set_image por socket del canvas). */}
      <Modal open={showMap} onClose={() => setShowMap(false)} title="Cambiar mapa">
        <form onSubmit={submitMap} className="flex flex-col gap-3">
          <label htmlFor="toolbar-map-url" className="text-sm text-sub">
            URL de imagen de fondo del canvas
          </label>
          <input
            id="toolbar-map-url"
            value={imageDraft}
            onChange={(e) => setImageDraft(e.target.value)}
            placeholder="https://…"
            className={inputCls}
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => { onSetImage(''); setShowMap(false); }}>
              Quitar fondo
            </Button>
            <Button type="submit" size="sm">Fijar fondo</Button>
          </div>
        </form>
      </Modal>

      {/* Modal Evento rápido (F20): crear y disparar un evento ad-hoc al instante. */}
      <Modal open={showQuick} onClose={() => setShowQuick(false)} title="Nuevo Evento">
        <div className="flex flex-col gap-2.5">
          {error && <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}
          <input
            value={quickForm.title}
            onChange={(e) => setQuickForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            className={inputCls}
            aria-label="Título del evento"
            autoFocus
          />
          <select
            value={quickForm.category}
            onChange={(e) => setQuickForm((f) => ({ ...f, category: e.target.value }))}
            className={inputCls}
            aria-label="Categoría"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <textarea
            value={quickForm.description}
            onChange={(e) => setQuickForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            rows={2}
            className={`resize-y ${inputCls}`}
          />

          {/* Participantes: todo el grupo o específicos (patrón de PlanningPanel). */}
          <div className="flex gap-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-sub">
              <input
                type="radio"
                className="accent-accent"
                checked={quickPartType === 'all'}
                onChange={() => {
                  setQuickPartType('all');
                  setQuickPartSelected(new Set());
                }}
              />
              <span>Todo el grupo</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-sub">
              <input
                type="radio"
                className="accent-accent"
                checked={quickPartType === 'specific'}
                onChange={() => setQuickPartType('specific')}
              />
              <span>Específicos</span>
            </label>
          </div>
          {quickPartType === 'specific' && (
            <div className="flex max-h-36 flex-col gap-2 overflow-y-auto">
              {sessionChars.length === 0 && (
                <p className="text-xs italic text-muted">Sin personajes en sesión.</p>
              )}
              {sessionChars.map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 text-sm text-sub">
                  <input
                    type="checkbox"
                    className="accent-accent"
                    checked={quickPartSelected.has(c.id)}
                    onChange={() => toggleQuickParticipant(c.id)}
                  />
                  <span>{c.name}</span>
                </label>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => { setShowQuick(false); onOpenPlanning(); }}
              className="text-xs text-sub underline decoration-dotted underline-offset-2 transition-colors hover:text-title"
            >
              ¿Evento planificado? Abrir Planificación
            </button>
            <div className="flex gap-2">
              <Button variant="secondary" size="sm" onClick={() => setShowQuick(false)}>Cancelar</Button>
              <Button size="sm" onClick={submitQuick} disabled={quickBusy}>
                {quickBusy ? 'Creando…' : 'Crear y disparar'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Modal Nuevo Evento NPC (catálogo F16). */}
      <Modal open={showNpc} onClose={() => setShowNpc(false)} title="Nuevo Evento NPC">
        <div className="flex flex-col gap-2.5">
          {error && <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}
          <select
            value={npcForm.npc_id}
            onChange={(e) => setNpcForm((f) => ({ ...f, npc_id: e.target.value }))}
            className={inputCls}
            aria-label="NPC"
          >
            <option value="">— Seleccionar NPC —</option>
            {npcs.map((n) => (
              <option key={n.id} value={n.id}>{n.name}</option>
            ))}
          </select>
          <select
            value={npcForm.category}
            onChange={(e) => setNpcForm((f) => ({ ...f, category: e.target.value }))}
            className={inputCls}
            aria-label="Categoría"
          >
            {EVENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
          <input
            value={npcForm.title}
            onChange={(e) => setNpcForm((f) => ({ ...f, title: e.target.value }))}
            placeholder="Título del evento"
            className={inputCls}
          />
          <textarea
            value={npcForm.description}
            onChange={(e) => setNpcForm((f) => ({ ...f, description: e.target.value }))}
            placeholder="Descripción (opcional)"
            rows={2}
            className={`resize-y ${inputCls}`}
          />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" size="sm" onClick={() => setShowNpc(false)}>Cancelar</Button>
            <Button size="sm" onClick={submitNpc} disabled={npcBusy}>
              {npcBusy ? 'Creando…' : 'Crear evento'}
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

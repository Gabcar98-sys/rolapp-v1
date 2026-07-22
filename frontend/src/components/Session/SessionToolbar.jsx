import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import { EVENT_CATEGORIES } from '../../lib/planning.js';
import Button from '../ui/Button.jsx';
import Modal from '../ui/Modal.jsx';
import Icon from '../ui/Icon.jsx';

const inputCls =
  'w-full rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Toolbar de la sesión en vivo (F18). Expone como barra las acciones ya existentes:
//   DM: Cambiar mapa (modal), Nuevo Evento (abre el tab Planificación), Nuevo Evento NPC
//       (modal con catálogo F16), Reset, Finalizar.
//   Jugador: Salir.
// No dispara su propia lógica de planificación (eso vive en PlanningPanel): "Nuevo Evento"
// solo navega al panel; el evento NPC sí se lanza aquí porque es un flujo corto y aislado.
export default function SessionToolbar({
  session,
  user,
  currentImageUrl,
  onSetImage,
  onOpenPlanning,
  onReset,
  onClose,
  onLeave,
}) {
  const isDM = user.role === 'dm';
  const [showMap, setShowMap] = useState(false);
  const [imageDraft, setImageDraft] = useState('');
  const [showNpc, setShowNpc] = useState(false);
  const [npcs, setNpcs] = useState([]);
  const [npcForm, setNpcForm] = useState({ npc_id: '', category: 'general', title: '', description: '' });
  const [npcBusy, setNpcBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDM || !user?.id) return;
    api.listNpcs(user.id).then(({ npcs: list }) => setNpcs(list ?? [])).catch(() => {});
  }, [isDM, user?.id]);

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
          <Button variant="secondary" size="sm" onClick={onOpenPlanning}>
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

import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { campaignAccentIndex, campaignIsActive } from '../lib/metrics.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// Franja superior de 6px de la tarjeta: clases estáticas (JIT de Tailwind) elegidas
// por el índice estable de metrics.js. Paleta = acento + colores de categoría.
const STRIPE_CLASSES = [
  'bg-accent',
  'bg-cat-social-bar',
  'bg-cat-explore-bar',
  'bg-cat-discovery-bar',
  'bg-cat-extra-text',
];

const inputCls =
  'w-full rounded-[10px] border border-[#37312A] bg-bg px-3.5 py-[11px] text-sm text-ink outline-none placeholder:text-muted focus:border-accent';

// Badge de estado de la campaña: Activa (verde exploración) / Pausada (neutral).
function StatusBadge({ active }) {
  const tone = active
    ? 'bg-cat-explore-bg text-cat-explore-text'
    : 'bg-[#2E2A23] text-[#9A9182]';
  return (
    <span className={`rounded-pill px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[.5px] ${tone}`}>
      {active ? 'Activa' : 'Pausada'}
    </span>
  );
}

// Cifra + label del pie de la tarjeta (Jugadores / Sesiones).
function CardStat({ value, label }) {
  return (
    <div>
      <div className="num font-serif text-[19px] font-semibold text-title-2">{value}</div>
      <div className="text-[11px] uppercase tracking-[.6px] text-faint">{label}</div>
    </div>
  );
}

// Campañas (F14): grid de tarjetas con franja de acento propia, badge de estado,
// stats de jugadores/sesiones y detalle expandible (sesiones + editar).
export default function CampaignsPage({ user }) {
  const [campaigns, setCampaigns] = useState([]);
  const [gameSystems, setGameSystems] = useState([]);
  const [sessions, setSessions] = useState([]); // activas + cerradas, para el detalle
  const [openId, setOpenId] = useState(null); // tarjeta expandida ("Abrir")
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState(null); // campaña en edición (null = crear)
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function loadCampaigns() {
    try {
      const { campaigns: list } = await api.listCampaigns(user.id);
      setCampaigns(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCampaigns();
    api
      .listGameSystems(user.id)
      .then(({ systems }) => setGameSystems(systems))
      .catch(() => {});
    // El detalle expandible lista las sesiones de la campaña sin pedirlas de nuevo.
    Promise.all([api.listSessions('active'), api.listSessions('closed')])
      .then(([a, c]) => setSessions([...a.sessions, ...c.sessions]))
      .catch(() => {});
    // Solo recarga al cambiar el usuario.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  function openCreate() {
    setEditing(null);
    setName('');
    setSystemId('');
    setDescription('');
    setFormOpen(true);
  }

  function openEdit(campaign) {
    setEditing(campaign);
    setName(campaign.name);
    setSystemId(campaign.game_system_id ?? '');
    setDescription(campaign.description ?? '');
    setFormOpen(true);
  }

  async function submitForm(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      if (editing) {
        await api.updateCampaign(editing.id, user.id, {
          name: name.trim(),
          description,
          game_system_id: systemId || null,
        });
      } else {
        await api.createCampaign(name.trim(), user.id, description, systemId || null);
      }
      setFormOpen(false);
      await loadCampaigns();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Page>
      <PageHeader
        title="Campañas"
        subtitle="Tus mundos y las sesiones que los habitan."
        actions={
          <Button onClick={openCreate} className="px-[18px] py-[11px]">
            <Icon name="plus" size={16} strokeWidth={2.3} />
            Nueva campaña
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
          {error}
        </p>
      )}

      {campaigns.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="book" size={28} className="text-muted-2" />
          <p className="text-sm text-faint">
            Aún no tienes campañas. Crea la primera para empezar a organizar tus sesiones.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(320px,1fr))]">
          {campaigns.map((c) => {
            const stripe = STRIPE_CLASSES[campaignAccentIndex(c.id)] ?? STRIPE_CLASSES[0];
            const campaignSessions = sessions.filter(
              (s) => String(s.campaign_id ?? '') === String(c.id)
            );
            const open = openId === c.id;
            return (
              <Card key={c.id} hoverable className="overflow-hidden">
                <div className={`h-1.5 ${stripe}`} />
                <div className="px-5 pb-5 pt-[18px]">
                  <div className="mb-2 flex items-center justify-between">
                    <StatusBadge active={campaignIsActive(c)} />
                    <span className="text-xs text-faint">
                      {c.game_system_name || 'Sin sistema'}
                    </span>
                  </div>
                  <div className="mb-1.5 font-serif text-[21px] font-semibold leading-tight text-title-2">
                    {c.name}
                  </div>
                  <p className="mb-4 text-[13.5px] leading-normal text-sub">
                    {c.description || 'Sin descripción.'}
                  </p>
                  <div className="flex gap-[18px] border-t border-line-2 pt-[13px]">
                    <CardStat value={c.player_count ?? 0} label="Jugadores" />
                    <CardStat value={c.session_count ?? 0} label="Sesiones" />
                    <div className="flex-1" />
                    <button
                      type="button"
                      onClick={() => setOpenId(open ? null : c.id)}
                      className="flex items-center gap-1 self-center text-[12.5px] font-semibold text-accent-text hover:text-accent-hover"
                    >
                      {open ? 'Cerrar' : 'Abrir'}
                      <Icon name={open ? 'chevron-down' : 'arrow-right'} size={12} />
                    </button>
                  </div>

                  {open && (
                    <div className="mt-3 border-t border-line-2 pt-3">
                      <div className="mb-2 flex items-center justify-between">
                        <span className="text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
                          Sesiones de la campaña
                        </span>
                        <Button size="sm" variant="secondary" onClick={() => openEdit(c)}>
                          <Icon name="edit" size={13} />
                          Editar
                        </Button>
                      </div>
                      {campaignSessions.length === 0 ? (
                        <p className="py-2 text-sm text-faint">Todavía sin sesiones.</p>
                      ) : (
                        campaignSessions.map((s) => (
                          <div
                            key={s.id}
                            className="flex items-center gap-2.5 border-t border-line-2 py-2 first:border-t-0"
                          >
                            <span
                              className={`h-2 w-2 flex-shrink-0 rounded-full ${
                                s.status === 'active'
                                  ? 'bg-cat-explore-bar shadow-[0_0_0_3px_#22301E]'
                                  : 'bg-[#5A5348]'
                              }`}
                            />
                            <span className="min-w-0 flex-1 truncate text-sm text-ink">
                              {s.name}
                            </span>
                            <span className="text-xs text-faint">
                              {s.status === 'active' ? 'Activa' : 'Cerrada'}
                            </span>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={editing ? 'Editar campaña' : 'Nueva campaña'}
      >
        <form onSubmit={submitForm} className="flex flex-col gap-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la campaña"
            className={inputCls}
          />
          <select
            value={systemId}
            onChange={(e) => setSystemId(e.target.value)}
            className={`${inputCls} text-idle`}
          >
            <option value="">— Sin sistema de juego —</option>
            {gameSystems.map((gs) => (
              <option key={gs.id} value={gs.id}>
                {gs.name}
              </option>
            ))}
          </select>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descripción (opcional)"
            rows={3}
            className={`${inputCls} resize-none`}
          />
          <div className="mt-1 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear campaña'}
            </Button>
          </div>
        </form>
      </Modal>
    </Page>
  );
}

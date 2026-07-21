import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  DISPOSITIONS,
  dispositionIndex,
  dispositionLabel,
  filterEntities,
  initialGlyph,
} from '../lib/catalog.js';
import { inputCls, NPC_GLYPH_CLASSES, NPC_BADGE_CLASSES } from '../components/ui/catalogClasses.js';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// Gestor de NPCs (F16): maestro (grid con filtro por sistema + crear) y detalle
// con tabs Información / Quests / Inventario / Campañas. Solo el DM gestiona.
export default function NpcsPage({ user }) {
  const [systems, setSystems] = useState([]);
  const [systemFilter, setSystemFilter] = useState('');
  const [npcs, setNpcs] = useState([]);
  const [query, setQuery] = useState('');
  const [detailId, setDetailId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');

  async function loadNpcs() {
    try {
      const { npcs: list } = await api.listNpcs(user.id, systemFilter || null);
      setNpcs(list ?? []);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadNpcs();
    // Recarga al cambiar el DM o el filtro de sistema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, systemFilter]);

  useEffect(() => {
    api.listGameSystems(user.id).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
  }, [user.id]);

  const filtered = filterEntities(npcs, { query });

  if (detailId != null) {
    return (
      <Page>
        <NpcDetail
          user={user}
          npcId={detailId}
          systems={systems}
          onBack={() => {
            setDetailId(null);
            loadNpcs();
          }}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="NPCs"
        subtitle="Los rostros que tus jugadores encontrarán en el camino."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="px-[18px] py-[11px]">
            <Icon name="plus" size={16} strokeWidth={2.3} />
            Nuevo NPC
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <div className="mb-[18px] flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} strokeWidth={1.8} />
          </span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar NPC…"
            className="w-full rounded-[10px] border border-line bg-surface py-2.5 pl-[38px] pr-3.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        <select
          value={systemFilter}
          onChange={(e) => setSystemFilter(e.target.value)}
          className={`${inputCls} max-w-xs text-idle`}
          aria-label="Filtrar por sistema de juego"
        >
          <option value="">Todos los sistemas</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="users" size={28} className="text-muted-2" />
          <p className="text-sm text-sub">
            {npcs.length === 0
              ? 'Aún no hay NPCs. Crea el primero para empezar tu elenco.'
              : 'Sin resultados para la búsqueda actual.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((npc) => (
            <NpcCard key={npc.id} npc={npc} onOpen={() => setDetailId(npc.id)} />
          ))}
        </div>
      )}

      <NpcFormModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Nuevo NPC"
        systems={systems}
        defaultSystemId={systemFilter}
        onSubmit={async (fields) => {
          await api.createNpc(user.id, fields);
          setCreateOpen(false);
          await loadNpcs();
        }}
        setError={setError}
      />
    </Page>
  );
}

// ── Tarjeta de NPC (glifo de inicial + badge de disposición) ──────────────────
function NpcCard({ npc, onOpen }) {
  const dispIdx = dispositionIndex(npc.disposition);
  const counts = [
    npc.quest_count ? `${npc.quest_count} quests` : null,
    npc.inventory_count ? `${npc.inventory_count} objetos` : null,
  ].filter(Boolean);

  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex gap-[15px] rounded-[14px] border border-line bg-surface p-[18px] text-left transition-all hover:border-line-hover hover:shadow-card"
    >
      <span
        className={`flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-[13px] font-serif text-[22px] font-semibold ${NPC_GLYPH_CLASSES[dispIdx]}`}
      >
        {initialGlyph(npc.name)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-0.5 flex flex-wrap items-center gap-2">
          <span className="font-serif text-[18px] font-semibold text-title-2">{npc.name}</span>
          <DispositionBadge value={npc.disposition} />
        </div>
        {npc.game_system_name && (
          <div className="mb-[9px] text-[12.5px] text-faint">{npc.game_system_name}</div>
        )}
        <p className="m-0 line-clamp-3 text-[12.5px] leading-normal text-sub">
          {npc.description || 'Sin descripción.'}
        </p>
        {counts.length > 0 && (
          <div className="num mt-2.5 text-[11.5px] text-muted-2">{counts.join(' · ')}</div>
        )}
      </div>
    </button>
  );
}

function DispositionBadge({ value }) {
  const idx = dispositionIndex(value);
  return (
    <span
      className={`inline-block w-max rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-[.4px] ${NPC_BADGE_CLASSES[idx]}`}
    >
      {dispositionLabel(value)}
    </span>
  );
}

const TABS = [
  { id: 'info', label: 'Información', icon: 'user' },
  { id: 'quests', label: 'Quests', icon: 'map' },
  { id: 'inventory', label: 'Inventario', icon: 'bag' },
  { id: 'campaigns', label: 'Campañas', icon: 'book' },
];

// ── Detalle maestro-detalle con tabs ──────────────────────────────────────────
function NpcDetail({ user, npcId, systems, onBack }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState('info');
  const [error, setError] = useState('');
  const [editOpen, setEditOpen] = useState(false);

  async function load() {
    setError('');
    try {
      setData(await api.getNpc(npcId));
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [npcId]);

  async function removeNpc() {
    if (!data) return;
    if (!window.confirm(`¿Eliminar el NPC "${data.npc.name}" y todo su contenido?`)) return;
    try {
      await api.deleteNpc(npcId, user.id);
      onBack();
    } catch (err) {
      setError(err.message);
    }
  }

  if (!data) {
    return (
      <>
        <BackLink onBack={onBack} />
        {error && (
          <p className="mt-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
        )}
      </>
    );
  }

  const { npc } = data;

  return (
    <>
      <BackLink onBack={onBack} />
      <div className="mt-1 mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <span
            className={`flex h-[52px] w-[52px] flex-shrink-0 items-center justify-center rounded-[13px] font-serif text-[22px] font-semibold ${NPC_GLYPH_CLASSES[dispositionIndex(npc.disposition)]}`}
          >
            {initialGlyph(npc.name)}
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-serif text-[26px] font-semibold leading-tight text-title md:text-[30px]">
                {npc.name}
              </h1>
              <DispositionBadge value={npc.disposition} />
            </div>
            {npc.game_system_name && (
              <p className="mt-0.5 text-sm text-faint">{npc.game_system_name}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setEditOpen(true)}>
            <Icon name="edit" size={15} />
            Editar
          </Button>
          <Button variant="danger" onClick={removeNpc}>
            <Icon name="trash" size={15} />
            Eliminar
          </Button>
        </div>
      </div>

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <div className="mb-5 flex flex-wrap gap-2 border-b border-line-2">
        {TABS.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 pb-2.5 pt-1 text-[13.5px] font-semibold transition-colors ${
                active
                  ? 'border-accent text-title'
                  : 'border-transparent text-faint hover:text-ink'
              }`}
            >
              <Icon name={t.icon} size={15} />
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'info' && <InfoTab npc={npc} />}
      {tab === 'quests' && (
        <QuestsTab user={user} npcId={npcId} quests={data.quests} onChange={load} setError={setError} />
      )}
      {tab === 'inventory' && (
        <InventoryTab
          user={user}
          npcId={npcId}
          inventory={data.inventory}
          onChange={load}
          setError={setError}
        />
      )}
      {tab === 'campaigns' && (
        <CampaignsTab
          user={user}
          npcId={npcId}
          linked={data.campaigns}
          onChange={load}
          setError={setError}
        />
      )}

      <NpcFormModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        title="Editar NPC"
        systems={systems}
        npc={npc}
        onSubmit={async (fields) => {
          await api.updateNpc(npcId, user.id, fields);
          setEditOpen(false);
          await load();
        }}
        setError={setError}
      />
    </>
  );
}

function BackLink({ onBack }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
    >
      <Icon name="arrow-left" size={14} />
      NPCs
    </button>
  );
}

// ── Tab: Información ───────────────────────────────────────────────────────────
function InfoTab({ npc }) {
  return (
    <div className="max-w-2xl rounded-[14px] border border-line bg-surface p-5">
      <dl className="flex flex-col gap-4">
        <div>
          <dt className="mb-1 text-[11px] font-bold uppercase tracking-[.7px] text-muted">
            Disposición
          </dt>
          <dd>
            <DispositionBadge value={npc.disposition} />
          </dd>
        </div>
        <div>
          <dt className="mb-1 text-[11px] font-bold uppercase tracking-[.7px] text-muted">
            Descripción
          </dt>
          <dd className="whitespace-pre-wrap text-sm leading-relaxed text-sub">
            {npc.description || 'Sin descripción.'}
          </dd>
        </div>
      </dl>
    </div>
  );
}

// ── Tab: Quests ────────────────────────────────────────────────────────────────
function QuestsTab({ user, npcId, quests, onChange, setError }) {
  const [open, setOpen] = useState(false);

  async function remove(quest) {
    if (!window.confirm(`¿Eliminar la quest "${quest.title}"?`)) return;
    try {
      await api.deleteNpcQuest(npcId, quest.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={14} />
          Nueva quest
        </Button>
      </div>
      {quests.length === 0 ? (
        <EmptyBlock text="Este NPC aún no ofrece quests." />
      ) : (
        <div className="flex flex-col gap-3">
          {quests.map((q) => (
            <div
              key={q.id}
              className="group flex items-start justify-between gap-3 rounded-[12px] border border-line bg-surface p-4"
            >
              <div className="min-w-0">
                <div className="text-sm font-semibold text-title-2">{q.title}</div>
                {q.description && (
                  <p className="mt-1 whitespace-pre-wrap text-[12.5px] leading-normal text-sub">
                    {q.description}
                  </p>
                )}
                {q.reward && (
                  <div className="num mt-2 flex items-center gap-1.5 text-[12px] text-cat-discovery-text">
                    <Icon name="coin" size={13} />
                    {q.reward}
                  </div>
                )}
              </div>
              <RemoveButton label={`Eliminar quest ${q.title}`} onClick={() => remove(q)} />
            </div>
          ))}
        </div>
      )}

      <SubResourceModal
        open={open}
        onClose={() => setOpen(false)}
        title="Nueva quest"
        fields={[
          { name: 'title', label: 'Título', required: true },
          { name: 'description', label: 'Descripción', textarea: true },
          { name: 'reward', label: 'Recompensa' },
        ]}
        onSubmit={async (values) => {
          await api.createNpcQuest(npcId, user.id, values);
          setOpen(false);
          await onChange();
        }}
        setError={setError}
      />
    </div>
  );
}

// ── Tab: Inventario ─────────────────────────────────────────────────────────────
function InventoryTab({ user, npcId, inventory, onChange, setError }) {
  const [open, setOpen] = useState(false);

  async function remove(item) {
    if (!window.confirm(`¿Eliminar "${item.item_name}" del inventario?`)) return;
    try {
      await api.deleteNpcItem(npcId, item.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <Button variant="secondary" size="sm" onClick={() => setOpen(true)}>
          <Icon name="plus" size={14} />
          Nuevo objeto
        </Button>
      </div>
      {inventory.length === 0 ? (
        <EmptyBlock text="Este NPC no lleva objetos encima." />
      ) : (
        <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
          <div className="grid grid-cols-[2fr_60px_80px_40px] gap-3 border-b border-line-2 px-5 py-3 text-[11px] font-bold uppercase tracking-[.7px] text-muted">
            <span>Objeto</span>
            <span className="text-right">Cant.</span>
            <span className="text-right">Costo</span>
            <span />
          </div>
          {inventory.map((it) => (
            <div
              key={it.id}
              className="group grid grid-cols-[2fr_60px_80px_40px] items-center gap-3 border-b border-line-2 px-5 py-3.5 last:border-b-0 hover:bg-hover"
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-title-2">{it.item_name}</div>
                {it.description && (
                  <div className="truncate text-xs text-faint">{it.description}</div>
                )}
              </div>
              <span className="num text-right text-[13.5px] text-sub">{it.quantity}</span>
              <span className="num text-right text-[13.5px] text-cat-discovery-text">{it.cost}</span>
              <div className="flex justify-end">
                <RemoveButton label={`Eliminar ${it.item_name}`} onClick={() => remove(it)} />
              </div>
            </div>
          ))}
        </div>
      )}

      <SubResourceModal
        open={open}
        onClose={() => setOpen(false)}
        title="Nuevo objeto"
        fields={[
          { name: 'item_name', label: 'Nombre', required: true },
          { name: 'quantity', label: 'Cantidad', type: 'number', default: 1 },
          { name: 'cost', label: 'Costo', type: 'number', default: 0 },
          { name: 'description', label: 'Descripción', textarea: true },
        ]}
        onSubmit={async (values) => {
          await api.createNpcItem(npcId, user.id, values);
          setOpen(false);
          await onChange();
        }}
        setError={setError}
      />
    </div>
  );
}

// ── Tab: Campañas (asociar / desasociar) ──────────────────────────────────────
function CampaignsTab({ user, npcId, linked, onChange, setError }) {
  const [all, setAll] = useState([]);

  useEffect(() => {
    api.listCampaigns(user.id).then(({ campaigns }) => setAll(campaigns ?? [])).catch(() => {});
  }, [user.id]);

  const linkedIds = new Set(linked.map((c) => String(c.id)));
  const available = all.filter((c) => !linkedIds.has(String(c.id)));

  async function link(campaignId) {
    try {
      await api.linkNpcCampaign(npcId, user.id, campaignId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function unlink(campaignId) {
    try {
      await api.unlinkNpcCampaign(npcId, campaignId, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[.7px] text-muted">
          Campañas asociadas
        </h3>
        {linked.length === 0 ? (
          <EmptyBlock text="Este NPC no está asociado a ninguna campaña." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {linked.map((c) => (
              <span
                key={c.id}
                className="flex items-center gap-2 rounded-pill border border-line bg-surface py-1.5 pl-3.5 pr-1.5 text-[13px] text-ink"
              >
                {c.name}
                <button
                  type="button"
                  onClick={() => unlink(c.id)}
                  className="flex h-5 w-5 items-center justify-center rounded-full text-faint hover:bg-danger-tint hover:text-danger-text"
                  aria-label={`Desasociar de ${c.name}`}
                >
                  <Icon name="x" size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
      </section>

      <section>
        <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[.7px] text-muted">
          Disponibles
        </h3>
        {available.length === 0 ? (
          <EmptyBlock text="No hay más campañas para asociar." />
        ) : (
          <div className="flex flex-wrap gap-2">
            {available.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => link(c.id)}
                className="flex items-center gap-1.5 rounded-pill border border-dashed border-line px-3.5 py-1.5 text-[13px] text-sub hover:border-accent hover:text-ink"
              >
                <Icon name="plus" size={13} />
                {c.name}
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Piezas reutilizables ───────────────────────────────────────────────────────
function EmptyBlock({ text }) {
  return (
    <p className="rounded-[12px] border border-dashed border-line px-4 py-8 text-center text-sm text-faint">
      {text}
    </p>
  );
}

function RemoveButton({ label, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-[7px] text-[#A87D72] opacity-0 transition-opacity hover:bg-danger-tint hover:text-danger-text focus:opacity-100 group-hover:opacity-100"
      aria-label={label}
    >
      <Icon name="trash" size={15} strokeWidth={1.8} />
    </button>
  );
}

// Modal de crear/editar NPC (nombre, disposición, sistema, descripción).
function NpcFormModal({ open, onClose, title, systems, npc, defaultSystemId = '', onSubmit, setError }) {
  const [name, setName] = useState('');
  const [disposition, setDisposition] = useState('neutral');
  const [gameSystemId, setGameSystemId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(npc?.name ?? '');
    setDisposition(npc?.disposition ?? 'neutral');
    setGameSystemId(npc?.game_system_id ? String(npc.game_system_id) : defaultSystemId || '');
    setDescription(npc?.description ?? '');
  }, [open, npc, defaultSystemId]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        disposition,
        game_system_id: gameSystemId ? Number(gameSystemId) : null,
        description,
      });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del NPC"
          className={inputCls}
        />
        <select
          value={disposition}
          onChange={(e) => setDisposition(e.target.value)}
          className={`${inputCls} text-idle`}
          aria-label="Disposición"
        >
          {DISPOSITIONS.map((d) => (
            <option key={d.value} value={d.value}>{d.label}</option>
          ))}
        </select>
        <select
          value={gameSystemId}
          onChange={(e) => setGameSystemId(e.target.value)}
          className={`${inputCls} text-idle`}
          aria-label="Sistema de juego"
        >
          <option value="">Sin sistema</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
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
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : npc ? 'Guardar cambios' : 'Crear NPC'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Modal genérico para crear sub-recursos (quest / objeto) a partir de una spec de campos.
function SubResourceModal({ open, onClose, title, fields, onSubmit, setError }) {
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const initial = {};
    for (const f of fields) initial[f.name] = f.default ?? '';
    setValues(initial);
  }, [open, fields]);

  const requiredField = fields.find((f) => f.required);
  const canSubmit = !requiredField || String(values[requiredField.name] ?? '').trim();

  async function submit(e) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    try {
      await onSubmit(values);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        {fields.map((f) =>
          f.textarea ? (
            <textarea
              key={f.name}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
              placeholder={f.label}
              rows={3}
              className={`${inputCls} resize-none`}
            />
          ) : (
            <input
              key={f.name}
              type={f.type === 'number' ? 'number' : 'text'}
              value={values[f.name] ?? ''}
              onChange={(e) => setValues((prev) => ({ ...prev, [f.name]: e.target.value }))}
              placeholder={f.label}
              className={`${inputCls}${f.type === 'number' ? ' num' : ''}`}
            />
          )
        )}
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !canSubmit}>
            {busy ? 'Guardando…' : 'Crear'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

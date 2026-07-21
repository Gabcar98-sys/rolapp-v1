import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import { abbreviate, glyphAccentIndex, initialGlyph } from '../lib/catalog.js';
import { formatDate } from '../lib/metrics.js';
import { inputCls, GLYPH_CLASSES, BADGE_CLASSES } from '../components/ui/catalogClasses.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

const ATTR_TYPES = ['number', 'text', 'boolean'];
const MECHANIC_TYPES = ['custom', 'inventory_weight', 'inventory_type', 'inventory_slot'];
const AFFECTS = ['general', 'inventory', 'equipment', 'attributes', 'combat'];
const PARAM_TYPES = ['text', 'number', 'boolean', 'list'];

// Bases de Atributos (F15): lista de sistemas → detalle con tabs Atributos /
// Personajes base / Slots de Equipamiento / Mecánicas / Documentos. Conserva
// import/export de packs JSON del builder anterior.
export default function AttributesPage({ user, onNavigate }) {
  const [systems, setSystems] = useState([]);
  const [detail, setDetail] = useState(null); // { system, attributes, equipmentSlots, mechanics }
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileRef = useRef(null);

  async function loadSystems() {
    try {
      const { systems: list } = await api.listGameSystems(user.id);
      setSystems(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadSystems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function openSystem(id) {
    setError('');
    try {
      setDetail(await api.getGameSystem(id));
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSystem(system) {
    if (!window.confirm(`¿Eliminar el sistema "${system.name}" y todo su contenido?`)) return;
    try {
      await api.deleteGameSystem(system.id, user.id);
      if (detail?.system.id === system.id) setDetail(null);
      await loadSystems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function importPack(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const pack = JSON.parse(await file.text());
      const { system } = await api.importGamePack(user.id, pack);
      setNotice(`Pack "${system.name}" importado correctamente.`);
      await loadSystems();
    } catch (err) {
      setError(`No se pudo importar: ${err.message}`);
    } finally {
      // Permite reimportar el mismo archivo (onChange no dispara si el value no cambia).
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function exportSystem(system) {
    setError('');
    try {
      const { pack } = await api.exportGameSystem(system.id);
      const blob = new Blob([JSON.stringify(pack, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${system.name.toLowerCase().replace(/\s+/g, '-')}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <Page maxWidthClass="max-w-[980px]">
      {detail ? (
        <SystemDetail
          user={user}
          detail={detail}
          onBack={() => {
            setDetail(null);
            loadSystems();
          }}
          onRefresh={() => openSystem(detail.system.id)}
          onExport={() => exportSystem(detail.system)}
          onNavigate={onNavigate}
          setError={setError}
          error={error}
        />
      ) : (
        <>
          <PageHeader
            title="Bases de Atributos"
            subtitle="Los atributos fundamentales sobre los que se construye cualquier ficha."
            actions={
              <>
                <input
                  ref={fileRef}
                  type="file"
                  accept="application/json,.json"
                  onChange={importPack}
                  className="hidden"
                  id="import-pack-input"
                />
                <Button variant="secondary" onClick={() => fileRef.current?.click()}>
                  <Icon name="upload" size={15} />
                  Importar pack
                </Button>
                <Button onClick={() => setCreateOpen(true)} className="px-[18px] py-[11px]">
                  <Icon name="plus" size={16} strokeWidth={2.3} />
                  Nuevo sistema
                </Button>
              </>
            }
          />

          {error && (
            <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
          )}
          {notice && (
            <p className="mb-4 rounded-btn bg-cat-explore-bg px-3 py-2 text-sm text-cat-explore-text">
              {notice}
            </p>
          )}

          {systems.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
              <Icon name="sliders" size={28} className="text-muted-2" />
              <p className="text-sm text-faint">
                Aún no tienes sistemas. Crea uno vacío o importa un pack de ejemplo.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
              <div className="grid grid-cols-[2fr_130px] gap-3.5 border-b border-line-2 px-5 py-3 text-[11px] font-bold uppercase tracking-[.7px] text-muted md:grid-cols-[2fr_110px_110px_130px]">
                <span>Sistema</span>
                <span className="hidden md:block">Atributos</span>
                <span className="hidden md:block">Creado</span>
                <span />
              </div>
              {systems.map((system) => (
                <div
                  key={system.id}
                  className="group grid grid-cols-[2fr_130px] items-center gap-3.5 border-b border-[#221E18] px-5 py-3.5 last:border-b-0 hover:bg-hover md:grid-cols-[2fr_110px_110px_130px]"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span
                      className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] font-serif text-[17px] font-semibold ${
                        GLYPH_CLASSES[glyphAccentIndex(system.id)]
                      }`}
                    >
                      {initialGlyph(system.name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate font-serif text-[17px] font-semibold text-title-2">
                        {system.name}
                      </div>
                      <div className="truncate text-xs text-faint">
                        {system.description || 'Sin descripción.'}
                      </div>
                    </div>
                  </div>
                  <span className="num hidden text-[13.5px] text-sub md:block">
                    {system.attribute_count}
                  </span>
                  <span className="hidden text-[13px] text-faint md:block">
                    {formatDate(system.created_at)}
                  </span>
                  <div className="flex justify-end gap-1.5">
                    <Button variant="secondary" size="sm" onClick={() => openSystem(system.id)}>
                      Abrir
                      <Icon name="arrow-right" size={13} />
                    </Button>
                    <button
                      type="button"
                      onClick={() => exportSystem(system)}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-faint hover:bg-[#2E2A22] hover:text-ink"
                      aria-label={`Exportar ${system.name}`}
                    >
                      <Icon name="download" size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteSystem(system)}
                      className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                      aria-label={`Eliminar ${system.name}`}
                    >
                      <Icon name="trash" size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <CreateSystemModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSubmit={async ({ name, description }) => {
          await api.createGameSystem(user.id, name, description);
          setCreateOpen(false);
          await loadSystems();
        }}
        setError={setError}
      />
    </Page>
  );
}

function CreateSystemModal({ open, onClose, onSubmit, setError }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setDescription('');
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), description });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo sistema de juego">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del sistema"
          className={inputCls}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
          className={`${inputCls} resize-none`}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creando…' : 'Crear sistema'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Detalle de un sistema: tabs ───────────────────────────────────────────────
function SystemDetail({ user, detail, onBack, onRefresh, onExport, onNavigate, setError, error }) {
  const { system } = detail;
  const [tab, setTab] = useState('attributes');
  const tabs = [
    { id: 'attributes', label: 'Atributos' },
    { id: 'base-characters', label: 'Personajes base' },
    { id: 'slots', label: 'Slots de Equipamiento' },
    { id: 'mechanics', label: 'Mecánicas' },
    { id: 'docs', label: 'Documentos' },
  ];

  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
        >
          <Icon name="arrow-left" size={14} />
          Sistemas
        </button>
      </div>
      <PageHeader
        title={system.name}
        subtitle={system.description || 'Configura los cimientos del sistema de juego.'}
        actions={
          <Button variant="secondary" onClick={onExport}>
            <Icon name="download" size={15} />
            Exportar pack
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} className="mb-5" />

      {tab === 'attributes' && (
        <AttributesTab user={user} detail={detail} onChange={onRefresh} setError={setError} />
      )}
      {tab === 'base-characters' && (
        <BaseCharactersTab user={user} systemId={system.id} onNavigate={onNavigate} setError={setError} />
      )}
      {tab === 'slots' && (
        <SlotsTab user={user} detail={detail} onChange={onRefresh} setError={setError} />
      )}
      {tab === 'mechanics' && (
        <MechanicsTab user={user} detail={detail} onChange={onRefresh} setError={setError} />
      )}
      {tab === 'docs' && <DocsTab user={user} systemId={system.id} setError={setError} />}
    </>
  );
}

// ── Tab Atributos: form de alta + lista agrupada por categoría ────────────────
function AttributesTab({ user, detail, onChange, setError }) {
  const systemId = detail.system.id;
  const [name, setName] = useState('');
  const [type, setType] = useState('number');
  const [category, setCategory] = useState('general');
  const [isCore, setIsCore] = useState(false);
  const [hasMax, setHasMax] = useState(false);
  const [formula, setFormula] = useState('');

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createAttribute(systemId, user.id, {
        name: name.trim(),
        type,
        category: category.trim() || 'general',
        is_core: isCore,
        has_max: hasMax,
        formula: formula.trim(),
        sort_order: detail.attributes.length,
      });
      setName('');
      setFormula('');
      setIsCore(false);
      setHasMax(false);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(attr) {
    if (!window.confirm(`¿Eliminar el atributo "${attr.name}"?`)) return;
    try {
      await api.deleteAttribute(systemId, attr.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  // Agrupación por categoría respetando el orden del backend (category, sort_order).
  const grouped = detail.attributes.reduce((acc, attr) => {
    (acc[attr.category] = acc[attr.category] || []).push(attr);
    return acc;
  }, {});

  const typeBadge = (t) =>
    ({ number: BADGE_CLASSES[3], text: BADGE_CLASSES[4], boolean: BADGE_CLASSES[1] })[t] ??
    BADGE_CLASSES[4];

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
          Nuevo atributo
        </h3>
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (p. ej. Fuerza)"
              className={`flex-1 ${inputCls}`}
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className={`md:w-32 ${inputCls}`}>
              {ATTR_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Categoría"
              className={`md:w-40 ${inputCls}`}
            />
          </div>
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="Fórmula derivada (opcional, p. ej. 10 + Fuerza)"
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-sub">
              <input
                type="checkbox"
                checked={isCore}
                onChange={(e) => setIsCore(e.target.checked)}
                className="h-4 w-4 accent-[#CE6A3A]"
              />
              Atributo core
            </label>
            <label className="flex items-center gap-2 text-sm text-sub">
              <input
                type="checkbox"
                checked={hasMax}
                onChange={(e) => setHasMax(e.target.checked)}
                className="h-4 w-4 accent-[#CE6A3A]"
              />
              Tiene máximo
            </label>
            <Button size="sm" type="submit" className="ml-auto" disabled={!name.trim()}>
              <Icon name="plus" size={14} />
              Atributo
            </Button>
          </div>
        </form>
      </Card>

      {detail.attributes.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">Este sistema aún no tiene atributos.</p>
      ) : (
        Object.entries(grouped).map(([category, attrs]) => (
          <section key={category}>
            <h3 className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px] text-muted-2">
              {category}
            </h3>
            <div className="flex flex-col gap-3">
              {attrs.map((attr) => (
                <div
                  key={attr.id}
                  className="group flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-4 transition-colors hover:border-line-hover"
                >
                  <span
                    className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-[11px] font-serif text-[15px] font-semibold ${
                      GLYPH_CLASSES[glyphAccentIndex(attr.id)]
                    }`}
                  >
                    {abbreviate(attr.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-serif text-lg font-semibold text-title-2">{attr.name}</span>
                      <span
                        className={`rounded-pill px-[9px] py-[2px] text-[10.5px] font-bold uppercase tracking-[.4px] ${typeBadge(attr.type)}`}
                      >
                        {attr.type}
                      </span>
                      {Boolean(attr.is_core) && (
                        <span className="rounded-pill bg-accent-tint px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[.4px] text-accent-text">
                          core
                        </span>
                      )}
                      {Boolean(attr.has_max) && (
                        <span className="rounded-pill bg-[#2A2620] px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[.4px] text-faint">
                          con máx
                        </span>
                      )}
                    </div>
                    {attr.formula && (
                      <p className="mt-0.5 truncate text-[13px] text-faint">Fórmula: {attr.formula}</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => remove(attr)}
                    className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-btn text-[#A87D72] opacity-0 transition-opacity hover:bg-danger-tint hover:text-danger-text focus:opacity-100 group-hover:opacity-100"
                    aria-label={`Eliminar ${attr.name}`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

// ── Tab Personajes base del sistema ───────────────────────────────────────────
function BaseCharactersTab({ user, systemId, onNavigate, setError }) {
  const [baseChars, setBaseChars] = useState([]);

  useEffect(() => {
    api
      .listBaseCharacters(user.id, systemId)
      .then(({ baseCharacters }) => setBaseChars(baseCharacters ?? []))
      .catch((err) => setError(err.message));
  }, [user.id, systemId, setError]);

  return (
    <div className="flex flex-col gap-3">
      {baseChars.length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">
          Este sistema aún no tiene personajes base.
        </p>
      ) : (
        baseChars.map((bc) => (
          <div
            key={bc.id}
            className="flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-3.5"
          >
            <span
              className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] font-serif text-[17px] font-semibold ${
                GLYPH_CLASSES[glyphAccentIndex(bc.id)]
              }`}
            >
              {initialGlyph(bc.name)}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-title-2">{bc.name}</div>
              <div className="num text-xs text-faint">
                {bc.attrs?.length ?? 0} atributos · {bc.skillLinks?.length ?? 0} habilidades ·{' '}
                {bc.inventory?.length ?? 0} items
              </div>
            </div>
          </div>
        ))
      )}
      {onNavigate && (
        <button
          type="button"
          onClick={() => onNavigate('base-characters')}
          className="flex items-center gap-1 self-start text-[12.5px] font-semibold text-accent-text hover:text-accent-hover"
        >
          Gestionar en Personajes Base
          <Icon name="arrow-right" size={12} />
        </button>
      )}
    </div>
  );
}

// ── Tab Slots de Equipamiento ─────────────────────────────────────────────────
function SlotsTab({ user, detail, onChange, setError }) {
  const systemId = detail.system.id;
  const [name, setName] = useState('');
  const [slotKey, setSlotKey] = useState('');
  const [maxItems, setMaxItems] = useState(1);

  async function add(e) {
    e.preventDefault();
    if (!name.trim() || !slotKey.trim()) return;
    try {
      await api.createEquipmentSlot(systemId, user.id, {
        name: name.trim(),
        slot_key: slotKey.trim(),
        max_items: Number(maxItems) || 1,
        sort_order: detail.equipmentSlots.length,
      });
      setName('');
      setSlotKey('');
      setMaxItems(1);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(slot) {
    if (!window.confirm(`¿Eliminar el slot "${slot.name}"?`)) return;
    try {
      await api.deleteEquipmentSlot(systemId, slot.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
          Nuevo slot
        </h3>
        <form onSubmit={add} className="flex flex-col gap-3 md:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre (p. ej. Mano principal)"
            className={`flex-1 ${inputCls}`}
          />
          <input
            value={slotKey}
            onChange={(e) => setSlotKey(e.target.value)}
            placeholder="Clave (p. ej. main_hand)"
            className={`md:w-48 ${inputCls}`}
          />
          <input
            type="number"
            min="1"
            value={maxItems}
            onChange={(e) => setMaxItems(e.target.value)}
            className={`md:w-24 ${inputCls}`}
            aria-label="Tamaño (máximo de objetos)"
          />
          <Button size="sm" type="submit" disabled={!name.trim() || !slotKey.trim()}>
            <Icon name="plus" size={14} />
            Slot
          </Button>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {detail.equipmentSlots.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">Sin slots de equipamiento.</p>
        ) : (
          detail.equipmentSlots.map((slot) => (
            <div
              key={slot.id}
              className="group flex items-center gap-4 rounded-card border border-line bg-surface px-5 py-3.5"
            >
              <span className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[9px] bg-[#2A2620] text-faint">
                <Icon name="shield" size={16} />
              </span>
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-title-2">{slot.name}</span>
                <span className="num ml-2 text-xs text-faint">
                  {slot.slot_key} · máx {slot.max_items}
                </span>
              </div>
              <button
                type="button"
                onClick={() => remove(slot)}
                className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-btn text-[#A87D72] opacity-0 transition-opacity hover:bg-danger-tint hover:text-danger-text focus:opacity-100 group-hover:opacity-100"
                aria-label={`Eliminar ${slot.name}`}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tab Mecánicas: CRUD con tipo, affect y parámetros dinámicos ───────────────
function MechanicsTab({ user, detail, onChange, setError }) {
  const systemId = detail.system.id;
  const [name, setName] = useState('');
  const [mechanicType, setMechanicType] = useState('custom');
  const [affects, setAffects] = useState('general');
  const [description, setDescription] = useState('');
  const [paramDrafts, setParamDrafts] = useState({}); // { mechId: { name, type, value } }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createMechanic(systemId, user.id, {
        name: name.trim(),
        mechanic_type: mechanicType,
        affects,
        description: description.trim(),
      });
      setName('');
      setMechanicType('custom');
      setAffects('general');
      setDescription('');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(mech) {
    if (!window.confirm(`¿Eliminar la mecánica "${mech.name}" y sus parámetros?`)) return;
    try {
      await api.deleteMechanic(systemId, mech.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addParam(mech) {
    const draft = paramDrafts[mech.id] ?? {};
    if (!draft.name?.trim()) return;
    try {
      await api.createMechanicParam(systemId, mech.id, user.id, {
        param_name: draft.name.trim(),
        param_type: draft.type ?? 'text',
        param_value: draft.value ?? '',
        sort_order: mech.params.length,
      });
      setParamDrafts((prev) => ({ ...prev, [mech.id]: { name: '', type: 'text', value: '' } }));
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeParam(mech, param) {
    try {
      await api.deleteMechanicParam(systemId, mech.id, param.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
          Nueva mecánica
        </h3>
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre (p. ej. Peso de inventario)"
              className={`flex-1 ${inputCls}`}
            />
            <select
              value={mechanicType}
              onChange={(e) => setMechanicType(e.target.value)}
              className={`md:w-48 ${inputCls}`}
              aria-label="Tipo de mecánica"
            >
              {MECHANIC_TYPES.map((t) => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
            <select
              value={affects}
              onChange={(e) => setAffects(e.target.value)}
              className={`md:w-40 ${inputCls}`}
              aria-label="Ámbito que afecta"
            >
              {AFFECTS.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-3">
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descripción (opcional)"
              className={`flex-1 ${inputCls}`}
            />
            <Button size="sm" type="submit" disabled={!name.trim()}>
              <Icon name="plus" size={14} />
              Mecánica
            </Button>
          </div>
        </form>
      </Card>

      <div className="flex flex-col gap-3">
        {detail.mechanics.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">Sin mecánicas configuradas.</p>
        ) : (
          detail.mechanics.map((mech) => (
            <Card key={mech.id} className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-serif text-[17px] font-semibold text-title-2">
                      {mech.name}
                    </span>
                    <span className={`rounded-pill px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[.4px] ${BADGE_CLASSES[0]}`}>
                      {mech.mechanic_type}
                    </span>
                    <span className={`rounded-pill px-2 py-[2px] text-[10.5px] font-bold uppercase tracking-[.4px] ${BADGE_CLASSES[1]}`}>
                      {mech.affects}
                    </span>
                  </div>
                  {mech.description && (
                    <p className="mt-1 text-[13px] text-faint">{mech.description}</p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(mech)}
                  className="flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-btn text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                  aria-label={`Eliminar ${mech.name}`}
                >
                  <Icon name="trash" size={15} />
                </button>
              </div>

              {mech.params.length > 0 && (
                <div className="mt-3 flex flex-col gap-1.5 border-t border-line-2 pt-3">
                  {mech.params.map((p) => (
                    <div key={p.id} className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold text-ink">{p.param_name}</span>
                      <span className="rounded-pill bg-[#2A2620] px-2 py-[1px] text-[10px] font-semibold uppercase text-faint">
                        {p.param_type}
                      </span>
                      <span className="num min-w-0 flex-1 truncate text-sub">
                        {p.param_value || '—'}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeParam(mech, p)}
                        className="text-faint hover:text-danger-text"
                        aria-label={`Eliminar parámetro ${p.param_name}`}
                      >
                        <Icon name="x" size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                <input
                  value={paramDrafts[mech.id]?.name ?? ''}
                  onChange={(e) =>
                    setParamDrafts((prev) => ({
                      ...prev,
                      [mech.id]: { ...prev[mech.id], name: e.target.value },
                    }))
                  }
                  placeholder="Parámetro (p. ej. max_weight)"
                  className={`flex-1 ${inputCls}`}
                />
                <select
                  value={paramDrafts[mech.id]?.type ?? 'text'}
                  onChange={(e) =>
                    setParamDrafts((prev) => ({
                      ...prev,
                      [mech.id]: { ...prev[mech.id], type: e.target.value },
                    }))
                  }
                  className={`md:w-32 ${inputCls}`}
                  aria-label="Tipo del parámetro"
                >
                  {PARAM_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <input
                  value={paramDrafts[mech.id]?.value ?? ''}
                  onChange={(e) =>
                    setParamDrafts((prev) => ({
                      ...prev,
                      [mech.id]: { ...prev[mech.id], value: e.target.value },
                    }))
                  }
                  placeholder="Valor por defecto"
                  className={`md:w-44 ${inputCls}`}
                />
                <Button size="sm" variant="secondary" onClick={() => addParam(mech)}>
                  <Icon name="plus" size={13} />
                  Parámetro
                </Button>
              </div>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

// ── Tab Documentos (RAG): se conserva la gestión de docs del builder anterior ──
function DocsTab({ user, systemId, setError }) {
  const [docs, setDocs] = useState([]);
  const [vecEnabled, setVecEnabled] = useState(true);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  async function load() {
    try {
      const { docs: list, vecEnabled: vec } = await api.listDocs(systemId);
      setDocs(list);
      setVecEnabled(vec);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId]);

  async function ingest(e) {
    e.preventDefault();
    if (!title.trim() || !content.trim()) return;
    setBusy(true);
    try {
      await api.ingestDoc(systemId, user.id, title.trim(), content);
      setTitle('');
      setContent('');
      await load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function loadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setContent(text);
    if (!title.trim()) setTitle(file.name.replace(/\.md$/i, ''));
    if (fileRef.current) fileRef.current.value = '';
  }

  async function remove(doc) {
    if (!window.confirm(`¿Eliminar el documento "${doc.title}" y sus chunks?`)) return;
    try {
      await api.deleteDoc(systemId, doc.id, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs text-faint">
        Índice vectorial:{' '}
        {vecEnabled ? (
          <span className="text-cat-explore-text">activo</span>
        ) : (
          <span className="text-cat-discovery-text">inactivo (solo keyword/FTS)</span>
        )}
      </p>

      <div className="flex flex-col gap-2.5">
        {docs.length === 0 ? (
          <p className="py-4 text-center text-sm text-faint">Aún no hay documentos indexados.</p>
        ) : (
          docs.map((doc) => (
            <div
              key={doc.id}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-5 py-3"
            >
              <Icon name="file" size={16} className="text-faint" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold text-title-2">{doc.title}</span>
                <span className="num ml-2 text-xs text-faint">{doc.chunk_count} chunks</span>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() =>
                  api.reindexDoc(systemId, doc.id, user.id).then(load).catch((err) => setError(err.message))
                }
              >
                Reindexar
              </Button>
              <button
                type="button"
                onClick={() => remove(doc)}
                className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                aria-label={`Eliminar ${doc.title}`}
              >
                <Icon name="trash" size={15} />
              </button>
            </div>
          ))
        )}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
          Nuevo documento (.md)
        </h3>
        <form onSubmit={ingest} className="flex flex-col gap-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Título del documento"
              className={`flex-1 ${inputCls}`}
            />
            <input
              ref={fileRef}
              type="file"
              accept=".md,text/markdown,text/plain"
              onChange={loadFile}
              className="hidden"
              id="doc-file-input"
            />
            <Button variant="secondary" size="sm" type="button" onClick={() => fileRef.current?.click()}>
              <Icon name="upload" size={14} />
              Cargar .md
            </Button>
          </div>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="Contenido Markdown (reglas, lore, tablas…)"
            rows={6}
            className={`${inputCls} resize-none`}
          />
          <Button size="sm" type="submit" disabled={busy || !title.trim() || !content.trim()} className="ml-auto">
            {busy ? 'Indexando…' : 'Indexar documento'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

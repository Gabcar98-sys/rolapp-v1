import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Tabs from '../ui/Tabs.jsx';
import SkillsPanel from './SkillsPanel.jsx';
import ItemsPanel from './ItemsPanel.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

const ATTR_TYPES = ['number', 'text', 'boolean'];
const MECHANIC_TYPES = ['custom', 'inventory_weight', 'inventory_type', 'inventory_slot'];
const AFFECTS = ['general', 'inventory', 'equipment', 'attributes', 'combat'];

// Builder de sistemas de juego: lista/crea/edita/elimina sistemas, importa/exporta packs
// y, dentro de cada sistema, edita atributos, slots, mecánicas, habilidades y objetos.
export default function GameSystemPanel({ user }) {
  const [systems, setSystems] = useState([]);
  const [selected, setSelected] = useState(null); // detalle del sistema { system, attributes, equipmentSlots, mechanics }
  const [tab, setTab] = useState('attributes');
  const [newSystemName, setNewSystemName] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const fileInputRef = useRef(null);

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
      const detail = await api.getGameSystem(id);
      setSelected(detail);
      setTab('attributes');
    } catch (err) {
      setError(err.message);
    }
  }

  async function refreshSelected() {
    if (selected) await openSystem(selected.system.id);
  }

  async function createSystem(e) {
    e.preventDefault();
    if (!newSystemName.trim()) return;
    setError('');
    try {
      await api.createGameSystem(user.id, newSystemName.trim());
      setNewSystemName('');
      await loadSystems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteSystem(system) {
    if (!window.confirm(`¿Eliminar el sistema "${system.name}" y todo su contenido?`)) return;
    setError('');
    try {
      await api.deleteGameSystem(system.id, user.id);
      if (selected?.system.id === system.id) setSelected(null);
      await loadSystems();
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleImportFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const text = await file.text();
      const pack = JSON.parse(text);
      const { system } = await api.importGamePack(user.id, pack);
      setNotice(`Pack "${system.name}" importado correctamente.`);
      await loadSystems();
    } catch (err) {
      setError(`No se pudo importar: ${err.message}`);
    } finally {
      // Permite reimportar el mismo archivo (onChange no dispara si el value no cambia).
      if (fileInputRef.current) fileInputRef.current.value = '';
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

  // ── Vista de detalle de un sistema ──────────────────────────────────────────
  if (selected) {
    const { system } = selected;
    const tabs = [
      { id: 'attributes', label: 'Atributos' },
      { id: 'slots', label: 'Equipo' },
      { id: 'mechanics', label: 'Mecánicas' },
      { id: 'skills', label: 'Habilidades' },
      { id: 'items', label: 'Objetos' },
    ];
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold text-gold">{system.name}</h2>
            {system.description && <p className="text-xs text-gray-400">{system.description}</p>}
          </div>
          <Button variant="secondary" size="sm" onClick={() => setSelected(null)}>
            ← Sistemas
          </Button>
        </div>

        {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

        <Tabs tabs={tabs} activeId={tab} onChange={setTab} />

        {tab === 'attributes' && (
          <AttributeEditor user={user} detail={selected} onChange={refreshSelected} setError={setError} />
        )}
        {tab === 'slots' && (
          <SlotEditor user={user} detail={selected} onChange={refreshSelected} setError={setError} />
        )}
        {tab === 'mechanics' && (
          <MechanicEditor user={user} detail={selected} onChange={refreshSelected} setError={setError} />
        )}
        {tab === 'skills' && <SkillsPanel user={user} systemId={system.id} />}
        {tab === 'items' && <ItemsPanel user={user} systemId={system.id} />}
      </div>
    );
  }

  // ── Vista de lista de sistemas ──────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}
      {notice && <p className="rounded-md bg-success/20 px-3 py-2 text-sm text-green-300">{notice}</p>}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Nuevo sistema de juego</h3>
        <div className="flex flex-col gap-3">
          <form onSubmit={createSystem} className="flex flex-col gap-3 md:flex-row">
            <input
              value={newSystemName}
              onChange={(e) => setNewSystemName(e.target.value)}
              placeholder="Nombre del sistema"
              className={`flex-1 ${inputCls}`}
            />
            <Button type="submit">Crear vacío</Button>
          </form>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
              id="import-pack-input"
            />
            <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()}>
              ⬆ Importar pack (.json)
            </Button>
          </div>
        </div>
      </Card>

      <section className="flex flex-col gap-3">
        {systems.length === 0 ? (
          <p className="text-center text-sm text-gray-500">
            Aún no tienes sistemas. Crea uno o importa un pack de ejemplo.
          </p>
        ) : (
          systems.map((system) => (
            <Card key={system.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{system.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">{system.attribute_count} atributos</p>
              </div>
              <div className="ml-3 flex flex-shrink-0 gap-2">
                <Button size="sm" onClick={() => openSystem(system.id)}>
                  Editar
                </Button>
                <Button variant="secondary" size="sm" onClick={() => exportSystem(system)}>
                  Exportar
                </Button>
                <Button variant="danger" size="sm" onClick={() => deleteSystem(system)}>
                  🗑
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

// ── Editor de atributos ─────────────────────────────────────────────────────
function AttributeEditor({ user, detail, onChange, setError }) {
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
    try {
      await api.deleteAttribute(systemId, attr.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {detail.attributes.map((attr) => (
          <div
            key={attr.id}
            className="flex items-center justify-between rounded-md border border-ink-line bg-ink-900 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm text-gray-100">{attr.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {attr.category} · {attr.type}
                {attr.is_core ? ' · core' : ''}
                {attr.has_max ? ' · max' : ''}
                {attr.formula ? ` · ${attr.formula}` : ''}
              </span>
            </div>
            <button
              onClick={() => remove(attr)}
              className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
              aria-label={`Eliminar ${attr.name}`}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <Card className="p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Nuevo atributo
        </h4>
        <form onSubmit={add} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nombre"
              className={`flex-1 ${inputCls}`}
            />
            <input
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              placeholder="Categoría"
              className={`md:w-40 ${inputCls}`}
            />
            <select value={type} onChange={(e) => setType(e.target.value)} className={`md:w-32 ${inputCls}`}>
              {ATTR_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <input
            value={formula}
            onChange={(e) => setFormula(e.target.value)}
            placeholder="Fórmula derivada (opcional, p. ej. 10 + Strength)"
            className={inputCls}
          />
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={isCore} onChange={(e) => setIsCore(e.target.checked)} className="accent-gold" />
              is_core
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-300">
              <input type="checkbox" checked={hasMax} onChange={(e) => setHasMax(e.target.checked)} className="accent-gold" />
              has_max
            </label>
            <Button size="sm" type="submit" className="ml-auto">
              + Atributo
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// ── Editor de slots de equipo ────────────────────────────────────────────────
function SlotEditor({ user, detail, onChange, setError }) {
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
    try {
      await api.deleteEquipmentSlot(systemId, slot.id, user.id);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        {detail.equipmentSlots.map((slot) => (
          <div
            key={slot.id}
            className="flex items-center justify-between rounded-md border border-ink-line bg-ink-900 px-3 py-2"
          >
            <div className="min-w-0">
              <span className="text-sm text-gray-100">{slot.name}</span>
              <span className="ml-2 text-xs text-gray-500">
                {slot.slot_key} · máx {slot.max_items}
              </span>
            </div>
            <button
              onClick={() => remove(slot)}
              className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
              aria-label={`Eliminar ${slot.name}`}
            >
              🗑
            </button>
          </div>
        ))}
      </div>

      <Card className="p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Nuevo slot</h4>
        <form onSubmit={add} className="flex flex-col gap-3 md:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={`flex-1 ${inputCls}`} />
          <input value={slotKey} onChange={(e) => setSlotKey(e.target.value)} placeholder="slot_key" className={`md:w-40 ${inputCls}`} />
          <input
            type="number"
            min="1"
            value={maxItems}
            onChange={(e) => setMaxItems(e.target.value)}
            className={`md:w-24 ${inputCls}`}
            aria-label="Máximo de objetos"
          />
          <Button size="sm" type="submit">
            + Slot
          </Button>
        </form>
      </Card>
    </div>
  );
}

// ── Editor de mecánicas (+ params) ───────────────────────────────────────────
function MechanicEditor({ user, detail, onChange, setError }) {
  const systemId = detail.system.id;
  const [name, setName] = useState('');
  const [mechanicType, setMechanicType] = useState('custom');
  const [affects, setAffects] = useState('general');
  const [paramDrafts, setParamDrafts] = useState({}); // { mechId: { name, value } }

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.createMechanic(systemId, user.id, {
        name: name.trim(),
        mechanic_type: mechanicType,
        affects,
      });
      setName('');
      setMechanicType('custom');
      setAffects('general');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(mech) {
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
        param_value: draft.value ?? '',
        sort_order: mech.params.length,
      });
      setParamDrafts((prev) => ({ ...prev, [mech.id]: { name: '', value: '' } }));
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3">
        {detail.mechanics.map((mech) => (
          <Card key={mech.id} className="p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <span className="text-sm text-gray-100">{mech.name}</span>
                <span className="ml-2 text-xs text-gray-500">
                  {mech.mechanic_type} · {mech.affects}
                </span>
              </div>
              <button
                onClick={() => remove(mech)}
                className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
                aria-label={`Eliminar ${mech.name}`}
              >
                🗑
              </button>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {mech.params.map((p) => (
                <div key={p.id} className="flex items-center justify-between text-xs text-gray-400">
                  <span>
                    {p.param_name}: {p.param_value}
                  </span>
                  <button
                    onClick={() => removeParam(mech, p)}
                    className="text-gray-600 hover:text-danger"
                    aria-label={`Eliminar parámetro ${p.param_name}`}
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-2 flex gap-2">
              <input
                value={paramDrafts[mech.id]?.name ?? ''}
                onChange={(e) =>
                  setParamDrafts((prev) => ({ ...prev, [mech.id]: { ...prev[mech.id], name: e.target.value } }))
                }
                placeholder="param"
                className={`flex-1 ${inputCls}`}
              />
              <input
                value={paramDrafts[mech.id]?.value ?? ''}
                onChange={(e) =>
                  setParamDrafts((prev) => ({ ...prev, [mech.id]: { ...prev[mech.id], value: e.target.value } }))
                }
                placeholder="valor"
                className={`flex-1 ${inputCls}`}
              />
              <Button size="sm" variant="secondary" onClick={() => addParam(mech)}>
                + Param
              </Button>
            </div>
          </Card>
        ))}
      </div>

      <Card className="p-4">
        <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gray-500">Nueva mecánica</h4>
        <form onSubmit={add} className="flex flex-col gap-3 md:flex-row">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre" className={`flex-1 ${inputCls}`} />
          <select value={mechanicType} onChange={(e) => setMechanicType(e.target.value)} className={`md:w-44 ${inputCls}`}>
            {MECHANIC_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={affects} onChange={(e) => setAffects(e.target.value)} className={`md:w-36 ${inputCls}`}>
            {AFFECTS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
          <Button size="sm" type="submit">
            + Mecánica
          </Button>
        </form>
      </Card>
    </div>
  );
}

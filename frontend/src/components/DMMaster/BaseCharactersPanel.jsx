import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

// El DM gestiona personajes base (pregens) por sistema de juego: crea, edita atributos
// (desde la plantilla del sistema), inventario y skills del catálogo. Los jugadores
// pueden adoptarlos desde "Mis personajes".
export default function BaseCharactersPanel({ user }) {
  const [systems, setSystems] = useState([]);
  const [baseChars, setBaseChars] = useState([]);
  const [selected, setSelected] = useState(null); // pregen expandido (ficha completa)
  const [form, setForm] = useState({ name: '', game_system_id: '', avatar_icon: '🧙' });
  const [error, setError] = useState('');

  async function load() {
    try {
      const { baseCharacters } = await api.listBaseCharacters(user.id);
      setBaseChars(baseCharacters);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    api.listGameSystems(user.id).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function create(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError('');
    try {
      await api.createBaseCharacter(user.id, {
        name: form.name.trim(),
        game_system_id: form.game_system_id || null,
        avatar_icon: form.avatar_icon || '🧙',
      });
      setForm({ name: '', game_system_id: '', avatar_icon: '🧙' });
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(bc) {
    if (!window.confirm(`¿Eliminar el pregen "${bc.name}"?`)) return;
    setError('');
    try {
      await api.deleteBaseCharacter(bc.id, user.id);
      if (selected?.id === bc.id) setSelected(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  async function open(bcId) {
    setError('');
    try {
      const { baseCharacter } = await api.getBaseCharacter(bcId);
      setSelected(baseCharacter);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Nuevo personaje base</h3>
        <form onSubmit={create} className="flex flex-col gap-3">
          <div className="flex flex-col gap-3 md:flex-row">
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nombre"
              className={`flex-1 ${inputCls}`}
            />
            <input
              value={form.avatar_icon}
              onChange={(e) => setForm((p) => ({ ...p, avatar_icon: e.target.value }))}
              placeholder="🧙"
              className={`w-20 text-center ${inputCls}`}
              aria-label="Icono"
            />
          </div>
          <div className="flex flex-col gap-3 md:flex-row">
            <select
              value={form.game_system_id}
              onChange={(e) => setForm((p) => ({ ...p, game_system_id: e.target.value }))}
              className={`flex-1 ${inputCls}`}
            >
              <option value="">— Sistema de juego —</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <Button type="submit">Crear pregen</Button>
          </div>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        {baseChars.length === 0 ? (
          <p className="text-center text-sm text-gray-500">Aún no tienes personajes base.</p>
        ) : (
          baseChars.map((bc) => (
            <Card key={bc.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-2xl">{bc.avatar_icon}</span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-gray-100">{bc.name}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {bc.game_system_name || 'Sin sistema'} · {bc.is_public ? 'público' : 'privado'}
                    </p>
                  </div>
                </div>
                <div className="ml-3 flex flex-shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => (selected?.id === bc.id ? setSelected(null) : open(bc.id))}
                  >
                    {selected?.id === bc.id ? 'Cerrar' : 'Editar'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => remove(bc)}>
                    🗑
                  </Button>
                </div>
              </div>

              {selected?.id === bc.id && (
                <BaseCharacterEditor
                  base={selected}
                  systems={systems}
                  user={user}
                  onChange={() => open(bc.id)}
                  setError={setError}
                />
              )}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

// Editor del pregen seleccionado: atributos (según el sistema), inventario y skills del catálogo.
function BaseCharacterEditor({ base, systems, user, onChange, setError }) {
  const [attrDefs, setAttrDefs] = useState([]);
  const [draft, setDraft] = useState({});
  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [itemName, setItemName] = useState('');

  useEffect(() => {
    if (base.game_system_id) {
      api
        .getGameSystem(base.game_system_id)
        .then((detail) => {
          const defs = detail.attributes ?? [];
          setAttrDefs(defs);
          const init = {};
          for (const def of defs) {
            const existing = base.attrs?.find((a) => a.attribute_template_id === def.id);
            init[def.id] = existing?.value ?? '';
          }
          setDraft(init);
        })
        .catch(() => {});
      api.listSkillFormats(user.id, base.game_system_id).then(({ formats: f }) => setFormats(f ?? [])).catch(() => {});
    } else {
      setAttrDefs([]);
    }
  }, [base, user.id]);

  async function saveAttrs() {
    const attrs = attrDefs.map((def) => ({
      attribute_template_id: def.id,
      attr_name: def.name,
      attr_type: def.type,
      attr_category: def.category,
      value: draft[def.id] ?? '',
    }));
    try {
      await api.setBaseCharacterAttrs(base.id, user.id, attrs);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function pickFormat(formatId) {
    setSelectedFormat(formatId);
    if (!formatId) {
      setCatalog([]);
      return;
    }
    try {
      const { format } = await api.getSkillFormat(formatId);
      setCatalog(format.skills ?? []);
    } catch (err) {
      setError(err.message);
    }
  }

  const linkedIds = new Set((base.skillLinks ?? []).map((s) => s.skill_id));

  async function toggleSkill(skillId, isLinked) {
    try {
      if (isLinked) await api.unlinkBaseCharacterSkill(base.id, user.id, skillId);
      else await api.linkBaseCharacterSkill(base.id, user.id, skillId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addItem(e) {
    e.preventDefault();
    if (!itemName.trim()) return;
    try {
      await api.addBaseCharacterItem(base.id, user.id, { item_name: itemName.trim() });
      setItemName('');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeItem(itemId) {
    try {
      await api.deleteBaseCharacterItem(base.id, user.id, itemId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-ink-line pt-4">
      {/* Atributos */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">Atributos</h4>
        {attrDefs.length === 0 ? (
          <p className="text-xs text-gray-500">
            {base.game_system_id ? 'El sistema no tiene atributos.' : 'Asigna un sistema de juego para editar atributos.'}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {attrDefs.map((def) => (
              <div key={def.id} className="flex items-center gap-2">
                <label className="w-28 flex-shrink-0 text-sm text-gray-300">{def.name}</label>
                <input
                  value={draft[def.id] ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, [def.id]: e.target.value }))}
                  className={`flex-1 ${inputCls}`}
                  type={def.type === 'number' ? 'number' : 'text'}
                />
              </div>
            ))}
            <Button size="sm" onClick={saveAttrs} className="self-start">
              Guardar atributos
            </Button>
          </div>
        )}
      </div>

      {/* Skills del catálogo */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Habilidades ({base.skillLinks?.length ?? 0})
        </h4>
        <div className="mb-2 flex flex-wrap gap-2">
          {(base.skillLinks ?? []).map((sk) => (
            <span
              key={sk.skill_id}
              className="flex items-center gap-1 rounded-md border border-ink-line bg-ink-900 px-2 py-1 text-xs text-gray-300"
            >
              {sk.skill_name}
              <button
                onClick={() => toggleSkill(sk.skill_id, true)}
                className="text-gray-500 hover:text-danger"
                aria-label={`Quitar ${sk.skill_name}`}
              >
                ✕
              </button>
            </span>
          ))}
        </div>
        <select value={selectedFormat} onChange={(e) => pickFormat(e.target.value)} className={`mb-2 w-full ${inputCls}`}>
          <option value="">— Formato de habilidad —</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        {selectedFormat && (
          <div className="flex max-h-40 flex-col gap-1 overflow-y-auto">
            {catalog.map((sk) => {
              const isLinked = linkedIds.has(sk.id);
              return (
                <label key={sk.id} className="flex cursor-pointer items-center gap-2 rounded-md bg-ink-900 px-2 py-1">
                  <input type="checkbox" checked={isLinked} onChange={() => toggleSkill(sk.id, isLinked)} className="accent-gold" />
                  <span className="text-sm text-gray-200">{sk.name}</span>
                </label>
              );
            })}
          </div>
        )}
      </div>

      {/* Inventario */}
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
          Inventario ({base.inventory?.length ?? 0})
        </h4>
        {(base.inventory ?? []).map((it) => (
          <div key={it.id} className="mb-1 flex items-center justify-between rounded-md bg-ink-900 px-3 py-1.5 text-sm text-gray-200">
            <span>
              {it.item_name} <span className="text-xs text-gray-500">x{it.quantity}</span>
            </span>
            <button onClick={() => removeItem(it.id)} className="text-gray-500 hover:text-danger" aria-label={`Eliminar ${it.item_name}`}>
              ✕
            </button>
          </div>
        ))}
        <form onSubmit={addItem} className="mt-2 flex gap-2">
          <input
            value={itemName}
            onChange={(e) => setItemName(e.target.value)}
            placeholder="Objeto"
            className={`flex-1 ${inputCls}`}
          />
          <Button size="sm" type="submit">
            + Objeto
          </Button>
        </form>
      </div>

      {/* Sistema (referencia rápida; el editor de atributos depende de él) */}
      {systems.length > 0 && !base.game_system_id && (
        <p className="text-xs italic text-gray-500">Asigna el sistema con &quot;Editar&quot; en el builder de sistemas.</p>
      )}
    </div>
  );
}

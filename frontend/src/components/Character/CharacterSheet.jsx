import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Tabs from '../ui/Tabs.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

// Barra de estado: ancho en pasos de 10% con clases Tailwind literales (sin inline).
// Las clases se escriben completas para que el JIT de Tailwind las incluya en el build.
const BAR_WIDTHS = [
  'w-0', 'w-[10%]', 'w-1/5', 'w-[30%]', 'w-2/5', 'w-1/2',
  'w-3/5', 'w-[70%]', 'w-4/5', 'w-[90%]', 'w-full',
];
function barWidthClass(pct) {
  const step = Math.max(0, Math.min(10, Math.round(pct / 10)));
  return BAR_WIDTHS[step];
}

// Ficha dinámica reutilizable (MyCharacters y SessionView). Renderiza atributos según
// el sistema de juego (agrupados por category; is_core destacados; has_max como valor/máx),
// estado (atributos is_core/has_max), inventario, equipo (slots del sistema) y skills.
// El backend valida permisos; aquí `canEdit` solo decide si se muestran los controles.
export default function CharacterSheet({ characterId, user, canEdit = true, onBack }) {
  const [character, setCharacter] = useState(null);
  const [attrDefs, setAttrDefs] = useState([]);
  const [slots, setSlots] = useState([]);
  const [tab, setTab] = useState('attrs');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const { character: ch } = await api.getCharacter(characterId);
      setCharacter(ch);
      if (ch.game_system_template_id) {
        const detail = await api.getGameSystem(ch.game_system_template_id);
        setAttrDefs(detail.attributes ?? []);
        setSlots(detail.equipmentSlots ?? []);
      } else {
        setAttrDefs([]);
        setSlots([]);
      }
    } catch (err) {
      setError(err.message);
    }
  }, [characterId]);

  useEffect(() => {
    load();
  }, [load]);

  if (!character) {
    return (
      <div className="p-4 text-sm text-gray-500">
        {error ? <span className="text-red-300">{error}</span> : 'Cargando ficha…'}
      </div>
    );
  }

  const tabs = [
    { id: 'attrs', label: '📊' },
    { id: 'status', label: '❤️' },
    { id: 'skills', label: '⚡' },
    { id: 'equipment', label: '🛡️' },
    { id: 'inventory', label: '🎒' },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-ink-line px-4 py-3">
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack}>
            ←
          </Button>
        )}
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold text-gold">{character.name}</h2>
          {character.game_system_name && (
            <p className="text-xs text-gray-400">{character.game_system_name}</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>
      )}

      <Tabs tabs={tabs} activeId={tab} onChange={setTab} className="flex-shrink-0" />

      <div className="flex-1 overflow-y-auto p-4">
        {tab === 'attrs' && (
          <AttributesTab
            character={character}
            attrDefs={attrDefs}
            user={user}
            canEdit={canEdit}
            onSaved={load}
            setError={setError}
          />
        )}
        {tab === 'status' && <StatusTab character={character} attrDefs={attrDefs} />}
        {tab === 'skills' && (
          <SkillsTab character={character} user={user} canEdit={canEdit} onChange={load} setError={setError} />
        )}
        {tab === 'equipment' && (
          <EquipmentTab
            character={character}
            slots={slots}
            user={user}
            canEdit={canEdit}
            onChange={load}
            setError={setError}
          />
        )}
        {tab === 'inventory' && (
          <InventoryTab character={character} user={user} canEdit={canEdit} onChange={load} setError={setError} />
        )}
      </div>
    </div>
  );
}

// ── Atributos (agrupados por category) ────────────────────────────────────────
function AttributesTab({ character, attrDefs, user, canEdit, onSaved, setError }) {
  const [draft, setDraft] = useState({});
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    const init = {};
    for (const def of attrDefs) {
      const existing = character.templateAttrs?.find((a) => a.attribute_template_id === def.id);
      init[def.id] = existing?.value ?? '';
      if (def.has_max) init[`${def.id}__max`] = existing?.max_value ?? '';
    }
    setDraft(init);
    setDirty(false);
  }, [character, attrDefs]);

  async function save() {
    const values = attrDefs.map((def) => ({
      attribute_template_id: def.id,
      value: draft[def.id] ?? '',
      ...(def.has_max ? { max_value: draft[`${def.id}__max`] ?? '' } : {}),
    }));
    try {
      await api.setCharacterAttributes(character.id, user.id, values);
      setDirty(false);
      await onSaved();
    } catch (err) {
      setError(err.message);
    }
  }

  if (attrDefs.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Sin sistema de juego o sin atributos definidos.</p>;
  }

  const grouped = attrDefs.reduce((acc, def) => {
    (acc[def.category] = acc[def.category] || []).push(def);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([category, defs]) => (
        <Card key={category} className="p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-gold">{category}</h4>
          <div className="flex flex-col gap-3">
            {defs.map((def) => (
              <div key={def.id} className="flex items-center gap-3">
                <label className="flex w-28 flex-shrink-0 items-center gap-1 text-sm text-gray-300">
                  {def.is_core && <span className="text-gold" title="atributo principal">★</span>}
                  {def.name}
                </label>
                {def.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={draft[def.id] === 'true'}
                    onChange={(e) => {
                      setDraft((p) => ({ ...p, [def.id]: String(e.target.checked) }));
                      setDirty(true);
                    }}
                    className="h-4 w-4 accent-gold"
                  />
                ) : def.has_max ? (
                  <div className="flex flex-1 items-center gap-1">
                    <input
                      disabled={!canEdit}
                      type={def.type === 'number' ? 'number' : 'text'}
                      placeholder="Actual"
                      value={draft[def.id] ?? ''}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, [def.id]: e.target.value }));
                        setDirty(true);
                      }}
                      className={`flex-1 ${inputCls}`}
                    />
                    <span className="text-gray-500">/</span>
                    <input
                      disabled={!canEdit}
                      type={def.type === 'number' ? 'number' : 'text'}
                      placeholder="Máx"
                      value={draft[`${def.id}__max`] ?? ''}
                      onChange={(e) => {
                        setDraft((p) => ({ ...p, [`${def.id}__max`]: e.target.value }));
                        setDirty(true);
                      }}
                      className={`flex-1 ${inputCls}`}
                    />
                  </div>
                ) : (
                  <input
                    disabled={!canEdit}
                    type={def.type === 'number' ? 'number' : 'text'}
                    value={draft[def.id] ?? ''}
                    onChange={(e) => {
                      setDraft((p) => ({ ...p, [def.id]: e.target.value }));
                      setDirty(true);
                    }}
                    className={`flex-1 ${inputCls}`}
                  />
                )}
              </div>
            ))}
          </div>
        </Card>
      ))}
      {canEdit && (
        <Button onClick={save} disabled={!dirty}>
          Guardar cambios
        </Button>
      )}
    </div>
  );
}

// ── Estado (atributos is_core / has_max, tipo vida/foco) ──────────────────────
function StatusTab({ character, attrDefs }) {
  const coreDefs = attrDefs.filter((d) => d.is_core || d.has_max);
  if (coreDefs.length === 0) {
    return <p className="py-8 text-center text-sm text-gray-500">Este sistema no define atributos de estado.</p>;
  }
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
      {coreDefs.map((def) => {
        const val = character.templateAttrs?.find((a) => a.attribute_template_id === def.id);
        const current = val?.value ?? '—';
        const max = def.has_max ? val?.max_value : null;
        const num = Number(current);
        const maxNum = Number(max);
        const pct = def.has_max && maxNum > 0 ? Math.min(100, Math.round((num / maxNum) * 100)) : null;
        return (
          <Card key={def.id} className="p-3 text-center">
            <p className="text-xs text-gray-400">{def.name}</p>
            <p className="mt-1 text-lg font-bold text-gray-100">
              {current}
              {max ? <span className="text-sm text-gray-500">/{max}</span> : null}
            </p>
            {pct !== null && (
              <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-ink-900">
                {/* Ancho en pasos de 10% vía clases Tailwind estáticas (sin estilo inline). */}
                <div className={`h-1.5 rounded-full bg-danger ${barWidthClass(pct)}`} />
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Skills (catálogo enlazado con rank + manuales) ────────────────────────────
function SkillsTab({ character, user, canEdit, onChange, setError }) {
  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [manualName, setManualName] = useState('');

  useEffect(() => {
    // El catálogo lo administra el DM; cualquiera puede listarlo para enlazar.
    api
      .listSkillFormats('', character.game_system_template_id ?? null)
      .then(({ formats: list }) => setFormats(list ?? []))
      .catch(() => {});
  }, [character.game_system_template_id]);

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

  const linkedIds = new Set((character.skillLinks ?? []).map((s) => s.skill_id));

  async function toggle(skillId, isLinked) {
    try {
      if (isLinked) await api.unlinkCharacterSkill(character.id, user.id, skillId);
      else await api.linkCharacterSkill(character.id, user.id, skillId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addManual(e) {
    e.preventDefault();
    if (!manualName.trim()) return;
    try {
      await api.addCharacterSkill(character.id, user.id, { name: manualName.trim() });
      setManualName('');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeManual(skillId) {
    try {
      await api.deleteCharacterSkill(character.id, user.id, skillId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">
          Habilidades del catálogo ({character.skillLinks?.length ?? 0})
        </h4>
        {(character.skillLinks ?? []).length === 0 ? (
          <p className="text-sm text-gray-500">Sin habilidades enlazadas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {character.skillLinks.map((sk) => (
              <div
                key={sk.skill_id}
                className="flex items-center justify-between rounded-md border border-ink-line bg-ink-900 px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm text-gray-100">{sk.skill_name}</span>
                  <span className="ml-2 text-xs text-gray-500">
                    {sk.format_name}
                    {sk.rank ? ` · rango ${sk.rank}` : ''}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => toggle(sk.skill_id, true)}
                    className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
                    aria-label={`Quitar ${sk.skill_name}`}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-ink-line pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">Enlazar del catálogo</h4>
          <select value={selectedFormat} onChange={(e) => pickFormat(e.target.value)} className={`mb-2 w-full ${inputCls}`}>
            <option value="">— Selecciona un formato —</option>
            {formats.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
          {selectedFormat && (
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto">
              {catalog.length === 0 ? (
                <p className="py-2 text-center text-sm text-gray-500">Sin habilidades en este formato.</p>
              ) : (
                catalog.map((sk) => {
                  const isLinked = linkedIds.has(sk.id);
                  return (
                    <label
                      key={sk.id}
                      className="flex cursor-pointer items-center gap-2 rounded-md bg-ink-900 px-3 py-2 hover:bg-ink-500"
                    >
                      <input type="checkbox" checked={isLinked} onChange={() => toggle(sk.id, isLinked)} className="accent-gold" />
                      <span className="text-sm text-gray-200">{sk.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-ink-line pt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gold">
          Habilidades manuales ({character.skills?.length ?? 0})
        </h4>
        {(character.skills ?? []).map((sk) => (
          <div
            key={sk.id}
            className="mb-1 flex items-center justify-between rounded-md border border-ink-line bg-ink-900 px-3 py-2"
          >
            <span className="text-sm text-gray-100">
              {sk.name}
              <span className="ml-2 text-xs text-gray-500">{sk.skill_list}</span>
            </span>
            {canEdit && (
              <button
                onClick={() => removeManual(sk.id)}
                className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
                aria-label={`Eliminar ${sk.name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        {canEdit && (
          <form onSubmit={addManual} className="mt-2 flex gap-2">
            <input
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              placeholder="Habilidad manual"
              className={`flex-1 ${inputCls}`}
            />
            <Button size="sm" type="submit">
              + Skill
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}

// ── Equipo (slots del sistema) ────────────────────────────────────────────────
function EquipmentTab({ character, slots, user, canEdit, onChange, setError }) {
  const [items, setItems] = useState([]);
  const [addingSlot, setAddingSlot] = useState(null);
  const [selItem, setSelItem] = useState('');

  useEffect(() => {
    if (!canEdit) return;
    api
      .listItemFormats(user.id, character.game_system_template_id ?? null)
      .then(async ({ formats }) => {
        // Reúne los item masters de todos los formatos del sistema.
        const all = [];
        for (const fmt of formats ?? []) {
          const { format } = await api.getItemFormat(fmt.id);
          for (const it of format.items ?? []) all.push(it);
        }
        setItems(all);
      })
      .catch(() => {});
  }, [user.id, character.game_system_template_id, canEdit]);

  async function equip(slotId) {
    if (!selItem) return;
    try {
      await api.equipItem(character.id, user.id, slotId, selItem);
      setAddingSlot(null);
      setSelItem('');
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function unequip(equipId) {
    try {
      await api.unequipItem(character.id, user.id, equipId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  if (slots.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-gray-500">
        Sin slots de equipo. El DM debe configurarlos en el sistema de juego.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {slots.map((slot) => {
        const equipped = (character.equipment ?? []).filter((e) => e.slot_id === slot.id);
        const canAdd = canEdit && equipped.length < (slot.max_items ?? 1);
        const isAdding = addingSlot === slot.id;
        return (
          <Card key={slot.id} className="p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-28 flex-shrink-0 text-xs font-semibold uppercase text-gray-400">{slot.name}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {equipped.length === 0 && !isAdding && <span className="text-xs italic text-gray-600">vacío</span>}
                {equipped.map((e) => (
                  <span
                    key={e.id}
                    className="flex items-center gap-1 rounded-full border border-ink-line bg-ink-900 px-3 py-1 text-xs text-gray-200"
                  >
                    🗡️ {e.item_name}
                    {canEdit && (
                      <button
                        onClick={() => unequip(e.id)}
                        className="text-gray-500 hover:text-danger"
                        aria-label={`Desequipar ${e.item_name}`}
                      >
                        ✕
                      </button>
                    )}
                  </span>
                ))}
                {canAdd && !isAdding && (
                  <button
                    onClick={() => {
                      setAddingSlot(slot.id);
                      setSelItem('');
                    }}
                    className="rounded-full border border-gold/40 px-2 py-0.5 text-xs text-gold hover:border-gold"
                  >
                    + Equipar
                  </button>
                )}
              </div>
            </div>
            {isAdding && (
              <div className="mt-2 flex gap-2">
                <select value={selItem} onChange={(e) => setSelItem(e.target.value)} className={`flex-1 ${inputCls}`}>
                  <option value="">— Selecciona objeto —</option>
                  {items.map((it) => (
                    <option key={it.id} value={it.id}>
                      {it.name}
                    </option>
                  ))}
                </select>
                <Button size="sm" disabled={!selItem} onClick={() => equip(slot.id)}>
                  Equipar
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setAddingSlot(null)}>
                  ✕
                </Button>
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ── Inventario ────────────────────────────────────────────────────────────────
function InventoryTab({ character, user, canEdit, onChange, setError }) {
  const [name, setName] = useState('');
  const [qty, setQty] = useState(1);

  async function add(e) {
    e.preventDefault();
    if (!name.trim()) return;
    try {
      await api.addCharacterItem(character.id, user.id, { item_name: name.trim(), quantity: Number(qty) || 1 });
      setName('');
      setQty(1);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(itemId) {
    try {
      await api.deleteCharacterItem(character.id, user.id, itemId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {canEdit && (
        <form onSubmit={add} className="flex flex-wrap gap-2">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Objeto"
            className={`min-w-36 flex-1 ${inputCls}`}
          />
          <input
            type="number"
            min="1"
            value={qty}
            onChange={(e) => setQty(e.target.value)}
            className={`w-20 ${inputCls}`}
            aria-label="Cantidad"
          />
          <Button type="submit">+</Button>
        </form>
      )}
      {(character.inventory ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500">Inventario vacío.</p>
      ) : (
        character.inventory.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-3 rounded-md border border-ink-line bg-ink-900 px-3 py-2"
          >
            <span className="flex-1 text-sm text-gray-100">{item.item_name}</span>
            <span className="rounded-full bg-ink-600 px-2 py-0.5 text-xs text-gray-200">x{item.quantity}</span>
            {canEdit && (
              <button
                onClick={() => remove(item.id)}
                className="text-gray-500 hover:text-danger"
                aria-label={`Eliminar ${item.item_name}`}
              >
                ✕
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

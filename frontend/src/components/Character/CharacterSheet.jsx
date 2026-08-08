import { useCallback, useEffect, useState } from 'react';
import socket from '../../lib/socket.js';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Tabs from '../ui/Tabs.jsx';
import Icon from '../ui/Icon.jsx';

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

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

// Marcador de "atributo principal" (★). OJO: `is_core` llega como ENTERO 0/1 desde
// SQLite; un guard `{is_core && <span/>}` renderiza el 0 literal en el DOM cuando vale 0
// (bug F30: "0Deflect", "0Health"). Coercionar a booleano evita pintar el número.
export function coreMarker(isCore) {
  return Boolean(isCore) ? (
    <span className="text-accent-text" title="atributo principal">★</span>
  ) : null;
}

// Ficha dinámica reutilizable (CharactersPage y SessionView). Renderiza atributos según
// el sistema de juego (agrupados por category; is_core destacados; has_max como valor/máx),
// estado (dot-tracker editable de PV/voluntad), inventario, equipo (slots) y skills.
// El backend valida permisos; aquí `canEdit` solo decide si se muestran los controles.
// Reacciona a `characters:updated` por socket: si otro usuario edita ESTA ficha, se recarga.
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

  // Sync en vivo: si llega characters:updated para ESTE personaje, refresca la ficha
  // abierta (antes solo se recargaba la lista, no la ficha activa). El backend adjunta
  // el character actualizado, pero recargamos para traer también attrDefs/slots frescos.
  useEffect(() => {
    const onUpdated = ({ characterId: id }) => {
      if (Number(id) === Number(characterId)) load();
    };
    socket.on('characters:updated', onUpdated);
    return () => socket.off('characters:updated', onUpdated);
  }, [characterId, load]);

  if (!character) {
    return (
      <div className="p-4 text-sm text-faint">
        {error ? <span className="text-danger-text">{error}</span> : 'Cargando ficha…'}
      </div>
    );
  }

  const tabs = [
    { id: 'attrs', label: <Icon name="sliders" size={18} /> },
    { id: 'status', label: <Icon name="heart" size={18} /> },
    { id: 'skills', label: <Icon name="skills" size={18} /> },
    { id: 'equipment', label: <Icon name="shield" size={18} /> },
    { id: 'inventory', label: <Icon name="bag" size={18} /> },
  ];

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-shrink-0 items-center gap-3 border-b border-line px-4 py-3">
        {onBack && (
          <Button variant="secondary" size="sm" onClick={onBack} aria-label="Volver">
            <Icon name="arrow-left" size={16} />
          </Button>
        )}
        <div className="min-w-0">
          <h2 className="truncate font-serif text-base font-semibold text-title">{character.name}</h2>
          {character.game_system_name && (
            <p className="text-xs text-faint">{character.game_system_name}</p>
          )}
        </div>
      </div>

      {error && (
        <p className="mx-4 mt-3 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
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
        {tab === 'status' && (
          <StatusTab character={character} attrDefs={attrDefs} user={user} canEdit={canEdit} onSaved={load} setError={setError} />
        )}
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
    return <p className="py-8 text-center text-sm text-faint">Sin sistema de juego o sin atributos definidos.</p>;
  }

  const grouped = attrDefs.reduce((acc, def) => {
    (acc[def.category] = acc[def.category] || []).push(def);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([category, defs]) => (
        <Card key={category} className="p-4">
          <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-accent-text">{category}</h4>
          <div className="flex flex-col gap-3">
            {defs.map((def) => (
              <div key={def.id} className="flex items-center gap-3">
                <label className="flex w-28 flex-shrink-0 items-center gap-1 text-sm text-sub">
                  {coreMarker(def.is_core)}
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
                    className="h-4 w-4 accent-accent"
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
                    <span className="text-faint">/</span>
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

// ── Estado (dot-tracker editable de atributos is_core / has_max) ──────────────
// Cada atributo con máximo se muestra como una fila de "puntos" clickeables (rellenar =
// subir el valor actual, vaciar = bajarlo), con controles +/- y edición del máx. Persiste
// vía PUT /characters/:id/attributes (que emite characters:updated → sync a otras pestañas).
const MAX_DOTS = 20; // por encima de esto se usa solo el input numérico (evita filas enormes).

function StatusTab({ character, attrDefs, user, canEdit, onSaved, setError }) {
  const coreDefs = attrDefs.filter((d) => d.is_core || d.has_max);
  if (coreDefs.length === 0) {
    return <p className="py-8 text-center text-sm text-faint">Este sistema no define atributos de estado.</p>;
  }
  return (
    <div className="flex flex-col gap-3">
      {coreDefs.map((def) => (
        <StatusRow
          key={def.id}
          def={def}
          character={character}
          user={user}
          canEdit={canEdit}
          onSaved={onSaved}
          setError={setError}
        />
      ))}
    </div>
  );
}

export function StatusRow({ def, character, user, canEdit, onSaved, setError }) {
  const val = character.templateAttrs?.find((a) => a.attribute_template_id === def.id);
  const current = Number(val?.value ?? 0);
  const [maxDraft, setMaxDraft] = useState(def.has_max ? (val?.max_value ?? '') : '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMaxDraft(def.has_max ? (val?.max_value ?? '') : '');
  }, [val?.max_value, def.has_max]);

  const maxNum = def.has_max ? Number(maxDraft) : NaN;
  // Boolean(def.has_max): has_max es ENTERO 0/1 de SQLite. Sin coercionar, hasNumericMax
  // heredaría el 0 y se propagaría a `useDots`, cuyo guard `{useDots && (...)}` (abajo)
  // pintaría el 0 literal para un atributo core sin máximo (mismo footgun F30).
  const hasNumericMax = Boolean(def.has_max) && Number.isFinite(maxNum) && maxNum > 0;
  const pct = hasNumericMax ? Math.min(100, Math.round((current / maxNum) * 100)) : null;
  const useDots = hasNumericMax && maxNum <= MAX_DOTS;

  // Persiste el atributo (valor actual y, opcionalmente, máx) reutilizando el endpoint
  // de atributos; el backend emite characters:updated → las otras pestañas se refrescan.
  async function persist(nextValue, nextMax) {
    setSaving(true);
    setError('');
    try {
      await api.setCharacterAttributes(character.id, user.id, [
        {
          attribute_template_id: def.id,
          value: String(Math.max(0, nextValue)),
          ...(def.has_max ? { max_value: nextMax === '' ? '' : String(nextMax) } : {}),
        },
      ]);
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  function setDot(index) {
    if (!canEdit) return;
    // Click en un punto ya relleno lo vacía (baja a index); en uno vacío lo llena (index+1).
    const next = index + 1 === current ? index : index + 1;
    persist(next, maxDraft);
  }

  return (
    <Card className="p-3">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-sm text-sub">
          {coreMarker(def.is_core)}
          {def.name}
        </span>
        <span className="num text-lg font-bold text-title">
          {current}
          {def.has_max && maxDraft !== '' ? <span className="text-sm text-faint">/{maxDraft}</span> : null}
        </span>
      </div>

      {useDots && (
        <div className="mt-2 flex flex-wrap gap-1">
          {Array.from({ length: maxNum }, (_, i) => (
            <button
              key={i}
              type="button"
              disabled={!canEdit || saving}
              onClick={() => setDot(i)}
              aria-label={`${def.name} ${i + 1}`}
              className={`h-4 w-4 rounded-full border transition-colors ${
                i < current
                  ? 'border-accent bg-accent'
                  : 'border-line-hover bg-transparent hover:border-accent'
              } ${!canEdit ? 'cursor-default' : ''}`}
            />
          ))}
        </div>
      )}

      {!useDots && pct !== null && (
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg">
          <div className={`h-1.5 rounded-full bg-accent ${barWidthClass(pct)}`} />
        </div>
      )}

      {canEdit && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="secondary" disabled={saving || current <= 0} onClick={() => persist(current - 1, maxDraft)}>
            −
          </Button>
          <Button size="sm" variant="secondary" disabled={saving} onClick={() => persist(current + 1, maxDraft)}>
            +
          </Button>
          {def.has_max ? (
            <label className="ml-auto flex items-center gap-1 text-xs text-faint">
              Máx
              <input
                type="number"
                min="0"
                value={maxDraft}
                onChange={(e) => setMaxDraft(e.target.value)}
                onBlur={() => persist(current, maxDraft)}
                className={`w-16 ${inputCls} px-2 py-1`}
                aria-label={`Máximo de ${def.name}`}
              />
            </label>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ── Skills (catálogo enlazado con rank + manuales) ────────────────────────────
function SkillsTab({ character, user, canEdit, onChange, setError }) {
  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [catalog, setCatalog] = useState([]);
  const [manualName, setManualName] = useState('');

  useEffect(() => {
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
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
          Habilidades del catálogo ({character.skillLinks?.length ?? 0})
        </h4>
        {(character.skillLinks ?? []).length === 0 ? (
          <p className="text-sm text-faint">Sin habilidades enlazadas.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {character.skillLinks.map((sk) => (
              <div
                key={sk.skill_id}
                className="flex items-center justify-between rounded-btn border border-line bg-bg px-3 py-2"
              >
                <div className="min-w-0">
                  <span className="text-sm text-title">{sk.skill_name}</span>
                  <span className="ml-2 text-xs text-faint">
                    {sk.format_name}
                    {sk.rank ? ` · rango ${sk.rank}` : ''}
                  </span>
                </div>
                {canEdit && (
                  <button
                    onClick={() => toggle(sk.skill_id, true)}
                    className="ml-3 flex-shrink-0 text-faint hover:text-danger-text"
                    aria-label={`Quitar ${sk.skill_name}`}
                  >
                    <Icon name="x" size={15} />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {canEdit && (
        <div className="border-t border-line pt-4">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">Enlazar del catálogo</h4>
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
                <p className="py-2 text-center text-sm text-faint">Sin habilidades en este formato.</p>
              ) : (
                catalog.map((sk) => {
                  const isLinked = linkedIds.has(sk.id);
                  return (
                    <label
                      key={sk.id}
                      className="flex cursor-pointer items-center gap-2 rounded-btn bg-bg px-3 py-2 hover:bg-hover"
                    >
                      <input type="checkbox" checked={isLinked} onChange={() => toggle(sk.id, isLinked)} className="accent-accent" />
                      <span className="text-sm text-sub">{sk.name}</span>
                    </label>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}

      <div className="border-t border-line pt-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">
          Habilidades manuales ({character.skills?.length ?? 0})
        </h4>
        {(character.skills ?? []).map((sk) => (
          <div
            key={sk.id}
            className="mb-1 flex items-center justify-between rounded-btn border border-line bg-bg px-3 py-2"
          >
            <span className="text-sm text-title">
              {sk.name}
              <span className="ml-2 text-xs text-faint">{sk.skill_list}</span>
            </span>
            {canEdit && (
              <button
                onClick={() => removeManual(sk.id)}
                className="ml-3 flex-shrink-0 text-faint hover:text-danger-text"
                aria-label={`Eliminar ${sk.name}`}
              >
                <Icon name="x" size={15} />
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
              <Icon name="plus" size={15} />
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
      <p className="py-8 text-center text-sm text-faint">
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
              <span className="w-28 flex-shrink-0 text-xs font-semibold uppercase text-faint">{slot.name}</span>
              <div className="flex flex-1 flex-wrap items-center gap-2">
                {equipped.length === 0 && !isAdding && <span className="text-xs italic text-muted">vacío</span>}
                {equipped.map((e) => (
                  <span
                    key={e.id}
                    className="flex items-center gap-1 rounded-pill border border-line bg-bg px-3 py-1 text-xs text-sub"
                  >
                    <Icon name="shield" size={13} className="text-faint" /> {e.item_name}
                    {canEdit && (
                      <button
                        onClick={() => unequip(e.id)}
                        className="text-faint hover:text-danger-text"
                        aria-label={`Desequipar ${e.item_name}`}
                      >
                        <Icon name="x" size={13} />
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
                    className="flex items-center gap-1 rounded-pill border border-accent/40 px-2 py-0.5 text-xs text-accent-text hover:border-accent"
                  >
                    <Icon name="plus" size={13} /> Equipar
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
                <Button size="sm" variant="secondary" onClick={() => setAddingSlot(null)} aria-label="Cancelar">
                  <Icon name="x" size={15} />
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

  // +/- cantidad reutilizando el PUT de inventario (F18: control de cantidad in situ).
  async function changeQty(item, delta) {
    const next = Math.max(1, (Number(item.quantity) || 1) + delta);
    try {
      await api.updateCharacterItem(character.id, user.id, item.id, { quantity: next });
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
          <Button type="submit" aria-label="Añadir objeto">
            <Icon name="plus" size={16} />
          </Button>
        </form>
      )}
      {(character.inventory ?? []).length === 0 ? (
        <p className="py-8 text-center text-sm text-faint">Inventario vacío.</p>
      ) : (
        character.inventory.map((item) => (
          <div
            key={item.id}
            className="flex items-center gap-2 rounded-btn border border-line bg-bg px-3 py-2"
          >
            <span className="flex-1 text-sm text-title">{item.item_name}</span>
            {canEdit ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => changeQty(item, -1)}
                  disabled={(Number(item.quantity) || 1) <= 1}
                  className="flex h-6 w-6 items-center justify-center rounded-btn border border-line text-sub hover:border-accent disabled:opacity-40"
                  aria-label={`Menos ${item.item_name}`}
                >
                  −
                </button>
                <span className="num w-7 text-center text-xs text-sub">x{item.quantity}</span>
                <button
                  onClick={() => changeQty(item, 1)}
                  className="flex h-6 w-6 items-center justify-center rounded-btn border border-line text-sub hover:border-accent"
                  aria-label={`Más ${item.item_name}`}
                >
                  +
                </button>
              </div>
            ) : (
              <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-sub">x{item.quantity}</span>
            )}
            {canEdit && (
              <button
                onClick={() => remove(item.id)}
                className="text-faint hover:text-danger-text"
                aria-label={`Eliminar ${item.item_name}`}
              >
                <Icon name="trash" size={15} />
              </button>
            )}
          </div>
        ))
      )}
    </div>
  );
}

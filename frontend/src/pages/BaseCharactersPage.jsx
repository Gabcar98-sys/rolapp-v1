import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { baseCharBars, barWidthClass, glyphAccentIndex, initialGlyph } from '../lib/catalog.js';
import { inputCls, GLYPH_CLASSES, BAR_FILL_CLASSES } from '../components/ui/catalogClasses.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

// Personajes Base (F15): grid de plantillas con glifo, barras de atributos y chips
// de habilidades; editor con tabs Atributos / Inventario / Habilidades; filtro por sistema.
export default function BaseCharactersPage({ user }) {
  const [systems, setSystems] = useState([]);
  const [systemFilter, setSystemFilter] = useState('');
  const [baseChars, setBaseChars] = useState([]);
  const [editing, setEditing] = useState(null); // pregen abierto en el editor (ficha completa)
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { baseCharacters } = await api.listBaseCharacters(user.id, systemFilter || null);
      setBaseChars(baseCharacters);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // Recarga al cambiar el DM o el filtro de sistema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, systemFilter]);

  useEffect(() => {
    api.listGameSystems(user.id).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
  }, [user.id]);

  async function openEditor(id) {
    setError('');
    try {
      const { baseCharacter } = await api.getBaseCharacter(id);
      setEditing(baseCharacter);
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(bc) {
    if (!window.confirm(`¿Eliminar la plantilla "${bc.name}"?`)) return;
    try {
      await api.deleteBaseCharacter(bc.id, user.id);
      if (editing?.id === bc.id) setEditing(null);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  if (editing) {
    return (
      <Page maxWidthClass="max-w-[900px]">
        <BaseCharacterEditor
          user={user}
          base={editing}
          systems={systems}
          onBack={() => {
            setEditing(null);
            load();
          }}
          onRefresh={() => openEditor(editing.id)}
          setError={setError}
          error={error}
        />
      </Page>
    );
  }

  return (
    <Page>
      <PageHeader
        title="Personajes Base"
        subtitle="Plantillas reutilizables: clases y arquetipos que definen el punto de partida."
        actions={
          <Button onClick={() => setCreateOpen(true)} className="px-[18px] py-[11px]">
            <Icon name="plus" size={16} strokeWidth={2.3} />
            Nueva plantilla
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <div className="mb-5 max-w-xs">
        <select
          value={systemFilter}
          onChange={(e) => setSystemFilter(e.target.value)}
          className={`${inputCls} text-idle`}
          aria-label="Filtrar por sistema de juego"
        >
          <option value="">Todos los sistemas</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      {baseChars.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="id-card" size={28} className="text-muted-2" />
          <p className="text-sm text-faint">
            Aún no hay personajes base. Crea la primera plantilla para tus jugadores.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
          {baseChars.map((bc) => {
            const accent = glyphAccentIndex(bc.id);
            const bars = baseCharBars(bc.attrs);
            const skills = (bc.skillLinks ?? []).slice(0, 4);
            return (
              <Card key={bc.id} hoverable className="group flex flex-col p-5">
                <div className="mb-4 flex items-center gap-[13px]">
                  <span
                    className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[11px] font-serif text-[22px] font-semibold ${GLYPH_CLASSES[accent]}`}
                  >
                    {initialGlyph(bc.name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-serif text-[19px] font-semibold leading-tight text-title-2">
                      {bc.name}
                    </div>
                    <div className="truncate text-[12.5px] text-faint">
                      {bc.description || bc.game_system_name || 'Sin sistema'}
                    </div>
                  </div>
                  <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => openEditor(bc.id)}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-faint hover:bg-[#2E2A22] hover:text-ink"
                      aria-label={`Editar ${bc.name}`}
                    >
                      <Icon name="edit" size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(bc)}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                      aria-label={`Eliminar ${bc.name}`}
                    >
                      <Icon name="trash" size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>

                {/* Barras de atributos numéricos de la plantilla */}
                {bars.length > 0 ? (
                  <div className="flex flex-col gap-[9px]">
                    {bars.map((bar) => (
                      <div key={bar.label} className="flex items-center gap-2.5">
                        <span className="w-[62px] flex-shrink-0 truncate text-xs text-faint">
                          {bar.label}
                        </span>
                        <div className="h-1.5 flex-1 overflow-hidden rounded bg-[#2A2620]">
                          <div
                            className={`h-full rounded ${BAR_FILL_CLASSES[accent]} ${barWidthClass(bar.pct)}`}
                          />
                        </div>
                        <span className="num w-6 flex-shrink-0 text-right text-xs text-sub">
                          {bar.value}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-faint">Sin atributos numéricos definidos.</p>
                )}

                {/* Chips de habilidades + contadores */}
                <div className="mt-4 flex flex-wrap items-center gap-1.5 border-t border-line-2 pt-3.5">
                  {skills.length > 0 ? (
                    skills.map((sk) => (
                      <span
                        key={sk.skill_id}
                        className="rounded-pill bg-[#2A2620] px-2.5 py-1 text-[11.5px] text-sub"
                      >
                        {sk.skill_name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[11.5px] text-faint">Sin habilidades enlazadas</span>
                  )}
                </div>
                <div className="num mt-2.5 flex items-center gap-3 text-[11.5px] text-faint">
                  <span className="flex items-center gap-1">
                    <Icon name="sliders" size={12} />
                    {bc.attrs?.length ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="skills" size={12} />
                    {bc.skillLinks?.length ?? 0}
                  </span>
                  <span className="flex items-center gap-1">
                    <Icon name="bag" size={12} />
                    {bc.inventory?.length ?? 0}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <CreateBaseModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        systems={systems}
        defaultSystemId={systemFilter}
        onSubmit={async ({ name, gameSystemId, description }) => {
          const { baseCharacter } = await api.createBaseCharacter(user.id, {
            name,
            game_system_id: gameSystemId || null,
            description,
          });
          setCreateOpen(false);
          await load();
          await openEditor(baseCharacter.id);
        }}
        setError={setError}
      />
    </Page>
  );
}

function CreateBaseModal({ open, onClose, systems, defaultSystemId, onSubmit, setError }) {
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setSystemId(defaultSystemId || '');
      setDescription('');
    }
  }, [open, defaultSystemId]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), gameSystemId: systemId, description });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nueva plantilla">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre (p. ej. Guerrero)"
          className={inputCls}
        />
        <select
          value={systemId}
          onChange={(e) => setSystemId(e.target.value)}
          className={`${inputCls} text-idle`}
        >
          <option value="">— Sin sistema de juego —</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Rol o propósito (p. ej. Vanguardia)"
          className={inputCls}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creando…' : 'Crear plantilla'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Editor de plantilla: meta + tabs Atributos / Inventario / Habilidades ─────
function BaseCharacterEditor({ user, base, systems, onBack, onRefresh, setError, error }) {
  const [tab, setTab] = useState('attrs');
  const [metaOpen, setMetaOpen] = useState(false);

  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
        >
          <Icon name="arrow-left" size={14} />
          Plantillas
        </button>
      </div>
      <PageHeader
        title={base.name}
        subtitle={[base.game_system_name || 'Sin sistema', base.description || null]
          .filter(Boolean)
          .join(' · ')}
        actions={
          <Button variant="secondary" onClick={() => setMetaOpen(true)}>
            <Icon name="edit" size={14} />
            Editar datos
          </Button>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      <Tabs
        tabs={[
          { id: 'attrs', label: 'Atributos' },
          { id: 'inventory', label: 'Inventario' },
          { id: 'skills', label: 'Habilidades' },
        ]}
        activeId={tab}
        onChange={setTab}
        className="mb-5"
      />

      {tab === 'attrs' && (
        <BaseAttrsTab user={user} base={base} onChange={onRefresh} setError={setError} />
      )}
      {tab === 'inventory' && (
        <BaseInventoryTab user={user} base={base} onChange={onRefresh} setError={setError} />
      )}
      {tab === 'skills' && (
        <BaseSkillsTab user={user} base={base} onChange={onRefresh} setError={setError} />
      )}

      <EditMetaModal
        open={metaOpen}
        onClose={() => setMetaOpen(false)}
        base={base}
        systems={systems}
        onSubmit={async (fields) => {
          await api.updateBaseCharacter(base.id, user.id, fields);
          setMetaOpen(false);
          await onRefresh();
        }}
        setError={setError}
      />
    </>
  );
}

function EditMetaModal({ open, onClose, base, systems, onSubmit, setError }) {
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName(base.name);
      setSystemId(base.game_system_id ?? '');
      setDescription(base.description ?? '');
    }
  }, [open, base]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), game_system_id: systemId || null, description });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Editar plantilla">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
        <select value={systemId} onChange={(e) => setSystemId(e.target.value)} className={inputCls}>
          <option value="">— Sin sistema de juego —</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Rol o propósito"
          className={inputCls}
        />
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Tab Atributos del pregen (según la plantilla del sistema) ─────────────────
function BaseAttrsTab({ user, base, onChange, setError }) {
  const [attrDefs, setAttrDefs] = useState([]);
  const [draft, setDraft] = useState({});

  useEffect(() => {
    if (!base.game_system_id) {
      setAttrDefs([]);
      return;
    }
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
      .catch((err) => setError(err.message));
  }, [base, setError]);

  async function save() {
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

  if (attrDefs.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-faint">
        {base.game_system_id
          ? 'El sistema no tiene atributos definidos.'
          : 'Asigna un sistema de juego (Editar datos) para configurar atributos.'}
      </p>
    );
  }

  const grouped = attrDefs.reduce((acc, def) => {
    (acc[def.category] = acc[def.category] || []).push(def);
    return acc;
  }, {});

  return (
    <div className="flex flex-col gap-4">
      {Object.entries(grouped).map(([category, defs]) => (
        <Card key={category} className="p-5">
          <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
            {category}
          </h3>
          <div className="flex flex-col gap-2.5">
            {defs.map((def) => (
              <div key={def.id} className="flex items-center gap-3">
                <label className="w-32 flex-shrink-0 truncate text-sm text-sub">{def.name}</label>
                <input
                  value={draft[def.id] ?? ''}
                  onChange={(e) => setDraft((p) => ({ ...p, [def.id]: e.target.value }))}
                  type={def.type === 'number' ? 'number' : 'text'}
                  className={`flex-1 ${inputCls}`}
                  aria-label={def.name}
                />
              </div>
            ))}
          </div>
        </Card>
      ))}
      <Button onClick={save} className="self-start">
        Guardar atributos
      </Button>
    </div>
  );
}

// ── Tab Inventario del pregen ─────────────────────────────────────────────────
function BaseInventoryTab({ user, base, onChange, setError }) {
  const [itemName, setItemName] = useState('');
  const [quantity, setQuantity] = useState(1);

  async function add(e) {
    e.preventDefault();
    if (!itemName.trim()) return;
    try {
      await api.addBaseCharacterItem(base.id, user.id, {
        item_name: itemName.trim(),
        quantity: Number(quantity) || 1,
      });
      setItemName('');
      setQuantity(1);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(itemId) {
    try {
      await api.deleteBaseCharacterItem(base.id, user.id, itemId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={add} className="flex flex-wrap gap-2">
        <input
          value={itemName}
          onChange={(e) => setItemName(e.target.value)}
          placeholder="Objeto"
          className={`min-w-40 flex-1 ${inputCls}`}
        />
        <input
          type="number"
          min="1"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className={`w-24 ${inputCls}`}
          aria-label="Cantidad"
        />
        <Button type="submit" disabled={!itemName.trim()}>
          <Icon name="plus" size={14} />
          Objeto
        </Button>
      </form>
      {(base.inventory ?? []).length === 0 ? (
        <p className="py-6 text-center text-sm text-faint">Inventario vacío.</p>
      ) : (
        base.inventory.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-2.5"
          >
            <span className="min-w-0 flex-1 truncate text-sm text-ink">{it.item_name}</span>
            <span className="num rounded-pill bg-[#2A2620] px-2 py-0.5 text-xs text-sub">
              x{it.quantity}
            </span>
            <button
              type="button"
              onClick={() => remove(it.id)}
              className="text-faint hover:text-danger-text"
              aria-label={`Eliminar ${it.item_name}`}
            >
              <Icon name="x" size={14} />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ── Tab Habilidades del pregen (enlaza del catálogo) ──────────────────────────
function BaseSkillsTab({ user, base, onChange, setError }) {
  const [formats, setFormats] = useState([]);
  const [selectedFormat, setSelectedFormat] = useState('');
  const [catalog, setCatalog] = useState([]);

  useEffect(() => {
    api
      .listSkillFormats(user.id, base.game_system_id ?? null)
      .then(({ formats: f }) => setFormats(f ?? []))
      .catch(() => {});
  }, [user.id, base.game_system_id]);

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

  async function toggle(skillId, isLinked) {
    try {
      if (isLinked) await api.unlinkBaseCharacterSkill(base.id, user.id, skillId);
      else await api.linkBaseCharacterSkill(base.id, user.id, skillId);
      await onChange();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(base.skillLinks ?? []).length === 0 ? (
          <p className="text-sm text-faint">Sin habilidades enlazadas.</p>
        ) : (
          base.skillLinks.map((sk) => (
            <span
              key={sk.skill_id}
              className="flex items-center gap-1.5 rounded-pill bg-[#2A2620] px-2.5 py-1 text-[11.5px] text-sub"
            >
              {sk.skill_name}
              <button
                type="button"
                onClick={() => toggle(sk.skill_id, true)}
                className="text-faint hover:text-danger-text"
                aria-label={`Quitar ${sk.skill_name}`}
              >
                <Icon name="x" size={11} />
              </button>
            </span>
          ))
        )}
      </div>

      <Card className="p-5">
        <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
          Enlazar del catálogo
        </h3>
        <select
          value={selectedFormat}
          onChange={(e) => pickFormat(e.target.value)}
          className={`mb-2 w-full ${inputCls}`}
          aria-label="Formato de habilidad"
        >
          <option value="">— Formato de habilidad —</option>
          {formats.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        {selectedFormat && (
          <div className="flex max-h-52 flex-col gap-1 overflow-y-auto">
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
                    <input
                      type="checkbox"
                      checked={isLinked}
                      onChange={() => toggle(sk.id, isLinked)}
                      className="h-4 w-4 accent-[#CE6A3A]"
                    />
                    <span className="text-sm text-ink">{sk.name}</span>
                  </label>
                );
              })
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

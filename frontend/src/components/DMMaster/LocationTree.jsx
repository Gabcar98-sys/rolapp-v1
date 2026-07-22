import { useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../ui/Icon.jsx';

// Panel de ubicaciones (266px) de la pantalla Preparar Sesión.
// Árbol colapsable ubicación → sub-ubicación, con badges de conteo, selección de
// sub-ubicación (o "Sin ubicación"), y creación/renombrado inline.
//
// Props:
//   prep       → { id, name } prep activo.
//   locations  → jerarquía (de api.getPrep): [{ id, name, sub_locations:[{ id, name, events }] }].
//   freeEvents → eventos sueltos (para el conteo de "Sin ubicación").
//   dmId       → dueño (autoriza mutaciones).
//   selected   → { type:'sub'|'none', id? } sub-ubicación (o "none") seleccionada.
//   onSelect   → callback al elegir una fila.
//   onChange   → recarga la jerarquía tras crear/renombrar.
export default function LocationTree({
  prep,
  locations = [],
  freeEvents = [],
  dmId,
  selected,
  onSelect,
  onChange,
}) {
  const [expanded, setExpanded] = useState({}); // locationId → bool (undefined = abierto)
  const [error, setError] = useState('');

  // Drafts de creación / edición inline.
  const [addingLoc, setAddingLoc] = useState(false);
  const [locDraft, setLocDraft] = useState('');
  const [addingSubFor, setAddingSubFor] = useState(null); // locationId
  const [subDraft, setSubDraft] = useState('');
  const [editing, setEditing] = useState(null); // { kind:'loc'|'sub', id }
  const [editDraft, setEditDraft] = useState('');

  const isOpen = (locId) => expanded[locId] !== false;
  const toggle = (locId) => setExpanded((e) => ({ ...e, [locId]: !isOpen(locId) }));

  async function run(fn) {
    setError('');
    try {
      await fn();
      onChange?.();
    } catch (err) {
      setError(err.message);
    }
  }

  async function createLocation() {
    if (!locDraft.trim()) {
      setAddingLoc(false);
      return;
    }
    await run(() => api.createLocation(prep.id, locDraft.trim(), dmId));
    setLocDraft('');
    setAddingLoc(false);
  }

  async function createSub(locId) {
    if (!subDraft.trim()) {
      setAddingSubFor(null);
      return;
    }
    await run(() => api.createSubLocation(locId, subDraft.trim(), dmId));
    setSubDraft('');
    setAddingSubFor(null);
  }

  async function saveRename() {
    const name = editDraft.trim();
    const { kind, id } = editing;
    setEditing(null);
    if (!name) return;
    if (kind === 'loc') await run(() => api.updateLocation(id, dmId, { name }));
    else await run(() => api.updateSubLocation(id, dmId, { name }));
  }

  function startRename(kind, id, name) {
    setEditing({ kind, id });
    setEditDraft(name);
  }

  const badgeCls = (active) =>
    `flex h-[19px] min-w-[19px] items-center justify-center rounded-pill px-1.5 text-[10.5px] font-bold ${
      active ? 'bg-accent text-bg' : 'bg-surface-2 text-muted-2'
    }`;

  const inputCls =
    'w-full rounded-btn border border-line bg-bg px-2 py-1 text-sm text-ink outline-none focus:border-accent';

  const noneCount = freeEvents.length;
  const noneSel = selected?.type === 'none';

  return (
    <aside className="flex w-[266px] flex-shrink-0 flex-col border-r border-line bg-nav">
      {/* Cabecera con nombre del prep */}
      <div className="border-b border-line-2 px-4 pb-3 pt-4">
        <div className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-2">
          Preparación
        </div>
        <div className="mt-1 truncate font-serif text-[19px] font-semibold leading-tight text-title-2">
          {prep.name}
        </div>
      </div>

      {/* Título Ubicaciones + botón nueva */}
      <div className="flex items-center justify-between px-4 pb-2 pt-3.5">
        <span className="text-[10.5px] font-bold uppercase tracking-[1.4px] text-muted-2">
          Ubicaciones
        </span>
        <button
          type="button"
          title="Nueva ubicación"
          aria-label="Nueva ubicación"
          onClick={() => {
            setAddingLoc(true);
            setLocDraft('');
          }}
          className="flex h-6 w-6 items-center justify-center rounded-[7px] border border-line bg-surface-2 text-idle hover:border-accent hover:text-accent-text"
        >
          <Icon name="plus" size={14} strokeWidth={2} />
        </button>
      </div>

      {error && (
        <p className="mx-4 mb-1 rounded-btn bg-danger-tint px-2 py-1 text-xs text-danger-text">
          {error}
        </p>
      )}

      <div className="flex-1 overflow-y-auto px-1.5 pb-4">
        {addingLoc && (
          <div className="mx-1 my-1">
            <input
              value={locDraft}
              onChange={(e) => setLocDraft(e.target.value)}
              onBlur={createLocation}
              onKeyDown={(e) => {
                if (e.key === 'Enter') createLocation();
                if (e.key === 'Escape') setAddingLoc(false);
              }}
              placeholder="Nombre de la ubicación"
              autoFocus
              className={inputCls}
            />
          </div>
        )}

        {locations.map((loc) => {
          const subs = loc.sub_locations ?? [];
          const open = isOpen(loc.id);
          return (
            <div key={loc.id} className="mt-1">
              {/* Cabecera de ubicación */}
              <div className="group flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-sub">
                <button
                  type="button"
                  onClick={() => toggle(loc.id)}
                  aria-label={open ? 'Colapsar' : 'Expandir'}
                  className="flex items-center gap-1.5"
                >
                  <Icon
                    name="chevron-right"
                    size={12}
                    strokeWidth={2.4}
                    className={`transition-transform ${open ? 'rotate-90' : ''}`}
                  />
                  <Icon name="pin" size={13} className="text-accent" />
                </button>
                {editing?.kind === 'loc' && editing.id === loc.id ? (
                  <input
                    value={editDraft}
                    onChange={(e) => setEditDraft(e.target.value)}
                    onBlur={saveRename}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveRename();
                      if (e.key === 'Escape') setEditing(null);
                    }}
                    autoFocus
                    className={`${inputCls} flex-1`}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => toggle(loc.id)}
                    className="flex-1 truncate text-left font-serif text-[15px] font-semibold text-sub hover:text-title-2"
                  >
                    {loc.name}
                  </button>
                )}
                <button
                  type="button"
                  title="Renombrar"
                  aria-label="Renombrar ubicación"
                  onClick={() => startRename('loc', loc.id, loc.name)}
                  className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-hover-2 group-hover:opacity-100"
                >
                  <Icon name="edit" size={12} className="text-faint" />
                </button>
              </div>

              {/* Sub-ubicaciones */}
              {open && (
                <div className="pl-2">
                  {subs.map((sub) => {
                    const isSel = selected?.type === 'sub' && selected.id === sub.id;
                    const count = (sub.events ?? []).length;
                    return (
                      <div
                        key={sub.id}
                        role="button"
                        tabIndex={0}
                        onClick={() => onSelect({ type: 'sub', id: sub.id })}
                        onKeyDown={(e) => e.key === 'Enter' && onSelect({ type: 'sub', id: sub.id })}
                        className={`group mx-1 my-px flex items-center gap-2 rounded-btn px-2.5 py-1.5 text-[13.5px] ${
                          isSel
                            ? 'bg-hover font-semibold text-title-2 shadow-[inset_3px_0_0_#CE6A3A]'
                            : 'cursor-pointer font-medium text-idle hover:bg-hover-2 hover:text-title-2'
                        }`}
                      >
                        <Icon name="pin" size={12} className="flex-shrink-0 opacity-60" />
                        {editing?.kind === 'sub' && editing.id === sub.id ? (
                          <input
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            onBlur={saveRename}
                            onClick={(e) => e.stopPropagation()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveRename();
                              if (e.key === 'Escape') setEditing(null);
                            }}
                            autoFocus
                            className={`${inputCls} flex-1`}
                          />
                        ) : (
                          <span className="flex-1 truncate">{sub.name}</span>
                        )}
                        <span className={badgeCls(isSel)}>{count}</span>
                        <button
                          type="button"
                          title="Renombrar"
                          aria-label="Renombrar sub-ubicación"
                          onClick={(e) => {
                            e.stopPropagation();
                            startRename('sub', sub.id, sub.name);
                          }}
                          className="flex h-5 w-5 items-center justify-center rounded opacity-0 transition-opacity hover:bg-hover-2 group-hover:opacity-100"
                        >
                          <Icon name="edit" size={12} className="text-faint" />
                        </button>
                      </div>
                    );
                  })}

                  {addingSubFor === loc.id ? (
                    <div className="mx-1 my-px pl-3">
                      <input
                        value={subDraft}
                        onChange={(e) => setSubDraft(e.target.value)}
                        onBlur={() => createSub(loc.id)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') createSub(loc.id);
                          if (e.key === 'Escape') setAddingSubFor(null);
                        }}
                        placeholder="Nombre de la sub-ubicación"
                        autoFocus
                        className={inputCls}
                      />
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setAddingSubFor(loc.id);
                        setSubDraft('');
                      }}
                      className="mx-1.5 my-px flex items-center gap-1.5 px-2.5 py-1.5 text-[12.5px] text-muted-2 hover:text-accent-text"
                    >
                      <Icon name="plus" size={11} strokeWidth={2.2} />
                      Sub-ubicación
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Sin ubicación */}
        <div className="mt-2.5 border-t border-dashed border-line pt-2">
          <div
            role="button"
            tabIndex={0}
            onClick={() => onSelect({ type: 'none' })}
            onKeyDown={(e) => e.key === 'Enter' && onSelect({ type: 'none' })}
            className={`mx-1 flex items-center gap-2 rounded-btn px-2.5 py-1.5 text-[13.5px] ${
              noneSel
                ? 'bg-hover font-semibold text-title-2 shadow-[inset_3px_0_0_#CE6A3A]'
                : 'cursor-pointer font-medium text-idle hover:bg-hover-2 hover:text-title-2'
            }`}
          >
            <Icon name="bag" size={13} className="flex-shrink-0 opacity-60" />
            <span className="flex-1">Sin ubicación</span>
            <span className={badgeCls(noneSel)}>{noneCount}</span>
          </div>
        </div>
      </div>
    </aside>
  );
}

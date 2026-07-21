import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  RARITY_FIELD_NAMES,
  TYPE_FIELD_NAMES,
  VALUE_FIELD_NAMES,
  distinctFieldValues,
  filterEntities,
  findField,
  glyphAccentIndex,
  initialGlyph,
  paginate,
} from '../lib/catalog.js';
import { inputCls, GLYPH_CLASSES, RARITY_DOT_CLASSES } from '../components/ui/catalogClasses.js';
import {
  DynamicFieldInput,
  FieldsEditor,
  FormatGroups,
  FormatModal,
} from '../components/Catalog/FormatShared.jsx';
import Button from '../components/ui/Button.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';

const PER_PAGE = 50;

// Items (F15): formatos agrupados por sistema → grid de tarjetas de objetos con
// búsqueda, paginación, flag equippable y campos dinámicos (tipo/rareza/valor).
export default function ItemsPage({ user }) {
  const [systems, setSystems] = useState([]);
  const [systemFilter, setSystemFilter] = useState('');
  const [formats, setFormats] = useState([]);
  const [detail, setDetail] = useState(null); // formato abierto (con fields + items)
  const [formatModal, setFormatModal] = useState(false);
  const [error, setError] = useState('');

  async function loadFormats() {
    try {
      const { formats: list } = await api.listItemFormats(user.id, systemFilter || null);
      setFormats(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadFormats();
    // Recarga al cambiar el DM o el filtro de sistema.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, systemFilter]);

  useEffect(() => {
    api.listGameSystems(user.id).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
  }, [user.id]);

  async function openFormat(formatId) {
    setError('');
    try {
      const { format } = await api.getItemFormat(formatId);
      setDetail(format);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFormat(format) {
    if (!window.confirm(`¿Eliminar el formato "${format.name}" y todos sus objetos?`)) return;
    try {
      await api.deleteItemFormat(format.id, user.id);
      if (detail?.id === format.id) setDetail(null);
      await loadFormats();
    } catch (err) {
      setError(err.message);
    }
  }

  const systemName = (id) => systems.find((s) => String(s.id) === String(id))?.name ?? 'Sistema';

  return (
    <Page>
      {detail ? (
        <ItemFormatDetail
          user={user}
          format={detail}
          systemName={detail.game_system_id ? systemName(detail.game_system_id) : null}
          onBack={() => {
            setDetail(null);
            loadFormats();
          }}
          onRefresh={() => openFormat(detail.id)}
          setError={setError}
          error={error}
        />
      ) : (
        <>
          <PageHeader
            title="Items"
            subtitle="Equipo, consumibles y tesoros que pueblan tu mundo."
            actions={
              <Button onClick={() => setFormatModal(true)} className="px-[18px] py-[11px]">
                <Icon name="plus" size={16} strokeWidth={2.3} />
                Nuevo formato
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

          <FormatGroups
            formats={formats}
            systemName={systemName}
            emptyText="Aún no hay formatos de objeto. Crea uno para empezar el inventario del mundo."
            emptyIcon="bag"
            onOpen={openFormat}
            onDelete={deleteFormat}
            countLabel={(f) => `${f.fields.length} campos`}
          />
        </>
      )}

      <FormatModal
        open={formatModal}
        onClose={() => setFormatModal(false)}
        title="Nuevo formato de objeto"
        systems={systems}
        defaultSystemId={systemFilter}
        onSubmit={async ({ name, gameSystemId, description }) => {
          await api.createItemFormat(user.id, name, gameSystemId || null, description);
          setFormatModal(false);
          await loadFormats();
        }}
        setError={setError}
      />
    </Page>
  );
}

// ── Detalle de un formato de objetos: grid de tarjetas ────────────────────────
function ItemFormatDetail({ user, format, systemName, onBack, onRefresh, setError, error }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [itemModal, setItemModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null);

  const typeField = findField(format.fields, TYPE_FIELD_NAMES);
  const rarityField = findField(format.fields, RARITY_FIELD_NAMES);
  const valueField = findField(
    format.fields.filter((f) => f !== typeField && f !== rarityField),
    VALUE_FIELD_NAMES
  );
  // Índice de color de rareza estable por valor (orden de aparición en el catálogo).
  const rarityValues = rarityField ? distinctFieldValues(format.items, rarityField.id) : [];

  const filtered = filterEntities(format.items, { query });
  const { items, page: current, totalPages, total } = paginate(filtered, page, PER_PAGE);

  async function removeItem(item) {
    if (!window.confirm(`¿Eliminar el objeto "${item.name}"?`)) return;
    try {
      await api.deleteItem(item.id, user.id);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <>
      <div className="mb-1 flex items-center gap-2">
        <button
          type="button"
          onClick={onBack}
          className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
        >
          <Icon name="arrow-left" size={14} />
          Formatos
        </button>
      </div>
      <PageHeader
        title={format.name}
        subtitle={
          [systemName, format.description || null].filter(Boolean).join(' · ') ||
          'Objetos del formato.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setFieldsOpen((v) => !v)}>
              <Icon name="sliders" size={15} />
              Campos
            </Button>
            <Button
              onClick={() => {
                setEditingItem(null);
                setItemModal(true);
              }}
              className="px-[18px] py-[11px]"
            >
              <Icon name="plus" size={16} strokeWidth={2.3} />
              Nuevo item
            </Button>
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      {fieldsOpen && (
        <FieldsEditor
          format={format}
          onAdd={async (field) => {
            try {
              await api.createItemField(format.id, user.id, field);
              await onRefresh();
            } catch (err) {
              setError(err.message);
            }
          }}
          onRemove={async (field) => {
            if (!window.confirm(`¿Eliminar el campo "${field.field_name}" y sus valores?`)) return;
            try {
              await api.deleteItemField(format.id, field.id, user.id);
              await onRefresh();
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      )}

      <div className="relative mb-[18px] max-w-md">
        <span className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted">
          <Icon name="search" size={16} strokeWidth={1.8} />
        </span>
        <input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setPage(1);
          }}
          placeholder="Buscar objeto…"
          className="w-full rounded-[10px] border border-line bg-surface py-2.5 pl-[38px] pr-3.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
        />
      </div>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="bag" size={28} className="text-muted-2" />
          <p className="text-sm text-faint">
            {format.items.length === 0
              ? 'Aún no hay objetos en este formato.'
              : 'Sin resultados para la búsqueda actual.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-[repeat(auto-fill,minmax(230px,1fr))]">
          {items.map((item) => {
            const typeValue = typeField ? item.values[typeField.id] : '';
            const rarityValue = rarityField ? item.values[rarityField.id] : '';
            const value = valueField ? item.values[valueField.id] : '';
            const meta = [typeValue, rarityValue].filter(Boolean).join(' · ');
            const rarityIdx =
              rarityValue && rarityValues.length > 0
                ? Math.max(0, rarityValues.indexOf(rarityValue)) % RARITY_DOT_CLASSES.length
                : null;
            return (
              <div
                key={item.id}
                className="group relative rounded-[14px] border border-line bg-surface p-[18px] transition-[border-color,box-shadow] duration-150 hover:border-line-hover hover:shadow-card"
              >
                {rarityIdx != null && (
                  <span
                    className={`absolute right-3.5 top-3.5 h-2 w-2 rounded-full ${RARITY_DOT_CLASSES[rarityIdx]}`}
                    title={rarityValue}
                  />
                )}
                <span
                  className={`mb-[13px] flex h-11 w-11 items-center justify-center rounded-[11px] font-serif text-xl font-semibold ${
                    GLYPH_CLASSES[glyphAccentIndex(item.id)]
                  }`}
                >
                  {initialGlyph(item.name)}
                </span>
                <div className="mb-[3px] text-[15px] font-semibold text-title-2">{item.name}</div>
                <div className="mb-[11px] text-xs text-faint">
                  {meta || (item.equippable ? 'Equipable' : 'No equipable')}
                </div>
                <p className="mb-3 text-[12.5px] leading-normal text-sub">
                  {item.description || 'Sin descripción.'}
                </p>
                <div className="flex items-center justify-between">
                  {value ? (
                    <span className="flex items-center gap-1.5 text-[13px] font-semibold text-cat-discovery-text">
                      <Icon name="coin" size={14} />
                      <span className="num">{value}</span>
                    </span>
                  ) : (
                    <span />
                  )}
                  <div className="flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                    <button
                      type="button"
                      onClick={() => {
                        setEditingItem(item);
                        setItemModal(true);
                      }}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-faint hover:bg-[#2E2A22] hover:text-ink"
                      aria-label={`Editar ${item.name}`}
                    >
                      <Icon name="edit" size={15} strokeWidth={1.8} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeItem(item)}
                      className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                      aria-label={`Eliminar ${item.name}`}
                    >
                      <Icon name="trash" size={15} strokeWidth={1.8} />
                    </button>
                  </div>
                </div>
                {!item.equippable && meta && (
                  <span className="mt-2 inline-block rounded-pill bg-[#2E2A23] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[.4px] text-[#9A9182]">
                    No equipable
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-faint">
          <span className="num">
            {total} objetos · página {current} de {totalPages}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" disabled={current <= 1} onClick={() => setPage(current - 1)}>
              Anterior
            </Button>
            <Button
              variant="secondary"
              size="sm"
              disabled={current >= totalPages}
              onClick={() => setPage(current + 1)}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}

      <ItemModal
        open={itemModal}
        onClose={() => setItemModal(false)}
        user={user}
        format={format}
        item={editingItem}
        onSaved={async () => {
          setItemModal(false);
          await onRefresh();
        }}
        setError={setError}
      />
    </>
  );
}

// ── Modal de crear/editar objeto con campos dinámicos + equippable ────────────
function ItemModal({ open, onClose, user, format, item, onSaved, setError }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [equippable, setEquippable] = useState(true);
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? '');
    setDescription(item?.description ?? '');
    setEquippable(item ? Boolean(item.equippable) : true);
    setValues(item?.values ? { ...item.values } : {});
  }, [open, item]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (item) {
        await api.updateItem(item.id, user.id, { name: name.trim(), description, equippable, values });
      } else {
        await api.createItem(user.id, format.id, name.trim(), description, equippable, values);
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={item ? 'Editar item' : 'Nuevo item'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del objeto"
          className={inputCls}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descripción (opcional)"
          rows={2}
          className={`${inputCls} resize-none`}
        />
        {format.fields.map((f) => (
          <DynamicFieldInput
            key={f.id}
            field={f}
            value={values[f.id] ?? ''}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
          />
        ))}
        <label className="flex items-center gap-2 text-sm text-sub">
          <input
            type="checkbox"
            checked={equippable}
            onChange={(e) => setEquippable(e.target.checked)}
            className="h-4 w-4 accent-[#CE6A3A]"
          />
          Equipable
        </label>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : item ? 'Guardar cambios' : 'Crear item'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

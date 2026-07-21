import { useEffect, useState } from 'react';
import { glyphAccentIndex, groupFormatsBySystem, initialGlyph } from '../../lib/catalog.js';
import { inputCls, GLYPH_CLASSES } from '../ui/catalogClasses.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';
import Modal from '../ui/Modal.jsx';

// Piezas compartidas de los catálogos de formatos (Habilidades e Items, F15).

// Lista de formatos agrupados por sistema de juego, con "Sin sistema" al final.
export function FormatGroups({ formats, systemName, emptyText, emptyIcon = 'skills', onOpen, onDelete, countLabel }) {
  if (formats.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
        <Icon name={emptyIcon} size={28} className="text-muted-2" />
        <p className="text-sm text-faint">{emptyText}</p>
      </div>
    );
  }
  const groups = groupFormatsBySystem(formats);
  return (
    <div className="flex flex-col gap-6">
      {groups.map((group) => (
        <section key={group.systemId ?? 'none'}>
          <h2 className="mb-2.5 text-[11px] font-bold uppercase tracking-[1.3px] text-muted-2">
            {group.systemId != null ? systemName(group.systemId) : 'Sin sistema'}
          </h2>
          <div className="flex flex-col gap-3">
            {group.formats.map((f) => (
              <Card key={f.id} hoverable className="flex items-center gap-4 px-5 py-4">
                <span
                  className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-[10px] font-serif text-[17px] font-semibold ${
                    GLYPH_CLASSES[glyphAccentIndex(f.id)]
                  }`}
                >
                  {initialGlyph(f.name)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-serif text-[17px] font-semibold text-title-2">
                    {f.name}
                  </div>
                  <div className="truncate text-xs text-faint">
                    {[countLabel(f), f.description || null].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div className="flex flex-shrink-0 gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onOpen(f.id)}>
                    Abrir
                    <Icon name="arrow-right" size={13} />
                  </Button>
                  <button
                    type="button"
                    onClick={() => onDelete(f)}
                    className="flex h-[30px] w-[30px] items-center justify-center rounded-btn text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                    aria-label={`Eliminar formato ${f.name}`}
                  >
                    <Icon name="trash" size={15} />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

// Modal de crear formato (nombre + sistema + descripción).
export function FormatModal({ open, onClose, title, systems, defaultSystemId = '', onSubmit, setError }) {
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
    <Modal open={open} onClose={onClose} title={title}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del formato"
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
            {busy ? 'Creando…' : 'Crear formato'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// Input según el tipo del campo dinámico (text / number / boolean).
export function DynamicFieldInput({ field, value, onChange }) {
  if (field.field_type === 'boolean') {
    return (
      <label className="flex items-center gap-2 text-sm text-sub">
        <input
          type="checkbox"
          checked={value === 'true'}
          onChange={(e) => onChange(String(e.target.checked))}
          className="h-4 w-4 accent-[#CE6A3A]"
        />
        {field.field_name}
      </label>
    );
  }
  return (
    <input
      type={field.field_type === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={field.field_name}
      className={inputCls}
      aria-label={field.field_name}
    />
  );
}

// Editor de campos de un formato (agregar con tipo + eliminar).
export function FieldsEditor({ format, fieldTypes = ['text', 'number', 'boolean'], onAdd, onRemove }) {
  const [name, setName] = useState('');
  const [type, setType] = useState('text');

  async function addField(e) {
    e.preventDefault();
    if (!name.trim()) return;
    await onAdd({ field_name: name.trim(), field_type: type, sort_order: format.fields.length });
    setName('');
    setType('text');
  }

  return (
    <Card className="mb-[18px] p-5">
      <h3 className="mb-3 text-[11px] font-bold uppercase tracking-[1.2px] text-muted-2">
        Campos del formato
      </h3>
      <div className="mb-3 flex flex-wrap gap-2">
        {format.fields.length === 0 && (
          <p className="text-sm text-faint">Sin campos. Agrega los que definirán cada entrada.</p>
        )}
        {format.fields.map((f) => (
          <span
            key={f.id}
            className="flex items-center gap-2 rounded-pill border border-line bg-bg px-3 py-1.5 text-xs text-sub"
          >
            <span className="font-semibold text-ink">{f.field_name}</span>
            <span className="text-muted-2">{f.field_type}</span>
            <button
              type="button"
              onClick={() => onRemove(f)}
              className="text-faint hover:text-danger-text"
              aria-label={`Eliminar campo ${f.field_name}`}
            >
              <Icon name="x" size={12} />
            </button>
          </span>
        ))}
      </div>
      <form onSubmit={addField} className="flex flex-col gap-2 md:flex-row">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nuevo campo (p. ej. coste)"
          className={`flex-1 ${inputCls}`}
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className={`md:w-36 ${inputCls}`}>
          {fieldTypes.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <Button type="submit" disabled={!name.trim()}>
          <Icon name="plus" size={14} />
          Campo
        </Button>
      </form>
    </Card>
  );
}

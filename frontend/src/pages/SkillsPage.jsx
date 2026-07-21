import { useEffect, useRef, useState } from 'react';
import { api } from '../lib/api.js';
import {
  TYPE_FIELD_NAMES,
  distinctFieldValues,
  filterEntities,
  findField,
  glyphAccentIndex,
  initialGlyph,
  paginate,
  parseBulkSkillsText,
} from '../lib/catalog.js';
import { inputCls, GLYPH_CLASSES, BADGE_CLASSES } from '../components/ui/catalogClasses.js';
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

// Habilidades (F15): formatos por sistema → tabla de habilidades con búsqueda,
// chips de tipo, paginación, editor de campos, CRUD e importación masiva JSON.
export default function SkillsPage({ user }) {
  const [systems, setSystems] = useState([]);
  const [systemFilter, setSystemFilter] = useState('');
  const [formats, setFormats] = useState([]);
  const [detail, setDetail] = useState(null); // formato abierto (con fields + skills)
  const [formatModal, setFormatModal] = useState(false);
  const [error, setError] = useState('');

  async function loadFormats() {
    try {
      const { formats: list } = await api.listSkillFormats(user.id, systemFilter || null);
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
      const { format } = await api.getSkillFormat(formatId);
      setDetail(format);
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFormat(format) {
    if (!window.confirm(`¿Eliminar el formato "${format.name}" y todas sus habilidades?`)) return;
    try {
      await api.deleteSkillFormat(format.id, user.id);
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
        <FormatDetail
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
            title="Habilidades"
            subtitle="Define las capacidades que tus personajes pueden aprender."
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
            emptyText="Aún no hay formatos de habilidad. Crea uno para empezar el catálogo."
            onOpen={openFormat}
            onDelete={deleteFormat}
            countLabel={(f) => `${f.fields.length} campos`}
          />
        </>
      )}

      <FormatModal
        open={formatModal}
        onClose={() => setFormatModal(false)}
        title="Nuevo formato de habilidad"
        systems={systems}
        defaultSystemId={systemFilter}
        onSubmit={async ({ name, gameSystemId, description }) => {
          await api.createSkillFormat(user.id, name, gameSystemId || null, description);
          setFormatModal(false);
          await loadFormats();
        }}
        setError={setError}
      />
    </Page>
  );
}

// ── Vista de detalle de un formato: tabla + campos + import ───────────────────
function FormatDetail({ user, format, systemName, onBack, onRefresh, setError, error }) {
  const [query, setQuery] = useState('');
  const [chip, setChip] = useState('');
  const [page, setPage] = useState(1);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [skillModal, setSkillModal] = useState(false);
  const [editingSkill, setEditingSkill] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const typeField = findField(format.fields, TYPE_FIELD_NAMES);
  const chipValues = typeField ? distinctFieldValues(format.skills, typeField.id) : [];
  // Columnas clave: el campo de tipo primero (si existe) y luego el siguiente campo.
  const keyFields = [typeField, ...format.fields.filter((f) => f !== typeField)]
    .filter(Boolean)
    .slice(0, 2);

  const filtered = filterEntities(format.skills, {
    query,
    fieldId: typeField?.id ?? null,
    fieldValue: chip,
  });
  const { items, page: current, totalPages, total } = paginate(filtered, page, PER_PAGE);

  async function removeSkill(skill) {
    if (!window.confirm(`¿Eliminar la habilidad "${skill.name}"?`)) return;
    try {
      await api.deleteSkill(skill.id, user.id);
      await onRefresh();
    } catch (err) {
      setError(err.message);
    }
  }

  const badgeFor = (value) => {
    const idx = Math.max(0, chipValues.indexOf(value)) % BADGE_CLASSES.length;
    return BADGE_CLASSES[idx];
  };

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
          'Catálogo de habilidades del formato.'
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setFieldsOpen((v) => !v)}>
              <Icon name="sliders" size={15} />
              Campos
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <Icon name="upload" size={15} />
              Importar JSON
            </Button>
            <Button
              onClick={() => {
                setEditingSkill(null);
                setSkillModal(true);
              }}
              className="px-[18px] py-[11px]"
            >
              <Icon name="plus" size={16} strokeWidth={2.3} />
              Nueva habilidad
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
              await api.createSkillField(format.id, user.id, field);
              await onRefresh();
            } catch (err) {
              setError(err.message);
            }
          }}
          onRemove={async (field) => {
            if (!window.confirm(`¿Eliminar el campo "${field.field_name}" y sus valores?`)) return;
            try {
              await api.deleteSkillField(format.id, field.id, user.id);
              await onRefresh();
            } catch (err) {
              setError(err.message);
            }
          }}
        />
      )}

      {/* Búsqueda + chips de tipo */}
      <div className="mb-[18px] flex flex-wrap items-center gap-2.5">
        <div className="relative min-w-[220px] flex-1">
          <span className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" size={16} strokeWidth={1.8} />
          </span>
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Buscar habilidad…"
            className="w-full rounded-[10px] border border-line bg-surface py-2.5 pl-[38px] pr-3.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
        </div>
        {typeField && (
          <div className="flex flex-wrap gap-2">
            {['', ...chipValues].map((value) => {
              const active = chip === value;
              return (
                <button
                  key={value || 'todas'}
                  type="button"
                  onClick={() => {
                    setChip(value);
                    setPage(1);
                  }}
                  className={`rounded-btn border px-3.5 py-2 text-[12.5px] font-semibold transition-colors ${
                    active
                      ? 'border-accent bg-accent-tint text-accent-text'
                      : 'border-line bg-surface text-idle hover:text-ink'
                  }`}
                >
                  {value || 'Todas'}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Tabla de habilidades en panel */}
      <div className="overflow-hidden rounded-[14px] border border-line bg-surface">
        <div className="grid grid-cols-[2fr_90px] gap-3.5 border-b border-line-2 px-5 py-3 text-[11px] font-bold uppercase tracking-[.7px] text-muted md:grid-cols-[2fr_1fr_1fr_90px]">
          <span>Habilidad</span>
          <span className="hidden md:block">{keyFields[0]?.field_name ?? ''}</span>
          <span className="hidden md:block">{keyFields[1]?.field_name ?? ''}</span>
          <span />
        </div>
        {items.length === 0 ? (
          <p className="px-5 py-10 text-center text-sm text-faint">
            {format.skills.length === 0
              ? 'Aún no hay habilidades en este formato. Crea una o importa un JSON.'
              : 'Sin resultados para la búsqueda actual.'}
          </p>
        ) : (
          items.map((skill) => {
            const typeValue = typeField ? skill.values[typeField.id] : null;
            return (
              <div
                key={skill.id}
                className="group grid grid-cols-[2fr_90px] items-center gap-3.5 border-b border-[#221E18] px-5 py-3.5 last:border-b-0 hover:bg-hover md:grid-cols-[2fr_1fr_1fr_90px]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={`flex h-[34px] w-[34px] flex-shrink-0 items-center justify-center rounded-[9px] font-serif text-[15px] font-semibold ${
                      GLYPH_CLASSES[glyphAccentIndex(skill.id)]
                    }`}
                  >
                    {initialGlyph(skill.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold text-title-2">{skill.name}</div>
                    <div className="truncate text-xs text-faint">{skill.description || '—'}</div>
                  </div>
                </div>
                <span className="hidden min-w-0 md:block">
                  {keyFields[0] &&
                    (typeField && keyFields[0] === typeField && typeValue ? (
                      <span
                        className={`inline-block w-max rounded-pill px-[9px] py-[3px] text-[10.5px] font-bold uppercase tracking-[.4px] ${badgeFor(typeValue)}`}
                      >
                        {typeValue}
                      </span>
                    ) : (
                      <span className="truncate text-[13.5px] text-sub">
                        {skill.values[keyFields[0].id] || '—'}
                      </span>
                    ))}
                </span>
                <span className="hidden truncate text-[13.5px] text-sub md:block">
                  {keyFields[1] ? skill.values[keyFields[1].id] || '—' : ''}
                </span>
                <div className="flex justify-end gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => {
                      setEditingSkill(skill);
                      setSkillModal(true);
                    }}
                    className="flex h-7 w-7 items-center justify-center rounded-[7px] text-faint hover:bg-[#2E2A22] hover:text-ink"
                    aria-label={`Editar ${skill.name}`}
                  >
                    <Icon name="edit" size={15} strokeWidth={1.8} />
                  </button>
                  <button
                    type="button"
                    onClick={() => removeSkill(skill)}
                    className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
                    aria-label={`Eliminar ${skill.name}`}
                  >
                    <Icon name="trash" size={15} strokeWidth={1.8} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Paginación (50 por página) */}
      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between text-sm text-faint">
          <span className="num">
            {total} habilidades · página {current} de {totalPages}
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

      <SkillModal
        open={skillModal}
        onClose={() => setSkillModal(false)}
        user={user}
        format={format}
        skill={editingSkill}
        onSaved={async () => {
          setSkillModal(false);
          await onRefresh();
        }}
        setError={setError}
      />
      <BulkImportModal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        user={user}
        format={format}
        onImported={onRefresh}
      />
    </>
  );
}

// ── Modal de crear/editar habilidad con campos dinámicos ──────────────────────
function SkillModal({ open, onClose, user, format, skill, onSaved, setError }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [values, setValues] = useState({});
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(skill?.name ?? '');
    setDescription(skill?.description ?? '');
    setValues(skill?.values ? { ...skill.values } : {});
  }, [open, skill]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      if (skill) {
        await api.updateSkill(skill.id, user.id, { name: name.trim(), description, values });
      } else {
        await api.createSkill(user.id, format.id, name.trim(), description, values);
      }
      await onSaved();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title={skill ? 'Editar habilidad' : 'Nueva habilidad'}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre de la habilidad"
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
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Guardando…' : skill ? 'Guardar cambios' : 'Crear habilidad'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

// ── Modal de importación masiva JSON ──────────────────────────────────────────
function BulkImportModal({ open, onClose, user, format, onImported }) {
  const [text, setText] = useState('');
  const [localError, setLocalError] = useState('');
  const [report, setReport] = useState(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    if (open) {
      setText('');
      setLocalError('');
      setReport(null);
    }
  }, [open]);

  async function loadFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setText(await file.text());
    if (fileRef.current) fileRef.current.value = '';
  }

  async function runImport() {
    setLocalError('');
    setReport(null);
    // Validación en cliente antes de llamar al backend (estructura del JSON).
    const parsed = parseBulkSkillsText(text);
    if (!parsed.ok) {
      setLocalError(parsed.error);
      return;
    }
    setBusy(true);
    try {
      const result = await api.bulkImportSkills(user.id, format.id, parsed.data);
      setReport(result);
      await onImported();
    } catch (err) {
      setLocalError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Importación masiva (JSON)">
      <div className="flex flex-col gap-3">
        <p className="text-[12.5px] leading-normal text-faint">
          Estructura: claves = nombres de habilidad, valores = objetos de campos. Los campos
          desconocidos se crean automáticamente en el formato.
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder='{"Tajo demoledor": {"tipo": "Ataque", "coste": 2, "description": "Golpe pesado."}}'
          rows={7}
          className={`${inputCls} num resize-none font-mono text-xs`}
        />
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            onChange={loadFile}
            className="hidden"
            id="bulk-skills-file"
          />
          <Button variant="secondary" size="sm" onClick={() => fileRef.current?.click()}>
            <Icon name="file" size={14} />
            Cargar archivo .json
          </Button>
        </div>

        {localError && (
          <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{localError}</p>
        )}
        {report && (
          <div className="rounded-btn border border-line bg-bg px-3.5 py-3 text-sm">
            <p className="mb-1 flex items-center gap-1.5 font-semibold text-cat-explore-text">
              <Icon name="check" size={14} />
              Importación completada
            </p>
            <ul className="num flex flex-col gap-0.5 text-sub">
              <li>Importadas: {report.imported}</li>
              <li>Omitidas (duplicadas o inválidas): {report.skipped}</li>
              <li>
                Campos creados: {report.createdFields?.length > 0 ? report.createdFields.join(', ') : 'ninguno'}
              </li>
            </ul>
          </div>
        )}

        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>{report ? 'Cerrar' : 'Cancelar'}</Button>
          <Button onClick={runImport} disabled={busy || !text.trim()}>
            <Icon name="upload" size={14} />
            {busy ? 'Importando…' : 'Importar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

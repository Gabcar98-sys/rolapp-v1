import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

// CRUD de formatos de habilidad (campos parametrizables) y de las habilidades del catálogo.
// Si se pasa systemId, los formatos creados quedan ligados a ese sistema de juego.
export default function SkillsPanel({ user, systemId = null }) {
  const [formats, setFormats] = useState([]);
  const [selected, setSelected] = useState(null); // formato expandido (con fields + skills)
  const [newFormatName, setNewFormatName] = useState('');
  const [newFieldName, setNewFieldName] = useState('');
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillValues, setNewSkillValues] = useState({});
  const [error, setError] = useState('');

  async function loadFormats() {
    try {
      const { formats: list } = await api.listSkillFormats(user.id, systemId);
      setFormats(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadFormats();
    // Recarga al cambiar el DM o el sistema seleccionado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id, systemId]);

  async function openFormat(formatId) {
    setError('');
    try {
      const { format } = await api.getSkillFormat(formatId);
      setSelected(format);
      setNewSkillValues({});
    } catch (err) {
      setError(err.message);
    }
  }

  async function createFormat(e) {
    e.preventDefault();
    if (!newFormatName.trim()) return;
    setError('');
    try {
      await api.createSkillFormat(user.id, newFormatName.trim(), systemId);
      setNewFormatName('');
      await loadFormats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function deleteFormat(format) {
    if (!window.confirm(`¿Eliminar el formato "${format.name}" y todas sus habilidades?`)) return;
    setError('');
    try {
      await api.deleteSkillFormat(format.id, user.id);
      if (selected?.id === format.id) setSelected(null);
      await loadFormats();
    } catch (err) {
      setError(err.message);
    }
  }

  async function addField(e) {
    e.preventDefault();
    if (!newFieldName.trim() || !selected) return;
    setError('');
    try {
      await api.createSkillField(selected.id, user.id, {
        field_name: newFieldName.trim(),
        sort_order: selected.fields.length,
      });
      setNewFieldName('');
      await openFormat(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function addSkill(e) {
    e.preventDefault();
    if (!newSkillName.trim() || !selected) return;
    setError('');
    try {
      await api.createSkill(user.id, selected.id, newSkillName.trim(), '', newSkillValues);
      setNewSkillName('');
      setNewSkillValues({});
      await openFormat(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  async function removeSkill(skill) {
    setError('');
    try {
      await api.deleteSkill(skill.id, user.id);
      await openFormat(selected.id);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      <Card className="p-4">
        <h3 className="mb-3 text-sm font-semibold text-gray-200">Nuevo formato de habilidad</h3>
        <form onSubmit={createFormat} className="flex flex-col gap-3 md:flex-row">
          <input
            value={newFormatName}
            onChange={(e) => setNewFormatName(e.target.value)}
            placeholder="Nombre del formato (p. ej. Habilidades)"
            className={`flex-1 ${inputCls}`}
          />
          <Button type="submit">Crear formato</Button>
        </form>
      </Card>

      <section className="flex flex-col gap-3">
        {formats.length === 0 ? (
          <p className="text-center text-sm text-gray-500">Aún no hay formatos de habilidad.</p>
        ) : (
          formats.map((fmt) => (
            <Card key={fmt.id} className="p-4">
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-gray-100">{fmt.name}</p>
                  <p className="mt-0.5 text-xs text-gray-400">
                    {fmt.fields.length} campos
                  </p>
                </div>
                <div className="ml-3 flex flex-shrink-0 gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => (selected?.id === fmt.id ? setSelected(null) : openFormat(fmt.id))}
                  >
                    {selected?.id === fmt.id ? 'Cerrar' : 'Editar'}
                  </Button>
                  <Button variant="danger" size="sm" onClick={() => deleteFormat(fmt)}>
                    🗑
                  </Button>
                </div>
              </div>

              {selected?.id === fmt.id && (
                <div className="mt-4 flex flex-col gap-4 border-t border-ink-line pt-4">
                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Campos
                    </h4>
                    <div className="mb-2 flex flex-wrap gap-2">
                      {selected.fields.map((f) => (
                        <span
                          key={f.id}
                          className="flex items-center gap-2 rounded-md border border-ink-line bg-ink-900 px-2 py-1 text-xs text-gray-300"
                        >
                          {f.field_name}
                          <button
                            onClick={() =>
                              api
                                .deleteSkillField(selected.id, f.id, user.id)
                                .then(() => openFormat(selected.id))
                                .catch((err) => setError(err.message))
                            }
                            className="text-gray-500 hover:text-danger"
                            aria-label={`Eliminar campo ${f.field_name}`}
                          >
                            ✕
                          </button>
                        </span>
                      ))}
                    </div>
                    <form onSubmit={addField} className="flex gap-2">
                      <input
                        value={newFieldName}
                        onChange={(e) => setNewFieldName(e.target.value)}
                        placeholder="Nuevo campo (p. ej. attribute)"
                        className={`flex-1 ${inputCls}`}
                      />
                      <Button size="sm" type="submit">
                        + Campo
                      </Button>
                    </form>
                  </div>

                  <div>
                    <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Habilidades ({selected.skills.length})
                    </h4>
                    <div className="mb-3 flex flex-col gap-2">
                      {selected.skills.map((sk) => (
                        <div
                          key={sk.id}
                          className="flex items-center justify-between rounded-md border border-ink-line bg-ink-900 px-3 py-2"
                        >
                          <div className="min-w-0">
                            <span className="text-sm text-gray-100">{sk.name}</span>
                            <span className="ml-2 text-xs text-gray-500">
                              {selected.fields
                                .map((f) => sk.values[f.id])
                                .filter(Boolean)
                                .join(' · ')}
                            </span>
                          </div>
                          <button
                            onClick={() => removeSkill(sk)}
                            className="ml-3 flex-shrink-0 text-gray-500 hover:text-danger"
                            aria-label={`Eliminar ${sk.name}`}
                          >
                            🗑
                          </button>
                        </div>
                      ))}
                    </div>
                    <form onSubmit={addSkill} className="flex flex-col gap-2">
                      <input
                        value={newSkillName}
                        onChange={(e) => setNewSkillName(e.target.value)}
                        placeholder="Nombre de la habilidad"
                        className={inputCls}
                      />
                      {selected.fields.map((f) => (
                        <input
                          key={f.id}
                          value={newSkillValues[f.id] ?? ''}
                          onChange={(e) =>
                            setNewSkillValues((prev) => ({ ...prev, [f.id]: e.target.value }))
                          }
                          placeholder={f.field_name}
                          className={inputCls}
                        />
                      ))}
                      <Button size="sm" type="submit">
                        + Habilidad
                      </Button>
                    </form>
                  </div>
                </div>
              )}
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

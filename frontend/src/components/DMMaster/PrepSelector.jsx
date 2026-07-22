import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Icon from '../ui/Icon.jsx';
import Button from '../ui/Button.jsx';

// Vista de entrada de Preparar Sesión: lista de preparaciones del DM. Crear, abrir
// (para editar su grafo/lista de eventos) y eliminar.
export default function PrepSelector({ user, onOpen }) {
  const [preps, setPreps] = useState([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function load() {
    try {
      const { preps: list } = await api.listPreps(user.id);
      setPreps(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function createPrep(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      const { prep } = await api.createPrep(user.id, name.trim());
      setName('');
      await load();
      if (prep) onOpen(prep);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function deletePrep(prep) {
    if (!window.confirm(`¿Eliminar la preparación "${prep.name}" y todos sus eventos?`)) return;
    setError('');
    try {
      await api.deletePrep(prep.id, user.id);
      await load();
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="min-w-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-[820px] px-8 py-8">
        <div className="mb-1 text-[11px] font-bold uppercase tracking-[1.2px] text-accent-text">
          Preparar Sesión
        </div>
        <h1 className="mb-1 font-serif text-[30px] font-semibold tracking-[-0.2px] text-title">
          Preparaciones
        </h1>
        <p className="mb-6 text-sm text-faint">
          Construye ubicaciones, eventos y enlaces narrativos para tus sesiones.
        </p>

        <form onSubmit={createPrep} className="mb-6 flex flex-col gap-2.5 sm:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la preparación"
            className="flex-1 rounded-btn border border-line bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-muted focus:border-accent"
          />
          <Button type="submit" disabled={busy}>
            <Icon name="plus" size={15} strokeWidth={2.2} />
            {busy ? 'Creando…' : 'Nueva preparación'}
          </Button>
        </form>

        {error && (
          <p className="mb-3 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">
            {error}
          </p>
        )}

        {preps.length === 0 ? (
          <div className="rounded-card border border-dashed border-line-hover px-5 py-12 text-center">
            <Icon name="map" size={30} className="mx-auto mb-2.5 text-muted" />
            <p className="text-sm text-faint">Aún no tienes preparaciones. Crea la primera arriba.</p>
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {preps.map((prep) => (
              <div
                key={prep.id}
                className="group flex items-center justify-between gap-3 rounded-card border border-line bg-surface-2 p-4 transition-colors hover:border-line-hover hover:shadow-card"
              >
                <button
                  type="button"
                  onClick={() => onOpen(prep)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-serif text-[17px] font-semibold text-title-2">
                    {prep.name}
                  </p>
                  <p className="mt-0.5 text-xs text-faint">
                    {prep.event_count} evento{prep.event_count !== 1 ? 's' : ''}
                    {prep.campaign_name ? ` · ${prep.campaign_name}` : ''}
                  </p>
                </button>
                <div className="flex flex-shrink-0 items-center gap-1.5">
                  <Button size="sm" variant="secondary" onClick={() => onOpen(prep)}>
                    Abrir
                  </Button>
                  <button
                    type="button"
                    title="Eliminar"
                    aria-label="Eliminar preparación"
                    onClick={() => deletePrep(prep)}
                    className="flex h-8 w-8 items-center justify-center rounded-btn text-danger-idle hover:bg-danger-tint hover:text-danger-text"
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

// Lista de preparaciones del DM: crear, eliminar y seleccionar una para editar su grafo.
export default function SessionPrepPanel({ user, onEditPrep }) {
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
    // load es estable para este componente; recargar solo al cambiar el DM.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function createPrep(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError('');
    try {
      await api.createPrep(user.id, name.trim());
      setName('');
      await load();
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
    <div className="flex flex-col gap-4">
      <Card className="p-4">
        <h2 className="mb-3 text-sm font-semibold text-gray-200">Nueva preparación</h2>
        <form onSubmit={createPrep} className="flex flex-col gap-3 md:flex-row">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Nombre de la preparación"
            className="flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
          />
          <Button type="submit" disabled={busy}>
            {busy ? '…' : 'Crear'}
          </Button>
        </form>
      </Card>

      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      <section className="flex flex-col gap-3">
        {preps.length === 0 ? (
          <p className="text-center text-sm text-gray-500">Aún no tienes preparaciones.</p>
        ) : (
          preps.map((prep) => (
            <Card key={prep.id} className="flex items-center justify-between p-4">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-gray-100">{prep.name}</p>
                <p className="mt-0.5 text-xs text-gray-400">
                  {prep.event_count} eventos
                  {prep.campaign_name ? ` · ${prep.campaign_name}` : ''}
                </p>
              </div>
              <div className="ml-3 flex flex-shrink-0 gap-2">
                <Button size="sm" onClick={() => onEditPrep(prep)}>
                  Editar
                </Button>
                <Button variant="danger" size="sm" onClick={() => deletePrep(prep)}>
                  🗑
                </Button>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}

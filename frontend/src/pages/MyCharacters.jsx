import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import CharacterSheet from '../components/Character/CharacterSheet.jsx';
import CharacterStatsPanel from '../components/Stats/CharacterStatsPanel.jsx';

const inputCls =
  'rounded-md border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Mis personajes: lista, crea (eligiendo sistema o partiendo de un pregen del DM),
// edita la ficha completa y elimina. Accesible para todos desde el Lobby.
export default function MyCharacters({ user, onBack }) {
  const [characters, setCharacters] = useState([]);
  const [systems, setSystems] = useState([]);
  const [baseChars, setBaseChars] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'create' | 'pregen' | 'sheet' | 'stats'
  const [activeId, setActiveId] = useState(null);
  const [form, setForm] = useState({ name: '', game_system_template_id: '' });
  const [error, setError] = useState('');

  async function loadCharacters() {
    try {
      const { characters: list } = await api.listMyCharacters(user.id);
      setCharacters(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCharacters();
    // El catálogo de sistemas es global; sin dm_id devuelve todos los del DM actual.
    api.listGameSystems(user.id).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
    api.listBaseCharacters().then(({ baseCharacters }) => setBaseChars(baseCharacters ?? [])).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

  async function createCharacter(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError('');
    try {
      const { character } = await api.createCharacter(
        user.id,
        form.name.trim(),
        form.game_system_template_id || null
      );
      setForm({ name: '', game_system_template_id: '' });
      await loadCharacters();
      setActiveId(character.id);
      setView('sheet');
    } catch (err) {
      setError(err.message);
    }
  }

  async function adopt(bcId) {
    setError('');
    try {
      const { character } = await api.adoptBaseCharacter(bcId, user.id);
      await loadCharacters();
      setActiveId(character.id);
      setView('sheet');
    } catch (err) {
      setError(err.message);
    }
  }

  async function remove(char) {
    if (!window.confirm(`¿Eliminar el personaje "${char.name}"?`)) return;
    setError('');
    try {
      await api.deleteCharacter(char.id, user.id);
      await loadCharacters();
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Estadísticas de un personaje ─────────────────────────────────────────────
  if (view === 'stats' && activeId) {
    const active = characters.find((c) => c.id === activeId);
    return (
      <div className="mx-auto flex min-h-full max-w-3xl flex-col gap-6 p-4 md:p-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-accent-text">Estadísticas</h1>
            <p className="text-sm text-sub">{active?.name ?? 'Personaje'}</p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              setView('list');
              setActiveId(null);
            }}
          >
            ← Volver
          </Button>
        </header>
        <CharacterStatsPanel characterId={activeId} />
      </div>
    );
  }

  // ── Ficha de un personaje ───────────────────────────────────────────────────
  if (view === 'sheet' && activeId) {
    return (
      <div className="mx-auto h-full max-w-3xl">
        <CharacterSheet
          characterId={activeId}
          user={user}
          canEdit
          onBack={() => {
            setView('list');
            setActiveId(null);
            loadCharacters();
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col gap-6 p-4 md:p-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-accent-text">Mis personajes</h1>
          <p className="text-sm text-sub">{user.username}</p>
        </div>
        <div className="flex items-center gap-2">
          {view === 'list' && (
            <>
              {baseChars.length > 0 && (
                <Button variant="secondary" size="sm" onClick={() => setView('pregen')}>
                  <Icon name="id-card" size={15} />
                  Desde pregen
                </Button>
              )}
              <Button size="sm" onClick={() => setView('create')}>
                + Nuevo
              </Button>
            </>
          )}
          {onBack && (
            <Button variant="secondary" size="sm" onClick={onBack}>
              ← Lobby
            </Button>
          )}
        </div>
      </header>

      {error && (
        <p className="rounded-md bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      {view === 'create' && (
        <Card className="max-w-lg p-4">
          <h3 className="mb-3 text-sm font-semibold text-title">Crear personaje</h3>
          <form onSubmit={createCharacter} className="flex flex-col gap-3">
            <input
              value={form.name}
              onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
              placeholder="Nombre del personaje"
              className={inputCls}
            />
            <select
              value={form.game_system_template_id}
              onChange={(e) => setForm((p) => ({ ...p, game_system_template_id: e.target.value }))}
              className={inputCls}
            >
              <option value="">— Sistema de juego (opcional) —</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="submit" className="flex-1">
                Crear
              </Button>
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setView('list')}>
                Cancelar
              </Button>
            </div>
          </form>
        </Card>
      )}

      {view === 'pregen' && (
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" onClick={() => setView('list')}>
              ← Volver
            </Button>
            <h2 className="text-sm font-semibold text-title">Personajes base disponibles</h2>
          </div>
          {baseChars.length === 0 ? (
            <p className="text-center text-sm text-faint">No hay personajes base disponibles.</p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {baseChars.map((bc) => (
                <PregenCard key={bc.id} baseChar={bc} onAdopt={() => adopt(bc.id)} />
              ))}
            </div>
          )}
        </div>
      )}

      {view === 'list' && (
        <section className="flex flex-col gap-3">
          {characters.length === 0 ? (
            <p className="py-8 text-center text-sm text-faint">
              No tienes personajes. Crea uno con &quot;+ Nuevo&quot;.
            </p>
          ) : (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              {characters.map((char) => (
                <CharacterRow
                  key={char.id}
                  char={char}
                  onOpen={() => {
                    setActiveId(char.id);
                    setView('sheet');
                  }}
                  onStats={() => {
                    setActiveId(char.id);
                    setView('stats');
                  }}
                  onDelete={() => remove(char)}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}

// ── Tarjeta de personaje base (pregen) ───────────────────────────────────────
// Exportada para poder testearla con SSR sin jsdom (lección F20): los contadores
// usan iconos de línea (F35), no emojis.
export function PregenCard({ baseChar, onAdopt }) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        {/* avatar_icon es un DATO del personaje base, no un emoji escrito en el código. */}
        <span className="text-3xl">{baseChar.avatar_icon}</span>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-title">{baseChar.name}</p>
          {baseChar.game_system_name && (
            <p className="text-xs text-sub">{baseChar.game_system_name}</p>
          )}
        </div>
      </div>
      <p className="mt-2 flex gap-3 text-xs text-faint">
        <span className="flex items-center gap-1" title="Atributos">
          <Icon name="sliders" size={12} />
          {baseChar.attrs?.length ?? 0}
        </span>
        <span className="flex items-center gap-1" title="Habilidades">
          <Icon name="skills" size={12} />
          {baseChar.skillLinks?.length ?? 0}
        </span>
        <span className="flex items-center gap-1" title="Inventario">
          <Icon name="bag" size={12} />
          {baseChar.inventory?.length ?? 0}
        </span>
      </p>
      <Button size="sm" className="mt-3 w-full" onClick={onAdopt}>
        Crear desde este pregen
      </Button>
    </Card>
  );
}

// ── Fila de personaje propio (ver ficha / estadísticas / eliminar) ────────────
// Exportada para SSR-test (lección F20). Los botones de solo-icono conservan su
// aria-label porque el Icon es aria-hidden.
export function CharacterRow({ char, onOpen, onStats, onDelete }) {
  return (
    <Card className="flex items-center justify-between p-4">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-title">{char.name}</p>
        <p className="mt-0.5 text-xs text-sub">{char.game_system_name || 'Sin sistema'}</p>
      </div>
      <div className="ml-3 flex flex-shrink-0 gap-2">
        <Button size="sm" onClick={onOpen}>
          Ver ficha
        </Button>
        <Button
          variant="secondary"
          size="sm"
          aria-label={`Ver estadísticas de ${char.name}`}
          onClick={onStats}
        >
          <Icon name="chart" size={15} />
        </Button>
        <Button
          variant="danger"
          size="sm"
          aria-label={`Eliminar ${char.name}`}
          onClick={onDelete}
        >
          <Icon name="trash" size={15} />
        </Button>
      </div>
    </Card>
  );
}

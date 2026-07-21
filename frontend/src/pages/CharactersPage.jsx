import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import {
  HP_ATTR_NAMES,
  LEVEL_ATTR_NAMES,
  XP_ATTR_NAMES,
  barWidthClass,
  coreStats,
  findAttr,
  glyphAccentIndex,
  initialGlyph,
  percent,
} from '../lib/catalog.js';
import { inputCls, GLYPH_CLASSES } from '../components/ui/catalogClasses.js';
import Button from '../components/ui/Button.jsx';
import Card from '../components/ui/Card.jsx';
import Icon from '../components/ui/Icon.jsx';
import Modal from '../components/ui/Modal.jsx';
import Page from '../components/layout/Page.jsx';
import PageHeader from '../components/layout/PageHeader.jsx';
import CharacterSheet from '../components/Character/CharacterSheet.jsx';
import CharacterStatsPanel from '../components/Stats/CharacterStatsPanel.jsx';

// Personajes (F15): para el DM = todos los personajes con su dueño; para el
// jugador = los suyos (crear, adoptar plantilla, ficha, estadísticas, eliminar).
export default function CharactersPage({ user }) {
  const isDM = user.role === 'dm';
  const [characters, setCharacters] = useState([]);
  const [systems, setSystems] = useState([]);
  const [baseChars, setBaseChars] = useState([]);
  const [view, setView] = useState('list'); // 'list' | 'pregen' | 'sheet' | 'stats'
  const [activeId, setActiveId] = useState(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [error, setError] = useState('');

  async function loadCharacters() {
    try {
      const { characters: list } = isDM
        ? await api.listAllCharacters(user.id)
        : await api.listMyCharacters(user.id);
      setCharacters(list);
    } catch (err) {
      setError(err.message);
    }
  }

  useEffect(() => {
    loadCharacters();
    // El jugador ve todos los sistemas (para elegir al crear); el DM, los suyos.
    api.listGameSystems(isDM ? user.id : null).then(({ systems: s }) => setSystems(s ?? [])).catch(() => {});
    // Plantillas adoptables: para el jugador solo las públicas; el DM ve las suyas.
    api
      .listBaseCharacters(isDM ? user.id : null)
      .then(({ baseCharacters }) => setBaseChars(baseCharacters ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user.id]);

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

  // ── Estadísticas de un personaje ────────────────────────────────────────────
  if (view === 'stats' && activeId) {
    const active = characters.find((c) => c.id === activeId);
    return (
      <Page maxWidthClass="max-w-[900px]">
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setView('list');
              setActiveId(null);
            }}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
          >
            <Icon name="arrow-left" size={14} />
            Personajes
          </button>
        </div>
        <PageHeader title="Estadísticas" subtitle={active?.name ?? 'Personaje'} />
        <CharacterStatsPanel characterId={activeId} />
      </Page>
    );
  }

  // ── Ficha de un personaje ───────────────────────────────────────────────────
  if (view === 'sheet' && activeId) {
    const active = characters.find((c) => c.id === activeId);
    // El backend valida permisos; el dueño siempre edita, el DM solo si el
    // personaje está en una de sus sesiones.
    const canEdit = !active || String(active.user_id) === String(user.id) || isDM;
    return (
      <Page maxWidthClass="max-w-[820px]">
        <div className="h-full overflow-hidden rounded-card border border-line bg-surface">
          <CharacterSheet
            characterId={activeId}
            user={user}
            canEdit={canEdit}
            onBack={() => {
              setView('list');
              setActiveId(null);
              loadCharacters();
            }}
          />
        </div>
      </Page>
    );
  }

  // ── Adoptar plantilla (pregen) ──────────────────────────────────────────────
  if (view === 'pregen') {
    return (
      <Page>
        <div className="mb-1 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setView('list')}
            className="flex items-center gap-1.5 text-[12.5px] font-semibold text-faint hover:text-ink"
          >
            <Icon name="arrow-left" size={14} />
            Personajes
          </button>
        </div>
        <PageHeader
          title="Adoptar plantilla"
          subtitle="Crea tu personaje a partir de un personaje base del DM."
        />
        {error && (
          <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
        )}
        {baseChars.length === 0 ? (
          <p className="py-8 text-center text-sm text-faint">No hay plantillas disponibles.</p>
        ) : (
          <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]">
            {baseChars.map((bc) => (
              <Card key={bc.id} hoverable className="flex flex-col p-5">
                <div className="mb-3 flex items-center gap-3">
                  <span
                    className={`flex h-[46px] w-[46px] flex-shrink-0 items-center justify-center rounded-[11px] font-serif text-[22px] font-semibold ${
                      GLYPH_CLASSES[glyphAccentIndex(bc.id)]
                    }`}
                  >
                    {initialGlyph(bc.name)}
                  </span>
                  <div className="min-w-0">
                    <div className="truncate font-serif text-[19px] font-semibold text-title-2">
                      {bc.name}
                    </div>
                    <div className="truncate text-[12.5px] text-faint">
                      {bc.game_system_name || 'Sin sistema'}
                    </div>
                  </div>
                </div>
                <div className="num mb-3 flex items-center gap-3 text-[11.5px] text-faint">
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
                <Button size="sm" className="mt-auto w-full" onClick={() => adopt(bc.id)}>
                  Crear desde esta plantilla
                </Button>
              </Card>
            ))}
          </div>
        )}
      </Page>
    );
  }

  // ── Lista (grid de tarjetas) ────────────────────────────────────────────────
  return (
    <Page>
      <PageHeader
        title={isDM ? 'Personajes' : 'Mis Personajes'}
        subtitle={
          isDM
            ? 'Los héroes creados por tus jugadores a partir de las plantillas.'
            : 'Tus héroes: crea uno nuevo o adopta una plantilla del DM.'
        }
        actions={
          <>
            {baseChars.length > 0 && (
              <Button variant="secondary" onClick={() => setView('pregen')}>
                <Icon name="id-card" size={15} />
                Desde plantilla
              </Button>
            )}
            <Button onClick={() => setCreateOpen(true)} className="px-[18px] py-[11px]">
              <Icon name="plus" size={16} strokeWidth={2.3} />
              Nuevo personaje
            </Button>
          </>
        }
      />

      {error && (
        <p className="mb-4 rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>
      )}

      {characters.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-card border border-dashed border-line p-12 text-center">
          <Icon name="user" size={28} className="text-muted-2" />
          <p className="text-sm text-faint">
            {isDM
              ? 'Todavía no hay personajes creados por los jugadores.'
              : 'No tienes personajes. Crea uno nuevo o adopta una plantilla.'}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-[18px] md:grid-cols-[repeat(auto-fill,minmax(340px,1fr))]">
          {characters.map((char) => (
            <CharacterCard
              key={char.id}
              char={char}
              isOwner={String(char.user_id) === String(user.id)}
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

      <CreateCharacterModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        systems={systems}
        onSubmit={async ({ name, gameSystemId }) => {
          const { character } = await api.createCharacter(user.id, name, gameSystemId || null);
          setCreateOpen(false);
          await loadCharacters();
          setActiveId(character.id);
          setView('sheet');
        }}
        setError={setError}
      />
    </Page>
  );
}

// ── Tarjeta de personaje (glifo + barras PV/EXP + 4 stats core) ───────────────
function CharacterCard({ char, isOwner, onOpen, onStats, onDelete }) {
  const accent = glyphAccentIndex(char.id);
  const hp = findAttr(char.templateAttrs, HP_ATTR_NAMES);
  const xp = findAttr(char.templateAttrs, XP_ATTR_NAMES);
  const level = findAttr(char.templateAttrs, LEVEL_ATTR_NAMES);
  const hpPct = hp ? percent(hp.value, hp.max_value) : null;
  const xpPct = xp ? percent(xp.value, xp.max_value) : null;
  const stats = coreStats(char.templateAttrs);
  const subtitle = [
    char.game_system_name || 'Sin sistema',
    level?.value ? `Nivel ${level.value}` : null,
    char.username,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="group overflow-hidden rounded-[14px] border border-line bg-surface transition-[border-color,box-shadow] duration-150 hover:border-line-hover hover:shadow-card">
      <div className="flex items-center gap-3.5 px-5 pb-0 pt-[18px]">
        <button
          type="button"
          onClick={onOpen}
          className={`flex h-[54px] w-[54px] flex-shrink-0 items-center justify-center rounded-[14px] font-serif text-[23px] font-semibold ${GLYPH_CLASSES[accent]}`}
          aria-label={`Abrir ficha de ${char.name}`}
        >
          {initialGlyph(char.name)}
        </button>
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="truncate font-serif text-[19px] font-semibold leading-tight text-title-2">
            {char.name}
          </div>
          <div className="truncate text-[12.5px] text-faint">{subtitle}</div>
        </button>
        <div className="flex flex-shrink-0 gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          <button
            type="button"
            onClick={onStats}
            className="flex h-7 w-7 items-center justify-center rounded-[7px] text-faint hover:bg-[#2E2A22] hover:text-ink"
            aria-label={`Estadísticas de ${char.name}`}
          >
            <Icon name="chart" size={15} strokeWidth={1.8} />
          </button>
          {isOwner && (
            <button
              type="button"
              onClick={onDelete}
              className="flex h-7 w-7 items-center justify-center rounded-[7px] text-[#A87D72] hover:bg-danger-tint hover:text-danger-text"
              aria-label={`Eliminar ${char.name}`}
            >
              <Icon name="trash" size={15} strokeWidth={1.8} />
            </button>
          )}
        </div>
      </div>

      {/* Barras PV / EXP (degradan con elegancia si el sistema no las define) */}
      {(hpPct != null || xpPct != null) && (
        <div className="px-5 pb-3.5 pt-3">
          {hpPct != null && (
            <div className="mb-2 flex items-center gap-2">
              <span className="w-7 flex-shrink-0 text-[11px] uppercase text-faint">PV</span>
              <div className="h-[7px] flex-1 overflow-hidden rounded bg-[#2A2620]">
                <div className={`h-full rounded bg-cat-explore-bar ${barWidthClass(hpPct)}`} />
              </div>
              <span className="num w-[52px] flex-shrink-0 text-right text-xs text-sub">
                {hp.value}/{hp.max_value}
              </span>
            </div>
          )}
          {xpPct != null && (
            <div className="flex items-center gap-2">
              <span className="w-7 flex-shrink-0 text-[11px] uppercase text-faint">EXP</span>
              <div className="h-[7px] flex-1 overflow-hidden rounded bg-[#2A2620]">
                <div className={`h-full rounded bg-accent ${barWidthClass(xpPct)}`} />
              </div>
              <span className="num w-[52px] flex-shrink-0 text-right text-xs text-sub">{xpPct}%</span>
            </div>
          )}
        </div>
      )}

      {/* Pie: 4 stats core en cuadrícula (degrada si el sistema no las define) */}
      {stats.length > 0 ? (
        <div className="grid grid-cols-4 border-t border-line-2">
          {stats.map((s) => (
            <div key={s.label} className="border-r border-[#221E18] py-[11px] text-center last:border-r-0">
              <div className="num font-serif text-lg font-semibold text-title-2">{s.value}</div>
              <div className="text-[10px] uppercase tracking-[.5px] text-faint">{s.label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className="border-t border-line-2 px-5 py-2.5 text-center text-[11.5px] text-faint">
          Sin atributos core definidos
        </div>
      )}
    </div>
  );
}

function CreateCharacterModal({ open, onClose, systems, onSubmit, setError }) {
  const [name, setName] = useState('');
  const [systemId, setSystemId] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setName('');
      setSystemId('');
    }
  }, [open]);

  async function submit(e) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSubmit({ name: name.trim(), gameSystemId: systemId });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Nuevo personaje">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nombre del personaje"
          className={inputCls}
        />
        <select
          value={systemId}
          onChange={(e) => setSystemId(e.target.value)}
          className={`${inputCls} text-idle`}
        >
          <option value="">— Sistema de juego (opcional) —</option>
          {systems.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
        <div className="mt-1 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" disabled={busy || !name.trim()}>
            {busy ? 'Creando…' : 'Crear personaje'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

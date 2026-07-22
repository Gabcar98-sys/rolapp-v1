import { useCallback, useEffect, useState } from 'react';
import socket from '../../lib/socket.js';
import { api } from '../../lib/api.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import CharacterSheet from '../Character/CharacterSheet.jsx';

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Panel de personajes en sesión. El jugador elige qué personaje lleva (lo vincula vía
// session_characters) y edita su ficha. El DM ve/gestiona los de la sesión. Escucha
// characters:list_updated y characters:updated para sincronizar en vivo.
export default function SessionCharactersPanel({ sessionId, session, user }) {
  const isDM = user.role === 'dm';
  const [sessionChars, setSessionChars] = useState([]);
  const [myChars, setMyChars] = useState([]);
  const [pick, setPick] = useState('');
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');

  const loadSessionChars = useCallback(async () => {
    try {
      const { characters } = await api.listSessionCharacters(sessionId);
      setSessionChars(characters);
    } catch (err) {
      setError(err.message);
    }
  }, [sessionId]);

  useEffect(() => {
    loadSessionChars();
    if (!isDM) {
      api.listMyCharacters(user.id).then(({ characters }) => setMyChars(characters)).catch(() => {});
    }

    const onListUpdated = () => loadSessionChars();
    socket.on('characters:list_updated', onListUpdated);
    socket.on('characters:updated', onListUpdated);
    return () => {
      socket.off('characters:list_updated', onListUpdated);
      socket.off('characters:updated', onListUpdated);
    };
  }, [loadSessionChars, isDM, user.id]);

  async function bringCharacter() {
    if (!pick) return;
    setError('');
    try {
      await api.addCharacterToSession(sessionId, pick, user.id);
      setPick('');
      await loadSessionChars();
      setActiveId(Number(pick));
    } catch (err) {
      setError(err.message);
    }
  }

  // ── Ficha del personaje activo ──────────────────────────────────────────────
  if (activeId) {
    const active = sessionChars.find((c) => c.id === activeId);
    // El jugador edita el suyo; el DM puede editar los de su sesión (backend valida).
    const canEdit = isDM || (active && String(active.user_id) === String(user.id));
    return (
      <CharacterSheet
        characterId={activeId}
        user={user}
        canEdit={canEdit}
        onBack={() => {
          setActiveId(null);
          loadSessionChars();
        }}
      />
    );
  }

  const myInSession = sessionChars.filter((c) => String(c.user_id) === String(user.id));
  // Coherencia de sistema de juego (F8a): si la campaña de la sesión define un
  // game_system_id, solo se pueden llevar personajes de ese mismo sistema. Si la
  // campaña no tiene sistema (o la sesión no tiene campaña), no se filtra.
  const campaignSystemId = session?.campaign_game_system_id ?? null;
  const notInSession = myChars.filter((c) => !sessionChars.some((sc) => sc.id === c.id));
  const bringable = campaignSystemId
    ? notInSession.filter(
        (c) => String(c.game_system_template_id) === String(campaignSystemId)
      )
    : notInSession;
  // Hay personajes disponibles pero ninguno compatible con el sistema de la campaña.
  const hasIncompatibleOnly = campaignSystemId && notInSession.length > 0 && bringable.length === 0;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      {error && <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}

      {/* Selector: el jugador elige qué personaje lleva a la sesión */}
      {!isDM && (
        <Card className="p-3">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-accent-text">Llevar un personaje</h4>
          {myInSession.length > 0 && (
            <p className="mb-2 text-xs text-sub">
              Ya tienes {myInSession.length} en esta sesión. Puedes añadir otro.
            </p>
          )}
          {bringable.length === 0 ? (
            <p className="text-xs text-faint">
              {hasIncompatibleOnly
                ? 'No tienes personajes del sistema de juego de esta campaña.'
                : 'No tienes más personajes para añadir.'}
            </p>
          ) : (
            <div className="flex gap-2">
              <select value={pick} onChange={(e) => setPick(e.target.value)} className={`flex-1 ${inputCls}`}>
                <option value="">— Elige un personaje —</option>
                {bringable.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <Button size="sm" disabled={!pick} onClick={bringCharacter}>
                Añadir
              </Button>
            </div>
          )}
        </Card>
      )}

      {/* Lista de personajes en la sesión */}
      <div className="flex flex-col gap-2">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
          {isDM ? 'Personajes de la sesión' : 'En la sesión'}
        </h4>
        {sessionChars.length === 0 ? (
          <p className="text-sm text-faint">Aún no hay personajes vinculados.</p>
        ) : (
          sessionChars.map((c) => (
            <Card key={c.id} className="flex items-center justify-between p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-title">{c.name}</p>
                <p className="mt-0.5 text-xs text-sub">
                  {c.username}
                  {c.game_system_name ? ` · ${c.game_system_name}` : ''}
                </p>
              </div>
              <Button size="sm" className="ml-3 flex-shrink-0" onClick={() => setActiveId(c.id)}>
                {isDM || String(c.user_id) === String(user.id) ? 'Ficha' : 'Ver'}
              </Button>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}

import { useCallback, useEffect, useState } from 'react';
import socket from '../lib/socket.js';
import { api } from '../lib/api.js';
import { eventCategoryClasses, isPlanningEvent } from '../lib/planning.js';
import PartyVitals from '../components/Session/PartyVitals.jsx';

// Vista de televisor (F31): espectador de SOLO LECTURA, sin login y sin controles.
// Se lee a 3 metros: tipografías grandes, contraste alto, cero interacción.
//
// Privacidad: la TV NO pinta el chat (ni siquiera de solo lectura) — está a la vista de
// toda la mesa y los susurros son privados. No se suscribe a `chat:message` ni pide
// `chat:history`.
//
// El socket entra por `session:spectate`, que solo une el socket al room: el televisor
// no registra presencia, no ocupa un slot de session_members y no escribe en el log.

const MAX_STRIP_EVENTS = 5;

// Tiempo transcurrido de sesión: "M:SS" bajo la hora, "H:MM:SS" a partir de la hora.
export function formatElapsed(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// Normaliza una fila de session_events al mínimo que pinta la TV. El payload es TEXT
// en la DB; si no parsea, se degrada al `type` como título en vez de romper la vista.
export function toTvEvent(event) {
  let payload = {};
  try {
    payload = JSON.parse(event?.payload ?? '{}') ?? {};
  } catch {
    payload = {};
  }
  return {
    id: event?.id,
    category: event?.type,
    title: payload.title || event?.type || 'Evento',
    description: payload.description || '',
    npcName: payload.npc_name || '',
  };
}

// ── Presentación (pura, testeable con SSR sin efectos) ────────────────────────
export function TvScreen({
  session = null,
  elapsedSeconds = 0,
  imageUrl = null,
  characters = [],
  attrDefs = [],
  users = [],
  events = [],
  inviteUrl = '',
  closed = false,
}) {
  const onlineIds = new Set((users ?? []).map((u) => String(u.userId)));
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;
  const recent = events.slice(-MAX_STRIP_EVENTS).reverse();
  const meta = [session?.campaign_name, session?.campaign_game_system_name]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="flex flex-shrink-0 items-center justify-between gap-6 border-b border-line bg-nav px-6 py-4 lg:px-10 lg:py-6">
        <div className="min-w-0">
          <h1 className="truncate font-serif text-3xl font-semibold leading-tight text-title lg:text-5xl">
            {session?.name ?? 'Sesión'}
          </h1>
          {meta ? <p className="mt-1 truncate text-lg text-sub lg:text-2xl">{meta}</p> : null}
        </div>
        <div className="flex flex-shrink-0 items-center gap-3">
          <span
            className={`h-3 w-3 rounded-full ${closed ? 'bg-muted' : 'bg-cat-explore-bar'}`}
            title={closed ? 'Sesión finalizada' : 'Sesión en curso'}
          />
          <span className="num font-serif text-3xl font-semibold text-title lg:text-5xl">
            {formatElapsed(elapsedSeconds)}
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4 lg:p-8">
          {closed ? (
            <div className="text-center">
              <p className="font-serif text-4xl font-semibold text-title lg:text-6xl">
                Sesión finalizada
              </p>
              <p className="mt-4 text-xl text-sub lg:text-3xl">Gracias por jugar.</p>
            </div>
          ) : imageUrl ? (
            <img
              src={imageUrl}
              alt="Escena actual de la sesión"
              className="max-h-full max-w-full rounded-card object-contain"
            />
          ) : lastEvent ? (
            <TvEventCard event={lastEvent} />
          ) : (
            <p className="font-serif text-3xl text-faint lg:text-4xl">
              Esperando a que empiece la acción…
            </p>
          )}
        </main>

        <aside className="flex w-full flex-shrink-0 flex-col gap-3 overflow-y-auto border-t border-line bg-nav p-4 lg:w-[28rem] lg:border-l lg:border-t-0 lg:p-6">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-muted lg:text-base">
            La partida
          </h2>
          {characters.length === 0 ? (
            <p className="text-xl text-faint">Aún no hay personajes en la mesa.</p>
          ) : (
            characters.map((character) => (
              <TvPartyCard
                key={character.id}
                character={character}
                attrDefs={attrDefs}
                online={onlineIds.has(String(character.user_id))}
              />
            ))
          )}
        </aside>
      </div>

      <div className="flex-shrink-0 border-t border-line bg-surface px-4 py-3 lg:px-8">
        {recent.length === 0 ? (
          <p className="text-lg text-faint">Sin eventos todavía.</p>
        ) : (
          <div className="flex gap-3 overflow-hidden">
            {recent.map((event) => (
              <TvEventChip key={event.id} event={event} />
            ))}
          </div>
        )}
      </div>

      <footer className="flex-shrink-0 border-t border-line bg-nav px-4 py-2 text-center text-base text-faint lg:text-lg">
        Únete desde tu móvil: <span className="num text-sub">{inviteUrl}</span>
      </footer>
    </div>
  );
}

// Tarjeta grande del ÚLTIMO evento disparado (cuando no hay imagen compartida).
function TvEventCard({ event }) {
  const { label, badgeClass, borderClass } = eventCategoryClasses(event.category);
  return (
    <div className={`w-full max-w-4xl rounded-card border-2 bg-surface p-6 lg:p-10 ${borderClass}`}>
      <span
        className={`inline-block rounded-pill px-4 py-1 text-sm font-semibold uppercase tracking-wider lg:text-base ${badgeClass}`}
      >
        {label}
      </span>
      <h2 className="mt-4 font-serif text-4xl font-semibold leading-tight text-title lg:text-6xl">
        {event.title}
      </h2>
      {event.npcName ? (
        <p className="mt-2 text-2xl text-accent-text lg:text-3xl">{event.npcName}</p>
      ) : null}
      {event.description ? (
        <p className="mt-4 text-xl leading-relaxed text-sub lg:text-3xl">{event.description}</p>
      ) : null}
    </div>
  );
}

// Píldora de la franja inferior (últimos eventos, color por categoría).
function TvEventChip({ event }) {
  const { label, barClass, badgeClass } = eventCategoryClasses(event.category);
  return (
    <div className="flex min-w-0 flex-1 items-center gap-3 rounded-btn bg-surface-2 px-3 py-2">
      <span className={`h-9 w-1.5 flex-shrink-0 rounded-full ${barClass}`} />
      <div className="min-w-0">
        <p className="truncate text-lg text-title lg:text-xl">{event.title}</p>
        <span
          className={`mt-0.5 inline-block rounded-pill px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wider ${badgeClass}`}
        >
          {label}
        </span>
      </div>
    </div>
  );
}

// Tarjeta de personaje de la party: nombre, chip de conexión y vitales del sistema.
function TvPartyCard({ character, attrDefs, online }) {
  return (
    <div className="rounded-card border border-line bg-surface p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="truncate font-serif text-2xl font-semibold text-title lg:text-3xl">
          {character.name}
        </span>
        <span
          className={`flex flex-shrink-0 items-center gap-2 rounded-pill px-3 py-1 text-sm ${
            online ? 'bg-cat-explore-bg text-cat-explore-text' : 'bg-surface-2 text-faint'
          }`}
        >
          <span className={`h-2.5 w-2.5 rounded-full ${online ? 'bg-cat-explore-bar' : 'bg-muted'}`} />
          {online ? 'Conectado' : 'Desconectado'}
        </span>
      </div>
      {character.username ? (
        <p className="mt-0.5 truncate text-base text-faint">{character.username}</p>
      ) : null}
      <PartyVitals character={character} attrDefs={attrDefs} size="lg" className="mt-3" />
    </div>
  );
}

// Pantalla completa para los estados que no son "mesa en marcha" (carga / error).
function TvMessage({ title, subtitle }) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg p-8 text-center">
      <p className="font-serif text-4xl font-semibold text-title lg:text-6xl">{title}</p>
      {subtitle ? <p className="text-xl text-sub lg:text-2xl">{subtitle}</p> : null}
    </div>
  );
}

// ── Contenedor: datos + realtime ──────────────────────────────────────────────
export default function TvView({ sessionId }) {
  const [session, setSession] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | closed | error
  const [characters, setCharacters] = useState([]);
  const [attrDefs, setAttrDefs] = useState([]);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  const loadCharacters = useCallback(() => {
    api
      .listSessionCharacters(sessionId)
      .then(({ characters: list }) => setCharacters(list ?? []))
      .catch(() => {});
  }, [sessionId]);

  // Carga inicial: compone la vista con los endpoints que YA existen (cero REST nuevo).
  useEffect(() => {
    let cancelled = false;
    setStatus('loading');

    api
      .getSession(sessionId)
      .then(async ({ session: loaded }) => {
        if (cancelled) return;
        setSession(loaded);
        setStatus(loaded?.status === 'active' ? 'ready' : 'closed');
        if (loaded?.campaign_game_system_id) {
          const detail = await api.getGameSystem(loaded.campaign_game_system_id).catch(() => null);
          if (!cancelled) setAttrDefs(detail?.attributes ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) setStatus('error');
      });

    loadCharacters();

    api
      .listEvents(sessionId)
      .then(({ events: list }) =>
        setEvents((list ?? []).filter(isPlanningEvent).map(toTvEvent))
      )
      .catch(() => {});

    api
      .getCanvas(sessionId)
      .then(({ canvas }) => setImageUrl(canvas?.image_url ?? null))
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [sessionId, loadCharacters]);

  // Realtime: la TV solo ESCUCHA la room. Nada de chat (susurros a la vista de todos).
  useEffect(() => {
    socket.connect();
    socket.emit('session:spectate', { sessionId });

    const onUsers = ({ users: list }) => setUsers(list ?? []);
    const onEventFired = ({ event }) => {
      if (!isPlanningEvent(event)) return;
      setEvents((prev) => [...prev, toTvEvent(event)]);
    };
    const onImageChanged = ({ imageUrl: url }) => setImageUrl(url || null);
    const onReset = () => setImageUrl(null);
    const onClosed = () => setStatus('closed');
    const onCharacters = () => loadCharacters();

    socket.on('session:users', onUsers);
    socket.on('session:event_fired', onEventFired);
    socket.on('canvas:image_changed', onImageChanged);
    socket.on('session:reset', onReset);
    socket.on('session:closed', onClosed);
    socket.on('characters:updated', onCharacters);
    socket.on('characters:list_updated', onCharacters);

    return () => {
      socket.emit('session:unspectate', { sessionId });
      socket.off('session:users', onUsers);
      socket.off('session:event_fired', onEventFired);
      socket.off('canvas:image_changed', onImageChanged);
      socket.off('session:reset', onReset);
      socket.off('session:closed', onClosed);
      socket.off('characters:updated', onCharacters);
      socket.off('characters:list_updated', onCharacters);
      socket.disconnect();
    };
  }, [sessionId, loadCharacters]);

  // Reloj de sesión (tiempo transcurrido desde created_at, en segundos unixepoch).
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  const inviteUrl = typeof window === 'undefined' ? '' : window.location.origin;

  if (status === 'loading') {
    return <TvMessage title="Preparando la mesa…" />;
  }
  if (status === 'error') {
    return (
      <TvMessage
        title="Sesión no disponible"
        subtitle={`Comprueba el enlace del televisor. Entra desde ${inviteUrl}`}
      />
    );
  }

  const elapsedSeconds = session?.created_at
    ? Math.floor(now / 1000) - Number(session.created_at)
    : 0;

  return (
    <TvScreen
      session={session}
      elapsedSeconds={elapsedSeconds}
      imageUrl={imageUrl}
      characters={characters}
      attrDefs={attrDefs}
      users={users}
      events={events}
      inviteUrl={inviteUrl}
      closed={status === 'closed'}
    />
  );
}

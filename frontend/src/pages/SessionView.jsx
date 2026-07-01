import { useEffect, useState } from 'react';
import socket from '../lib/socket.js';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import CanvasBoard from '../components/Canvas/CanvasBoard.jsx';
import ConnectedUsers from '../components/Session/ConnectedUsers.jsx';
import ChatPanel from '../components/Chat/ChatPanel.jsx';
import PlanningPanel from '../components/Session/PlanningPanel.jsx';
import SessionCharactersPanel from '../components/Session/SessionCharactersPanel.jsx';
import AIPanel from '../components/AI/AIPanel.jsx';

const TAB_TITLES = {
  players: 'Jugadores',
  characters: 'Personajes',
  chat: 'Chat',
  ai: 'Asistente IA',
  planning: 'Planificación',
};

export default function SessionView({ session, user, onLeave }) {
  const isDM = user.role === 'dm';
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageDraft, setImageDraft] = useState('');
  const [activeTab, setActiveTab] = useState('players');
  // En móvil el panel lateral se muestra como bottom-sheet; en md: va anclado al
  // lado. No medimos window.innerWidth: el layout es responsive con breakpoints y
  // este estado solo controla la apertura del sheet móvil.
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);

  // Conecta el socket y se une a la sesión al montar; limpia al desmontar.
  useEffect(() => {
    socket.connect();
    socket.emit('session:join', { sessionId: session.id, user });

    const onUsers = ({ users }) => setConnectedUsers(users);
    const onImageChanged = ({ imageUrl: url }) => setImageUrl(url);
    const onReset = () => setImageUrl(null);
    const onClosed = () => onLeave();

    socket.on('session:users', onUsers);
    socket.on('canvas:image_changed', onImageChanged);
    socket.on('session:reset', onReset);
    socket.on('session:closed', onClosed);

    api
      .getCanvas(session.id)
      .then(({ canvas }) => setImageUrl(canvas?.image_url ?? null))
      .catch(() => {});

    return () => {
      socket.emit('session:leave', { sessionId: session.id, user });
      socket.off('session:users', onUsers);
      socket.off('canvas:image_changed', onImageChanged);
      socket.off('session:reset', onReset);
      socket.off('session:closed', onClosed);
      socket.disconnect();
    };
    // El efecto se reinicia solo al cambiar de sesión; user/onLeave son estables aquí.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session.id]);

  function setCanvasImage(e) {
    e.preventDefault();
    if (!imageDraft.trim()) return;
    socket.emit('canvas:set_image', { sessionId: session.id, imageUrl: imageDraft.trim() });
    setImageDraft('');
  }

  async function handleReset() {
    await api.resetSession(session.id, user.id);
  }

  async function handleClose() {
    await api.closeSession(session.id, user.id);
  }

  // La pestaña de Planificación es exclusiva del DM (motor de prep en sesión).
  const tabs = [
    { id: 'players', label: '👥' },
    { id: 'characters', label: '⚔️' },
    { id: 'chat', label: '💬' },
    { id: 'ai', label: '🤖' },
    ...(isDM ? [{ id: 'planning', label: '📋' }] : []),
  ];

  // El contenido del panel se comparte entre el aside (desktop) y el sheet (móvil).
  const panelBody = (
    <>
      {activeTab === 'players' && <ConnectedUsers users={connectedUsers} />}
      {activeTab === 'characters' && (
        <SessionCharactersPanel sessionId={session.id} session={session} user={user} />
      )}
      {activeTab === 'chat' && (
        <ChatPanel sessionId={session.id} user={user} connectedUsers={connectedUsers} />
      )}
      {activeTab === 'ai' && <AIPanel sessionId={session.id} user={user} />}
      {activeTab === 'planning' && isDM && (
        <PlanningPanel sessionId={session.id} user={user} session={session} />
      )}
    </>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-ink-line bg-ink-700 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate text-base font-semibold text-gold">{session.name}</h2>
          <span className="flex-shrink-0 rounded-full bg-ink-600 px-2.5 py-0.5 text-xs text-gray-200">
            {isDM ? '🎲 DM' : `⚔️ ${user.username}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isDM && (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleReset}
                title="Reiniciar canvas"
                aria-label="Reiniciar canvas"
              >
                🔄
              </Button>
              <Button
                variant="success"
                size="sm"
                onClick={handleClose}
                title="Finalizar sesión"
                aria-label="Finalizar sesión"
              >
                ✔
              </Button>
            </>
          )}
          {/* Abre el panel como bottom-sheet — solo visible en móvil (oculto en md:) */}
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            onClick={() => setMobileSheetOpen(true)}
            title="Abrir panel"
            aria-label="Abrir panel de sesión"
          >
            📋
          </Button>
          <Button variant="danger" size="sm" onClick={onLeave} aria-label="Salir de la sesión">
            Salir
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Área de canvas: lienzo tldraw con la imagen compartida de fondo. */}
        <main className="flex flex-1 flex-col overflow-hidden bg-ink-900 p-2 md:p-3">
          <div className="min-h-0 flex-1">
            <CanvasBoard sessionId={session.id} imageUrl={imageUrl} />
          </div>
          {isDM && (
            <form onSubmit={setCanvasImage} className="mt-2 flex gap-2 md:mt-3">
              <label htmlFor="canvas-image-url" className="sr-only">
                URL de imagen para el canvas
              </label>
              <input
                id="canvas-image-url"
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                placeholder="URL de imagen de fondo…"
                className="min-h-[44px] flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
              />
              <Button type="submit" size="sm" className="min-h-[44px]">
                Fijar fondo
              </Button>
            </form>
          )}
        </main>

        {/* Panel lateral fijo — visible desde md:; en móvil se usa el bottom-sheet. */}
        <aside className="hidden w-80 flex-shrink-0 flex-col border-l border-ink-line bg-ink-700 md:flex">
          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
            className="flex-shrink-0"
          />
          <div className="flex flex-1 flex-col overflow-hidden">{panelBody}</div>
        </aside>
      </div>

      {/* Bottom-sheet del panel para móvil (oculto en md: vía el aside de arriba). */}
      <div className="md:hidden">
        <Sheet
          open={mobileSheetOpen}
          onClose={() => setMobileSheetOpen(false)}
          title={TAB_TITLES[activeTab] ?? 'Panel'}
        >
          <Tabs
            tabs={tabs}
            activeId={activeTab}
            onChange={setActiveTab}
            className="flex-shrink-0"
          />
          <div className="flex flex-1 flex-col overflow-hidden">{panelBody}</div>
        </Sheet>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import socket from '../lib/socket.js';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import Sheet from '../components/ui/Sheet.jsx';
import Icon from '../components/ui/Icon.jsx';
import CanvasBoard from '../components/Canvas/CanvasBoard.jsx';
import ConnectedUsers from '../components/Session/ConnectedUsers.jsx';
import ChatPanel from '../components/Chat/ChatPanel.jsx';
import PlanningPanel from '../components/Session/PlanningPanel.jsx';
import SessionCharactersPanel from '../components/Session/SessionCharactersPanel.jsx';
import NotesPanel from '../components/Session/NotesPanel.jsx';
import SessionToolbar from '../components/Session/SessionToolbar.jsx';
import AIPanel from '../components/AI/AIPanel.jsx';

const TAB_TITLES = {
  players: 'Jugadores',
  characters: 'Personajes',
  chat: 'Chat',
  notes: 'Notas',
  ai: 'Asistente IA',
  planning: 'Planificación',
};

export default function SessionView({ session, user, onLeave }) {
  const isDM = user.role === 'dm';
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [activeTab, setActiveTab] = useState('players');
  // En móvil el panel lateral se muestra como bottom-sheet; en md: va anclado al lado.
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

  function setCanvasImage(url) {
    socket.emit('canvas:set_image', { sessionId: session.id, imageUrl: url });
  }

  async function handleReset() {
    await api.resetSession(session.id, user.id);
  }

  async function handleClose() {
    await api.closeSession(session.id, user.id);
  }

  // Las pestañas de Notas y Planificación tienen gating por rol donde aplica.
  const tabs = [
    { id: 'players', label: <Icon name="users" size={18} /> },
    { id: 'characters', label: <Icon name="id-card" size={18} /> },
    { id: 'chat', label: <Icon name="book" size={18} /> },
    { id: 'notes', label: <Icon name="file" size={18} /> },
    { id: 'ai', label: <Icon name="cube" size={18} /> },
    ...(isDM ? [{ id: 'planning', label: <Icon name="map" size={18} /> }] : []),
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
      {activeTab === 'notes' && <NotesPanel sessionId={session.id} user={user} />}
      {activeTab === 'ai' && (
        <AIPanel sessionId={session.id} user={user} campaignId={session.campaign_id ?? null} />
      )}
      {activeTab === 'planning' && isDM && (
        <PlanningPanel sessionId={session.id} user={user} session={session} />
      )}
    </>
  );

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-bg">
      <header className="flex flex-shrink-0 items-center justify-between gap-2 border-b border-line bg-nav px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <h2 className="truncate font-serif text-base font-semibold text-title">{session.name}</h2>
          <span className="flex flex-shrink-0 items-center gap-1 rounded-pill bg-surface-2 px-2.5 py-0.5 text-xs text-sub">
            <Icon name={isDM ? 'cube' : 'user'} size={13} />
            {isDM ? 'DM' : user.username}
          </span>
        </div>
        {/* Abre el panel como bottom-sheet — solo visible en móvil (oculto en md:) */}
        <Button
          variant="secondary"
          size="sm"
          className="md:hidden"
          onClick={() => setMobileSheetOpen(true)}
          aria-label="Abrir panel de sesión"
        >
          <Icon name="sliders" size={16} />
        </Button>
      </header>

      {/* Toolbar de sesión (DM: mapa/evento/NPC/reset/finalizar; jugador: salir). Va como
          bloque flex-shrink-0 encima del área de canvas para no colapsar su flex. */}
      <SessionToolbar
        session={session}
        user={user}
        currentImageUrl={imageUrl}
        onSetImage={setCanvasImage}
        onOpenPlanning={() => { setActiveTab('planning'); setMobileSheetOpen(true); }}
        onReset={handleReset}
        onClose={handleClose}
        onLeave={onLeave}
      />

      <div className="flex flex-1 overflow-hidden">
        {/* Área de canvas: lienzo tldraw con la imagen compartida de fondo. */}
        <main className="flex flex-1 flex-col overflow-hidden bg-bg p-2 md:p-3">
          <div className="min-h-0 flex-1">
            <CanvasBoard sessionId={session.id} imageUrl={imageUrl} />
          </div>
        </main>

        {/* Panel lateral fijo — visible desde md:; en móvil se usa el bottom-sheet. */}
        <aside className="hidden w-80 flex-shrink-0 flex-col border-l border-line bg-nav md:flex">
          <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} className="flex-shrink-0" />
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
          <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} className="flex-shrink-0" />
          <div className="flex flex-1 flex-col overflow-hidden">{panelBody}</div>
        </Sheet>
      </div>
    </div>
  );
}

import { useEffect, useState } from 'react';
import socket from '../lib/socket.js';
import { api } from '../lib/api.js';
import Button from '../components/ui/Button.jsx';
import Tabs from '../components/ui/Tabs.jsx';
import ConnectedUsers from '../components/Session/ConnectedUsers.jsx';
import ChatPanel from '../components/Chat/ChatPanel.jsx';
import PlanningPanel from '../components/Session/PlanningPanel.jsx';
import SessionCharactersPanel from '../components/Session/SessionCharactersPanel.jsx';
import AIPanel from '../components/AI/AIPanel.jsx';

export default function SessionView({ session, user, onLeave }) {
  const isDM = user.role === 'dm';
  const [connectedUsers, setConnectedUsers] = useState([]);
  const [imageUrl, setImageUrl] = useState(null);
  const [imageDraft, setImageDraft] = useState('');
  const [activeTab, setActiveTab] = useState('players');
  // Toggle de UI para móvil (canvas ↔ panel). En md: ambos se muestran lado a lado,
  // así que no medimos el ancho de la ventana: usamos clases responsive + este estado.
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

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
              <Button variant="secondary" size="sm" onClick={handleReset} title="Reiniciar canvas">
                🔄
              </Button>
              <Button variant="success" size="sm" onClick={handleClose} title="Finalizar sesión">
                ✔
              </Button>
            </>
          )}
          {/* Toggle canvas/panel — solo visible en móvil (oculto en md:) */}
          <Button
            variant="secondary"
            size="sm"
            className="md:hidden"
            onClick={() => setMobilePanelOpen((v) => !v)}
            title={mobilePanelOpen ? 'Ver canvas' : 'Ver panel'}
          >
            {mobilePanelOpen ? '🗺️' : '📋'}
          </Button>
          <Button variant="danger" size="sm" onClick={onLeave}>
            Salir
          </Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Área de canvas. En móvil se oculta cuando el panel está abierto. */}
        <main
          className={`flex-1 overflow-hidden bg-ink-900 p-3 ${
            mobilePanelOpen ? 'hidden md:flex' : 'flex'
          } flex-col`}
        >
          {/* Espacio reservado para tldraw (F8). Por ahora muestra la imagen compartida. */}
          <div className="flex flex-1 items-center justify-center overflow-hidden rounded-card border border-ink-line bg-ink-800">
            {imageUrl ? (
              <img
                src={imageUrl}
                alt="Canvas compartido"
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <p className="text-sm text-gray-600">Sin imagen compartida.</p>
            )}
          </div>
          {isDM && (
            <form onSubmit={setCanvasImage} className="mt-3 flex gap-2">
              <input
                value={imageDraft}
                onChange={(e) => setImageDraft(e.target.value)}
                placeholder="URL de imagen para el canvas…"
                className="flex-1 rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold"
              />
              <Button type="submit" size="sm">
                Fijar
              </Button>
            </form>
          )}
        </main>

        {/* Panel lateral con tabs. En móvil ocupa todo; en md: ancho fijo. */}
        <aside
          className={`w-full flex-col border-l border-ink-line bg-ink-700 md:flex md:w-80 md:flex-shrink-0 ${
            mobilePanelOpen ? 'flex' : 'hidden'
          }`}
        >
          <Tabs tabs={tabs} activeId={activeTab} onChange={setActiveTab} className="flex-shrink-0" />
          <div className="flex flex-1 flex-col overflow-hidden">
            {activeTab === 'players' && <ConnectedUsers users={connectedUsers} />}
            {activeTab === 'characters' && (
              <SessionCharactersPanel sessionId={session.id} user={user} />
            )}
            {activeTab === 'chat' && (
              <ChatPanel sessionId={session.id} user={user} connectedUsers={connectedUsers} />
            )}
            {activeTab === 'ai' && <AIPanel sessionId={session.id} user={user} />}
            {activeTab === 'planning' && isDM && (
              <PlanningPanel sessionId={session.id} user={user} session={session} />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

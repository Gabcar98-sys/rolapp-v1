import { useEffect, useRef, useState } from 'react';
import socket from '../../lib/socket.js';
import Button from '../ui/Button.jsx';

// Chat de sesión en tiempo real. Soporta mensajes a todos o privados a un destinatario.
export default function ChatPanel({ sessionId, user, connectedUsers = [] }) {
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [toUserId, setToUserId] = useState(null);
  const endRef = useRef(null);

  useEffect(() => {
    socket.emit('chat:history', { sessionId });

    const onHistory = ({ messages: msgs }) => setMessages(msgs);
    const onMessage = ({ message }) => setMessages((prev) => [...prev, message]);

    socket.on('chat:history', onHistory);
    socket.on('chat:message', onMessage);
    return () => {
      socket.off('chat:history', onHistory);
      socket.off('chat:message', onMessage);
    };
  }, [sessionId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  function send() {
    if (!text.trim()) return;
    socket.emit('chat:message', { sessionId, from: user.id, body: text.trim(), to: toUserId });
    setText('');
  }

  // El DM puede escribir en privado a cualquiera; el jugador solo al DM.
  const privateTargets =
    user.role === 'dm'
      ? connectedUsers.filter((u) => u.userId !== user.id)
      : connectedUsers.filter((u) => u.role === 'dm');

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {privateTargets.length > 0 && (
        <div className="flex-shrink-0 border-b border-ink-line p-2">
          <select
            value={toUserId ?? ''}
            onChange={(e) => setToUserId(e.target.value ? Number(e.target.value) : null)}
            className="w-full rounded-md border border-ink-line bg-ink-900 px-2 py-1 text-xs text-gray-100 outline-none focus:border-gold"
          >
            <option value="">📢 Todos</option>
            {privateTargets.map((u) => (
              <option key={u.userId} value={u.userId}>
                🔒 {u.username}
                {u.role === 'dm' ? ' (DM)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-xs italic text-gray-600">Aún no hay mensajes.</p>
        )}
        {messages.map((msg) => {
          const isMine = msg.from_user_id === user.id;
          const isPrivate = msg.to_user_id !== null;
          return (
            <div
              key={msg.id}
              className={`flex max-w-[88%] flex-col ${isMine ? 'self-end' : 'self-start'}`}
            >
              {!isMine && <span className="text-[0.68rem] text-gold">{msg.from_username}</span>}
              {isPrivate && <span className="text-[0.65rem] text-gold">🔒 privado</span>}
              <div
                className={`break-words rounded-lg px-2.5 py-1.5 text-sm leading-snug ${
                  isMine ? 'bg-ink-600' : 'bg-ink-500'
                } ${isPrivate ? 'border-l-2 border-gold' : ''}`}
              >
                {msg.body}
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <div className="flex flex-shrink-0 gap-2 border-t border-ink-line p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={toUserId ? '🔒 Mensaje privado…' : 'Mensaje a todos…'}
          className="flex-1 rounded-md border border-ink-line bg-ink-900 px-2.5 py-1.5 text-sm text-gray-100 outline-none focus:border-gold"
        />
        <Button size="sm" onClick={send}>
          ➤
        </Button>
      </div>
    </div>
  );
}

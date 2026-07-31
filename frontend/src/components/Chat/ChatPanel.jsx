import { useEffect, useRef, useState } from 'react';
import socket from '../../lib/socket.js';
import Button from '../ui/Button.jsx';
import Icon from '../ui/Icon.jsx';

// Hora local "HH:MM" de un mensaje. `created_at` llega en unixepoch SEGUNDOS
// (backend/src/sockets/chat.js). Devuelve SIEMPRE una cadena ('' si el dato no
// sirve), nunca un número: así ningún guard puede pintar un literal suelto (F30).
export function formatMessageTime(unixSeconds) {
  const n = Number(unixSeconds);
  if (!Number.isFinite(n) || n <= 0) return '';
  const d = new Date(n * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Burbuja de un mensaje: autor (solo si es ajeno), marca de privado, hora y cuerpo.
// Exportada para poder testearla con el runner SSR (patrón F20/F30).
export function ChatMessage({ message, isMine }) {
  // to_user_id es NULL (público) o un id de usuario: Boolean() evita arrastrar el
  // valor crudo a los guards de render.
  const isPrivate = Boolean(message.to_user_id);
  const time = formatMessageTime(message.created_at);

  return (
    <div
      className={`flex max-w-[88%] flex-col gap-0.5 ${
        isMine ? 'items-end self-end' : 'items-start self-start'
      }`}
    >
      <div className="flex items-center gap-1.5 px-0.5">
        {isMine ? null : (
          <span className="text-[0.68rem] text-accent-text">{message.from_username}</span>
        )}
        {isPrivate ? (
          <span className="flex items-center gap-0.5 text-[0.65rem] text-accent-text">
            <Icon name="pin" size={10} />
            privado
          </span>
        ) : null}
        {time ? <span className="text-[0.65rem] text-muted">{time}</span> : null}
      </div>
      <div
        className={`break-words rounded-btn px-2.5 py-1.5 text-sm leading-snug ${
          isMine ? 'bg-surface-2' : 'bg-hover'
        } ${isPrivate ? 'border-l-2 border-accent' : ''}`}
      >
        {message.body}
      </div>
    </div>
  );
}

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
        <div className="flex flex-shrink-0 items-center gap-2 border-b border-line p-2">
          {/* El icono refleja el destinatario activo: todos vs. privado. */}
          <Icon name={toUserId ? 'pin' : 'users'} size={14} className="text-faint" />
          <select
            value={toUserId ?? ''}
            onChange={(e) => setToUserId(e.target.value ? Number(e.target.value) : null)}
            aria-label="Destinatario del mensaje"
            className="min-w-0 flex-1 rounded-btn border border-line bg-bg px-2 py-1 text-xs text-title outline-none focus:border-accent"
          >
            <option value="">Todos</option>
            {privateTargets.map((u) => (
              <option key={u.userId} value={u.userId}>
                Privado · {u.username}
                {u.role === 'dm' ? ' (DM)' : ''}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="flex flex-1 flex-col gap-2 overflow-y-auto p-3">
        {messages.length === 0 && (
          <p className="mt-4 text-center text-xs italic text-muted">Aún no hay mensajes.</p>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} isMine={msg.from_user_id === user.id} />
        ))}
        <div ref={endRef} />
      </div>

      <div className="flex flex-shrink-0 gap-2 border-t border-line p-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
          placeholder={toUserId ? 'Mensaje privado…' : 'Mensaje a todos…'}
          aria-label={toUserId ? 'Escribir mensaje privado' : 'Escribir mensaje para todos'}
          className="min-w-0 flex-1 rounded-btn border border-line bg-bg px-2.5 py-1.5 text-sm text-title outline-none placeholder:text-faint focus:border-accent"
        />
        <Button size="sm" onClick={send} aria-label="Enviar mensaje">
          <Icon name="arrow-right" size={16} />
        </Button>
      </div>
    </div>
  );
}

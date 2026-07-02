import { io } from 'socket.io-client';

// Mismo origen — nginx/vite proxean /socket.io al backend.
const socket = io({ autoConnect: false });

// Helper de streaming de IA. Emite `ai:ask` y enruta los eventos (`ai:token`,
// `ai:answer_done`, `ai:error`) por `requestId` a los callbacks. Devuelve una función
// de limpieza que quita los listeners (llamar al desmontar / al iniciar otra consulta).
//
// `history` (opcional) es la memoria corta de la conversación para follow-ups (F12):
// [{ role:'user'|'assistant', content }]. El backend la normaliza y acota.
//
// callbacks: { onToken(token), onDone({ answer, sources }), onError(message) }
export function streamAiAsk({ query, gameSystemId, history = [] }, callbacks) {
  const requestId = `ask-${Date.now()}-${Math.random().toString(36).slice(2)}`;

  const onToken = (msg) => {
    if (msg.requestId === requestId) callbacks.onToken?.(msg.token);
  };
  const onDone = (msg) => {
    if (msg.requestId === requestId) callbacks.onDone?.(msg);
  };
  const onError = (msg) => {
    if (msg.requestId === requestId) callbacks.onError?.(msg.error);
  };

  socket.on('ai:token', onToken);
  socket.on('ai:answer_done', onDone);
  socket.on('ai:error', onError);

  socket.emit('ai:ask', { requestId, query, gameSystemId, history });

  return () => {
    socket.off('ai:token', onToken);
    socket.off('ai:answer_done', onDone);
    socket.off('ai:error', onError);
  };
}

export default socket;

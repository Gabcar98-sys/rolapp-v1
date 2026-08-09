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
// Núcleo compartido de streaming de IA: emite `emitEvent` con `payload` (que ya incluye
// requestId) y enruta ai:token/ai:answer_done/ai:error por requestId a los callbacks.
// Devuelve una función de limpieza. Lo usan tanto la pregunta libre como los presets.
function streamAi(emitEvent, payload, callbacks) {
  const { requestId } = payload;
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

  socket.emit(emitEvent, payload);

  return () => {
    socket.off('ai:token', onToken);
    socket.off('ai:answer_done', onDone);
    socket.off('ai:error', onError);
  };
}

function newRequestId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

// callbacks: { onToken(token), onDone({ answer, sources }), onError(message) }
// `sectionType` (opcional, F18) filtra el retrieval por metadato para los topics de sistema.
// `sessionId` (opcional, F37) pide al backend que inyecte también el contexto de la partida
// (eventos + estado); lo manda la pregunta libre del modo Sesión. En modo Sistema va null y
// el backend responde exactamente como antes.
export function streamAiAsk({ query, gameSystemId, sessionId = null, history = [], sectionType = null }, callbacks) {
  return streamAi(
    'ai:ask',
    { requestId: newRequestId('ask'), query, gameSystemId, sessionId, history, sectionType },
    callbacks
  );
}

// Preset de sesión (F18): Resumen/Cronología/Estado/Inventarios por inyección de contexto.
// callbacks: { onToken, onDone({ answer, sources }), onError }.
export function streamSessionPreset({ sessionId, preset, includePrevious = false, history = [] }, callbacks) {
  return streamAi(
    'ai:session_preset',
    { requestId: newRequestId('preset'), sessionId, preset, includePrevious, history },
    callbacks
  );
}

export default socket;

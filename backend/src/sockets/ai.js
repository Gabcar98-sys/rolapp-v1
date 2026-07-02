import { streamRulesQuestion, streamPlanning } from '../services/ai.js';

// Handlers de streaming de IA por Socket.io. El AIPanel emite `ai:ask` (o
// `ai:assist_planning`) y recibe tokens en tiempo real; al terminar llega `ai:done`
// con la respuesta completa y las fuentes citadas. Un fallo del proveedor llega como
// `ai:error` (degradación elegante: la UI muestra el aviso, sin crash).
//
// Se emite SOLO al socket solicitante (no al room): la consulta es del usuario, no de
// la mesa. Cada petición lleva un `requestId` para que el cliente correlacione tokens.
export function registerAiHandlers(io, socket) {
  async function run(streamFn, args, requestId, doneEvent) {
    try {
      const result = await streamFn(args, (token) => {
        socket.emit('ai:token', { requestId, token });
      });
      socket.emit(doneEvent, { requestId, ...result });
    } catch (err) {
      socket.emit('ai:error', { requestId, error: err.message });
    }
  }

  // ai:ask { requestId, query, gameSystemId, history? } → stream de respuesta citada.
  // `history` (opcional) es la memoria corta de la conversación para follow-ups (F12 §4);
  // el servicio la normaliza y acota (nº de turnos/tokens).
  socket.on('ai:ask', ({ requestId, query, gameSystemId, history = [] }) => {
    if (!query || !gameSystemId) {
      socket.emit('ai:error', { requestId, error: 'query y gameSystemId son requeridos' });
      return;
    }
    run(streamRulesQuestion, { query, gameSystemId, history }, requestId, 'ai:answer_done');
  });

  // ai:assist_planning { requestId, sessionId?, gameSystemId?, prompt, history? } → sugerencias.
  socket.on('ai:assist_planning', ({ requestId, sessionId = null, gameSystemId = null, prompt, history = [] }) => {
    if (!prompt) {
      socket.emit('ai:error', { requestId, error: 'prompt es requerido' });
      return;
    }
    run(streamPlanning, { sessionId, gameSystemId, prompt, history }, requestId, 'ai:planning_done');
  });
}

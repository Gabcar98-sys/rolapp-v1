import { streamRulesQuestion, streamPlanning, streamSessionPreset } from '../services/ai.js';

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

  // ai:ask { requestId, query, gameSystemId, sessionId?, history?, sectionType? } → stream
  // de respuesta citada.
  // `history` (opcional) es la memoria corta de la conversación para follow-ups (F12 §4).
  // `sectionType` (opcional, F18) filtra el retrieval por metadato para los "topics" de
  // sistema (core/habilidades/items/NPCs); el REST ya lo soportaba, el socket ahora también.
  // `sessionId` (opcional, F37) inyecta ADEMÁS el contexto de la partida en curso: lo manda
  // la pregunta libre del modo Sesión. Sin él, el camino es exactamente el de antes.
  socket.on('ai:ask', ({ requestId, query, gameSystemId, sessionId = null, history = [], sectionType = null }) => {
    if (!query || !gameSystemId) {
      socket.emit('ai:error', { requestId, error: 'query y gameSystemId son requeridos' });
      return;
    }
    run(streamRulesQuestion, { query, gameSystemId, sessionId, history, sectionType }, requestId, 'ai:answer_done');
  });

  // ai:session_preset { requestId, sessionId, preset, includePrevious?, history? } (F18)
  // Presets de sesión (Resumen/Cronología/Estado/Inventarios) por inyección de contexto.
  socket.on('ai:session_preset', ({ requestId, sessionId, preset, includePrevious = false, history = [] }) => {
    if (!sessionId || !preset) {
      socket.emit('ai:error', { requestId, error: 'sessionId y preset son requeridos' });
      return;
    }
    run(streamSessionPreset, { sessionId, preset, includePrevious, history }, requestId, 'ai:answer_done');
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

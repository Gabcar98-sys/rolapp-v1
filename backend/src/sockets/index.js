import { registerSessionHandlers } from './session.js';
import { registerChatHandlers } from './chat.js';
import { registerCanvasHandlers } from './canvas.js';
import { registerAiHandlers } from './ai.js';

// Punto de entrada de Socket.io. Cada dominio registra sus handlers por socket.
export function initSockets(io) {
  io.on('connection', (socket) => {
    registerSessionHandlers(io, socket);
    registerChatHandlers(io, socket);
    registerCanvasHandlers(io, socket);
    registerAiHandlers(io, socket);
  });
}

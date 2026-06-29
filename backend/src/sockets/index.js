// Handlers de Socket.io. En F4 se agregan presencia, canvas, chat y eventos de sesión.
export function initSockets(io) {
  io.on('connection', (socket) => {
    console.log(`socket conectado: ${socket.id}`);

    socket.on('disconnect', () => {
      console.log(`socket desconectado: ${socket.id}`);
    });
  });
}

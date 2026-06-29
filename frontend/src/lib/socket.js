import { io } from 'socket.io-client';

// Mismo origen — nginx/vite proxean /socket.io al backend.
const socket = io({ autoConnect: false });

export default socket;

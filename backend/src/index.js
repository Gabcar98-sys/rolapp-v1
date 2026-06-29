import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { vecEnabled } from './db/index.js';
import authRouter from './routes/auth.js';
import { initSockets } from './sockets/index.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', vecEnabled, version: '1.0.0' });
});

app.use('/api/auth', authRouter);

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
initSockets(io);

server.listen(PORT, () => {
  console.log(`RolApp backend escuchando en :${PORT}`);
});

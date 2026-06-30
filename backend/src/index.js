import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { vecEnabled } from './db/index.js';
import authRouter from './routes/auth.js';
import campaignsRouter from './routes/campaigns.js';
import createSessionsRouter from './routes/sessions.js';
import createCanvasRouter from './routes/canvas.js';
import sessionPrepsRouter from './routes/sessionPreps.js';
import locationsRouter from './routes/locations.js';
import subLocationsRouter from './routes/subLocations.js';
import eventTemplatesRouter from './routes/eventTemplates.js';
import npcsRouter from './routes/npcs.js';
import { initSockets } from './sockets/index.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', vecEnabled, version: '1.0.0' });
});

app.use('/api/auth', authRouter);
app.use('/api/campaigns', campaignsRouter);
// sessions y canvas necesitan io para emitir cambios por socket desde REST.
app.use('/api/sessions', createSessionsRouter(io));
app.use('/api/canvas', createCanvasRouter(io));
// Motor de planificación (F5): routers REST sin socket (CRUD puro).
app.use('/api/session-preps', sessionPrepsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/sub-locations', subLocationsRouter);
app.use('/api/event-templates', eventTemplatesRouter);
app.use('/api/npcs', npcsRouter);

initSockets(io);

server.listen(PORT, () => {
  console.log(`RolApp backend escuchando en :${PORT}`);
});

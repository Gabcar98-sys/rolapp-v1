import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';

import { vecEnabled, ftsEnabled } from './db/index.js';
import { AI_CONFIG } from './services/ai.js';
import authRouter from './routes/auth.js';
import campaignsRouter from './routes/campaigns.js';
import gameSystemsRouter from './routes/gameSystems.js';
import skillsRouter from './routes/skills.js';
import itemsRouter from './routes/items.js';
import gamePacksRouter from './routes/gamePacks.js';
import createSessionsRouter from './routes/sessions.js';
import createCanvasRouter from './routes/canvas.js';
import createCharactersRouter from './routes/characters.js';
import baseCharactersRouter from './routes/baseCharacters.js';
import sessionPrepsRouter from './routes/sessionPreps.js';
import locationsRouter from './routes/locations.js';
import subLocationsRouter from './routes/subLocations.js';
import eventTemplatesRouter from './routes/eventTemplates.js';
import npcsRouter from './routes/npcs.js';
import createRagRouter from './routes/rag.js';
import statsRouter from './routes/stats.js';
import { initSockets } from './sockets/index.js';

const PORT = process.env.PORT || 3001;

const app = express();
app.use(cors());
app.use(express.json());

const server = createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.get('/api/health', (_req, res) => {
  // Estado ligero (sin sondear Ollama/API): flags de retrieval + motor de IA configurado.
  res.json({
    status: 'ok',
    version: '1.0.0',
    vecEnabled,
    ftsEnabled,
    ai: { provider: AI_CONFIG.provider, model: AI_CONFIG.model },
  });
});

app.use('/api/auth', authRouter);
app.use('/api/campaigns', campaignsRouter);
// Sistemas de juego data-driven (F2): CRUD + import/export de packs JSON (sin socket).
app.use('/api/game-systems', gameSystemsRouter);
app.use('/api/skills', skillsRouter);
app.use('/api/items', itemsRouter);
app.use('/api/game-packs', gamePacksRouter);
// sessions y canvas necesitan io para emitir cambios por socket desde REST.
app.use('/api/sessions', createSessionsRouter(io));
app.use('/api/canvas', createCanvasRouter(io));
// Personajes (F3): ficha completa, atributos, skills, inventario, equipo.
// characters emite por socket al editar fichas en sesión, por eso es factory.
app.use('/api/characters', createCharactersRouter(io));
app.use('/api/base-characters', baseCharactersRouter);
// Motor de planificación (F5): routers REST sin socket (CRUD puro).
app.use('/api/session-preps', sessionPrepsRouter);
app.use('/api/locations', locationsRouter);
app.use('/api/sub-locations', subLocationsRouter);
app.use('/api/event-templates', eventTemplatesRouter);
app.use('/api/npcs', npcsRouter);
// RAG / IA (F6): docs por game system, búsqueda híbrida, IA y resumen de sesión.
// Factory porque el resumen emite por socket. Rutas absolutas (montado en /api).
app.use('/api', createRagRouter(io));
// Estadísticas derivadas (F7): sesión, campaña y personaje. Rutas absolutas (montado en /api).
app.use('/api', statsRouter);

initSockets(io);

server.listen(PORT, () => {
  console.log(`RolApp backend escuchando en :${PORT}`);
});

import { Router } from 'express';
import db from '../db/index.js';
import { vecEnabled, ftsEnabled } from '../db/index.js';
import { ingestDoc, reindexDoc, deleteDoc, listDocs, hybridSearch } from '../services/rag.js';
import {
  answerRulesQuestion,
  assistPlanning,
  summarizeSession,
  getSessionSummary,
  getAiStatus,
} from '../services/ai.js';

// Router de RAG / IA (F6). Factory porque el resumen de sesión emite por Socket.io.
// Degradación elegante: si no hay embeddings/Ollama, responde 503/422 con mensaje
// claro y NO tumba el proceso.
export default function createRagRouter(io) {
  const router = Router();

  // Mapea errores de servicio a códigos HTTP claros (degradación elegante).
  function fail(res, err) {
    const msg = err?.message || 'Error interno';
    if (/no disponible|no está|vec|FTS|embedding|Ollama|LLM|API/i.test(msg)) {
      return res.status(503).json({ error: msg });
    }
    if (/requerido|vacía|vacío|no soportad|no encontrad/i.test(msg)) {
      return res.status(422).json({ error: msg });
    }
    return res.status(500).json({ error: msg });
  }

  function requireOwnedSystem(req, res) {
    const system = db
      .prepare('SELECT * FROM game_system_templates WHERE id = ?')
      .get(req.params.id);
    if (!system) {
      res.status(404).json({ error: 'Sistema no encontrado' });
      return null;
    }
    const { dm_id } = req.body ?? {};
    if (dm_id !== undefined && String(system.dm_id) !== String(dm_id)) {
      res.status(403).json({ error: 'Solo el DM dueño puede editar este sistema' });
      return null;
    }
    return system;
  }

  // ── Estado de la IA ──────────────────────────────────────────────────────────
  // GET /api/ai/status — motor activo, disponibilidad de LLM/embeddings, vec/fts.
  // ?probe=0 salta las llamadas de red (respuesta inmediata sin tocar Ollama/API).
  router.get('/ai/status', async (req, res) => {
    const probe = req.query.probe !== '0' && req.query.probe !== 'false';
    try {
      const status = await getAiStatus({ vecEnabled, ftsEnabled, probe });
      res.json(status);
    } catch (err) {
      // getAiStatus no debería lanzar (los probes atrapan sus errores), pero por si acaso.
      res.status(200).json({ ready: false, error: err.message, vecEnabled, ftsEnabled });
    }
  });

  // ── Documentos de juego (ligados a un game system) ─────────────────────────────

  // GET /api/game-systems/:id/docs — lista docs con conteo de chunks.
  router.get('/game-systems/:id/docs', (req, res) => {
    const docs = listDocs(req.params.id);
    res.json({ docs, vecEnabled, ftsEnabled });
  });

  // POST /api/game-systems/:id/docs  { title, content, dm_id } → ingesta.
  router.post('/game-systems/:id/docs', async (req, res) => {
    const { title, content } = req.body ?? {};
    if (!title || !content) {
      return res.status(422).json({ error: 'title y content son requeridos' });
    }
    const system = requireOwnedSystem(req, res);
    if (!system) return;
    try {
      const result = await ingestDoc({
        gameSystemId: system.id,
        title,
        content,
      });
      res.status(201).json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  // POST /api/game-systems/:id/docs/:docId/reindex  { dm_id } → re-embeber.
  router.post('/game-systems/:id/docs/:docId/reindex', async (req, res) => {
    const system = requireOwnedSystem(req, res);
    if (!system) return;
    try {
      const result = await reindexDoc(Number(req.params.docId));
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  // DELETE /api/game-systems/:id/docs/:docId  { dm_id }
  router.delete('/game-systems/:id/docs/:docId', (req, res) => {
    const system = requireOwnedSystem(req, res);
    if (!system) return;
    const ok = deleteDoc(Number(req.params.docId));
    if (!ok) return res.status(404).json({ error: 'Documento no encontrado' });
    res.json({ ok: true });
  });

  // ── Búsqueda híbrida directa (debug / UI de reglas) ────────────────────────────

  // POST /api/rag/search  { query, game_system_id, k?, section_type?, doc_id? }
  router.post('/rag/search', async (req, res) => {
    const { query, game_system_id, k, section_type, doc_id } = req.body ?? {};
    if (!query || !game_system_id) {
      return res.status(422).json({ error: 'query y game_system_id son requeridos' });
    }
    try {
      const results = await hybridSearch({
        query,
        gameSystemId: game_system_id,
        k: k || 5,
        sectionType: section_type || null,
        docId: doc_id ?? null,
      });
      res.json({ results });
    } catch (err) {
      fail(res, err);
    }
  });

  // ── Asistente de IA ────────────────────────────────────────────────────────────

  // POST /api/ai/ask  { query, game_system_id, session_id? } → respuesta citada.
  router.post('/ai/ask', async (req, res) => {
    const { query, game_system_id } = req.body ?? {};
    if (!query || !game_system_id) {
      return res.status(422).json({ error: 'query y game_system_id son requeridos' });
    }
    try {
      const result = await answerRulesQuestion({ query, gameSystemId: game_system_id });
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  // POST /api/ai/assist-planning  { session_id?, game_system_id?, prompt }
  router.post('/ai/assist-planning', async (req, res) => {
    const { session_id, game_system_id, prompt } = req.body ?? {};
    if (!prompt) return res.status(422).json({ error: 'prompt es requerido' });
    try {
      const result = await assistPlanning({
        sessionId: session_id || null,
        gameSystemId: game_system_id || null,
        prompt,
      });
      res.json(result);
    } catch (err) {
      fail(res, err);
    }
  });

  // ── Resumen de sesión ──────────────────────────────────────────────────────────

  // GET /api/sessions/:id/summary
  router.get('/sessions/:id/summary', (req, res) => {
    const summary = getSessionSummary(Number(req.params.id));
    res.json({ summary });
  });

  // POST /api/sessions/:id/summary  { dm_id } → genera y guarda (solo el DM dueño).
  router.post('/sessions/:id/summary', async (req, res) => {
    const sessionId = Number(req.params.id);
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    const { dm_id } = req.body ?? {};
    if (dm_id !== undefined && String(session.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede generar el resumen' });
    }
    try {
      const summary = await summarizeSession(sessionId);
      if (io) {
        io.to(`session:${sessionId}`).emit('session:summary_ready', { sessionId, summary });
      }
      res.status(201).json({ summary });
    } catch (err) {
      fail(res, err);
    }
  });

  return router;
}

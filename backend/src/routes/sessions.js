import { Router } from 'express';
import db from '../db/index.js';
import { logEvent, listEvents } from '../services/events.js';
import { saveSessionStats } from '../services/stats.js';
import { checkCharacterFitsSession } from '../services/gameSystemCoherence.js';

// El router necesita io para emitir eventos por socket al insertarlos vía REST.
export default function createSessionsRouter(io) {
  const router = Router();

  // GET /api/sessions?status=active|closed  — incluye DM, campaña y conteo de miembros.
  // Para el historial (F14) se enriquece con el resumen de cierre y la duración del
  // snapshot de stats. Ambos joins son 1:1 (session_id UNIQUE en session_summaries y
  // session_stats), así que no duplican filas ni inflan el COUNT de miembros.
  router.get('/', (req, res) => {
    const status = req.query.status === 'closed' ? 'closed' : 'active';
    const sessions = db
      .prepare(`
        SELECT s.*, u.username AS dm_username,
               c.name AS campaign_name,
               c.game_system_id AS campaign_game_system_id,
               COUNT(sm.user_id) AS member_count,
               ss.body AS summary,
               json_extract(st.payload, '$.duration_seconds') AS duration_seconds
        FROM sessions s
        JOIN users u ON s.dm_id = u.id
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        LEFT JOIN session_members sm ON s.id = sm.session_id
        LEFT JOIN session_summaries ss ON ss.session_id = s.id
        LEFT JOIN session_stats st ON st.session_id = s.id
        WHERE s.status = ?
        GROUP BY s.id
        ORDER BY s.created_at DESC
      `)
      .all(status);
    res.json({ sessions });
  });

  // GET /api/sessions/:id  — sesión con miembros y personajes.
  router.get('/:id', (req, res) => {
    const session = db
      .prepare(`
        SELECT s.*, u.username AS dm_username, c.name AS campaign_name,
               c.game_system_id AS campaign_game_system_id
        FROM sessions s
        JOIN users u ON s.dm_id = u.id
        LEFT JOIN campaigns c ON s.campaign_id = c.id
        WHERE s.id = ?
      `)
      .get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const members = db
      .prepare(`
        SELECT u.id, u.username, u.role, sm.joined_at
        FROM session_members sm
        JOIN users u ON sm.user_id = u.id
        WHERE sm.session_id = ?
        ORDER BY sm.joined_at ASC
      `)
      .all(session.id);

    const characters = db
      .prepare(`
        SELECT ch.id, ch.user_id, ch.name, sc.joined_at
        FROM session_characters sc
        JOIN characters ch ON sc.character_id = ch.id
        WHERE sc.session_id = ?
        ORDER BY sc.joined_at ASC
      `)
      .all(session.id);

    res.json({ session, members, characters });
  });

  // POST /api/sessions  { name, dm_id, campaign_id?, prep_id? }  → crea sesión activa.
  router.post('/', (req, res) => {
    const { name, dm_id, campaign_id = null, prep_id = null } = req.body ?? {};
    if (!name || !dm_id) {
      return res.status(400).json({ error: 'name y dm_id son requeridos' });
    }

    const dm = db.prepare("SELECT id FROM users WHERE id = ? AND role = 'dm'").get(dm_id);
    if (!dm) return res.status(404).json({ error: 'DM no encontrado' });

    const create = db.transaction(() => {
      const info = db
        .prepare('INSERT INTO sessions (name, dm_id, campaign_id, prep_id) VALUES (?, ?, ?, ?)')
        .run(name, dm_id, campaign_id, prep_id);
      const sessionId = info.lastInsertRowid;
      // El DM es miembro de su propia sesión desde el arranque.
      db.prepare('INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)')
        .run(sessionId, dm_id);
      logEvent(sessionId, 'session_start', dm_id, { name });
      return sessionId;
    });

    const sessionId = create();
    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(sessionId);
    res.status(201).json({ session });
  });

  // PATCH /api/sessions/:id/close  { dm_id }  → status='closed' (solo el DM dueño).
  router.patch('/:id/close', (req, res) => {
    const { dm_id } = req.body ?? {};
    if (!dm_id) return res.status(400).json({ error: 'dm_id es requerido' });

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (String(session.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede finalizar la sesión' });
    }

    db.prepare("UPDATE sessions SET status = 'closed' WHERE id = ?").run(session.id);
    logEvent(session.id, 'session_end', dm_id, {});

    // Snapshot de estadísticas al cerrar (F7). Si el cálculo falla, el cierre NO se
    // rompe: se loguea y se sigue. session_events solo se lee.
    try {
      saveSessionStats(db, session.id);
    } catch (err) {
      console.error(`No se pudo generar el snapshot de stats para la sesión ${session.id}:`, err.message);
    }

    io.to(`session:${session.id}`).emit('session:closed', { sessionId: session.id });

    res.json({ ok: true });
  });

  // PATCH /api/sessions/:id/reset  { dm_id }  → limpia canvas_state (solo el DM dueño).
  router.patch('/:id/reset', (req, res) => {
    const { dm_id } = req.body ?? {};
    if (!dm_id) return res.status(400).json({ error: 'dm_id es requerido' });

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    if (String(session.dm_id) !== String(dm_id)) {
      return res.status(403).json({ error: 'Solo el DM dueño puede reiniciar la sesión' });
    }

    db.prepare(
      'UPDATE canvas_state SET image_url = NULL, tldraw_snapshot = NULL, updated_at = unixepoch() WHERE session_id = ?'
    ).run(session.id);
    logEvent(session.id, 'session_reset', dm_id, {});
    io.to(`session:${session.id}`).emit('session:reset', { sessionId: session.id });

    res.json({ ok: true });
  });

  // POST /api/sessions/:id/members  { user_id }  → idempotente (INSERT OR IGNORE).
  router.post('/:id/members', (req, res) => {
    const { user_id } = req.body ?? {};
    if (!user_id) return res.status(400).json({ error: 'user_id es requerido' });

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(user_id);
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    db.prepare('INSERT OR IGNORE INTO session_members (session_id, user_id) VALUES (?, ?)')
      .run(session.id, user_id);

    res.status(201).json({ ok: true });
  });

  // POST /api/sessions/:id/characters  { character_id, user_id }  → vincula un
  // personaje a la sesión (session_characters). Dueño del personaje o DM de la sesión.
  router.post('/:id/characters', (req, res) => {
    const { character_id, user_id } = req.body ?? {};
    if (!character_id) return res.status(400).json({ error: 'character_id es requerido' });

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    const character = db.prepare('SELECT * FROM characters WHERE id = ?').get(character_id);
    if (!character) return res.status(404).json({ error: 'Personaje no encontrado' });

    const isOwner = String(character.user_id) === String(user_id);
    const isDM = String(session.dm_id) === String(user_id);
    if (!isOwner && !isDM) {
      return res.status(403).json({ error: 'Sin permisos para vincular este personaje' });
    }

    // Coherencia de sistema de juego: el personaje debe pertenecer al mismo sistema
    // que la campaña de la sesión (cuando ambos están definidos).
    const fit = checkCharacterFitsSession(session.id, character_id);
    if (!fit.ok) return res.status(422).json({ error: fit.error });

    db.prepare('INSERT OR IGNORE INTO session_characters (session_id, character_id) VALUES (?, ?)')
      .run(session.id, character_id);
    logEvent(session.id, 'character_joined', user_id ?? null, { character_id, name: character.name });

    const characters = db.prepare(`
      SELECT c.id, c.user_id, c.name, sc.joined_at
      FROM session_characters sc
      JOIN characters c ON sc.character_id = c.id
      WHERE sc.session_id = ?
      ORDER BY sc.joined_at ASC, c.id ASC
    `).all(session.id);
    io.to(`session:${session.id}`).emit('characters:list_updated', { characters });

    res.status(201).json({ ok: true, characters });
  });

  // GET /api/sessions/:id/events  → lista session_events (append-only) en orden cronológico.
  router.get('/:id/events', (req, res) => {
    const session = db.prepare('SELECT id FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });
    res.json({ events: listEvents(session.id) });
  });

  // POST /api/sessions/:id/events  → inserta en el log append-only y emite por socket.
  //
  // Acepta dos formas (ambas terminan en un INSERT en session_events):
  //  1) Genérica (F4): { actor_id, type, payload }.
  //  2) Disparo de planificación / NPC (F5): { dm_id, title, category, description,
  //     participant_type, participants[], location, sub_location, branch_label,
  //     template_id, actor_type:'dm'|'npc', npc_id, npc_name }.
  //     El `type` del evento = `category` (como en la v0) y el resto va al payload,
  //     de modo que el PlanningPanel reconstruye el estado "disparado" desde el log.
  router.post('/:id/events', (req, res) => {
    const body = req.body ?? {};

    const session = db.prepare('SELECT * FROM sessions WHERE id = ?').get(req.params.id);
    if (!session) return res.status(404).json({ error: 'Sesión no encontrada' });

    // Forma de planificación/NPC: se reconoce por la presencia de `title`.
    if (body.title !== undefined) {
      const {
        dm_id,
        title,
        category = 'general',
        description = '',
        participant_type = 'all',
        participants = [],
        location = '',
        sub_location = '',
        branch_label = '',
        template_id = null,
        actor_type = 'dm',
        npc_id = null,
        npc_name = '',
      } = body;
      if (!dm_id || !title) {
        return res.status(400).json({ error: 'dm_id y title son requeridos' });
      }
      if (String(session.dm_id) !== String(dm_id)) {
        return res.status(403).json({ error: 'Solo el DM puede disparar eventos' });
      }

      const event = logEvent(session.id, category, dm_id, {
        title,
        description,
        participant_type,
        participants,
        location,
        sub_location,
        branch_label,
        template_id,
        actor_type,
        npc_id,
        npc_name,
      });
      io.to(`session:${session.id}`).emit('session:event_fired', { event });
      return res.status(201).json({ event });
    }

    // Forma genérica (F4).
    const { actor_id = null, type, payload = {} } = body;
    if (!type) return res.status(400).json({ error: 'type es requerido' });

    const event = logEvent(session.id, type, actor_id, payload);
    io.to(`session:${session.id}`).emit('session:event_fired', { event });
    res.status(201).json({ event });
  });

  return router;
}

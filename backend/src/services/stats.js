// ════════════════════════════════════════════════════════════════════════════════
// Estadísticas derivadas (F7).
//
// El log session_events es APPEND-ONLY: aquí SOLO se LEE. El estado estadístico se
// deriva reproduciendo el log + las tablas relacionadas. Las funciones reciben `db`
// para ser testeables con una conexión aislada (:memory: o archivo temporal).
//
// El payload de cada evento es JSON libre (lo escribe F5); puede no traer todos los
// campos, así que SIEMPRE se parsea con try/catch y se degradan los campos ausentes.
// ════════════════════════════════════════════════════════════════════════════════

// Parsea el payload JSON de un evento sin romper si está corrupto o incompleto.
function parsePayload(raw) {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

// Tipos genéricos del motor de sesión (F4) que NO son categorías de planificación.
// Se separan en el conteo para no mezclar "combate" (categoría) con "session_start".
const ENGINE_TYPES = new Set([
  'session_start',
  'session_end',
  'session_reset',
  'character_joined',
  'roll',
]);

// Heurística para reconocer encuentros/combates a partir de la categoría del evento.
// Las categorías son texto libre (vienen de event_templates), por eso se normaliza.
function isEncounterCategory(category) {
  if (!category) return false;
  return /combat|combate|encuentro|encounter|fight|batalla|pelea/i.test(category);
}

// Suma 1 al contador de una clave dentro de un objeto-acumulador.
function bump(counter, key) {
  if (!key) return;
  counter[key] = (counter[key] || 0) + 1;
}

// ── (a) Estadísticas de una sesión ───────────────────────────────────────────────
// A partir de session_events + miembros/personajes/notas/mensajes, produce un objeto
// serializable con duración, conteos por type/category, encuentros, NPCs, y la
// participación por personaje/jugador.
export function computeSessionStats(database, sessionId) {
  const events = database
    .prepare(
      `SELECT id, type, actor_id, payload, created_at
       FROM session_events
       WHERE session_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(sessionId);

  const eventsByType = {};
  const eventsByCategory = {};
  // Participación: clave = id de personaje (string) → { name, events }.
  const participation = {};
  let encounters = 0;
  let allHandsEvents = 0; // eventos dirigidos a toda la mesa (participant_type 'all')
  const npcsIntroduced = new Set();

  for (const ev of events) {
    bump(eventsByType, ev.type);

    const payload = parsePayload(ev.payload);
    // La categoría puede venir explícita en el payload (F5) o ser el propio `type`
    // cuando el evento de planificación guardó la categoría como type.
    const category = payload.category || (ENGINE_TYPES.has(ev.type) ? null : ev.type);
    if (category) {
      bump(eventsByCategory, category);
      if (isEncounterCategory(category)) encounters += 1;
    }

    // NPCs introducidos: eventos disparados por un NPC (actor_type === 'npc').
    if (payload.actor_type === 'npc') {
      const npcKey = payload.npc_id ?? payload.npc_name;
      if (npcKey != null && npcKey !== '') npcsIntroduced.add(String(npcKey));
    }

    // Participación por personaje. participant_type === 'all' implica a todos los
    // personajes de la sesión; 'specific' usa la lista participants[] del payload.
    if (payload.participant_type === 'all') allHandsEvents += 1;
    if (payload.participant_type === 'specific' && Array.isArray(payload.participants)) {
      for (const p of payload.participants) {
        if (p == null) continue;
        const id = String(p.id ?? p.name ?? '');
        if (!id) continue;
        if (!participation[id]) participation[id] = { name: p.name ?? id, events: 0 };
        participation[id].events += 1;
      }
    }
  }

  // Personajes de la sesión: base de la participación (incluye a quienes nunca
  // aparecieron en un evento "specific", con 0 eventos).
  const sessionCharacters = database
    .prepare(
      `SELECT c.id, c.name, c.user_id, u.username
       FROM session_characters sc
       JOIN characters c ON c.id = sc.character_id
       LEFT JOIN users u ON u.id = c.user_id
       WHERE sc.session_id = ?`
    )
    .all(sessionId);

  const characters = sessionCharacters.map((c) => {
    const matched = participation[String(c.id)];
    return {
      character_id: c.id,
      name: c.name,
      user_id: c.user_id,
      username: c.username ?? null,
      events: matched ? matched.events : 0,
    };
  });

  const notesCount = database
    .prepare('SELECT COUNT(*) AS n FROM session_notes WHERE session_id = ?')
    .get(sessionId).n;
  const messagesCount = database
    .prepare('SELECT COUNT(*) AS n FROM messages WHERE session_id = ?')
    .get(sessionId).n;

  const first = events.length ? events[0].created_at : null;
  const last = events.length ? events[events.length - 1].created_at : null;
  const durationSeconds = first != null && last != null ? last - first : 0;

  return {
    session_id: sessionId,
    event_count: events.length,
    duration_seconds: durationSeconds,
    first_event_at: first,
    last_event_at: last,
    events_by_type: eventsByType,
    events_by_category: eventsByCategory,
    encounters,
    npcs_introduced: npcsIntroduced.size,
    notes_count: notesCount,
    messages_count: messagesCount,
    character_count: sessionCharacters.length,
    participation: characters,
    all_hands_events: allHandsEvents,
  };
}

// Persiste (UPSERT) el snapshot de estadísticas de una sesión en session_stats.
// Se llama al cerrar la sesión. NO toca session_events.
export function saveSessionStats(database, sessionId) {
  const stats = computeSessionStats(database, sessionId);
  const payload = JSON.stringify(stats);
  database
    .prepare(
      `INSERT INTO session_stats (session_id, payload, generated_at)
       VALUES (?, ?, unixepoch())
       ON CONFLICT(session_id) DO UPDATE SET
         payload = excluded.payload,
         generated_at = excluded.generated_at`
    )
    .run(sessionId, payload);
  return stats;
}

// Lee el snapshot guardado (o null si no existe). Parsea el payload con guardia.
export function getSessionStatsSnapshot(database, sessionId) {
  const row = database
    .prepare('SELECT payload, generated_at FROM session_stats WHERE session_id = ?')
    .get(sessionId);
  if (!row) return null;
  return { ...parsePayload(row.payload), generated_at: row.generated_at };
}

// ── (b) Estadísticas de campaña ──────────────────────────────────────────────────
// Agrega a lo largo de las sesiones de la campaña: sesiones jugadas, eventos por
// categoría, ubicaciones visitadas y progresión de atributos is_core por personaje.
export function computeCampaignStats(database, campaignId) {
  const sessions = database
    .prepare(
      `SELECT id, name, status, created_at
       FROM sessions
       WHERE campaign_id = ?
       ORDER BY created_at ASC, id ASC`
    )
    .all(campaignId);

  const eventsByCategory = {};
  const locations = new Set();
  let totalEvents = 0;
  let encounters = 0;

  const eventStmt = database.prepare(
    `SELECT type, payload FROM session_events WHERE session_id = ?`
  );

  const sessionSummaries = sessions.map((s) => {
    const evs = eventStmt.all(s.id);
    let sessionEvents = 0;
    for (const ev of evs) {
      sessionEvents += 1;
      totalEvents += 1;
      const payload = parsePayload(ev.payload);
      const category = payload.category || (ENGINE_TYPES.has(ev.type) ? null : ev.type);
      if (category) {
        bump(eventsByCategory, category);
        if (isEncounterCategory(category)) encounters += 1;
      }
      if (payload.location) locations.add(String(payload.location));
      if (payload.sub_location) locations.add(String(payload.sub_location));
    }
    return {
      session_id: s.id,
      name: s.name,
      status: s.status,
      created_at: s.created_at,
      event_count: sessionEvents,
    };
  });

  // Progresión de atributos is_core por personaje: estado ACTUAL de los personajes
  // que han participado en sesiones de la campaña. No hay histórico por sesión en el
  // esquema (los valores viven en character_template_attr_values), así que se reporta
  // el valor vigente — base para futuras gráficas de progresión.
  const coreProgress = database
    .prepare(
      `SELECT DISTINCT c.id AS character_id, c.name AS character_name,
              at.name AS attr_name, ctav.value, ctav.max_value
       FROM session_characters sc
       JOIN sessions s ON s.id = sc.session_id
       JOIN characters c ON c.id = sc.character_id
       JOIN character_template_attr_values ctav ON ctav.character_id = c.id
       JOIN attribute_templates at ON at.id = ctav.attribute_template_id
       WHERE s.campaign_id = ? AND at.is_core = 1
       ORDER BY c.name ASC, at.sort_order ASC, at.id ASC`
    )
    .all(campaignId);

  // Agrupa la progresión por personaje para un consumo cómodo en el frontend.
  const byCharacter = {};
  for (const row of coreProgress) {
    const key = String(row.character_id);
    if (!byCharacter[key]) {
      byCharacter[key] = { character_id: row.character_id, name: row.character_name, attrs: [] };
    }
    byCharacter[key].attrs.push({
      name: row.attr_name,
      value: row.value,
      max_value: row.max_value,
    });
  }

  return {
    campaign_id: campaignId,
    sessions_played: sessions.length,
    sessions_closed: sessions.filter((s) => s.status === 'closed').length,
    total_events: totalEvents,
    encounters,
    events_by_category: eventsByCategory,
    locations_visited: Array.from(locations),
    sessions: sessionSummaries,
    core_progress: Object.values(byCharacter),
  };
}

// ── (c) Estadísticas de un personaje ─────────────────────────────────────────────
// Skills con rank, atributos actuales (con is_core/has_max), inventario y número de
// eventos en los que participó (a lo largo de todas sus sesiones).
export function computeCharacterStats(database, characterId) {
  const character = database
    .prepare(
      `SELECT c.id, c.name, c.user_id, u.username, gs.name AS game_system_name
       FROM characters c
       LEFT JOIN users u ON u.id = c.user_id
       LEFT JOIN game_system_templates gs ON gs.id = c.game_system_template_id
       WHERE c.id = ?`
    )
    .get(characterId);
  if (!character) return null;

  const attributes = database
    .prepare(
      `SELECT at.name, at.is_core, at.has_max, ctav.value, ctav.max_value
       FROM character_template_attr_values ctav
       JOIN attribute_templates at ON at.id = ctav.attribute_template_id
       WHERE ctav.character_id = ?
       ORDER BY at.category ASC, at.sort_order ASC, at.id ASC`
    )
    .all(characterId);

  const skills = database
    .prepare(
      `SELECT s.name, csl.rank, sf.name AS format_name
       FROM character_skill_links csl
       JOIN skills s ON s.id = csl.skill_id
       JOIN skill_formats sf ON sf.id = s.format_id
       WHERE csl.character_id = ?
       ORDER BY csl.rank DESC, s.name ASC`
    )
    .all(characterId);

  const inventory = database
    .prepare(
      `SELECT item_name, quantity FROM character_inventory
       WHERE character_id = ?
       ORDER BY id ASC`
    )
    .all(characterId);

  const sessionsPlayed = database
    .prepare('SELECT COUNT(*) AS n FROM session_characters WHERE character_id = ?')
    .get(characterId).n;

  // Eventos en los que participó: recorre los eventos de sus sesiones y cuenta los
  // que lo incluyen (participant_type 'all', o 'specific' con su id en participants).
  const evs = database
    .prepare(
      `SELECT se.type, se.payload
       FROM session_events se
       JOIN session_characters sc ON sc.session_id = se.session_id
       WHERE sc.character_id = ?`
    )
    .all(characterId);

  let eventsParticipated = 0;
  for (const ev of evs) {
    const payload = parsePayload(ev.payload);
    if (payload.participant_type === 'all') {
      eventsParticipated += 1;
      continue;
    }
    if (payload.participant_type === 'specific' && Array.isArray(payload.participants)) {
      const included = payload.participants.some(
        (p) => p && String(p.id) === String(characterId)
      );
      if (included) eventsParticipated += 1;
    }
  }

  return {
    character_id: character.id,
    name: character.name,
    user_id: character.user_id,
    username: character.username ?? null,
    game_system_name: character.game_system_name ?? null,
    sessions_played: sessionsPlayed,
    events_participated: eventsParticipated,
    skill_count: skills.length,
    item_count: inventory.length,
    attributes,
    skills,
    inventory,
  };
}

export default { computeSessionStats, saveSessionStats, getSessionStatsSnapshot, computeCampaignStats, computeCharacterStats };

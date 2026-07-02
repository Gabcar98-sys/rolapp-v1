import db from '../db/index.js';
import { hybridSearch } from './rag.js';
import {
  computeSessionStats,
  getSessionStatsSnapshot,
  computeCampaignStats,
  computeCharacterStats,
} from './stats.js';

// ════════════════════════════════════════════════════════════════════════════════
// TOOLS de la IA (F12 §1).
//
// Cada tool es una función interna, síncrona o async, que devuelve DATOS ESTRUCTURADOS
// (no texto libre). Están pensadas para dos rutas:
//   1) Tool-use real: cuando el proveedor soporta function-calling, el orquestador de
//      `ai.js` expone estas tools al modelo y ejecuta la que el modelo pida.
//   2) Fallback por inyección de contexto: las mismas funciones alimentan el ensamblado
//      del prompt cuando no hay tools fiables (Ollama local).
//
// NINGUNA depende de un LLM real: se prueban con la DB (better-sqlite3, SÍNCRONO) y con
// el provider de embeddings stubbeado. El acceso a DB es síncrono salvo `retrieve_rules`,
// que es async por la llamada de red de embeddings (heredada de hybridSearch).
//
// El contrato de cada tool está en TOOL_SCHEMAS (formato estilo OpenAI function-calling),
// para poder pasárselo al proveedor sin duplicar la definición.
// ════════════════════════════════════════════════════════════════════════════════

// ── retrieve_rules: recupera chunks de reglas citados (retrieval híbrido de F11) ──
// Devuelve { chunks: [{ doc_title, heading_path, section_type, text, score }] }.
// section_type opcional filtra por tipo ('tabla'|'regla'|'lore'|'general').
async function retrieveRulesTool({ query, gameSystemId, sectionType = null, k = 8 }) {
  if (!query || !query.trim()) throw new Error('retrieve_rules: query es requerido');
  if (!gameSystemId) throw new Error('retrieve_rules: gameSystemId es requerido');
  const chunks = await hybridSearch({
    query,
    gameSystemId,
    k,
    sectionType: sectionType || null,
  });
  return { chunks };
}

// ── get_character: ficha estructurada de un personaje (atributos, skills, inventario) ──
function getCharacterTool({ id }) {
  if (!id) throw new Error('get_character: id es requerido');
  const character = db
    .prepare(`
      SELECT c.id, c.name, u.username AS player, gs.name AS game_system_name
      FROM characters c
      LEFT JOIN users u ON u.id = c.user_id
      LEFT JOIN game_system_templates gs ON gs.id = c.game_system_template_id
      WHERE c.id = ?
    `)
    .get(id);
  if (!character) return null;

  const attributes = db
    .prepare(`
      SELECT at.name, at.category, at.is_core, ctav.value, ctav.max_value
      FROM character_template_attr_values ctav
      JOIN attribute_templates at ON at.id = ctav.attribute_template_id
      WHERE ctav.character_id = ?
      ORDER BY at.category ASC, at.sort_order ASC, at.id ASC
    `)
    .all(character.id);

  const skills = db
    .prepare(`
      SELECT s.name, csl.rank
      FROM character_skill_links csl
      JOIN skills s ON s.id = csl.skill_id
      WHERE csl.character_id = ?
      ORDER BY csl.rank DESC, s.name ASC
    `)
    .all(character.id);

  const inventory = db
    .prepare('SELECT item_name, quantity FROM character_inventory WHERE character_id = ? ORDER BY id ASC')
    .all(character.id);

  return { ...character, attributes, skills, inventory };
}

// ── get_session_state: personajes + atributos de una sesión (estado vivo) ─────────
function getSessionStateTool({ sessionId }) {
  if (!sessionId) throw new Error('get_session_state: sessionId es requerido');
  const session = db
    .prepare(`
      SELECT s.id, s.name, s.status, c.name AS campaign_name
      FROM sessions s
      LEFT JOIN campaigns c ON c.id = s.campaign_id
      WHERE s.id = ?
    `)
    .get(sessionId);
  if (!session) return null;

  const characters = db
    .prepare(`
      SELECT ch.id, ch.name, u.username AS player
      FROM session_characters sc
      JOIN characters ch ON ch.id = sc.character_id
      JOIN users u ON u.id = ch.user_id
      WHERE sc.session_id = ?
      ORDER BY ch.name ASC
    `)
    .all(sessionId);

  const attrStmt = db.prepare(`
    SELECT at.name, at.category, v.value, v.max_value
    FROM character_template_attr_values v
    JOIN attribute_templates at ON at.id = v.attribute_template_id
    WHERE v.character_id = ?
    ORDER BY at.category ASC, at.sort_order ASC
  `);
  for (const ch of characters) ch.attributes = attrStmt.all(ch.id);

  return { session, characters };
}

// ── get_event_history: log narrativo append-only de la sesión (solo lectura) ──────
function getEventHistoryTool({ sessionId }) {
  if (!sessionId) throw new Error('get_event_history: sessionId es requerido');
  const SKIP = new Set(['session_join', 'session_leave', 'session_end', 'message']);
  const events = db
    .prepare(`
      SELECT se.type, se.payload, u.username AS actor
      FROM session_events se
      LEFT JOIN users u ON se.actor_id = u.id
      WHERE se.session_id = ?
      ORDER BY se.created_at ASC, se.id ASC
    `)
    .all(sessionId);

  return {
    events: events
      .filter((e) => !SKIP.has(e.type))
      .map((e) => {
        let payload = {};
        try { payload = JSON.parse(e.payload); } catch { /* payload no-JSON: se ignora */ }
        return { type: e.type, actor: e.actor ?? 'sistema', payload };
      }),
  };
}

// ── get_stats: estadísticas derivadas por ámbito (sesión | campaña | personaje) ───
// El log es append-only; stats.js solo LEE. Para 'session' usa el snapshot si existe.
function getStatsTool({ scope, id }) {
  if (!scope || id == null) throw new Error('get_stats: scope e id son requeridos');
  switch (scope) {
    case 'session':
      return getSessionStatsSnapshot(db, id) ?? computeSessionStats(db, id);
    case 'campaign':
      return computeCampaignStats(db, id);
    case 'character':
      return computeCharacterStats(db, id);
    default:
      throw new Error(`get_stats: scope no soportado "${scope}"`);
  }
}

// Registro central de tools. `handler` recibe un objeto de args ya normalizado.
export const TOOLS = {
  retrieve_rules: retrieveRulesTool,
  get_character: getCharacterTool,
  get_session_state: getSessionStateTool,
  get_event_history: getEventHistoryTool,
  get_stats: getStatsTool,
};

// Esquemas de las tools en formato function-calling (estilo OpenAI). Se envían al
// proveedor cuando soporta tools; el orquestador mapea el nombre a TOOLS[name].
export const TOOL_SCHEMAS = [
  {
    type: 'function',
    function: {
      name: 'retrieve_rules',
      description:
        'Recupera fragmentos de las reglas del juego relevantes para una consulta, con su ' +
        'cita (documento y encabezado). Úsala SIEMPRE antes de afirmar una regla.',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'La consulta de reglas a buscar.' },
          sectionType: {
            type: 'string',
            enum: ['tabla', 'regla', 'lore', 'general'],
            description: 'Filtro opcional por tipo de sección.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_character',
      description: 'Devuelve la ficha de un personaje: atributos, skills e inventario.',
      parameters: {
        type: 'object',
        properties: { id: { type: 'integer', description: 'ID del personaje.' } },
        required: ['id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_session_state',
      description: 'Devuelve el estado de una sesión: personajes vinculados y sus atributos.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'integer', description: 'ID de la sesión.' } },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_event_history',
      description: 'Devuelve el historial narrativo (eventos) de una sesión, en orden.',
      parameters: {
        type: 'object',
        properties: { sessionId: { type: 'integer', description: 'ID de la sesión.' } },
        required: ['sessionId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_stats',
      description:
        'Devuelve estadísticas derivadas de una sesión, campaña o personaje ' +
        '(conteos de eventos, encuentros, participación, progresión).',
      parameters: {
        type: 'object',
        properties: {
          scope: { type: 'string', enum: ['session', 'campaign', 'character'] },
          id: { type: 'integer', description: 'ID del recurso según el scope.' },
        },
        required: ['scope', 'id'],
      },
    },
  },
];

// Ejecuta una tool por nombre con args ya parseados. El orquestador la invoca cuando el
// modelo pide una tool-call. `context` aporta valores que el modelo no debe/puede fijar
// por sí mismo (p. ej. gameSystemId scoped por la sesión), que se fusionan con sus args.
export async function executeTool(name, args = {}, context = {}) {
  const handler = TOOLS[name];
  if (!handler) throw new Error(`Tool desconocida: ${name}`);
  // El contexto tiene prioridad sobre lo que proponga el modelo para claves de scope
  // (gameSystemId/sessionId), evitando que el modelo consulte datos de otra mesa.
  const merged = { ...args, ...context };
  return handler(merged);
}

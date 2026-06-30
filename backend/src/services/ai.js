import db from '../db/index.js';
import { hybridSearch } from './rag.js';

// ════════════════════════════════════════════════════════════════════════════════
// Cliente LLM INYECTABLE + ensamblado de CONTEXTO ESTRUCTURADO (§5.4 del plan).
//
// En lugar de un volcado de texto plano, las funciones arman bloques estructurados
// (reglas recuperadas con cita + estado de sesión/personajes/eventos) y construyen un
// prompt acotado. El acceso a datos se factoriza en helpers (`retrieveRules`,
// `getSessionState`, `getEventHistory`) pensados para convertirse en tools más
// adelante; por ahora se invocan internamente.
//
// El LLM se llama vía un cliente mutable que los tests sustituyen (sin red).
// ════════════════════════════════════════════════════════════════════════════════

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const AI_MODEL = process.env.AI_MODEL || process.env.OLLAMA_MODEL || 'llama3.1:8b';
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama';

// Un cliente LLM es: async (prompt: string) => string.
let activeLlm = null;

async function ollamaLlm(prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, prompt, stream: false }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Ollama LLM error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.response;
}

async function apiLlm(prompt) {
  const baseUrl = process.env.AI_API_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.API_KEY || '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model: AI_MODEL, messages: [{ role: 'user', content: prompt }] }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

function defaultLlm() {
  return AI_PROVIDER === 'api' ? apiLlm : ollamaLlm;
}

// Permite a los tests inyectar un stub. Pasar null restaura el default.
export function setLlmClient(client) {
  activeLlm = client;
}

async function callLlm(prompt) {
  const llm = activeLlm || defaultLlm();
  try {
    return await llm(prompt);
  } catch (err) {
    // Normaliza fallos de red (Ollama/API apagados) a un mensaje claro → 503 en el router.
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
      throw new Error(`Proveedor de IA no disponible (${AI_PROVIDER}): ${err.message}`);
    }
    throw err;
  }
}

const SYSTEM_PREAMBLE =
  'Eres el asistente de una mesa de rol. Responde SIEMPRE en español, de forma directa y ' +
  'factual. No inventes reglas ni datos que no estén en el contexto. Cuando uses una regla ' +
  'recuperada, cítala por su sección entre corchetes, p. ej. [Combate > Iniciativa].';

// ── Tool-like: recuperar reglas citadas ──────────────────────────────────────────
async function retrieveRules({ query, gameSystemId, k = 5 }) {
  return hybridSearch({ query, gameSystemId, k });
}

// ── Tool-like: estado estructurado de la sesión (personajes + atributos) ─────────
export function getSessionState(sessionId) {
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

// ── Tool-like: historial de eventos narrativos (append-only, solo lectura) ───────
export function getEventHistory(sessionId) {
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

  return events
    .filter((e) => !SKIP.has(e.type))
    .map((e) => {
      let payload = {};
      try { payload = JSON.parse(e.payload); } catch { /* payload no-JSON: se ignora */ }
      return { type: e.type, actor: e.actor ?? 'sistema', payload };
    });
}

// ── Ensamblado de contexto estructurado a texto compacto ─────────────────────────
function renderRules(chunks) {
  if (!chunks.length) return '';
  let out = '=== REGLAS RECUPERADAS ===\n';
  for (const c of chunks) {
    out += `[${c.doc_title || 'doc'} :: ${c.heading_path}] (${c.section_type})\n${c.text}\n\n`;
  }
  return out;
}

function renderSessionState(state) {
  if (!state) return '';
  let out = `=== ESTADO DE SESIÓN: ${state.session.name} ===\n`;
  if (state.session.campaign_name) out += `Campaña: ${state.session.campaign_name}\n`;
  for (const ch of state.characters) {
    const attrs = ch.attributes
      .map((a) => `${a.name}=${a.value}${a.max_value != null ? `/${a.max_value}` : ''}`)
      .join(', ');
    out += `- ${ch.name} (${ch.player})${attrs ? `: ${attrs}` : ''}\n`;
  }
  return out + '\n';
}

function renderEvents(events) {
  if (!events.length) return '';
  let out = '=== HISTORIAL DE EVENTOS ===\n';
  for (const e of events) {
    const loc = [e.payload.location, e.payload.sub_location].filter(Boolean).join(' › ');
    const parts = [];
    if (loc) parts.push(`[${loc}]`);
    parts.push(`(${e.type})`);
    if (e.payload.title) parts.push(e.payload.title);
    if (e.payload.description) parts.push(`— ${e.payload.description}`);
    out += `${e.actor}: ${parts.join(' ')}\n`;
  }
  return out + '\n';
}

// ── (a) Consulta de reglas con citas ─────────────────────────────────────────────
export async function answerRulesQuestion({ query, gameSystemId }) {
  if (!query || !query.trim()) throw new Error('La consulta está vacía');
  if (!gameSystemId) throw new Error('game_system_id es requerido');

  const chunks = await retrieveRules({ query, gameSystemId });
  const prompt =
    `${SYSTEM_PREAMBLE}\n\n${renderRules(chunks)}` +
    `=== PREGUNTA ===\n${query}\n\n` +
    'Responde la pregunta basándote únicamente en las reglas recuperadas y cita las secciones.';

  const answer = await callLlm(prompt);
  return {
    answer,
    citations: chunks.map((c) => ({
      doc_title: c.doc_title,
      heading_path: c.heading_path,
      section_type: c.section_type,
      score: c.score,
    })),
  };
}

// ── (b) Resumen de sesión (guarda en session_summaries) ──────────────────────────
export async function summarizeSession(sessionId) {
  const state = getSessionState(sessionId);
  if (!state) throw new Error('Sesión no encontrada');
  const events = getEventHistory(sessionId);

  const notes = db
    .prepare('SELECT title, body, event_type FROM session_notes WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId);
  let notesBlock = '';
  if (notes.length) {
    notesBlock = '=== NOTAS DEL DM ===\n';
    for (const n of notes) notesBlock += `[${n.event_type}] ${n.title}: ${n.body}\n`;
    notesBlock += '\n';
  }

  const prompt =
    `${SYSTEM_PREAMBLE}\n\n${notesBlock}${renderEvents(events)}${renderSessionState(state)}` +
    'Haz un resumen de esta sesión en 3-5 párrafos: eventos importantes en orden, decisiones ' +
    'clave de los personajes y el estado al cierre. Usa solo la información del contexto.';

  const body = await callLlm(prompt);

  db.prepare(`
    INSERT INTO session_summaries (session_id, body, generated_at)
    VALUES (?, ?, unixepoch())
    ON CONFLICT(session_id) DO UPDATE SET body = excluded.body, generated_at = unixepoch()
  `).run(sessionId, body);

  return getSessionSummary(sessionId);
}

export function getSessionSummary(sessionId) {
  return db.prepare('SELECT * FROM session_summaries WHERE session_id = ?').get(sessionId) ?? null;
}

// ── (c) Asistente de planificación (reglas + estado) ─────────────────────────────
export async function assistPlanning({ sessionId, gameSystemId, prompt }) {
  if (!prompt || !prompt.trim()) throw new Error('El prompt está vacío');

  const chunks = gameSystemId ? await retrieveRules({ query: prompt, gameSystemId }) : [];
  const state = sessionId ? getSessionState(sessionId) : null;
  const events = sessionId ? getEventHistory(sessionId) : [];

  const fullPrompt =
    `${SYSTEM_PREAMBLE}\n\n${renderRules(chunks)}${renderSessionState(state)}${renderEvents(events)}` +
    `=== PETICIÓN DEL DM ===\n${prompt}\n\n` +
    'Propón sugerencias concretas (encuentros, eventos, giros) apoyadas en las reglas y el ' +
    'estado actual. Sé breve y accionable.';

  const suggestion = await callLlm(fullPrompt);
  return {
    suggestion,
    citations: chunks.map((c) => ({
      doc_title: c.doc_title,
      heading_path: c.heading_path,
      section_type: c.section_type,
    })),
  };
}

import db from '../db/index.js';
import { hybridSearch } from './rag.js';
import { probeEmbeddings } from './embeddings.js';
import { TOOL_SCHEMAS, executeTool } from './aiTools.js';

// ════════════════════════════════════════════════════════════════════════════════
// Cliente LLM INYECTABLE + orquestador de TOOL-USE con FALLBACK a inyección de contexto
// (§5.4 del plan; tools en F12).
//
// Dos modos, elegidos por config (`AI_TOOLS_ENABLED`):
//   • TOOL-USE: si el proveedor soporta function-calling, el modelo puede pedir tools
//     (retrieve_rules, get_character, …). El orquestador (`runToolLoop`) ejecuta la tool,
//     le devuelve el resultado y repite hasta que el modelo responde en texto. Las tools
//     viven en `aiTools.js` y son 100% testeables sin LLM real.
//   • FALLBACK (inyección de contexto): si no hay tools fiables (Ollama local), se arma
//     el contexto estructurado y se manda como prompt (comportamiento previo a F12).
//
// El LLM se llama vía clientes mutables que los tests sustituyen (sin red):
//   activeLlm        — no-streaming: async (prompt|messages, opts) => string
//   activeLlmStream  — streaming: async function* (prompt|messages, opts) → tokens
//   activeLlmTools   — tool-use: async (messages, { tools, ...opts }) => assistantMessage
// ════════════════════════════════════════════════════════════════════════════════

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
// LLM local pequeño por defecto (turnkey): qwen2.5:3b es liviano y multilingüe.
// Se sobreescribe con AI_MODEL / OLLAMA_MODEL sin tocar código.
const AI_MODEL = process.env.AI_MODEL || process.env.OLLAMA_MODEL || 'qwen2.5:3b';
const AI_PROVIDER = process.env.AI_PROVIDER || 'ollama';

// Tool-use activado por env. Solo tiene sentido con proveedores con function-calling
// (típicamente 'api'); los modelos Ollama locales rara vez lo soportan de forma fiable,
// así que el default es OFF y el sistema usa inyección de contexto.
function toolsEnabled() {
  return /^(1|true|yes|on)$/i.test(process.env.AI_TOOLS_ENABLED || '');
}

export const AI_CONFIG = {
  provider: AI_PROVIDER,
  model: AI_MODEL,
  get toolsEnabled() { return toolsEnabled(); },
};

// ── Config por tarea (F12 §3) ──────────────────────────────────────────────────
// Cada tarea ('rules'|'summary'|'planning') puede fijar modelo/temperatura/top-k/máx.
// contexto vía env específicas (AI_MODEL_SUMMARY, AI_TEMPERATURE_RULES, …) con fallback
// a los valores generales. Se lee en cada llamada para que un cambio de env aplique sin
// reimportar el módulo (que arrastra el singleton db).
const TASK_KEYS = { rules: 'RULES', summary: 'SUMMARY', planning: 'PLANNING' };

function numEnv(name, fallback) {
  const v = Number(process.env[name]);
  return Number.isFinite(v) ? v : fallback;
}

export function resolveTaskConfig(task) {
  const key = TASK_KEYS[task] || 'RULES';
  const generalTemp = numEnv('AI_TEMPERATURE', 0.4);
  return {
    model: process.env[`AI_MODEL_${key}`] || AI_MODEL,
    temperature: numEnv(`AI_TEMPERATURE_${key}`, generalTemp),
    // top-k de retrieval por tarea (cuántos chunks recuperar antes de empaquetar).
    topK: Math.max(1, numEnv(`AI_TOP_K_${key}`, RETRIEVE_K)),
    // Presupuesto de tokens del contexto de reglas por tarea.
    contextBudget: Math.max(200, numEnv(`AI_MAX_CONTEXT_${key}`, CONTEXT_TOKEN_BUDGET)),
  };
}

// Un cliente LLM no-streaming es: async (prompt|messages, opts) => string.
let activeLlm = null;
// Un cliente LLM de streaming es: async function* (prompt|messages, opts) → yield token:string.
let activeLlmStream = null;
// Un cliente LLM de tool-use es: async (messages, { tools, temperature, model }) =>
//   { content: string, tool_calls?: [{ id, name, arguments }] }.
let activeLlmTools = null;

// Normaliza un prompt (string) o una lista de mensajes a `messages` estilo chat.
function toMessages(promptOrMessages) {
  if (Array.isArray(promptOrMessages)) return promptOrMessages;
  return [{ role: 'user', content: String(promptOrMessages ?? '') }];
}

async function ollamaLlm(prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, prompt: promptText(prompt), stream: false }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Ollama LLM error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.response;
}

// Aplana prompt|messages a texto para la API /generate de Ollama (no-chat).
function promptText(promptOrMessages) {
  if (!Array.isArray(promptOrMessages)) return String(promptOrMessages ?? '');
  return promptOrMessages
    .map((m) => `${m.role === 'system' ? '' : `${m.role}: `}${m.content}`)
    .join('\n\n');
}

// Streaming de Ollama: /api/generate con stream:true emite líneas NDJSON, cada una con
// un fragmento en `.response` y `.done` al final.
async function* ollamaLlmStream(prompt) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: AI_MODEL, prompt: promptText(prompt), stream: true }),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Ollama LLM error ${res.status}: ${msg}`);
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.response) yield obj.response;
      } catch { /* línea parcial: se reintenta con el siguiente chunk */ }
    }
  }
}

async function apiLlm(prompt, { model = AI_MODEL, temperature } = {}) {
  const baseUrl = process.env.AI_API_BASE_URL || process.env.AI_API_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.API_KEY || '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: toMessages(prompt),
      ...(temperature != null ? { temperature } : {}),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? '';
}

// Streaming estilo OpenAI (SSE): líneas `data: {json}` con delta en choices[0].delta.content.
async function* apiLlmStream(prompt, { model = AI_MODEL, temperature } = {}) {
  const baseUrl = process.env.AI_API_BASE_URL || process.env.AI_API_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.API_KEY || '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages: toMessages(prompt),
      stream: true,
      ...(temperature != null ? { temperature } : {}),
    }),
  });
  if (!res.ok || !res.body) {
    const msg = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${msg}`);
  }
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    let nl;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (payload === '[DONE]') return;
      try {
        const obj = JSON.parse(payload);
        const delta = obj.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch { /* fragmento parcial */ }
    }
  }
}

// Cliente de tool-use estilo OpenAI: manda `tools` y `tool_choice:auto`; devuelve el
// mensaje del asistente normalizado a { content, tool_calls:[{ id, name, arguments }] }.
async function apiLlmTools(messages, { model = AI_MODEL, temperature, tools } = {}) {
  const baseUrl = process.env.AI_API_BASE_URL || process.env.AI_API_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.API_KEY || '';
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({
      model,
      messages,
      tools,
      tool_choice: 'auto',
      ...(temperature != null ? { temperature } : {}),
    }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`LLM API error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  const message = data.choices?.[0]?.message ?? {};
  const toolCalls = (message.tool_calls || []).map((tc) => ({
    id: tc.id,
    name: tc.function?.name,
    arguments: safeParseJson(tc.function?.arguments),
  }));
  return { content: message.content ?? '', tool_calls: toolCalls };
}

function safeParseJson(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}

function defaultLlm() {
  return AI_PROVIDER === 'api' ? apiLlm : ollamaLlm;
}

function defaultLlmStream() {
  return AI_PROVIDER === 'api' ? apiLlmStream : ollamaLlmStream;
}

function defaultLlmTools() {
  return AI_PROVIDER === 'api' ? apiLlmTools : null;
}

// Permite a los tests inyectar stubs. Pasar null restaura los defaults.
export function setLlmClient(client) {
  activeLlm = client;
}

export function setLlmStreamClient(client) {
  activeLlmStream = client;
}

// Cliente de tool-use: async (messages, { tools, temperature, model }) => assistantMessage.
export function setLlmToolsClient(client) {
  activeLlmTools = client;
}

// Normaliza fallos de red (Ollama/API apagados) a un mensaje claro → 503 en el router.
function normalizeProviderError(err) {
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
    return new Error(`Proveedor de IA no disponible (${AI_PROVIDER}): ${err.message}`);
  }
  return err;
}

async function callLlm(prompt, opts = {}) {
  const llm = activeLlm || defaultLlm();
  try {
    return await llm(prompt, opts);
  } catch (err) {
    throw normalizeProviderError(err);
  }
}

// Emite la respuesta completa como un único token (usado cuando no hay streaming real).
async function nonStreamAsSingleToken(prompt, onToken, opts) {
  const answer = await callLlm(prompt, opts);
  if (onToken && answer) onToken(answer);
  return answer;
}

// Genera tokens del LLM invocando `onToken(token)` por cada fragmento. Devuelve el texto
// completo acumulado. Degradación elegante:
//  - Si NO hay cliente de streaming inyectado pero SÍ uno no-streaming (stub/override
//    explícito), usa el no-streaming directamente (el proveedor "no hace streaming").
//  - Si el streaming falla por un error que NO es de disponibilidad, cae al no-streaming.
//  - Si el proveedor está caído, propaga el error claro (el no-streaming también fallaría).
async function callLlmStream(prompt, onToken, opts = {}) {
  if (!activeLlmStream && activeLlm) {
    return nonStreamAsSingleToken(prompt, onToken, opts);
  }
  const streamClient = activeLlmStream || defaultLlmStream();
  let full = '';
  try {
    for await (const token of streamClient(prompt, opts)) {
      full += token;
      if (onToken) onToken(token);
    }
    return full;
  } catch (err) {
    const norm = normalizeProviderError(err);
    if (norm === err && !/no disponible/i.test(norm.message)) {
      return nonStreamAsSingleToken(prompt, onToken, opts);
    }
    throw norm;
  }
}

// ── Prompts endurecidos en español (citar-o-abstenerse; cero alucinación) ─────────
// Cláusula anti-alucinación reutilizable: obliga a apoyarse en el contexto/tools y a
// abstenerse cuando la información no está disponible.
const NO_HALLUCINATION =
  'REGLA CRÍTICA: no inventes. Usa ÚNICAMENTE la información del contexto recuperado ' +
  '(o de las tools). Si el contexto no cubre la pregunta, dilo explícitamente ("No ' +
  'encuentro esa información en los documentos cargados") en vez de especular. Cero ' +
  'alucinación: es preferible abstenerse a inventar una regla.';

const RULES_SYSTEM =
  'Eres el asistente de reglas de una mesa de rol. Responde SIEMPRE en español, de forma ' +
  'directa y factual. Cita la sección que respalda cada afirmación entre corchetes, p. ej. ' +
  '[Combate > Iniciativa]. ' + NO_HALLUCINATION;

const SUMMARY_SYSTEM =
  'Eres el cronista de una mesa de rol. Resume la sesión en español con esta estructura, ' +
  'usando SOLO la información del contexto:\n' +
  '**Qué pasó:** los eventos importantes en orden.\n' +
  '**Decisiones clave:** qué decidieron los personajes y sus consecuencias.\n' +
  '**Hilos abiertos:** tramas o preguntas sin resolver para la próxima sesión.\n' +
  'Sé conciso y concreto. ' + NO_HALLUCINATION;

const PLANNING_SYSTEM =
  'Eres el asistente de planificación del DM. Responde en español con sugerencias concretas ' +
  'y accionables (encuentros, eventos, giros, NPCs), apoyadas en las reglas recuperadas y en ' +
  'el estado actual de la sesión. Cita las reglas relevantes entre corchetes. No inventes ' +
  'reglas del juego; si algo no está en el contexto, propónlo como idea abierta y márcalo ' +
  'como sugerencia (no como regla oficial). ' + NO_HALLUCINATION;

// Presupuesto de tokens para el contexto de reglas que se manda al LLM (F11 §5).
// Estimación simple ~= chars/4 (misma heurística que el chunker). Configurable por env.
const CONTEXT_TOKEN_BUDGET = Math.max(200, Number(process.env.RAG_CONTEXT_TOKEN_BUDGET) || 1500);
// Recuperamos un poco más de chunks de los que probablemente entren, para que el
// empaquetado por presupuesto tenga de dónde elegir tras dedup/MMR.
const RETRIEVE_K = Math.max(5, Number(process.env.RAG_RETRIEVE_K) || 8);

// ── Follow-ups conversacionales (F12 §4) ──────────────────────────────────────────
// El historial de turnos se acota para no desbordar el contexto: nº de turnos y chars.
const HISTORY_MAX_TURNS = Math.max(0, Number(process.env.AI_HISTORY_MAX_TURNS) || 6);
const HISTORY_MAX_CHARS = Math.max(200, Number(process.env.AI_HISTORY_MAX_CHARS) || 4000);

// Normaliza y ACOTA el historial recibido del frontend a mensajes chat válidos.
// Acepta [{ role:'user'|'assistant', content }] y recorta a los últimos N turnos y a un
// presupuesto de caracteres (los turnos más recientes tienen prioridad).
export function normalizeHistory(history) {
  if (!Array.isArray(history)) return [];
  const clean = history
    .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
    .map((m) => ({ role: m.role, content: m.content.trim() }))
    .filter((m) => m.content);
  // Conserva los últimos HISTORY_MAX_TURNS turnos.
  const recent = clean.slice(-HISTORY_MAX_TURNS);
  // Recorta desde el más antiguo hasta caber en el presupuesto de caracteres.
  let total = recent.reduce((s, m) => s + m.content.length, 0);
  while (recent.length > 1 && total > HISTORY_MAX_CHARS) {
    total -= recent.shift().content.length;
  }
  return recent;
}

function estimateChunkTokens(text) {
  return Math.max(1, Math.ceil((text?.length || 0) / 4));
}

// Empaqueta los chunks recuperados (ya ordenados por relevancia) hasta agotar el
// presupuesto de tokens. Los más relevantes van primero; se detiene al no caber el
// siguiente. Garantiza al menos un chunk si hay alguno (aunque exceda el presupuesto),
// para no dejar al LLM sin contexto. Devuelve solo los chunks efectivamente usados.
function packWithinBudget(chunks, budget = CONTEXT_TOKEN_BUDGET) {
  const packed = [];
  let used = 0;
  for (const c of chunks) {
    const cost = c.token_count || estimateChunkTokens(c.text);
    if (packed.length && used + cost > budget) break;
    packed.push(c);
    used += cost;
  }
  return packed;
}

// ── Recuperar reglas citadas (con empaquetado por presupuesto) ────────────────────
// Recupera un pool amplio con el retrieval híbrido optimizado y lo empaqueta hasta el
// presupuesto de tokens, priorizando relevancia. Solo los chunks empaquetados llegan al
// prompt y se reportan como `sources`.
async function retrieveRules({ query, gameSystemId, k = RETRIEVE_K, budget = CONTEXT_TOKEN_BUDGET }) {
  const chunks = await hybridSearch({ query, gameSystemId, k });
  return packWithinBudget(chunks, budget);
}

// ── Estado estructurado de la sesión (personajes + atributos) ─────────────────────
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

// ── Historial de eventos narrativos (append-only, solo lectura) ───────────────────
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

// Convierte los chunks recuperados en el formato de fuentes citadas de la respuesta.
// { doc_title, heading_path, section_type, snippet, score }
function toSources(chunks) {
  return chunks.map((c) => ({
    doc_title: c.doc_title,
    heading_path: c.heading_path,
    section_type: c.section_type,
    snippet: c.text ? c.text.slice(0, 240).trim() : '',
    score: c.score,
  }));
}

// ── Orquestador de tool-use (F12 §1) ──────────────────────────────────────────────
// Loop: manda los mensajes al cliente de tools; si el modelo pide tool-calls, las
// ejecuta (vía aiTools.executeTool), añade los resultados como mensajes `tool` y repite
// hasta que el modelo responde en texto o se agota `maxIterations`. Acumula los chunks
// devueltos por retrieve_rules como fuentes citadas para el contrato { answer, sources }.
//
// `context` fija valores de scope (gameSystemId/sessionId) que el modelo no debe alterar.
const TOOL_LOOP_MAX_ITERS = Math.max(1, Number(process.env.AI_TOOL_MAX_ITERS) || 4);

async function runToolLoop({ system, messages, context, model, temperature }) {
  const toolsClient = activeLlmTools || defaultLlmTools();
  if (!toolsClient) throw new Error('El proveedor activo no soporta tool-use');

  const convo = [{ role: 'system', content: system }, ...messages];
  const collectedChunks = [];
  const seenChunks = new Set();

  for (let iter = 0; iter < TOOL_LOOP_MAX_ITERS; iter++) {
    let assistant;
    try {
      assistant = await toolsClient(convo, { tools: TOOL_SCHEMAS, model, temperature });
    } catch (err) {
      throw normalizeProviderError(err);
    }
    const toolCalls = assistant.tool_calls || [];
    if (!toolCalls.length) {
      // El modelo respondió en texto: fin del loop.
      const sources = dedupChunksToSources(collectedChunks);
      return { answer: assistant.content || '', sources };
    }

    // Registra la petición del asistente y ejecuta cada tool solicitada.
    convo.push({ role: 'assistant', content: assistant.content || '', tool_calls: toolCalls });
    for (const call of toolCalls) {
      let result;
      try {
        result = await executeTool(call.name, call.arguments, context);
      } catch (err) {
        result = { error: err.message };
      }
      // Si la tool fue retrieve_rules, acumula sus chunks como fuentes.
      if (call.name === 'retrieve_rules' && result?.chunks) {
        for (const c of result.chunks) {
          const key = `${c.doc_title}::${c.heading_path}`;
          if (!seenChunks.has(key)) {
            seenChunks.add(key);
            collectedChunks.push(c);
          }
        }
      }
      convo.push({
        role: 'tool',
        tool_call_id: call.id,
        name: call.name,
        content: JSON.stringify(result ?? null),
      });
    }
  }

  // Se agotaron las iteraciones sin respuesta final: pide una respuesta directa con lo
  // acumulado (degradación elegante en vez de colgar el loop).
  const final = await toolsClient(
    [...convo, { role: 'user', content: 'Responde ahora con la información disponible.' }],
    { tools: [], model, temperature }
  );
  return { answer: final.content || '', sources: dedupChunksToSources(collectedChunks) };
}

function dedupChunksToSources(chunks) {
  return toSources(chunks);
}

// ── (a) Consulta de reglas con citas ─────────────────────────────────────────────
function buildRulesPrompt(query, chunks, history = []) {
  const messages = [{ role: 'system', content: RULES_SYSTEM }];
  for (const turn of history) messages.push(turn);
  messages.push({
    role: 'user',
    content:
      `${renderRules(chunks)}=== PREGUNTA ===\n${query}\n\n` +
      'Responde la pregunta basándote únicamente en las reglas recuperadas y cita las secciones.',
  });
  return messages;
}

export async function answerRulesQuestion({ query, gameSystemId, history = [] }) {
  if (!query || !query.trim()) throw new Error('La consulta está vacía');
  if (!gameSystemId) throw new Error('game_system_id es requerido');

  const cfg = resolveTaskConfig('rules');
  const turns = normalizeHistory(history);

  // Ruta tool-use: el modelo decide qué recuperar (function-calling).
  if (toolsEnabled() && (activeLlmTools || defaultLlmTools())) {
    const { answer, sources } = await runToolLoop({
      system: RULES_SYSTEM,
      messages: [...turns, { role: 'user', content: query }],
      context: { gameSystemId },
      model: cfg.model,
      temperature: cfg.temperature,
    });
    return { answer, sources, citations: sources };
  }

  // Fallback: inyección de contexto (comportamiento previo a F12).
  const chunks = await retrieveRules({ query, gameSystemId, k: cfg.topK, budget: cfg.contextBudget });
  const answer = await callLlm(buildRulesPrompt(query, chunks, turns), {
    model: cfg.model,
    temperature: cfg.temperature,
  });
  const sources = toSources(chunks);
  // `citations` se mantiene como alias de compatibilidad; `sources` es el contrato canónico.
  return { answer, sources, citations: sources };
}

// Variante streaming: emite tokens vía onToken y devuelve { answer, sources }.
// El streaming de tokens solo aplica a la ruta de inyección de contexto; con tool-use la
// respuesta se produce tras el loop, así que se emite completa como un único token.
export async function streamRulesQuestion({ query, gameSystemId, history = [] }, onToken) {
  if (!query || !query.trim()) throw new Error('La consulta está vacía');
  if (!gameSystemId) throw new Error('game_system_id es requerido');

  const cfg = resolveTaskConfig('rules');
  const turns = normalizeHistory(history);

  if (toolsEnabled() && (activeLlmTools || defaultLlmTools())) {
    const { answer, sources } = await runToolLoop({
      system: RULES_SYSTEM,
      messages: [...turns, { role: 'user', content: query }],
      context: { gameSystemId },
      model: cfg.model,
      temperature: cfg.temperature,
    });
    if (onToken && answer) onToken(answer);
    return { answer, sources, citations: sources };
  }

  const chunks = await retrieveRules({ query, gameSystemId, k: cfg.topK, budget: cfg.contextBudget });
  const answer = await callLlmStream(buildRulesPrompt(query, chunks, turns), onToken, {
    model: cfg.model,
    temperature: cfg.temperature,
  });
  const sources = toSources(chunks);
  return { answer, sources, citations: sources };
}

// ── (b) Resumen de sesión (guarda en session_summaries) ──────────────────────────
export async function summarizeSession(sessionId) {
  const state = getSessionState(sessionId);
  if (!state) throw new Error('Sesión no encontrada');
  const events = getEventHistory(sessionId);
  const cfg = resolveTaskConfig('summary');

  const notes = db
    .prepare('SELECT title, body, event_type FROM session_notes WHERE session_id = ? ORDER BY created_at ASC')
    .all(sessionId);
  let notesBlock = '';
  if (notes.length) {
    notesBlock = '=== NOTAS DEL DM ===\n';
    for (const n of notes) notesBlock += `[${n.event_type}] ${n.title}: ${n.body}\n`;
    notesBlock += '\n';
  }

  const messages = [
    { role: 'system', content: SUMMARY_SYSTEM },
    {
      role: 'user',
      content:
        `${notesBlock}${renderEvents(events)}${renderSessionState(state)}` +
        'Redacta el resumen siguiendo la estructura indicada (Qué pasó / Decisiones clave / ' +
        'Hilos abiertos). Usa solo la información del contexto.',
    },
  ];

  const body = await callLlm(messages, { model: cfg.model, temperature: cfg.temperature });

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
async function buildPlanningContext({ sessionId, gameSystemId, prompt, history = [], cfg }) {
  const chunks = gameSystemId
    ? await retrieveRules({ query: prompt, gameSystemId, k: cfg.topK, budget: cfg.contextBudget })
    : [];
  const state = sessionId ? getSessionState(sessionId) : null;
  const events = sessionId ? getEventHistory(sessionId) : [];
  const messages = [{ role: 'system', content: PLANNING_SYSTEM }];
  for (const turn of history) messages.push(turn);
  messages.push({
    role: 'user',
    content:
      `${renderRules(chunks)}${renderSessionState(state)}${renderEvents(events)}` +
      `=== PETICIÓN DEL DM ===\n${prompt}\n\n` +
      'Propón sugerencias concretas apoyadas en las reglas y el estado actual. Sé breve y accionable.',
  });
  return { chunks, messages };
}

export async function assistPlanning({ sessionId, gameSystemId, prompt, history = [] }) {
  if (!prompt || !prompt.trim()) throw new Error('El prompt está vacío');
  const cfg = resolveTaskConfig('planning');
  const turns = normalizeHistory(history);
  const { chunks, messages } = await buildPlanningContext({ sessionId, gameSystemId, prompt, history: turns, cfg });
  const suggestion = await callLlm(messages, { model: cfg.model, temperature: cfg.temperature });
  const sources = toSources(chunks);
  return { suggestion, sources, citations: sources };
}

export async function streamPlanning({ sessionId, gameSystemId, prompt, history = [] }, onToken) {
  if (!prompt || !prompt.trim()) throw new Error('El prompt está vacío');
  const cfg = resolveTaskConfig('planning');
  const turns = normalizeHistory(history);
  const { chunks, messages } = await buildPlanningContext({ sessionId, gameSystemId, prompt, history: turns, cfg });
  const suggestion = await callLlmStream(messages, onToken, { model: cfg.model, temperature: cfg.temperature });
  const sources = toSources(chunks);
  return { suggestion, sources, citations: sources };
}

// ── Estado de la IA (para /api/ai/status y la UX) ─────────────────────────────────
// Sondea el LLM con un prompt mínimo. No lanza: la UX necesita un estado, no un crash.
async function probeLlm() {
  const llm = activeLlm || defaultLlm();
  try {
    const out = await llm('ping');
    return { ok: typeof out === 'string', provider: AI_PROVIDER, model: AI_MODEL };
  } catch (err) {
    return { ok: false, provider: AI_PROVIDER, model: AI_MODEL, error: normalizeProviderError(err).message };
  }
}

// Reporta el estado completo de la IA: motor activo, disponibilidad de LLM/embeddings y
// flags de retrieval (vec/fts). `probe:false` evita las llamadas de red (respuesta rápida).
export async function getAiStatus({ vecEnabled, ftsEnabled, probe = true } = {}) {
  const status = {
    provider: AI_PROVIDER,
    model: AI_MODEL,
    embedProvider: process.env.EMBED_PROVIDER || 'ollama',
    toolsEnabled: toolsEnabled(),
    vecEnabled: !!vecEnabled,
    ftsEnabled: !!ftsEnabled,
  };
  if (!probe) return status;
  const [llm, embeddings] = await Promise.all([probeLlm(), probeEmbeddings()]);
  return { ...status, llm, embeddings, ready: llm.ok && embeddings.ok };
}

import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import socket, { streamAiAsk, streamSessionPreset } from '../../lib/socket.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';
import Icon from '../ui/Icon.jsx';

const inputCls =
  'rounded-btn border border-line bg-bg px-3 py-2 text-sm text-title outline-none focus:border-accent';

// Memoria corta de conversación (follow-ups): nº de turnos que se mandan al backend.
const MAX_HISTORY_TURNS = 6;

// Presets del modo Sesión (contexto = sesión en vivo). "libre" es la pregunta abierta de
// reglas de siempre (streaming intacto); el resto van por streamSessionPreset (inyección
// de contexto de datos estructurados de la sesión). El preset lleva su query "canned"
// para mostrarla como pregunta enviada.
const SESSION_PRESETS = [
  { id: 'libre', label: 'Pregunta libre' },
  { id: 'resumen', label: 'Resumen', query: 'Resume lo ocurrido en la sesión.' },
  { id: 'cronologia', label: 'Cronología', query: 'Ordena cronológicamente los eventos.' },
  { id: 'estado', label: 'Estado de personajes', query: 'Estado actual de cada personaje.' },
  { id: 'inventarios', label: 'Inventarios', query: 'Inventario de cada personaje.' },
];

// Topics del modo Sistema (contexto = reglas del sistema). Cada topic filtra el retrieval
// por section_type y prefija la consulta. "core" no filtra (todas las secciones).
const SYSTEM_TOPICS = [
  { id: 'core', label: 'Reglas base', sectionType: null, prefix: '' },
  { id: 'habilidades', label: 'Habilidades', sectionType: 'regla', prefix: 'Sobre habilidades: ' },
  { id: 'items', label: 'Items', sectionType: 'tabla', prefix: 'Sobre objetos e items: ' },
  { id: 'npcs', label: 'NPCs', sectionType: 'lore', prefix: 'Sobre NPCs y criaturas: ' },
];

// Badge del motor de IA activo. Deriva su etiqueta/color del estado de /ai/status.
function EngineBadge({ status }) {
  if (!status) {
    return <span className="rounded-pill bg-surface-2 px-2 py-0.5 text-xs text-faint">Comprobando IA…</span>;
  }
  if (!status.ready) {
    return <span className="rounded-pill bg-danger-tint px-2 py-0.5 text-xs text-danger-text">IA no disponible</span>;
  }
  const label = status.provider === 'api' ? 'API externa' : 'Ollama local';
  return (
    <span className="rounded-pill bg-accent-tint px-2 py-0.5 text-xs text-accent-text" title={status.model}>
      {label} · {status.model}
    </span>
  );
}

function fmtScore(score) {
  return typeof score === 'number' ? score.toFixed(3) : '—';
}

// Resuelve los sistemas de juego disponibles para una sesión siguiendo el modelo canónico
// (docs/game_system_model.md): el sistema se hereda SIEMPRE de la CAMPAÑA; los personajes
// en sesión son solo un fallback/complemento. Devuelve la lista deduplicada por id
// (campaña primero) y el `defaultId` a preseleccionar. Sin campaña-con-sistema ni
// personajes-con-sistema → `{ systems: [], defaultId: '' }`. Helper puro para poder
// testearlo sin DOM (lección F20: vitest del frontend no tiene jsdom).
export function resolveSessionGameSystems({ session, characters = [] } = {}) {
  const seen = new Map();

  // 1) Sistema de la campaña de la sesión (fuente principal por diseño).
  const campaignSystemId = session?.campaign_game_system_id;
  if (campaignSystemId) {
    seen.set(
      campaignSystemId,
      session.campaign_game_system_name || `Sistema ${campaignSystemId}`
    );
  }

  // 2) Sistemas derivados de los personajes en sesión (fallback si no hay campaña con
  //    sistema, o complemento si algún personaje trae otro sistema).
  for (const c of characters) {
    if (c.game_system_template_id && !seen.has(c.game_system_template_id)) {
      seen.set(
        c.game_system_template_id,
        c.game_system_name || `Sistema ${c.game_system_template_id}`
      );
    }
  }

  const systems = [...seen.entries()].map(([id, name]) => ({ id, name }));
  const defaultId = systems.length ? String(systems[0].id) : '';
  return { systems, defaultId };
}

// Qué sessionId acompaña a una pregunta libre (F37). Solo el modo Sesión pide al backend
// que inyecte el contexto de la partida; el modo Sistema pregunta al manual y debe seguir
// yendo SIN sessionId (camino retrocompatible). Helper puro para poder testearlo sin DOM
// (lección F20: el vitest del frontend no tiene jsdom).
export function freeAskSessionId(mode, sessionId) {
  return mode === 'session' ? sessionId ?? null : null;
}

// Panel de IA dentro de la sesión (F18: modos Sesión/Sistema + presets/topics + checkbox
// "incluir sesiones anteriores"). ENVUELVE el motor de F9-F12: conserva STREAMING (tokens
// vía socket), CITAS con score, FOLLOW-UPS (memoria corta), REGENERAR y DEGRADACIÓN. El
// modo/preset solo decide QUÉ evento de socket se dispara; el manejo de tokens/estado es
// el mismo camino para todos.
export default function AIPanel({ sessionId, user, campaignId = null }) {
  const isDM = user.role === 'dm';
  const [mode, setMode] = useState('session'); // 'session' | 'system'
  const [preset, setPreset] = useState('libre'); // preset de sesión activo
  const [topic, setTopic] = useState('core'); // topic de sistema activo
  const [includePrevious, setIncludePrevious] = useState(false);
  const [systems, setSystems] = useState([]); // [{ id, name }]
  const [gameSystemId, setGameSystemId] = useState('');
  const [query, setQuery] = useState('');
  const [lastRun, setLastRun] = useState(null); // { kind, ... } para regenerar
  const [answer, setAnswer] = useState('');
  const [sources, setSources] = useState([]);
  const [conversation, setConversation] = useState([]); // memoria corta (solo pregunta libre)
  const [summary, setSummary] = useState(null);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [aiStatus, setAiStatus] = useState(null);
  const [showDebug, setShowDebug] = useState(false);
  const [debugChunks, setDebugChunks] = useState(null);
  const [debugLoading, setDebugLoading] = useState(false);
  const cleanupRef = useRef(null);

  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus({ ready: false }));
  }, []);

  // Resuelve el sistema de juego de la sesión desde la CAMPAÑA (modelo canónico), con los
  // personajes en sesión como fallback. La campaña llega en la sesión (campaign_game_system_id
  // / _name, expuestos por GET /api/sessions/:id); los personajes traen su propio sistema.
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.getSession(sessionId).catch(() => ({ session: null })),
      api.listSessionCharacters(sessionId).catch(() => ({ characters: [] })),
    ]).then(([{ session }, { characters }]) => {
      if (cancelled) return;
      const { systems: list, defaultId } = resolveSessionGameSystems({ session, characters });
      setSystems(list);
      setGameSystemId(defaultId);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  useEffect(() => {
    api.getSessionSummary(sessionId).then(({ summary: s }) => setSummary(s)).catch(() => {});
    const onSummaryReady = ({ summary: s }) => setSummary(s);
    socket.on('session:summary_ready', onSummaryReady);
    return () => socket.off('session:summary_ready', onSummaryReady);
  }, [sessionId]);

  useEffect(() => () => cleanupRef.current?.(), []);

  // Camino de streaming común: recibe un `starter(callbacks) => cleanup` y una acción
  // opcional `onComplete(finalAnswer)`. Centraliza el manejo de tokens/errores/estado para
  // no duplicar la lógica entre pregunta libre, presets y topics (streaming intacto).
  function runStream(starter, { onComplete } = {}) {
    setError('');
    setAnswer('');
    setSources([]);
    setAsking(true);
    cleanupRef.current?.();
    cleanupRef.current = starter({
      onToken: (token) => setAnswer((prev) => prev + token),
      onDone: ({ answer: full, sources: srcs }) => {
        const finalAnswer = full || '';
        if (full) setAnswer(full);
        setSources(srcs || []);
        setAsking(false);
        onComplete?.(finalAnswer);
      },
      onError: (message) => {
        setError(message);
        setAsking(false);
      },
    });
  }

  // Pregunta libre (con follow-ups y, en modo sesión, opción de topic=null). `askSessionId`
  // viaja en lastRun para que Regenerar reproduzca la MISMA consulta aunque se haya
  // cambiado de modo entretanto.
  function runFreeAsk(queryText, history, sectionType = null, askSessionId = null) {
    if (!gameSystemId) {
      setError('No hay sistema de juego asociado a esta sesión.');
      return;
    }
    setLastRun({ kind: 'free', queryText, sectionType, askSessionId });
    runStream(
      (cb) => streamAiAsk({ query: queryText, gameSystemId, sessionId: askSessionId, history, sectionType }, cb),
      {
        onComplete: (finalAnswer) =>
          setConversation((prev) =>
            [...prev, { role: 'user', content: queryText }, { role: 'assistant', content: finalAnswer }].slice(
              -MAX_HISTORY_TURNS
            )
          ),
      }
    );
  }

  // Preset de sesión (Resumen/Cronología/Estado/Inventarios).
  function runPreset(presetId) {
    setLastRun({ kind: 'preset', presetId });
    runStream((cb) => streamSessionPreset({ sessionId, preset: presetId, includePrevious }, cb));
  }

  // Envío del formulario: según el modo/preset activo despacha el camino correcto.
  function ask(e) {
    e.preventDefault();
    if (mode === 'system') {
      const q = query.trim();
      if (!q) return;
      const t = SYSTEM_TOPICS.find((x) => x.id === topic) ?? SYSTEM_TOPICS[0];
      runFreeAsk(`${t.prefix}${q}`, [], t.sectionType, freeAskSessionId('system', sessionId));
      setQuery('');
      return;
    }
    // Modo sesión.
    if (preset === 'libre') {
      const q = query.trim();
      if (!q) return;
      runFreeAsk(q, conversation, null, freeAskSessionId('session', sessionId));
      setQuery('');
    } else {
      runPreset(preset);
    }
  }

  function regenerate() {
    if (!lastRun) return;
    if (lastRun.kind === 'preset') {
      runPreset(lastRun.presetId);
    } else {
      const priorHistory = conversation.slice(0, -2);
      setConversation(priorHistory);
      runFreeAsk(lastRun.queryText, priorHistory, lastRun.sectionType, lastRun.askSessionId ?? null);
    }
  }

  function resetConversation() {
    setConversation([]);
    setAnswer('');
    setSources([]);
    setLastRun(null);
    setError('');
  }

  async function generateSummary() {
    setError('');
    setSummarizing(true);
    try {
      const { summary: s } = await api.generateSessionSummary(sessionId, user.id);
      setSummary(s);
    } catch (err) {
      setError(err.message);
    } finally {
      setSummarizing(false);
    }
  }

  function inspectRetrieval() {
    const q = (lastRun?.queryText || query).trim();
    if (!q || !gameSystemId) return;
    setDebugLoading(true);
    api
      .ragSearch(q, gameSystemId, 10)
      .then(({ results }) => setDebugChunks(results || []))
      .catch((err) => setError(err.message))
      .finally(() => setDebugLoading(false));
  }

  const aiDown = aiStatus && !aiStatus.ready;
  const isPresetRun = mode === 'session' && preset !== 'libre';
  const canRegenerate = lastRun && !asking;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted">Asistente IA</span>
        <EngineBadge status={aiStatus} />
      </div>

      {aiDown && (
        <p className="rounded-btn bg-surface-2 px-3 py-2 text-xs text-faint">
          La IA no está disponible. Inícialo con
          <code className="mx-1 text-accent-text">docker compose --profile ai up</code>
          y descarga los modelos con
          <code className="mx-1 text-accent-text">scripts/ai-bootstrap.sh</code>.
        </p>
      )}
      {error && <p className="rounded-btn bg-danger-tint px-3 py-2 text-sm text-danger-text">{error}</p>}

      <Card className="p-4">
        {/* Selector de modo Sesión / Sistema */}
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="inline-flex rounded-btn border border-line p-0.5">
            {[
              { id: 'session', label: 'Sesión' },
              { id: 'system', label: 'Sistema' },
            ].map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                className={`rounded-[7px] px-3 py-1 text-xs font-medium transition-colors ${
                  mode === m.id ? 'bg-accent text-bg' : 'text-sub hover:text-title'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          {mode === 'session' && preset === 'libre' && conversation.length > 0 && (
            <button type="button" onClick={resetConversation} className="text-xs text-faint hover:text-accent-text">
              Nueva conversación
            </button>
          )}
        </div>

        {/* Chips de preset (Sesión) o topic (Sistema) */}
        {mode === 'session' ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SESSION_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPreset(p.id)}
                className={`rounded-pill px-2.5 py-1 text-xs transition-colors ${
                  preset === p.id
                    ? 'bg-accent-tint text-accent-text'
                    : 'bg-surface-2 text-sub hover:text-title'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SYSTEM_TOPICS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTopic(t.id)}
                className={`rounded-pill px-2.5 py-1 text-xs transition-colors ${
                  topic === t.id
                    ? 'bg-accent-tint text-accent-text'
                    : 'bg-surface-2 text-sub hover:text-title'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {systems.length > 1 && mode === 'system' && (
          <select
            value={gameSystemId}
            onChange={(e) => setGameSystemId(e.target.value)}
            className={`mb-2 w-full ${inputCls}`}
            aria-label="Sistema de juego"
          >
            {systems.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        )}

        {/* Checkbox "incluir sesiones anteriores" (solo modo Sesión y con campaña) */}
        {mode === 'session' && campaignId && (
          <label className="mb-2 flex cursor-pointer items-center gap-1.5 text-xs text-sub">
            <input
              type="checkbox"
              checked={includePrevious}
              onChange={(e) => setIncludePrevious(e.target.checked)}
              className="h-4 w-4 accent-accent"
            />
            Incluir sesiones anteriores
          </label>
        )}

        <form onSubmit={ask} className="flex flex-col gap-2">
          {!isPresetRun && (
            <textarea
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={
                mode === 'system'
                  ? '¿Cómo funciona esta regla?'
                  : conversation.length
                    ? 'Pregunta de seguimiento…'
                    : '¿Cómo funciona la iniciativa en combate?'
              }
              rows={2}
              className={inputCls}
            />
          )}
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={asking || (mode === 'system' && !systems.length)}>
              {asking
                ? 'Consultando…'
                : isPresetRun
                  ? `Generar ${SESSION_PRESETS.find((p) => p.id === preset)?.label ?? ''}`
                  : mode === 'session' && conversation.length
                    ? 'Seguir'
                    : 'Preguntar'}
            </Button>
            {canRegenerate && (
              <Button type="button" size="sm" variant="secondary" onClick={regenerate}>
                <Icon name="arrow-left" size={14} className="mr-1" /> Regenerar
              </Button>
            )}
          </div>
        </form>
        {mode === 'system' && !systems.length && (
          <p className="mt-2 text-xs text-faint">
            Esta sesión no tiene sistema de juego. Asígnale una campaña con sistema para
            consultar sus reglas.
          </p>
        )}

        {(answer || asking) && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="whitespace-pre-wrap rounded-btn bg-bg px-3 py-2 text-sm text-title">
              {answer}
              {asking && <span className="ml-0.5 animate-pulse text-accent-text">▍</span>}
            </p>
            {sources.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">Fuentes</span>
                {sources.map((c, i) => (
                  <div key={i} className="text-xs text-sub">
                    <span className="flex items-center gap-1">
                      <span className="flex flex-1 items-center gap-1">
                        <Icon name="book" size={13} className="text-faint" />
                        {c.doc_title} › {c.heading_path}{' '}
                        <span className="text-faint">({c.section_type})</span>
                      </span>
                      <span
                        className="rounded bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-accent-text"
                        title="Score de relevancia"
                      >
                        {fmtScore(c.score)}
                      </span>
                    </span>
                    {c.snippet && <p className="mt-0.5 pl-4 italic text-faint">“{c.snippet}”</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Panel de depuración de retrieval (colapsable) */}
        {systems.length > 0 && (
          <div className="mt-3 border-t border-line pt-2">
            <button
              type="button"
              onClick={() => {
                const next = !showDebug;
                setShowDebug(next);
                if (next && !debugChunks) inspectRetrieval();
              }}
              className="flex items-center gap-1 text-xs text-faint hover:text-accent-text"
            >
              <Icon name={showDebug ? 'chevron-down' : 'chevron-right'} size={14} />
              Depuración de retrieval
            </button>
            {showDebug && (
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={inspectRetrieval}
                  disabled={debugLoading || !(lastRun?.queryText || query).trim()}
                >
                  {debugLoading ? 'Recuperando…' : 'Recuperar chunks de la última consulta'}
                </Button>
                {debugChunks && debugChunks.length === 0 && (
                  <p className="text-xs text-faint">Sin chunks recuperados.</p>
                )}
                {debugChunks &&
                  debugChunks.map((c, i) => (
                    <div key={i} className="rounded-btn bg-bg px-2 py-1.5 text-[11px] text-sub">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-title">{c.doc_title} › {c.heading_path}</span>
                        <span className="shrink-0 font-mono text-accent-text">{fmtScore(c.score)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-faint">{c.text}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-title">
            <Icon name="file" size={15} className="text-accent-text" /> Resumen de sesión
          </h3>
          {isDM && (
            <Button size="sm" variant="secondary" onClick={generateSummary} disabled={summarizing}>
              {summarizing ? 'Generando…' : 'Generar'}
            </Button>
          )}
        </div>
        {summary ? (
          <p className="whitespace-pre-wrap text-sm text-sub">{summary.body}</p>
        ) : (
          <p className="text-xs text-faint">
            {isDM ? 'Aún no hay resumen. Genera uno cuando quieras.' : 'El DM aún no ha generado el resumen.'}
          </p>
        )}
      </Card>
    </div>
  );
}

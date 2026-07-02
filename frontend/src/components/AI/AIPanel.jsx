import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import socket, { streamAiAsk } from '../../lib/socket.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

// Memoria corta de conversación (follow-ups): nº de turnos que se mandan al backend.
// El backend re-acota; aquí limitamos para no arrastrar historiales largos por socket.
const MAX_HISTORY_TURNS = 6;

// Badge del motor de IA activo. Deriva su etiqueta/color del estado de /ai/status.
function EngineBadge({ status }) {
  if (!status) {
    return (
      <span className="rounded-full bg-ink-600 px-2 py-0.5 text-xs text-gray-400">Comprobando IA…</span>
    );
  }
  if (!status.ready) {
    return (
      <span className="rounded-full bg-danger/20 px-2 py-0.5 text-xs text-red-300">IA no disponible</span>
    );
  }
  const label = status.provider === 'api' ? 'API externa' : 'Ollama local';
  return (
    <span className="rounded-full bg-success/30 px-2 py-0.5 text-xs text-green-300" title={status.model}>
      {label} · {status.model}
      {status.toolsEnabled && <span className="ml-1 text-gold" title="Tool-use activo">🛠️</span>}
    </span>
  );
}

// Formatea un score de fusión a 3 decimales; degrada si no viene.
function fmtScore(score) {
  return typeof score === 'number' ? score.toFixed(3) : '—';
}

// Panel de IA dentro de la sesión (tab 🤖). Consulta reglas con respuesta en STREAMING
// (tokens vía socket) y citas a la fuente con SCORE; permite REGENERAR y ver un panel de
// depuración de retrieval (chunks recuperados con score/heading_path). Mantiene una
// memoria corta de la conversación para follow-ups. El sistema de juego se deriva de los
// personajes vinculados (RAG scoped por game_system_id). Degrada con elegancia si la IA
// está caída. Muestra el motor activo (badge) y conserva el streaming de F9.
export default function AIPanel({ sessionId, user }) {
  const isDM = user.role === 'dm';
  const [systems, setSystems] = useState([]); // [{ id, name }]
  const [gameSystemId, setGameSystemId] = useState('');
  const [query, setQuery] = useState('');
  const [lastQuery, setLastQuery] = useState(''); // última consulta enviada (para regenerar)
  const [answer, setAnswer] = useState(''); // texto acumulado del streaming
  const [sources, setSources] = useState([]); // [{ doc_title, heading_path, snippet, score }]
  const [conversation, setConversation] = useState([]); // [{ role, content }] memoria corta
  const [summary, setSummary] = useState(null);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [aiStatus, setAiStatus] = useState(null); // { provider, model, ready, ... }
  const [showDebug, setShowDebug] = useState(false); // panel de depuración de retrieval
  const [debugChunks, setDebugChunks] = useState(null); // chunks crudos de /rag/search
  const [debugLoading, setDebugLoading] = useState(false);
  const cleanupRef = useRef(null);

  // Consulta el estado de la IA para el badge y para decidir la degradación de la UX.
  useEffect(() => {
    api.aiStatus().then(setAiStatus).catch(() => setAiStatus({ ready: false }));
  }, []);

  // Deriva los sistemas de juego presentes en la sesión a partir de los personajes.
  useEffect(() => {
    api
      .listSessionCharacters(sessionId)
      .then(({ characters }) => {
        const seen = new Map();
        for (const c of characters) {
          if (c.game_system_template_id && !seen.has(c.game_system_template_id)) {
            seen.set(c.game_system_template_id, c.game_system_name || `Sistema ${c.game_system_template_id}`);
          }
        }
        const list = [...seen.entries()].map(([id, name]) => ({ id, name }));
        setSystems(list);
        if (list.length) setGameSystemId(String(list[0].id));
      })
      .catch(() => {});
  }, [sessionId]);

  // Carga el resumen existente y escucha el evento de resumen listo por socket.
  useEffect(() => {
    api
      .getSessionSummary(sessionId)
      .then(({ summary: s }) => setSummary(s))
      .catch(() => {});

    const onSummaryReady = ({ summary: s }) => setSummary(s);
    socket.on('session:summary_ready', onSummaryReady);
    return () => socket.off('session:summary_ready', onSummaryReady);
  }, [sessionId]);

  // Limpia el listener de streaming al desmontar.
  useEffect(() => () => cleanupRef.current?.(), []);

  // Lanza una consulta por streaming. `queryText` puede diferir del input (regenerar usa
  // la última consulta). `history` acompaña la consulta para follow-ups conversacionales.
  function runAsk(queryText, history) {
    if (!gameSystemId) {
      setError('No hay sistema de juego asociado a esta sesión.');
      return;
    }
    setError('');
    setAnswer('');
    setSources([]);
    setAsking(true);
    setLastQuery(queryText);
    cleanupRef.current?.();

    cleanupRef.current = streamAiAsk(
      { query: queryText, gameSystemId, history },
      {
        onToken: (token) => setAnswer((prev) => prev + token),
        onDone: ({ answer: full, sources: srcs }) => {
          const finalAnswer = full || '';
          if (full) setAnswer(full);
          setSources(srcs || []);
          setAsking(false);
          // Actualiza la memoria corta: añade el turno del usuario y del asistente,
          // acotando a los últimos MAX_HISTORY_TURNS turnos.
          setConversation((prev) =>
            [...prev, { role: 'user', content: queryText }, { role: 'assistant', content: finalAnswer }].slice(
              -MAX_HISTORY_TURNS
            )
          );
        },
        onError: (message) => {
          setError(message);
          setAsking(false);
        },
      }
    );
  }

  function ask(e) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    // Follow-up: manda la conversación previa como memoria corta.
    runAsk(q, conversation);
    setQuery('');
  }

  // Regenera la última respuesta con la MISMA consulta y la conversación previa a ese
  // turno (sin el último par usuario/asistente, para no duplicarlo).
  function regenerate() {
    if (!lastQuery) return;
    const priorHistory = conversation.slice(0, -2);
    setConversation(priorHistory);
    runAsk(lastQuery, priorHistory);
  }

  // Limpia la conversación (empezar de cero).
  function resetConversation() {
    setConversation([]);
    setAnswer('');
    setSources([]);
    setLastQuery('');
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

  // Panel de depuración: recupera los chunks crudos de /rag/search para la última
  // consulta (o el input actual), mostrando score/heading_path sin pasar por el LLM.
  function inspectRetrieval() {
    const q = (lastQuery || query).trim();
    if (!q || !gameSystemId) return;
    setDebugLoading(true);
    api
      .ragSearch(q, gameSystemId, 10)
      .then(({ results }) => setDebugChunks(results || []))
      .catch((err) => setError(err.message))
      .finally(() => setDebugLoading(false));
  }

  const aiDown = aiStatus && !aiStatus.ready;

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Asistente IA</span>
        <EngineBadge status={aiStatus} />
      </div>

      {aiDown && (
        <p className="rounded-md bg-ink-600 px-3 py-2 text-xs text-gray-400">
          La IA no está disponible. Inícialo con
          <code className="mx-1 text-gold">docker compose --profile ai up</code>
          y descarga los modelos con
          <code className="mx-1 text-gold">scripts/ai-bootstrap.sh</code>.
        </p>
      )}
      {error && <p className="rounded-md bg-danger/20 px-3 py-2 text-sm text-red-300">{error}</p>}

      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">🤖 Preguntar reglas</h3>
          {conversation.length > 0 && (
            <button
              type="button"
              onClick={resetConversation}
              className="text-xs text-gray-500 hover:text-gold"
            >
              Nueva conversación
            </button>
          )}
        </div>
        {systems.length > 1 && (
          <select
            value={gameSystemId}
            onChange={(e) => setGameSystemId(e.target.value)}
            className={`mb-2 w-full ${inputCls}`}
            aria-label="Sistema de juego"
          >
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        )}
        <form onSubmit={ask} className="flex flex-col gap-2">
          <textarea
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              conversation.length
                ? 'Pregunta de seguimiento…'
                : '¿Cómo funciona la iniciativa en combate?'
            }
            rows={2}
            className={inputCls}
          />
          <div className="flex gap-2">
            <Button type="submit" size="sm" disabled={asking || !systems.length}>
              {asking ? 'Consultando…' : conversation.length ? 'Seguir' : 'Preguntar'}
            </Button>
            {lastQuery && !asking && (
              <Button type="button" size="sm" variant="secondary" onClick={regenerate}>
                ↻ Regenerar
              </Button>
            )}
          </div>
        </form>
        {!systems.length && (
          <p className="mt-2 text-xs text-gray-500">
            Vincula un personaje con sistema de juego para consultar sus reglas.
          </p>
        )}

        {(answer || asking) && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="whitespace-pre-wrap rounded-md bg-ink-900 px-3 py-2 text-sm text-gray-100">
              {answer}
              {asking && <span className="ml-0.5 animate-pulse text-gold">▍</span>}
            </p>
            {sources.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Fuentes
                </span>
                {sources.map((c, i) => (
                  <div key={i} className="text-xs text-gray-400">
                    <span className="flex items-center gap-1">
                      <span className="flex-1">
                        📖 {c.doc_title} › {c.heading_path}{' '}
                        <span className="text-gray-600">({c.section_type})</span>
                      </span>
                      <span
                        className="rounded bg-ink-600 px-1.5 py-0.5 font-mono text-[10px] text-gold"
                        title="Score de relevancia"
                      >
                        {fmtScore(c.score)}
                      </span>
                    </span>
                    {c.snippet && <p className="mt-0.5 pl-4 italic text-gray-600">“{c.snippet}”</p>}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Panel de depuración de retrieval (colapsable): chunks crudos con score/heading. */}
        {systems.length > 0 && (
          <div className="mt-3 border-t border-ink-line pt-2">
            <button
              type="button"
              onClick={() => {
                const next = !showDebug;
                setShowDebug(next);
                if (next && !debugChunks) inspectRetrieval();
              }}
              className="text-xs text-gray-500 hover:text-gold"
            >
              {showDebug ? '▾' : '▸'} Depuración de retrieval
            </button>
            {showDebug && (
              <div className="mt-2 flex flex-col gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  onClick={inspectRetrieval}
                  disabled={debugLoading || !(lastQuery || query).trim()}
                >
                  {debugLoading ? 'Recuperando…' : 'Recuperar chunks de la última consulta'}
                </Button>
                {debugChunks && debugChunks.length === 0 && (
                  <p className="text-xs text-gray-500">Sin chunks recuperados.</p>
                )}
                {debugChunks &&
                  debugChunks.map((c, i) => (
                    <div key={i} className="rounded-md bg-ink-900 px-2 py-1.5 text-[11px] text-gray-400">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-gray-300">
                          {c.doc_title} › {c.heading_path}
                        </span>
                        <span className="shrink-0 font-mono text-gold">{fmtScore(c.score)}</span>
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-gray-600">{c.text}</p>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}
      </Card>

      <Card className="p-4">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-200">📝 Resumen de sesión</h3>
          {isDM && (
            <Button size="sm" variant="secondary" onClick={generateSummary} disabled={summarizing}>
              {summarizing ? 'Generando…' : 'Generar'}
            </Button>
          )}
        </div>
        {summary ? (
          <p className="whitespace-pre-wrap text-sm text-gray-200">{summary.body}</p>
        ) : (
          <p className="text-xs text-gray-500">
            {isDM
              ? 'Aún no hay resumen. Genera uno cuando quieras.'
              : 'El DM aún no ha generado el resumen.'}
          </p>
        )}
      </Card>
    </div>
  );
}

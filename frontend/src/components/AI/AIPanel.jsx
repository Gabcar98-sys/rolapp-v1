import { useEffect, useRef, useState } from 'react';
import { api } from '../../lib/api.js';
import socket, { streamAiAsk } from '../../lib/socket.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

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
    </span>
  );
}

// Panel de IA dentro de la sesión (tab 🤖). Consulta reglas con respuesta en STREAMING
// (tokens vía socket) y citas a la fuente; el DM además genera/ve el resumen de sesión.
// El sistema de juego se deriva de los personajes vinculados (el RAG está scoped por
// game_system_id). Muestra el motor activo y degrada con elegancia si la IA está caída.
export default function AIPanel({ sessionId, user }) {
  const isDM = user.role === 'dm';
  const [systems, setSystems] = useState([]); // [{ id, name }]
  const [gameSystemId, setGameSystemId] = useState('');
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState(''); // texto acumulado del streaming
  const [sources, setSources] = useState([]); // [{ doc_title, heading_path, snippet }]
  const [summary, setSummary] = useState(null);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  const [aiStatus, setAiStatus] = useState(null); // { provider, model, ready, ... }
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

  function ask(e) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!gameSystemId) {
      setError('No hay sistema de juego asociado a esta sesión.');
      return;
    }
    setError('');
    setAnswer('');
    setSources([]);
    setAsking(true);
    cleanupRef.current?.();

    // Streaming por socket: los tokens llegan a medida que el LLM los produce.
    cleanupRef.current = streamAiAsk(
      { query: query.trim(), gameSystemId },
      {
        onToken: (token) => setAnswer((prev) => prev + token),
        onDone: ({ answer: full, sources: srcs }) => {
          if (full) setAnswer(full);
          setSources(srcs || []);
          setAsking(false);
        },
        onError: (message) => {
          setError(message);
          setAsking(false);
        },
      }
    );
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
        <h3 className="mb-3 text-sm font-semibold text-gray-200">🤖 Preguntar reglas</h3>
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
            placeholder="¿Cómo funciona la iniciativa en combate?"
            rows={2}
            className={inputCls}
          />
          <Button type="submit" size="sm" disabled={asking || !systems.length}>
            {asking ? 'Consultando…' : 'Preguntar'}
          </Button>
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
                    <span>
                      📖 {c.doc_title} › {c.heading_path}{' '}
                      <span className="text-gray-600">({c.section_type})</span>
                    </span>
                    {c.snippet && <p className="mt-0.5 pl-4 italic text-gray-600">“{c.snippet}”</p>}
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

import { useEffect, useState } from 'react';
import { api } from '../../lib/api.js';
import socket from '../../lib/socket.js';
import Button from '../ui/Button.jsx';
import Card from '../ui/Card.jsx';

const inputCls =
  'rounded-md border border-ink-line bg-ink-900 px-3 py-2 text-sm text-gray-100 outline-none focus:border-gold';

// Panel de IA dentro de la sesión (tab 🤖). Permite consultar reglas con citas y, para
// el DM, generar/ver el resumen de la sesión. El sistema de juego se deriva de los
// personajes vinculados a la sesión (el RAG está scoped por game_system_id).
export default function AIPanel({ sessionId, user }) {
  const isDM = user.role === 'dm';
  const [systems, setSystems] = useState([]); // [{ id, name }]
  const [gameSystemId, setGameSystemId] = useState('');
  const [query, setQuery] = useState('');
  const [answer, setAnswer] = useState(null); // { answer, citations }
  const [summary, setSummary] = useState(null);
  const [asking, setAsking] = useState(false);
  const [summarizing, setSummarizing] = useState(false);
  const [error, setError] = useState('');
  // IA deshabilitada (Ollama no responde): mostramos aviso sin romper la UI.
  const [aiDown, setAiDown] = useState(false);

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

  async function ask(e) {
    e.preventDefault();
    if (!query.trim()) return;
    if (!gameSystemId) {
      setError('No hay sistema de juego asociado a esta sesión.');
      return;
    }
    setError('');
    setAnswer(null);
    setAsking(true);
    try {
      const result = await api.aiAsk(query.trim(), gameSystemId, sessionId);
      setAnswer(result);
      setAiDown(false);
    } catch (err) {
      // 503 = embeddings/LLM no disponibles (Ollama apagado).
      if (/disponible|Ollama|LLM|embedding/i.test(err.message)) setAiDown(true);
      setError(err.message);
    } finally {
      setAsking(false);
    }
  }

  async function generateSummary() {
    setError('');
    setSummarizing(true);
    try {
      const { summary: s } = await api.generateSessionSummary(sessionId, user.id);
      setSummary(s);
      setAiDown(false);
    } catch (err) {
      if (/disponible|Ollama|LLM|embedding/i.test(err.message)) setAiDown(true);
      setError(err.message);
    } finally {
      setSummarizing(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 overflow-y-auto p-3">
      {aiDown && (
        <p className="rounded-md bg-ink-600 px-3 py-2 text-xs text-gray-400">
          La IA no está disponible (Ollama apagado). Inícialo con
          <code className="mx-1 text-gold">docker compose --profile ai up</code>
          para usar estas funciones.
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

        {answer && (
          <div className="mt-3 flex flex-col gap-2">
            <p className="whitespace-pre-wrap rounded-md bg-ink-900 px-3 py-2 text-sm text-gray-100">
              {answer.answer}
            </p>
            {answer.citations?.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                  Fuentes
                </span>
                {answer.citations.map((c, i) => (
                  <span key={i} className="text-xs text-gray-400">
                    📖 {c.doc_title} › {c.heading_path}{' '}
                    <span className="text-gray-600">({c.section_type})</span>
                  </span>
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

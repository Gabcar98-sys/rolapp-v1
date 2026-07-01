// Proveedor de embeddings INYECTABLE (§5 del plan).
//
// Por defecto usa Ollama (`nomic-embed-text`, 768 dims). Con EMBED_PROVIDER=api se
// puede apuntar a una API externa compatible (formato OpenAI /v1/embeddings).
//
// El punto clave del diseño: `embedTexts` delega en un provider mutable que los tests
// sustituyen por un stub determinista (sin red) vía `setEmbeddingProvider`. Así el
// pipeline completo de RAG se prueba sin Ollama.

export const EMBEDDING_DIMS = 768;

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || 'http://ollama:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';
const EMBED_PROVIDER = process.env.EMBED_PROVIDER || 'ollama';

export const EMBED_CONFIG = { provider: EMBED_PROVIDER, model: EMBED_MODEL };

// Un provider es: async (texts: string[]) => number[][]  (un vector por texto).
let activeProvider = null;

// Embebe un único texto vía Ollama. Ollama no expone batch nativo en /api/embeddings,
// así que el provider de Ollama hace una petición por texto.
async function ollamaEmbedOne(text) {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Ollama embeddings error ${res.status}: ${msg}`);
  }
  const { embedding } = await res.json();
  if (!Array.isArray(embedding)) {
    throw new Error('Ollama devolvió un embedding inválido');
  }
  return embedding;
}

async function ollamaProvider(texts) {
  const out = [];
  for (const text of texts) out.push(await ollamaEmbedOne(text));
  return out;
}

// Provider para API externa estilo OpenAI (/v1/embeddings, batch nativo).
async function apiProvider(texts) {
  const baseUrl = process.env.EMBED_API_URL || 'https://api.openai.com/v1';
  const apiKey = process.env.API_KEY || '';
  const res = await fetch(`${baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });
  if (!res.ok) {
    const msg = await res.text().catch(() => '');
    throw new Error(`Embeddings API error ${res.status}: ${msg}`);
  }
  const data = await res.json();
  return data.data.map((d) => d.embedding);
}

function defaultProvider() {
  return EMBED_PROVIDER === 'api' ? apiProvider : ollamaProvider;
}

// Permite a los tests inyectar un stub determinista. Pasar null restaura el default.
export function setEmbeddingProvider(provider) {
  activeProvider = provider;
}

// Embebe un lote de textos. Devuelve un array de vectores (number[][]).
// Valida que cada vector tenga la dimensión esperada para no corromper vec_chunks.
export async function embedTexts(texts) {
  const provider = activeProvider || defaultProvider();
  let vectors;
  try {
    vectors = await provider(texts);
  } catch (err) {
    // Un fallo de red (Ollama apagado) llega como "fetch failed". Lo normalizamos a un
    // mensaje claro para que los routers respondan 503 en vez de un 500 opaco.
    if (/fetch failed|ECONNREFUSED|ENOTFOUND|network/i.test(err.message)) {
      throw new Error(`Proveedor de embeddings no disponible (${EMBED_PROVIDER}): ${err.message}`);
    }
    throw err;
  }
  for (const v of vectors) {
    if (!Array.isArray(v) || v.length !== EMBEDDING_DIMS) {
      throw new Error(
        `El embedding tiene dimensión ${v?.length}, se esperaban ${EMBEDDING_DIMS} (modelo ${EMBED_MODEL})`
      );
    }
  }
  return vectors;
}

// Conveniencia para un solo texto (consultas).
export async function embedText(text) {
  const [vector] = await embedTexts([text]);
  return vector;
}

// Sondeo de disponibilidad para /api/ai/status. Intenta embeber un texto mínimo y
// reporta si el proveedor responde, sin lanzar (la UX necesita un estado, no un crash).
// Devuelve { ok, provider, model, error? }.
export async function probeEmbeddings() {
  try {
    const [v] = await embedTexts(['ping']);
    return { ok: Array.isArray(v) && v.length === EMBEDDING_DIMS, provider: EMBED_PROVIDER, model: EMBED_MODEL };
  } catch (err) {
    return { ok: false, provider: EMBED_PROVIDER, model: EMBED_MODEL, error: err.message };
  }
}

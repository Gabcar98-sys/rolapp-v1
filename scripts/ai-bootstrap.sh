#!/usr/bin/env sh
# ──────────────────────────────────────────────────────────────────────────────
# Bootstrap de modelos de IA local (Ollama) para RolApp.
#
# Descarga el modelo de embeddings y el LLM local pequeño dentro del contenedor
# `ollama` (levantado con el perfil `ai`). Idempotente: si un modelo ya está
# descargado, `ollama pull` no vuelve a bajarlo.
#
# Uso (desde la raíz del repo, con el perfil ai levantado):
#   docker compose --profile ai up -d
#   sh scripts/ai-bootstrap.sh
#
# También corre como servicio one-shot: `docker compose --profile ai run --rm ai-bootstrap`
# (ver docker-compose.yml). Las variables EMBED_MODEL / AI_MODEL sobreescriben los
# modelos por defecto sin editar el script.
# ──────────────────────────────────────────────────────────────────────────────
set -e

EMBED_MODEL="${EMBED_MODEL:-nomic-embed-text}"
AI_MODEL="${AI_MODEL:-qwen2.5:3b}"

# Cuando corre DENTRO de un contenedor con el CLI de ollama, apunta al servicio.
export OLLAMA_HOST="${OLLAMA_HOST:-http://ollama:11434}"

echo "==> Descargando modelo de embeddings: ${EMBED_MODEL}"
ollama pull "${EMBED_MODEL}"

echo "==> Descargando LLM local: ${AI_MODEL}"
ollama pull "${AI_MODEL}"

echo "==> Listo. Modelos disponibles:"
ollama list

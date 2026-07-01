# better-sqlite3 y sqlite-vec necesitan toolchain de compilación → imagen Debian, no Alpine
FROM node:22-bookworm-slim

WORKDIR /app

# Dependencias de compilación para módulos nativos
RUN apt-get update && apt-get install -y --no-install-recommends \
      python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# Incluye devDependencies (eslint + runner de tests) para verificar lint/tests
# dentro del contenedor — entorno canónico sin Node local.
COPY package.json ./
RUN npm install

COPY eslint.config.js ./
COPY src ./src
COPY scripts ./scripts

ENV PORT=3001
EXPOSE 3001

CMD ["node", "src/index.js"]

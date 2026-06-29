# ── Build ───────────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json ./
RUN npm install
COPY . .
# Lint forzado antes del build: que la imagen buildee = lint + build en verde.
RUN npm run lint
RUN npm run build

# ── Serve (nginx) ─────────────────────────────────────────────────────────────────
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80

# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build
RUN mkdir -p dist/fonts && cp -r src/fonts/. dist/fonts/
RUN mkdir -p dist/assets && cp -r src/assets/. dist/assets/

FROM node:20-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig && rm -rf /var/lib/apt/lists/*

COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

RUN mkdir -p /app/data/logs
ENV LOG_DIR=/app/data/logs
ENV ASSETS_DIR=/app/dist/assets
ENV FONTS_DIR=/app/dist/fonts
ENV NODE_ENV=production

EXPOSE 4931

CMD ["node", "dist/index.js"]
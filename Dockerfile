# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build  # -> dist/

FROM node:20-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

# convert esm migrations to .mjs so node will import them as esm
RUN find ./migrations -type f -name '*.js' -exec bash -lc 'for f; do mv "$f" "${f%.js}.mjs"; done' bash {} +

ENV NODE_ENV=production
CMD ["bash","-lc","npx node-pg-migrate up && exec node dist/index.js"]

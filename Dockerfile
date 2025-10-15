# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-audit --no-fund

FROM deps AS build
COPY . .
RUN npm run build  # -> dist/
RUN mkdir -p dist/fonts && cp -r src/fonts/. dist/fonts/

FROM node:20-bookworm-slim AS run
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig && rm -rf /var/lib/apt/lists/*

# runtime deps + app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY --from=build /app/dist ./dist
COPY --from=build /app/migrations ./migrations

# rename esm migrations to .mjs (recursive, robust)
RUN node -e "const fs=require('fs'),p=require('path');(function w(d){for(const e of fs.readdirSync(d,{withFileTypes:true})){const f=p.join(d,e.name);if(e.isDirectory())w(f);else if(f.endsWith('.js'))fs.renameSync(f,f.slice(0,-3)+'.mjs')}})('migrations')"

# logs: create a writable dir and expose to app via env
RUN mkdir -p /app/data/logs
ENV LOG_DIR=/app/data/logs

ENV NODE_ENV=production

EXPOSE 4931

CMD ["bash","-lc","exec node dist/index.js"]

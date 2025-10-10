# syntax=docker/dockerfile:1.7
FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates fontconfig && \
    rm -rf /var/lib/apt/lists/*

# deps
COPY package.json package-lock.json* tsconfig.json ./
RUN npm install --no-audit --no-fund

# source
COPY src ./src

# make ts-node transpile to esm at runtime
ENV TS_NODE_COMPILER_OPTIONS='{"module":"es2020","moduleResolution":"node16"}'

# run migrations, then start
CMD ["bash","-lc","npx node-pg-migrate up && exec node --loader ts-node/esm src/index.ts"]

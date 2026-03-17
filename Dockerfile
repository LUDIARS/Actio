# ─── Dev stage (hot-reload with tsx watch) ───────────────────
FROM node:22-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json drizzle.config.ts docker-entrypoint.sh ./
COPY src/ ./src/
COPY modules/ ./modules/

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["npm", "run", "dev"]

# ─── Build stage ─────────────────────────────────────────────
FROM node:22-slim AS builder

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY modules/ ./modules/

RUN npx tsc

# ─── Production stage ───────────────────────────────────────
FROM node:22-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
COPY drizzle.config.ts docker-entrypoint.sh ./
COPY src/ ./src/

ENV NODE_ENV=production
ENV DB_DIALECT=postgres

EXPOSE 3000

ENTRYPOINT ["./docker-entrypoint.sh"]
CMD ["node", "dist/src/index.js"]

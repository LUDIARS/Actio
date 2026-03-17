# ─── Dev stage (hot-reload with tsx watch) ───────────────────
FROM node:22-slim AS dev

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/
COPY modules/ ./modules/

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

ENV NODE_ENV=production
ENV DB_DIALECT=postgres

EXPOSE 3000

CMD ["node", "dist/src/index.js"]

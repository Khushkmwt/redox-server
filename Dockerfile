# ── Build stage ────────────────────────────────────────────────────────────────
FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig*.json ./
COPY src/ ./src/

RUN npm run build

# ── Production stage ────────────────────────────────────────────────────────────
FROM node:24-alpine AS production

# Non-root user for security
RUN addgroup -S redox && adduser -S redox -G redox

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Ensure persistence data directory exists with non-root ownership
RUN mkdir -p /app/data && chown -R redox:redox /app

USER redox

EXPOSE 6379

ENV HOST=0.0.0.0
ENV PORT=6379

CMD ["node", "dist/server.js"]

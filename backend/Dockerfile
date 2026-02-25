# ── Stage 1: Build ──────────────────────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Native build tools for better-sqlite3
RUN apk add --no-cache python3 make g++

COPY package*.json ./
RUN npm install

COPY tsconfig.json tsconfig.build.json ./
COPY src ./src

RUN npm run build

# ── Stage 2: Production ─────────────────────────────────────────────────────
FROM node:20-alpine

WORKDIR /app

# Native runtime libs for better-sqlite3 + Python + yt-dlp for YouTube streaming
RUN apk add --no-cache python3 py3-pip make g++ \
    && python3 -m pip install --break-system-packages --quiet yt-dlp \
    && yt-dlp --version

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "dist/api/index.js"]

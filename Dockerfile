# ─── Stage 1: Build frontend + compile server ────────────────────────────────
FROM node:20-slim AS builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@10.4.1

# Copy package files
COPY package.json pnpm-lock.yaml ./
COPY patches/ ./patches/

# Install Node dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY . .

# Build (Vite frontend + esbuild server)
RUN pnpm build

# ─── Stage 2: Production runtime ─────────────────────────────────────────────
FROM python:3.11-slim AS runtime

WORKDIR /app

# Install system dependencies: ffmpeg, Node.js 20
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# Install Python audio processing libraries
RUN pip install --no-cache-dir \
    numpy \
    scipy \
    librosa \
    soundfile

# Copy built artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/server ./server
COPY --from=builder /app/drizzle ./drizzle

# Create uploads directory
RUN mkdir -p /app/uploads /app/processed

# Expose port (Railway sets PORT automatically)
EXPOSE 3000

# Start the server
CMD ["node", "dist/index.js"]

FROM node:20-bookworm-slim

# System dependencies needed by sharp (libvips) and HEIC/AVIF support
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips-dev \
      libheif-dev \
      libwebp-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install dependencies first (layer cache)
COPY package*.json ./
RUN npm ci --omit=dev && npm rebuild sharp

# Copy source
COPY . .

# Create writable directories
RUN mkdir -p src dist server/uploads

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

CMD ["node", "server/app.js"]

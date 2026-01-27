# GEM Viz SSR Docker Image
# For deploying to Fly.io with pre-cached data

FROM node:20-slim AS builder
WORKDIR /app

# Install ca-certificates for MotherDuck SSL/gRPC
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Prefetch data from MotherDuck
ARG PUBLIC_MOTHERDUCK_TOKEN
ENV PUBLIC_MOTHERDUCK_TOKEN=$PUBLIC_MOTHERDUCK_TOKEN
RUN npm run prefetch

# Build the app
RUN npm run build

# Production image
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app, static files, and cache
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static
COPY --from=builder /app/.svelte-kit/asset-cache ./.svelte-kit/asset-cache
COPY --from=builder /app/.svelte-kit/entity-cache ./.svelte-kit/entity-cache

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "build"]

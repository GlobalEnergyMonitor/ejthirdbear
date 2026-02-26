# GEM Viz SSR Docker Image
# For deploying to Fly.io with pre-cached data

FROM node:20-slim AS builder
WORKDIR /app

# Build args for SvelteKit PUBLIC_ env vars (must be available at build time)
ARG PUBLIC_MOTHERDUCK_TOKEN
ARG PUBLIC_OWNERSHIP_API_BASE_URL=https://gem-ownership-api.fly.dev
ARG PUBLIC_SITE_URL=

# Set as env vars for the build
ENV PUBLIC_MOTHERDUCK_TOKEN=$PUBLIC_MOTHERDUCK_TOKEN
ENV PUBLIC_OWNERSHIP_API_BASE_URL=$PUBLIC_OWNERSHIP_API_BASE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL

# Install ca-certificates for MotherDuck SSL/gRPC
RUN apt-get update && apt-get install -y ca-certificates && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY . .

# Build the app (SSR mode queries MotherDuck at runtime, no prefetch needed)
RUN npm run build

# Production image
FROM node:20-slim
WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

# Copy built app, static files, and custom server
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static
COPY --from=builder /app/server.js ./server.js

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

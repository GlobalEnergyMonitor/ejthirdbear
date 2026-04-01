# GEM Viz SSR Docker Image
# For deploying to Fly.io with pre-cached data

FROM node:22-slim AS builder
WORKDIR /app

# Build args for SvelteKit PUBLIC_ env vars (must be available at build time)
ARG PUBLIC_OWNERSHIP_API_BASE_URL=https://gem-ownership-api.fly.dev
ARG PUBLIC_SITE_URL=

# Set as env vars for the build
ENV PUBLIC_OWNERSHIP_API_BASE_URL=$PUBLIC_OWNERSHIP_API_BASE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps && npm install @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps

COPY . .

# Build Shadow DOM widgets into static/widgets/
RUN npm run build:widgets

# Build the app (SSR mode queries REST API at runtime)
RUN npm run build

# Production image
FROM node:22-slim
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm install --omit=dev --legacy-peer-deps

# Copy built app, static files, and custom server
COPY --from=builder /app/build ./build
COPY --from=builder /app/static ./static
COPY --from=builder /app/server.js ./server.js

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]

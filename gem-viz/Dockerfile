# GEM Viz SSR Docker Image
# For deploying to Fly.io with pre-cached data

FROM node:22-slim AS builder
WORKDIR /app

# Build args for SvelteKit PUBLIC_ env vars (must be available at build time)
ARG PUBLIC_OWNERSHIP_API_BASE_URL=https://gem-ownership-api.fly.dev
ARG PUBLIC_SITE_URL=
ARG GIT_COMMIT=unknown
ARG GIT_MESSAGE=
ARG GIT_AUTHOR=

# Set as env vars for the build
ENV PUBLIC_OWNERSHIP_API_BASE_URL=$PUBLIC_OWNERSHIP_API_BASE_URL
ENV PUBLIC_SITE_URL=$PUBLIC_SITE_URL
ENV GIT_COMMIT=$GIT_COMMIT
ENV GIT_MESSAGE=$GIT_MESSAGE
ENV GIT_AUTHOR=$GIT_AUTHOR

COPY package.json package-lock.json ./
RUN npm install --legacy-peer-deps && npm install @rollup/rollup-linux-x64-gnu --no-save --legacy-peer-deps

COPY . .

# Sync SvelteKit types (needed by widget build's tsconfig)
RUN npx svelte-kit sync

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

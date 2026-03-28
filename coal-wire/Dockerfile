FROM node:22-slim AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-slim AS run

WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

# Data directory — Fly persistent volume mounts here.
RUN mkdir -p /app/data /app/data-seed

# Seed database baked into the image. On first boot, if the volume is empty,
# the startup script copies it to /app/data (the volume mount point).
COPY data/coalwire.db /app/data-seed/coalwire.db

# Startup script: copy seed DB to volume if missing or smaller than seed.
RUN printf '#!/bin/sh\nSEED=/app/data-seed/coalwire.db\nDEST=/app/data/coalwire.db\nSEED_SIZE=$(stat -c%%s "$SEED" 2>/dev/null || echo 0)\nDEST_SIZE=$(stat -c%%s "$DEST" 2>/dev/null || echo 0)\nif [ "$DEST_SIZE" -lt "$SEED_SIZE" ]; then\n  echo "Seeding database from image ($SEED_SIZE bytes)..."\n  cp "$SEED" "$DEST"\nfi\nexec node build\n' > /app/start.sh && chmod +x /app/start.sh

ENV NODE_ENV=production
ENV PORT=3000
EXPOSE 3000

CMD ["/app/start.sh"]

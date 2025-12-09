#!/bin/bash
# Build GEM Viz for SSR (server-side rendering) mode
# Output: build-ssr/ directory with Node.js server

set -e

echo "Building GEM Viz for SSR mode..."
echo "================================"

# Backup original config
cp svelte.config.js svelte.config.static.js.bak

# Use SSR config
cp svelte.config.ssr.js svelte.config.js

# Backup the static page server and use SSR version
cp src/routes/asset/\[id\]/+page.server.js src/routes/asset/\[id\]/+page.server.static.js.bak
cp src/routes/asset/\[id\]/+page.server.ssr.js src/routes/asset/\[id\]/+page.server.js

# Generate GeoJSON (still needed for maps)
node scripts/generate-geojson.js

# Build with SSR adapter
echo ""
echo "Running Vite build with adapter-node..."
npm run build:ssr 2>/dev/null || vite build

# Restore original files
mv svelte.config.static.js.bak svelte.config.js
mv src/routes/asset/\[id\]/+page.server.static.js.bak src/routes/asset/\[id\]/+page.server.js

echo ""
echo "SSR build complete!"
echo "Output: build-ssr/"
echo ""
echo "To run locally:"
echo "  PORT=3000 node build-ssr/index.js"
echo ""
echo "To deploy to Railway:"
echo "  railway up"

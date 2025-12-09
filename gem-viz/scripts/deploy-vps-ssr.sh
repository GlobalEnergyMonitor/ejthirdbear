#!/bin/bash
# Deploy GEM Viz SSR to VPS
# Usage: bash scripts/deploy-vps-ssr.sh
#
# Prerequisites:
# - SSH access to VPS via `ssh vps`
# - Node.js 20+ installed on VPS
# - Cloudflare Tunnel or nginx for public access

set -e

VPS_HOST="${VPS_HOST:-vps}"
REMOTE_DIR="${REMOTE_DIR:-/opt/gem-viz}"
PORT="${PORT:-3737}"

echo "🚀 Deploying GEM Viz SSR to VPS"
echo "================================"
echo "Host: $VPS_HOST"
echo "Remote dir: $REMOTE_DIR"
echo "Port: $PORT"
echo ""

# Step 1: Build SSR locally
echo "📦 Building SSR version locally..."
echo ""

# Check if svelte.config.ssr.js exists
if [ ! -f "svelte.config.ssr.js" ]; then
  echo "❌ svelte.config.ssr.js not found"
  exit 1
fi

# Swap configs temporarily
cp svelte.config.js svelte.config.static.bak
cp svelte.config.ssr.js svelte.config.js

# Swap page servers
cp src/routes/asset/\[id\]/+page.server.js src/routes/asset/\[id\]/+page.server.static.bak
cp src/routes/asset/\[id\]/+page.server.ssr.js src/routes/asset/\[id\]/+page.server.js

# Generate GeoJSON if needed
if [ ! -f "static/points.geojson" ]; then
  echo "Generating points.geojson..."
  npm run geojson 2>/dev/null || node scripts/generate-geojson.js
fi

# Build with node adapter
echo "Running vite build..."
rm -rf build-ssr
vite build 2>&1 | tail -10

# Restore original configs
mv svelte.config.static.bak svelte.config.js
mv src/routes/asset/\[id\]/+page.server.static.bak src/routes/asset/\[id\]/+page.server.js

if [ ! -d "build-ssr" ]; then
  echo "❌ SSR build failed - build-ssr directory not found"
  exit 1
fi

echo "✓ SSR build complete"
echo ""

# Step 2: Show what will be uploaded
BUILD_SIZE=$(du -sh build-ssr | cut -f1)
STATIC_SIZE=$(du -sh static | cut -f1)
echo "📊 Package sizes:"
echo "   build-ssr/: $BUILD_SIZE"
echo "   static/: $STATIC_SIZE"
echo ""

# Step 3: Create remote directory
echo "📁 Setting up remote directory..."
ssh "$VPS_HOST" "mkdir -p $REMOTE_DIR"

# Step 4: Upload files
echo "📤 Uploading to VPS..."
rsync -avz --progress \
  --exclude 'node_modules' \
  build-ssr/ "$VPS_HOST:$REMOTE_DIR/build-ssr/"

rsync -avz --progress \
  static/ "$VPS_HOST:$REMOTE_DIR/static/"

scp package.json "$VPS_HOST:$REMOTE_DIR/"
scp package-lock.json "$VPS_HOST:$REMOTE_DIR/" 2>/dev/null || true

echo ""
echo "✓ Files uploaded"

# Step 5: Install deps and start server
echo ""
echo "🔧 Installing dependencies on VPS..."
ssh "$VPS_HOST" << REMOTE
cd $REMOTE_DIR

# Install production dependencies only
npm ci --only=production 2>&1 | tail -5

# Check if node is available
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found on VPS"
  exit 1
fi

# Kill existing process if running
pkill -f "node.*gem-viz" 2>/dev/null || true

# Start server with nohup (runs in background)
echo ""
echo "🚀 Starting server on port $PORT..."
export PORT=$PORT
export PUBLIC_MOTHERDUCK_TOKEN="$PUBLIC_MOTHERDUCK_TOKEN"
nohup node build-ssr/index.js > server.log 2>&1 &

sleep 2

# Check if it's running
if pgrep -f "node.*build-ssr" > /dev/null; then
  echo "✓ Server started (PID: \$(pgrep -f 'node.*build-ssr'))"
  echo "✓ Logs: $REMOTE_DIR/server.log"
else
  echo "❌ Server failed to start"
  tail -20 server.log
  exit 1
fi
REMOTE

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your app is running at: http://$VPS_HOST:$PORT"
echo ""
echo "To make it public, set up a Cloudflare Tunnel:"
echo "  cloudflared tunnel --url http://localhost:$PORT"
echo ""
echo "Or add to nginx config and expose port 80/443"
echo ""

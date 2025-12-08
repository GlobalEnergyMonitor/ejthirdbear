#!/bin/bash
set -e

# Deploy GEM Viz to VPS via SSH/rsync
#
# Configuration via environment variables:
#   VPS_HOST       - SSH host (e.g., user@example.com or IP)
#   VPS_PORT       - SSH port (default: 22)
#   VPS_PATH       - Remote path for web root (e.g., /var/www/gem-viz)
#
# Usage:
#   VPS_HOST=user@example.com VPS_PATH=/var/www/gem-viz npm run deploy:vps
#
# Or set in .env file:
#   echo "VPS_HOST=user@example.com" >> .env
#   echo "VPS_PATH=/var/www/gem-viz" >> .env

# Load from .env if exists
if [ -f ".env" ]; then
  export $(cat .env | xargs)
fi

# Configuration
VPS_HOST="${VPS_HOST:-}"
VPS_PORT="${VPS_PORT:-22}"
VPS_PATH="${VPS_PATH:-/var/www/gem-viz}"

echo "🚀 GEM Viz VPS Deployment"
echo "========================="
echo ""

# Validate configuration
if [ -z "$VPS_HOST" ]; then
  echo "❌ VPS_HOST not set"
  echo ""
  echo "Set it via environment variable:"
  echo "  export VPS_HOST=user@example.com"
  echo ""
  echo "Or create .env file:"
  echo "  echo 'VPS_HOST=user@example.com' >> .env"
  echo "  echo 'VPS_PATH=/var/www/gem-viz' >> .env"
  exit 1
fi

# Check if build directory exists
if [ ! -d "build" ]; then
  echo "❌ Build directory not found. Run 'npm run build' first."
  exit 1
fi

echo "📍 Server: $VPS_HOST:$VPS_PORT"
echo "📂 Remote path: $VPS_PATH"
echo ""

# Test SSH connection
echo "🔗 Testing SSH connection..."
if ! ssh -p "$VPS_PORT" "$VPS_HOST" "echo 'Connection successful'" > /dev/null 2>&1; then
  echo "❌ Cannot connect to $VPS_HOST:$VPS_PORT"
  echo ""
  echo "Troubleshooting:"
  echo "  1. Check SSH key is authorized on the remote server"
  echo "  2. Verify host and port are correct"
  echo "  3. Check firewall allows SSH"
  exit 1
fi

echo "✓ SSH connection successful"
echo ""

# Create remote directory if needed
echo "📁 Ensuring remote directory exists..."
ssh -p "$VPS_PORT" "$VPS_HOST" "mkdir -p '$VPS_PATH'"

# Deploy using rsync
echo "⬆️  Syncing files with rsync..."
echo ""

rsync \
  --archive \
  --verbose \
  --delete \
  --compress \
  --rsh="ssh -p $VPS_PORT" \
  ./build/ \
  "$VPS_HOST:$VPS_PATH"

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Site URL: https://$(echo $VPS_HOST | cut -d@ -f2)"
echo ""
echo "📝 Next steps:"
echo "  1. Ensure web server (nginx/Apache) is configured to serve from $VPS_PATH"
echo "  2. Configure CORS headers for MotherDuck WASM:"
echo "     - Cross-Origin-Opener-Policy: same-origin"
echo "     - Cross-Origin-Embedder-Policy: require-corp"
echo "  3. Enable HTTPS with Let's Encrypt (certbot)"
echo ""

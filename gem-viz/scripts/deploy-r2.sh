#!/bin/bash
set -e

# Deploy GEM Viz to Cloudflare R2
# Requires wrangler CLI: npm install -g wrangler

echo "🚀 Deploying to Cloudflare R2"
echo "=============================="

# Check if build exists
if [ ! -d "build" ]; then
  echo "❌ Build directory not found. Run 'npm run build' first."
  exit 1
fi

# Configuration
R2_BUCKET="${R2_BUCKET:-gem-viz}"
BASE_PATH="${BASE_PATH:-gem-viz}"

echo "📦 Bucket: $R2_BUCKET"
echo "📂 Path: /$BASE_PATH/"
echo ""

# Upload to R2
echo "⬆️  Uploading files..."
wrangler r2 object put "$R2_BUCKET/$BASE_PATH" --file=build --recursive

echo ""
echo "✅ Deploy complete!"
echo ""
echo "🌐 Your site should be accessible at:"
echo "   https://YOUR-ACCOUNT.r2.dev/$BASE_PATH/index.html"
echo ""
echo "⚠️  IMPORTANT: Users must visit /index.html explicitly"
echo "   R2 doesn't serve directory indexes automatically."
echo ""
echo "💡 SOLUTION: Use Cloudflare Pages for automatic index.html serving:"
echo "   npx wrangler pages deploy build --project-name=gem-viz"

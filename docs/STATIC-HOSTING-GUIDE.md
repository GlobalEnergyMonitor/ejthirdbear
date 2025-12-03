# Static Hosting Guide: Object Storage vs Pages

## TL;DR - What We Fixed

✅ **Root page** (`/index.html`) now builds
✅ **Asset list** (`/asset/index.html`) now builds
✅ **All links use explicit `.html`** extensions
✅ **Works on object storage** (R2, DO Spaces)

⚠️  **The Catch**: Users must visit `/gem-viz/index.html`, not just `/gem-viz/`

## The Problem We Had

Your build was missing critical pages because `export const ssr = false` prevented prerendering. We fixed this by enabling prerendering while keeping client-side hydration for interactive components (maps, graphs).

## Object Storage Limitations

### What Digital Ocean Spaces Can't Do:
- ❌ Serve `index.html` when you visit `/gem-viz/`
- ❌ Route `/asset/` to `/asset/index.html`
- ❌ Set custom headers (needed for DuckDB WASM)

**Sources:**
- [DigitalOcean Ideas: Default to index.html](https://ideas.digitalocean.com/storage/p/default-to-indexhtml-in-spaces)
- [DigitalOcean Static Site Documentation](https://docs.digitalocean.com/glossary/static-site/)

### What Cloudflare R2 Can't Do (Without Workers):
- ❌ Serve `index.html` for directories
- ❌ SPA routing without transform rules

**Sources:**
- [Cloudflare Community: Index.html as Root](https://community.cloudflare.com/t/index-html-as-root-object-for-spa/581177)
- [Cloudflare Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/)

## Your Options

### Option 1: R2 + Explicit URLs (What Client Has)
**Cost:** $0 (included in their plan)
**Setup:** Run `./scripts/deploy-r2.sh`
**URL:** `https://account.r2.dev/gem-viz/index.html`
**Tradeoff:** Users must remember `/index.html`

### Option 2: Cloudflare Pages (Recommended)
**Cost:** Free (unlimited sites)
**Setup:** `npx wrangler pages deploy build --project-name=gem-viz`
**URL:** `https://gem-viz.pages.dev/gem-viz/` ← Works without `.html`!
**Bonus:** Automatic HTTPS, CDN, preview deploys

### Option 3: Digital Ocean App Platform
**Cost:** ~$5/month
**Setup:** Connect GitHub repo
**Benefits:** Proper static site hosting with directory indexes

### Option 4: R2 + Cloudflare Workers
**Cost:** Free tier (1M requests/day)
**Setup:** Create Worker to rewrite URLs
**Complexity:** Medium - requires Worker configuration

## What I'd Tell The Client

> "The good news: your static site builds successfully and works on object storage.
>
> The catch: R2 and DO Spaces are designed for file storage, not websites. Users need to visit `/gem-viz/index.html` instead of just `/gem-viz/`.
>
> **Best solution:** Cloudflare Pages (free, zero config). It's designed for static sites and handles all the URL routing automatically. Your R2 budget stays for data storage where it belongs.
>
> **Alternative:** If you must use R2, I can add a Cloudflare Worker (also free tier) to handle the URL rewriting."

## Quick Deploy Instructions

### To R2 (Your Setup):
```bash
# 1. Install wrangler if needed
npm install -g wrangler

# 2. Authenticate with Cloudflare
wrangler login

# 3. Build and deploy
npm run build
./scripts/deploy-r2.sh
```

### To Cloudflare Pages (Recommended):
```bash
# 1. Build
npm run build

# 2. Deploy (first time will prompt for login)
npx wrangler pages deploy build --project-name=gem-viz

# 3. Visit your site at:
# https://gem-viz.pages.dev/gem-viz/
```

## Technical Details

### What The Build Generates:
- `build/index.html` - Root page (2.5KB)
- `build/asset/index.html` - Asset list (4.1MB, 10K assets)
- `build/asset/[id]/index.html` - 62K+ detail pages
- `build/_app/` - JS/CSS bundles
- `build/tiles/` - Geographic data partitions

### How Links Work:
All internal links use relative paths with explicit `.html`:
```html
<a href="./asset/index.html">View All Assets</a>
<a href="../asset/E100002000183/index.html">Asset Detail</a>
```

This works perfectly on object storage when accessed directly!

### Base Path Configuration:
Currently set to `/gem-viz` in `svelte.config.js`:
```javascript
paths: {
  base: '/gem-viz'
}
```

To deploy at root instead:
1. Change `base: ''` in `svelte.config.js`
2. Rebuild
3. Deploy to `https://gem-viz.pages.dev/` (no subdirectory)

## Testing Locally

```bash
# Build
npm run build

# Serve with any static server
npx serve build

# Visit:
http://localhost:3000/index.html  ← Note: must include index.html
```

## Next Steps

1. **Try Cloudflare Pages deploy** (5 minutes)
2. **Share URL with client** for approval
3. **Set up custom domain** if needed
4. **Configure automated rebuilds** via GitHub Actions

## Files Changed

- `src/routes/+page.js` - Enabled prerendering
- `src/routes/asset/+page.server.js` - Added server-side data loading
- `src/routes/network/+page.js` - Enabled prerendering
- `scripts/deploy-r2.sh` - New R2 deploy script (this doc)

---

**Ready to ship!** All the pieces are in place. Just need to decide: Pages or R2?

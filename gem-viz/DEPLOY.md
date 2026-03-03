# Deployment Configuration

This app supports two deployment modes:

## Dynamic SSR (Fly.io) - Current

Node.js server renders pages on-demand.

### Files to configure for SSR:

| File                               | Setting                                                                                 |
| ---------------------------------- | --------------------------------------------------------------------------------------- |
| `svelte.config.js`                 | Use `adapter-node`, `prerender.entries: []`, `handleUnseenRoutes: 'ignore'`, `base: ''` |
| `src/routes/+layout.js`            | `prerender = false`                                                                     |
| `src/routes/+page.js`              | `prerender = false`                                                                     |
| `src/routes/presets/+page.js`      | `prerender = false`                                                                     |
| `src/routes/asset/+page.server.js` | `prerender = false`                                                                     |
| `src/routes/asset/search/+page.js` | `prerender = false`                                                                     |
| `src/routes/network/+page.js`      | `prerender = false`                                                                     |
| `src/lib/links.ts`                 | Uses clean URLs (no `/index.html`)                                                      |

### Deploy:

```bash
fly deploy
```

---

## Static Build (DO Spaces) - Legacy

Pre-renders all pages as static HTML.

### Files to configure for Static:

| File                               | Setting                                                  |
| ---------------------------------- | -------------------------------------------------------- |
| `svelte.config.js`                 | Use `adapter-static`, set `base: '/gem-viz/v${version}'` |
| `src/routes/+layout.js`            | `prerender = true`                                       |
| `src/routes/+page.js`              | `prerender = true`                                       |
| `src/routes/presets/+page.js`      | `prerender = true`                                       |
| `src/routes/asset/+page.server.js` | `prerender = true`                                       |
| `src/routes/asset/search/+page.js` | `prerender = true`                                       |
| `src/routes/network/+page.js`      | `prerender = true`                                       |
| `src/lib/links.ts`                 | Set `STATIC_BUILD=true` env var for `/index.html` URLs   |

### Deploy:

```bash
STATIC_BUILD=true npm run build
# Then upload build/ to DO Spaces
```

---

## Quick Switch Checklist

### To switch to SSR (Fly.io):

1. Set all `prerender = false` in route files
2. Use `svelte.config.js` (adapter-node)
3. Deploy with `fly deploy`

### To switch to Static (DO Spaces):

1. Set all `prerender = true` in route files
2. Use `svelte.config.cloudflare.js` or create static config
3. Set `STATIC_BUILD=true` in build environment
4. Build and upload to DO Spaces

---

## Environment Variables

| Variable       | SSR     | Static | Purpose                         |
| -------------- | ------- | ------ | ------------------------------- |
| `STATIC_BUILD` | Not set | `true` | Enables `/index.html` URL paths |

## Docker Ignore

The `.dockerignore` excludes `static/flowers/` (8,681 SVG files) to avoid file descriptor limits during Docker builds. If you need the flower SVGs, either:

- Generate them on-demand at runtime
- Upload them to a CDN separately

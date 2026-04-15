/* eslint-env node */
/**
 * Custom Node server for GEM Viz
 *
 * Wraps the SvelteKit handler to add COEP/COOP headers to ALL responses
 * (including static assets served by sirv, which bypass hooks.server.ts).
 */
import { createServer } from 'node:http';
import { handler } from './build/handler.js';

const PORT = process.env.PORT || 3000;

const server = createServer((req, res) => {
  // Add COEP/COOP to all responses EXCEPT embed/widget routes (used cross-origin)
  const url = req.url || '';
  const isEmbed = url.startsWith('/embed') || url.startsWith('/widgets') || url === '/embed.js';
  if (!isEmbed) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // CORS for widget assets and embed.js — allows dynamic import() from external sites
  if (url.startsWith('/widgets') || url === '/embed.js' || url === '/embed-source.js') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    res.setHeader('Timing-Allow-Origin', '*');
  }

  // embed.js — never cache so deploys take effect immediately on host pages
  if (url === '/embed.js' || url === '/embed-source.js') {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  // Content-hashed widget chunks/assets — immutable, cache forever
  if (url.startsWith('/widgets/chunks/') || url.startsWith('/widgets/assets/')) {
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
  }

  // Widget entry point + version manifest — never cache, always fetch fresh
  if (url === '/version.json' || url.startsWith('/version.json?')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  if (url === '/widgets/index.js' || url.startsWith('/widgets/index.js?')) {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`GEM Viz server listening on port ${PORT}`);
});

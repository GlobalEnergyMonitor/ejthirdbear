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
  // Add COEP/COOP to all responses EXCEPT embed routes
  const isEmbed = req.url?.startsWith('/embed');
  if (!isEmbed) {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  handler(req, res);
});

server.listen(PORT, () => {
  console.log(`GEM Viz server listening on port ${PORT}`);
});

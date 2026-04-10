import { readFileSync } from 'fs';
import { resolve } from 'path';

function getEmbedJs(): string {
  // Always read from disk — no in-memory cache.
  // The file is small and this avoids stale content after deploys
  // (especially with Fly.io machine suspend preserving process memory).
  return readFileSync(resolve('static/embed-source.js'), 'utf-8');
}

export function GET() {
  return new Response(getEmbedJs(), {
    headers: {
      'Content-Type': 'text/javascript',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
    },
  });
}

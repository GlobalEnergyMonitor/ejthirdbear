import { readFileSync } from 'fs';
import { resolve } from 'path';

let _cached: string | null = null;

function getEmbedJs(): string {
  if (_cached) return _cached;
  _cached = readFileSync(resolve('static/embed-source.js'), 'utf-8');
  return _cached;
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

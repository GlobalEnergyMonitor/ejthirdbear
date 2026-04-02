import type { Handle } from '@sveltejs/kit';

// Model warmup disabled — loads lazily on first semantic search request
// to avoid OOM on small Fly.io machines.

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const path = event.url.pathname;

  // Embed routes: allow cross-origin iframe embedding
  if (path.startsWith('/embed/')) {
    response.headers.delete('x-frame-options');
    response.headers.set('content-security-policy', 'frame-ancestors *');
  } else if (!path.startsWith('/api/')) {
    // Non-embed, non-API routes: prevent clickjacking
    response.headers.set('x-frame-options', 'DENY');
  }

  // API routes: allow CORS for Drupal or other origins
  if (path.startsWith('/api/')) {
    response.headers.set('access-control-allow-origin', '*');
    response.headers.set('access-control-allow-methods', 'GET, OPTIONS');
    response.headers.set('access-control-allow-headers', 'content-type');
  }

  return response;
};

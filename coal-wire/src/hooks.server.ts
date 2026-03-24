import type { Handle } from '@sveltejs/kit';
import { embedQuery } from '$lib/embeddings';

// Warm up the embedding model on server start so first search isn't slow.
// This runs in the background — doesn't block startup.
embedQuery('warmup').catch(() => {});

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);
  const path = event.url.pathname;

  // Embed routes: allow cross-origin iframe embedding
  if (path.startsWith('/embed/')) {
    response.headers.delete('x-frame-options');
    response.headers.set('content-security-policy', 'frame-ancestors *');
  }

  // API routes: allow CORS for Drupal or other origins
  if (path.startsWith('/api/')) {
    response.headers.set('access-control-allow-origin', '*');
    response.headers.set('access-control-allow-methods', 'GET, OPTIONS');
    response.headers.set('access-control-allow-headers', 'content-type');
  }

  return response;
};

import type { Handle } from '@sveltejs/kit';

/**
 * Set CORS isolation headers for main app routes.
 * Embed routes are excluded to support cross-origin iframes.
 *
 * Using 'require-corp' for Safari compatibility. Safari does not support 'credentialless'.
 * All cross-origin resources must have proper CORS/CORP headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Skip COEP/COOP for embed routes, widgets, and embed.js — they need to work cross-origin
  const isEmbedRoute =
    event.url.pathname.startsWith('/embed') ||
    event.url.pathname.startsWith('/widgets') ||
    event.url.pathname === '/embed.js' ||
    event.url.searchParams.get('embed') === 'true';

  if (!isEmbedRoute) {
    // Add required headers for SharedArrayBuffer support
    // 'require-corp' works in Safari (credentialless does not)
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // Note: /widgets/* and /version.json are static files — they bypass hooks.
  // Their CORS/cache headers must be set elsewhere (e.g. CDN config or Fly proxy).
  // /embed.js is a server route (+server.ts) and sets its own headers directly.

  return response;
};

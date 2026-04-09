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

  // Add CORS headers for widget assets and embed.js so they can be
  // dynamically imported from external sites (e.g. GEM Drupal pages)
  if (
    event.url.pathname.startsWith('/widgets') ||
    event.url.pathname === '/embed.js' ||
    event.url.pathname === '/version.json'
  ) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS');
  }

  // Prevent browser/CDN caching of embed entry points so deploys propagate immediately
  if (
    event.url.pathname === '/embed.js' ||
    event.url.pathname === '/widgets/index.js' ||
    event.url.pathname === '/version.json'
  ) {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
  }

  return response;
};

import type { Handle } from '@sveltejs/kit';

/**
 * Set CORS isolation headers for main app routes.
 * Widget assets and embed.js are excluded to support cross-origin embedding.
 *
 * Using 'require-corp' for Safari compatibility. Safari does not support 'credentialless'.
 * All cross-origin resources must have proper CORS/CORP headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Skip COEP/COOP for widget-related routes and ?embed=true pages
  const isWidgetRoute =
    event.url.pathname.startsWith('/widgets') ||
    event.url.pathname === '/embed.js' ||
    event.url.pathname === '/embed-source.js' ||
    event.url.pathname === '/version.json' ||
    event.url.searchParams.get('embed') === 'true';

  if (!isWidgetRoute) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  // Widget assets: CORP + Timing headers for cross-origin embedding
  if (event.url.pathname.startsWith('/widgets')) {
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    response.headers.set('Timing-Allow-Origin', '*');

    // Content-hashed chunks/assets — immutable, cache forever
    if (
      event.url.pathname.startsWith('/widgets/chunks/') ||
      event.url.pathname.startsWith('/widgets/assets/')
    ) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }

    // Widget entry point — always revalidate so deploys take effect immediately
    if (event.url.pathname === '/widgets/index.js') {
      response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  }

  // embed-source.js — CORS + cache with content hash (bootstrapper adds ?v= param)
  if (event.url.pathname === '/embed-source.js') {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Cross-Origin-Resource-Policy', 'cross-origin');
    // Cache for 1 year — URL includes content hash via ?v= param from bootstrapper
    if (event.url.searchParams.has('v')) {
      response.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
    }
  }

  // version.json — never cache, used for widget cache-busting
  if (event.url.pathname === '/version.json') {
    response.headers.set('Cache-Control', 'no-cache, no-store, must-revalidate');
    response.headers.set('Access-Control-Allow-Origin', '*');
  }

  return response;
};

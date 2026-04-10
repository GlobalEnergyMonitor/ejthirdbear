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
    event.url.searchParams.get('embed') === 'true';

  if (!isWidgetRoute) {
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return response;
};

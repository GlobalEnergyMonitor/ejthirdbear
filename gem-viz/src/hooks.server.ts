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

  // Skip COEP/COOP for embed routes and ?embed=true — they need to work in cross-origin iframes
  const isEmbedRoute = event.url.pathname.startsWith('/embed') ||
    event.url.searchParams.get('embed') === 'true';

  if (!isEmbedRoute) {
    // Add required headers for SharedArrayBuffer support
    // 'require-corp' works in Safari (credentialless does not)
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return response;
};

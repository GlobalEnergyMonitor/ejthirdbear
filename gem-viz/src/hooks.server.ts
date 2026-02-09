import type { Handle } from '@sveltejs/kit';

/**
 * Set CORS headers required for SharedArrayBuffer (MotherDuck WASM, DuckDB WASM)
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
 *
 * Using 'require-corp' for Safari compatibility. Safari does not support 'credentialless'.
 * All cross-origin resources must have proper CORS/CORP headers.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Skip COEP/COOP for embed routes — they need to work in cross-origin iframes
  // and use the REST API instead of DuckDB WASM
  const isEmbedRoute = event.url.pathname.startsWith('/embed');

  if (!isEmbedRoute) {
    // Add required headers for SharedArrayBuffer support
    // 'require-corp' works in Safari (credentialless does not)
    response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
    response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
  }

  return response;
};

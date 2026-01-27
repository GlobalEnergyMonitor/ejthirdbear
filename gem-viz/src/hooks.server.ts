import type { Handle } from '@sveltejs/kit';

/**
 * Set CORS headers required for SharedArrayBuffer (MotherDuck WASM, DuckDB WASM)
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
 *
 * Using 'credentialless' instead of 'require-corp' to allow DuckDB workers to load
 * while still enabling SharedArrayBuffer support.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Add required headers for SharedArrayBuffer support
  // 'credentialless' allows same-origin resources without CORP headers
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'credentialless');

  return response;
};

import type { Handle } from '@sveltejs/kit';

/**
 * Set CORS headers required for SharedArrayBuffer (MotherDuck WASM, DuckDB WASM)
 * See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer#security_requirements
 */
export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  // Add required headers for SharedArrayBuffer support
  response.headers.set('Cross-Origin-Opener-Policy', 'same-origin');
  response.headers.set('Cross-Origin-Embedder-Policy', 'require-corp');

  return response;
};

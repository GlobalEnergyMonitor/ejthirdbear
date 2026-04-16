import { readFileSync } from 'fs';
import { resolve } from 'path';

/**
 * Serve embed.js as a tiny bootstrapper that loads the real embed code
 * (embed-source.js) with a content-hash query param for cache busting.
 *
 * Why: host pages (Drupal) cache the <script src="embed.js"> response.
 * Even with no-cache headers, browsers that cached an old version before
 * those headers existed won't re-check until heuristic expiry. The
 * bootstrapper is tiny and immutable — even if cached, it always loads
 * the real code with a fresh hash, so deploys take effect immediately.
 */

let cachedHash: string | null = null;
let cachedBootstrap: string | null = null;

async function getBootstrapJs(origin: string): Promise<string> {
  // Hash the real embed source for cache busting
  const source = readFileSync(resolve('static/embed-source.js'), 'utf-8');
  const { createHash } = await import('crypto');
  const hash = createHash('md5').update(source).digest('hex').slice(0, 12);

  if (cachedHash === hash && cachedBootstrap) return cachedBootstrap;
  cachedHash = hash;

  cachedBootstrap = `/* GEM Embed Bootstrapper — loads real code with cache busting */
(function(){
  var s=document.currentScript;
  var base=s&&s.src?new URL(s.src).origin+new URL(s.src).pathname.replace(/\\/embed\\.js.*/,''):'${origin}';
  var sc=document.createElement('script');
  sc.src=base+'/embed-source.js?v=${hash}';
  (document.head||document.documentElement).appendChild(sc);
})();
`;
  return cachedBootstrap;
}

export async function GET({ url }) {
  const origin = url.origin;
  return new Response(await getBootstrapJs(origin), {
    headers: {
      'Content-Type': 'text/javascript',
      // Always revalidate — bootstrapper is tiny, and we need deploys to take effect fast
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    },
  });
}

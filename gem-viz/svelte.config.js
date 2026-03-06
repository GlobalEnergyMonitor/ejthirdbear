import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// ---------------------------------------------------------------------------
// Static build notes:
//   - adapter-static and adapter-cloudflare are installed as devDependencies
//   - To switch, swap the adapter import and set prerender entries
//   - Manifest and most CSR-only pages already work without a server
//   - About page load uses fetch() (not fs) so it can become +page.js
//   - Asset/entity detail pages still need build-cache or API at SSR time
//   - /api/resolve-id and /api/chat are the only true server routes
// ---------------------------------------------------------------------------

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: true,
    }),
    prerender: {
      entries: [],
      handleUnseenRoutes: 'ignore',
    },
    paths: {
      base: '',
      // Absolute paths — required for nested dynamic routes like /asset/[id]/
      relative: false,
    },
    alias: {
      $lib: 'src/lib',
    },
  },
};

export default config;

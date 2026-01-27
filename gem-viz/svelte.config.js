import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Entity pages are not prerendered at build time
// They will return 404 errors (focus on asset pages)

// No base path needed for dynamic deployment

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build',
      precompress: true
    }),
    // No prerendering - pages render dynamically on the server
    prerender: {
      entries: [],
      handleUnseenRoutes: 'ignore'
    },
    paths: {
      // For static builds: base: `/gem-viz/v${version}`
      // For dynamic/Fly.io: base: ''
      base: '',
      // Use absolute paths for assets to fix nested route resolution
      // Without this, /asset/[id]/ pages use wrong relative paths
      relative: false
    },
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;

import adapter from '@sveltejs/adapter-node';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// SSR Configuration - for server-side rendering deployment
// Uses adapter-node for running on VPS, Railway, Heroku, etc.
// Pages are rendered on-demand instead of pre-built

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      out: 'build-ssr',
      precompress: false
    }),
    paths: {
      base: '/gem-viz'
    },
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;

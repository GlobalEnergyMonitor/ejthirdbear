import adapter from '@sveltejs/adapter-cloudflare';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/**
 * Cloudflare Pages config - dynamic SSR instead of static prerendering
 * Asset/entity pages render on-demand instead of 56k static files
 */

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      routes: {
        include: ['/*'],
        exclude: ['<all>'],
      },
    }),
    // No prerendering for Cloudflare - pages render dynamically
    prerender: {
      entries: [], // Don't prerender any pages
    },
    paths: {
      base: '', // Serve from root on Cloudflare
      relative: false,
    },
    alias: {
      $lib: 'src/lib',
    },
  },
};

export default config;

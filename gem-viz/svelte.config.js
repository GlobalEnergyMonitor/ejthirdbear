import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Entity pages are not prerendered at build time
// They will return 404 errors (focus on asset pages)

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: false,  // Disable to reduce file descriptor pressure during prerender
      strict: false
    }),
    prerender: {
      concurrency: 1,   // Render 1 page at a time - eliminates cache/timing race conditions
      crawl: false,     // Don't crawl - entries() generates all routes from +page.server.js
      handleHttpError: ({ status, path, message }) => {
        // Skip 404/500 errors from problematic/missing assets and continue build
        console.warn(`⚠️  Skipping ${path} (status ${status}: ${message})`);
        // Don't throw - just log and continue
      },
      handleUnseenRoutes: 'ignore'  // Ignore unseen routes (we're generating the list)
    },
    paths: {
      base: '/gem-viz'
    },
    alias: {
      $lib: 'src/lib'
    }
  }
};

export default config;

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
      concurrency: 10,  // Render 10 pages at a time - balances speed vs file descriptor pressure
      crawl: true,      // Crawl to find dynamic routes like /asset/[id]
      entries: ['*'],  // Include only crawled routes
      handleHttpError: ({ status, path, message }) => {
        // Skip 404/500 errors from problematic/missing assets and continue build
        console.warn(`⚠️  Skipping ${path} (status ${status}: ${message})`);
        // Don't throw - just log and continue
      },
      handleUnseenRoutes: 'warn'  // Warn about unseen routes that still can't be found after crawl
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

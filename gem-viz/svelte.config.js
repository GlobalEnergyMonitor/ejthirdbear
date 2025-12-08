import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: undefined,
      precompress: {
        brotli: true,
        gzip: true,
        files: ['html', 'js', 'json', 'css', 'svg', 'xml']
      },
      strict: false
    }),
    prerender: {
      concurrency: 1,  // Serial rendering - slow but 100% reliable, super nice to DB
      crawl: true,     // Crawl to find dynamic routes like /asset/[id]
      entries: ['*'],
      handleHttpError: ({ status, path, message }) => {
        // Skip 404/500 errors from problematic/missing assets and continue build
        console.warn(`⚠️  Skipping ${path} (status ${status}: ${message})`);
        // Don't throw - just log and continue
      }
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

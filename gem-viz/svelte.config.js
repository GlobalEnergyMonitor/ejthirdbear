import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { readFileSync } from 'fs';

// Entity pages are not prerendered at build time
// They will return 404 errors (focus on asset pages)

const packageJson = JSON.parse(readFileSync('./package.json', 'utf-8'));
const version = packageJson.version;

const isDev = process.env.NODE_ENV === 'development';
const basePath = isDev ? '' : `/gem-viz/v${version}`;

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: 'build',
      assets: 'build',
      fallback: '404.html',  // Fallback page for missing routes (also serves as SPA fallback)
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
      // Use root base path for local dev so Vite HMR works without a subpath
      base: basePath,
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

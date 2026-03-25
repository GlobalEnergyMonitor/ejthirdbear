/**
 * Vite config for building GEM widget bundles (dynamic embeds).
 * Separate from the main SvelteKit build — outputs ES module chunks to static/widgets/.
 *
 * Usage: vite build --config vite.widgets.config.ts
 */

import { svelte } from '@sveltejs/vite-plugin-svelte';
import { defineConfig } from 'vite';
import path from 'path';

export default defineConfig({
  plugins: [
    svelte({
      compilerOptions: {
        // Inject CSS via JS (needed for Shadow DOM — styles must be in the shadow root, not <head>)
        css: 'injected',
      },
      // Don't treat .svelte files as custom elements — we mount manually via svelte mount()
    }),
  ],

  define: {
    // Tree-shake dev-only code
    'import.meta.env.DEV': 'false',
    'import.meta.env.SSR': 'false',
    'import.meta.env.PROD': 'true',
  },

  build: {
    outDir: 'static/widgets',
    emptyOutDir: true,
    sourcemap: true,
    // Disable minification — matches main build (minification breaks Svelte 5 runtime)
    minify: false,

    lib: {
      entry: path.resolve(__dirname, 'src/widgets/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js',
    },

    rollupOptions: {
      output: {
        // Use content-hash chunk names for cache busting
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: 'assets/[name]-[hash][extname]',
      },
    },

    // Widget bundles can be large due to d3/dagre
    chunkSizeWarningLimit: 2000,
    reportCompressedSize: false,
  },

  resolve: {
    alias: {
      $lib: path.resolve(__dirname, 'src/lib'),
      // SvelteKit shims — replace $app/* imports with lightweight stubs
      '$app/stores': path.resolve(__dirname, 'src/widgets/shims/app-stores.js'),
      '$app/navigation': path.resolve(__dirname, 'src/widgets/shims/app-navigation.js'),
      '$app/environment': path.resolve(__dirname, 'src/widgets/shims/app-environment.js'),
      '$app/paths': path.resolve(__dirname, 'src/widgets/shims/app-paths.js'),
      // Stub out Node-only child_process (same as main build)
      child_process: path.resolve(__dirname, 'src/lib/shims/child_process.js'),
    },
  },
});

import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [sveltekit()],

  server: {
    port: 3737,
  },

  build: {
    sourcemap: true,
    minify: false, // disabled - minification breaks Svelte 5 runtime
    rollupOptions: {
      external: [
        // Exclude Node.js-only packages from browser bundle
        'mock-aws-s3',
        'aws-sdk',
        'nock',
      ],
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            // Keep dagre separate so it only loads when needed
            if (id.includes('dagre')) return 'vendor-dagre';
            if (id.includes('d3')) return 'vendor-d3';
            if (id.includes('maplibre')) return 'vendor-maplibre';
            return 'vendor';
          }
        },
      },
    },
    chunkSizeWarningLimit: 4000, // Vendor chunks (d3, maplibre, dagre) can be large
    // Batch file writes to avoid exhausting file descriptors
    // Limit concurrent file operations during prerender/build
    reportCompressedSize: false,
  },

  optimizeDeps: {
    include: ['d3', 'maplibre-gl', 'maplibre-gl-draw', 'dagre-d3', 'dagre'],
  },

  resolve: {
    alias: {
      // Stub out Node-only child_process to silence bundler warnings from transitive deps
      child_process: path.resolve('./src/lib/shims/child_process.js'),
    },
  },

  ssr: {
    noExternal: ['lucide-svelte'],
  },
});

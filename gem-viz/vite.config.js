import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';

export default defineConfig({
  plugins: [
    sveltekit(),
    ViteMinifyPlugin({})
  ],

  server: {
    port: 3737,
    // Required for MotherDuck WASM client
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  build: {
    sourcemap: true,
    minify: 'terser',
    rollupOptions: {
      external: [
        // Exclude Node.js-only packages from browser bundle
        'duckdb',
        'mock-aws-s3',
        'aws-sdk',
        'nock'
      ],
      output: {
        manualChunks: (id) => {
          // Don't chunk DuckDB/MotherDuck for SSR build
          if (id.includes('@duckdb') || id.includes('@motherduck')) {
            return undefined;
          }
          if (id.includes('node_modules')) {
            if (id.includes('d3')) return 'vendor-d3';
            if (id.includes('maplibre')) return 'vendor-maplibre';
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1500,
    // Batch file writes to avoid exhausting file descriptors
    // Limit concurrent file operations during prerender/build
    reportCompressedSize: false
  },

  optimizeDeps: {
    include: ['@duckdb/duckdb-wasm', '@motherduck/wasm-client', 'd3', 'maplibre-gl', 'maplibre-gl-draw'],
    exclude: ['duckdb']
  },

  ssr: {
    noExternal: []
  }
});

import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
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
    chunkSizeWarningLimit: 4000, // DuckDB/MotherDuck chunks are legitimately large
    // Batch file writes to avoid exhausting file descriptors
    // Limit concurrent file operations during prerender/build
    reportCompressedSize: false
  },

  optimizeDeps: {
    include: ['@duckdb/duckdb-wasm', '@motherduck/wasm-client', 'd3', 'maplibre-gl', 'maplibre-gl-draw'],
    exclude: ['duckdb']
  },

  resolve: {
    alias: {
      // Stub out Node-only child_process to silence bundler warnings from transitive deps
      child_process: path.resolve('./src/lib/shims/child_process.js')
    }
  },

  ssr: {
    noExternal: []
  }
});

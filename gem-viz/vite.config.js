import { sveltekit } from '@sveltejs/kit/vite';
import path from 'path';
import { defineConfig } from 'vite';
import { ViteMinifyPlugin } from 'vite-plugin-minify';
import { visualizer } from 'rollup-plugin-visualizer';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf-8'));
const isProd = process.env.NODE_ENV === 'production';
const isAnalyze = process.env.ANALYZE === 'true';

export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36)),
    __APP_VERSION__: JSON.stringify(pkg.version)
  },
  plugins: [
    sveltekit(),
    // Only minify HTML in production
    isProd && ViteMinifyPlugin({}),
    // Bundle analysis - run with ANALYZE=true npm run build
    isAnalyze && visualizer({
      filename: 'build/stats.html',
      open: true,
      gzipSize: true,
      brotliSize: true,
    })
  ].filter(Boolean),

  server: {
    port: 3737,
    // Required for MotherDuck WASM client
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  build: {
    // Disable source maps in production for faster builds and smaller output
    sourcemap: false,
    // esbuild is much faster than terser (~10-100x) with similar output size
    minify: 'esbuild',
    // Target modern browsers for smaller bundles
    target: 'es2022',
    rollupOptions: {
      external: [
        // Exclude Node.js-only packages from browser bundle
        'duckdb',
        'mock-aws-s3',
        'aws-sdk',
        'nock'
      ],
      output: {
        // Better chunk splitting for caching
        manualChunks: (id) => {
          // Don't chunk DuckDB/MotherDuck for SSR build
          if (id.includes('@duckdb') || id.includes('@motherduck')) {
            return undefined;
          }
          if (id.includes('node_modules')) {
            // Heavy visualization libraries get their own chunks
            if (id.includes('maplibre-gl')) return 'vendor-maplibre';
            if (id.includes('mermaid')) return 'vendor-mermaid';
            if (id.includes('d3-')) return 'vendor-d3';  // d3 submodules
            if (id.includes('/d3/')) return 'vendor-d3'; // d3 main
            if (id.includes('deck.gl') || id.includes('@deck.gl')) return 'vendor-deckgl';
            if (id.includes('@luma.gl')) return 'vendor-luma';
            // Everything else in a general vendor chunk
            return 'vendor';
          }
        }
      }
    },
    chunkSizeWarningLimit: 1000, // Lowered to catch large chunks earlier
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
    // Externalize WASM packages from SSR bundle - they only work in browsers
    external: ['@motherduck/wasm-client', '@duckdb/duckdb-wasm'],
    noExternal: []
  }
});

import { defineConfig } from 'vitest/config';
import { sveltekit } from '@sveltejs/kit/vite';

export default defineConfig({
  plugins: [sveltekit()],
  test: {
    include: ['src/**/*.{test,spec}.{js,ts}'],
    environment: 'jsdom',
    globals: true,
    alias: {
      $lib: '/src/lib',
      '$app/paths': '/src/lib/test-mocks/app-paths.js',
      '$app/environment': '/src/lib/test-mocks/app-environment.js'
    }
  }
});

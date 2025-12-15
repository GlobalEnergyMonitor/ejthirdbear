import js from '@eslint/js';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import sveltePlugin from 'eslint-plugin-svelte';
import svelteParser from 'svelte-eslint-parser';
import globals from 'globals';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', '.svelte-kit/**', 'build/**'],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.js', 'svelte.config.js', 'vite.config.js'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/**/*.server.js', 'src/**/*.server.ts'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['src/**/*.js', 'src/**/*.ts'],
    ignores: ['src/**/*.server.js', 'src/**/*.server.ts', 'src/**/*.svelte.ts', 'src/**/*.svelte.js'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    // Svelte 5 runes files (.svelte.ts, .svelte.js)
    files: ['src/**/*.svelte.ts', 'src/**/*.svelte.js'],
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Svelte 5 runes
        $state: 'readonly',
        $derived: 'readonly',
        $effect: 'readonly',
        $props: 'readonly',
        $bindable: 'readonly',
        $inspect: 'readonly',
        $host: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.svelte'],
    plugins: {
      svelte: sveltePlugin,
    },
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
      },
      globals: {
        ...globals.browser,
        ...globals.es2021,
        // Build-time constants (injected by Vite)
        __BUILD_TIME__: 'readonly',
        __BUILD_HASH__: 'readonly',
        __APP_VERSION__: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': 'warn',
      'no-console': 'off',
      'svelte/no-unused-svelte-ignore': 'warn',
      'svelte/no-at-html-tags': 'off',
    },
  },
];

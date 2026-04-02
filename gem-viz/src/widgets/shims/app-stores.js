/**
 * Shim for $app/stores — provides a minimal page store for widget builds.
 * Components that read $page.url.searchParams won't work in widget context
 * (they receive props directly instead), but this prevents build errors.
 */

import { readable } from 'svelte/store';

export const page = readable({
  url: new URL('https://localhost'),
  params: {},
  route: { id: '' },
  status: 200,
  error: null,
  data: {},
  form: null,
});

export const navigating = readable(null);
export const updated = readable(false);

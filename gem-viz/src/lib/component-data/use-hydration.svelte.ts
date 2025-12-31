/**
 * Shared hydration utilities for self-hydrating components
 *
 * Provides reactive loading/error state and page ID resolution.
 * Uses Svelte 5 runes for reactivity.
 */
import { browser } from '$app/environment';
import { get } from 'svelte/store';
import { page } from '$app/stores';

export interface HydrationState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
}

/**
 * Get current asset/entity ID from page params
 */
export function getPageId(): string | null {
  return get(page)?.params?.id || null;
}

/**
 * Get current page type based on URL
 */
export function getPageType(): 'asset' | 'entity' | 'other' {
  const pathname = get(page)?.url?.pathname || '';
  if (pathname.includes('/asset/')) return 'asset';
  if (pathname.includes('/entity/')) return 'entity';
  return 'other';
}

/**
 * Create hydration state with standard loading/error pattern
 *
 * Usage in component:
 * ```
 * let { loading, error, data, run } = createHydration<MyData>();
 *
 * onMount(() => {
 *   run(async () => {
 *     const id = getPageId();
 *     return await fetchMyData(id);
 *   });
 * });
 * ```
 */
export function createHydration<T>() {
  let loading = $state(true);
  let error = $state<string | null>(null);
  let data = $state<T | null>(null);

  async function run(fetcher: () => Promise<T>): Promise<T | null> {
    loading = true;
    error = null;
    try {
      const result = await fetcher();
      data = result;
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error = msg;
      console.error('[Hydration]', msg);
      return null;
    } finally {
      loading = false;
    }
  }

  function reset() {
    loading = true;
    error = null;
    data = null;
  }

  return {
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
    get data() {
      return data;
    },
    run,
    reset,
  };
}

/**
 * Require page ID or throw - use inside hydration fetcher
 */
export function requirePageId(context: string = 'component'): string {
  const id = getPageId();
  if (!id) throw new Error(`Missing ID in URL params for ${context}`);
  return id;
}

/**
 * Dynamic import for MotherDuck to avoid SSR Worker error
 */
export async function getMotherDuck() {
  // Prevent WASM import during SSR - only works in browser
  if (!browser) {
    throw new Error('MotherDuck WASM client is only available in the browser');
  }
  const mod = await import('$lib/motherduck-wasm');
  return mod.default;
}

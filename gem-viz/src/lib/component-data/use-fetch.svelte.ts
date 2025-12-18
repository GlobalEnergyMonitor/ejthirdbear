/**
 * useFetch - SSR-aware data fetching for components
 *
 * Components declare their data needs clearly:
 *   const { data, loading, error } = useFetch(() => fetchOwnerPortfolio(id), `portfolio:${id}`);
 *
 * How it works:
 * - During SSR/prerender: checks context cache (populated by +page.server.js)
 * - During client: calls the fetcher function via onMount
 * - Build-time caching layer can dedupe repeated fetches
 */

import { getContext, onMount } from 'svelte';

/** Cache context key - pages set this with prebaked data */
export const SSR_CACHE_KEY = 'ssr-data-cache';

/** Type for the SSR cache */
export type SSRCache = Map<string, unknown>;

/**
 * Create reactive fetch state for a component
 *
 * @param fetcher - Async function that fetches the data
 * @param cacheKey - Unique key for SSR cache lookup (e.g., 'portfolio:E12345')
 * @returns Reactive object with { data, loading, error }
 */
export function useFetch<T>(
  fetcher: () => Promise<T>,
  cacheKey: string
): { data: T | null; loading: boolean; error: string | null } {
  // Check SSR cache first (populated during build/prerender)
  const ssrCache = getContext<SSRCache | undefined>(SSR_CACHE_KEY);
  const cachedData = ssrCache?.get(cacheKey) as T | undefined;

  // Reactive state
  let data = $state<T | null>(cachedData ?? null);
  let loading = $state(!cachedData);
  let error = $state<string | null>(null);

  // Fetch on client if no cached data
  onMount(async () => {
    if (data) {
      // Already have SSR data, no fetch needed
      loading = false;
      return;
    }

    try {
      data = await fetcher();
    } catch (e) {
      console.error(`[useFetch] ${cacheKey} failed:`, e);
      error = e instanceof Error ? e.message : String(e);
    } finally {
      loading = false;
    }
  });

  return {
    get data() {
      return data;
    },
    get loading() {
      return loading;
    },
    get error() {
      return error;
    },
  };
}

/**
 * Build an SSR cache Map from page load data
 * Use this in +page.svelte to set up the cache context
 *
 * @example
 * // In +page.svelte
 * import { setContext } from 'svelte';
 * import { SSR_CACHE_KEY, buildSSRCache } from '$lib/component-data/use-fetch.svelte';
 *
 * setContext(SSR_CACHE_KEY, buildSSRCache({
 *   [`portfolio:${data.entityId}`]: data.ownerExplorerData,
 * }));
 */
export function buildSSRCache(entries: Record<string, unknown>): SSRCache {
  return new Map(Object.entries(entries));
}

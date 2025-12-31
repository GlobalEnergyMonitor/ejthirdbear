/**
 * Data Loader Utilities
 *
 * Provides composable data loading patterns with automatic
 * loading states, error handling, and caching.
 */
import { writable, derived, get, type Writable, type Readable } from 'svelte/store';

// =============================================================================
// Types
// =============================================================================

export interface LoaderState<T> {
  loading: boolean;
  error: string | null;
  data: T | null;
  lastFetchedAt: number | null;
}

export interface LoaderStore<T> extends Readable<LoaderState<T>> {
  load: (_fetcher: () => Promise<T>, _options?: LoadOptions) => Promise<T | null>;
  reset: () => void;
  setError: (_error: string) => void;
}

export interface LoadOptions {
  /** Skip loading if data was fetched within this many ms */
  cacheMs?: number;
  /** Force refresh even if cached */
  force?: boolean;
}

// =============================================================================
// Cache
// =============================================================================

const dataCache = new Map<string, { data: unknown; timestamp: number }>();

/**
 * Get cached data if still valid
 */
export function getCached<T>(key: string, maxAgeMs: number): T | null {
  const cached = dataCache.get(key);
  if (!cached) return null;
  if (Date.now() - cached.timestamp > maxAgeMs) {
    dataCache.delete(key);
    return null;
  }
  return cached.data as T;
}

/**
 * Set cache entry
 */
export function setCache<T>(key: string, data: T): void {
  dataCache.set(key, { data, timestamp: Date.now() });
}

/**
 * Clear all cached data
 */
export function clearCache(): void {
  dataCache.clear();
}

// =============================================================================
// Loader Factory
// =============================================================================

/**
 * Create a data loader store with loading/error states
 */
export function createLoader<T>(): LoaderStore<T> {
  const state: Writable<LoaderState<T>> = writable({
    loading: false,
    error: null,
    data: null,
    lastFetchedAt: null,
  });

  return {
    subscribe: state.subscribe,

    async load(fetcher: () => Promise<T>, options: LoadOptions = {}): Promise<T | null> {
      const currentState = get(state);

      // Check cache
      if (!options.force && options.cacheMs && currentState.lastFetchedAt) {
        const age = Date.now() - currentState.lastFetchedAt;
        if (age < options.cacheMs && currentState.data !== null) {
          return currentState.data;
        }
      }

      // Start loading
      state.update((s) => ({ ...s, loading: true, error: null }));

      try {
        const data = await fetcher();
        state.set({
          loading: false,
          error: null,
          data,
          lastFetchedAt: Date.now(),
        });
        return data;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        state.set({
          loading: false,
          error: errorMsg,
          data: null,
          lastFetchedAt: null,
        });
        console.error('[DataLoader]', errorMsg);
        return null;
      }
    },

    reset(): void {
      state.set({
        loading: false,
        error: null,
        data: null,
        lastFetchedAt: null,
      });
    },

    setError(error: string): void {
      state.update((s) => ({ ...s, error, loading: false }));
    },
  };
}

// =============================================================================
// Keyed Loader (for ID-based data)
// =============================================================================

export interface KeyedLoaderStore<T> {
  /** Get or create a loader for a specific key */
  getLoader: (_key: string) => LoaderStore<T>;
  /** Load data for a key, with caching */
  load: (_key: string, _fetcher: () => Promise<T>, _options?: LoadOptions) => Promise<T | null>;
  /** Get current state for a key */
  getState: (_key: string) => LoaderState<T> | null;
  /** Clear all loaders */
  clear: () => void;
}

/**
 * Create a keyed loader for ID-based data access
 * Each unique key gets its own loader with independent state
 */
export function createKeyedLoader<T>(): KeyedLoaderStore<T> {
  const loaders = new Map<string, LoaderStore<T>>();

  return {
    getLoader(key: string): LoaderStore<T> {
      if (!loaders.has(key)) {
        loaders.set(key, createLoader<T>());
      }
      return loaders.get(key)!;
    },

    async load(key: string, fetcher: () => Promise<T>, options?: LoadOptions): Promise<T | null> {
      return this.getLoader(key).load(fetcher, options);
    },

    getState(key: string): LoaderState<T> | null {
      const loader = loaders.get(key);
      if (!loader) return null;
      return get(loader);
    },

    clear(): void {
      loaders.clear();
    },
  };
}

// =============================================================================
// Derived Loading State
// =============================================================================

/**
 * Combine multiple loader states into a single derived state
 */
export function combineLoaders<T extends Record<string, LoaderStore<unknown>>>(
  loaders: T
): Readable<{
  loading: boolean;
  errors: string[];
  allLoaded: boolean;
}> {
  const stores = Object.values(loaders);

  return derived(stores, (states) => {
    const loading = states.some((s) => s.loading);
    const errors = states.filter((s) => s.error).map((s) => s.error!);
    const allLoaded = states.every((s) => s.data !== null && !s.loading);

    return { loading, errors, allLoaded };
  });
}

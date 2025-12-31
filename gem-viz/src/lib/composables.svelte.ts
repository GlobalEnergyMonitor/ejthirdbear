/**
 * ============================================================================
 * SVELTE 5 COMPOSABLES
 * ============================================================================
 *
 * Reusable reactive patterns for GEM Viz components.
 *
 * WHY COMPOSABLES?
 * ----------------
 * Many components share the same patterns:
 * - Loading/error/data state management
 * - Async data fetching with error handling
 * - Query time tracking
 *
 * Instead of copy-pasting this boilerplate everywhere, we centralize it here.
 *
 * USAGE:
 * ------
 * ```svelte
 * <script>
 *   import { createAsyncState } from '$lib/composables.svelte';
 *
 *   const state = createAsyncState<MyData[]>();
 *
 *   onMount(() => {
 *     state.run(async () => {
 *       const response = await fetch('/api/data');
 *       return response.json();
 *     });
 *   });
 * </script>
 *
 * {#if state.loading}
 *   <p>Loading...</p>
 * {:else if state.error}
 *   <p>Error: {state.error}</p>
 * {:else}
 *   <ul>
 *     {#each state.data as item}
 *       <li>{item.name}</li>
 *     {/each}
 *   </ul>
 * {/if}
 * ```
 *
 * ============================================================================
 */

// ============================================================================
// ASYNC STATE
// ============================================================================

export interface AsyncState<T> {
  /** Whether data is currently being fetched */
  readonly loading: boolean;
  /** Error message if fetch failed, null otherwise */
  readonly error: string | null;
  /** The fetched data, null until loaded */
  readonly data: T | null;
  /** Time taken for the last fetch in milliseconds */
  readonly queryTime: number;
  /** Run an async fetcher, updating state automatically */
  run: (fetcher: () => Promise<T>) => Promise<T | null>;
  /** Reset to initial state */
  reset: () => void;
  /** Manually set an error */
  setError: (msg: string) => void;
  /** Manually set data (for prebaked data) */
  setData: (data: T) => void;
}

/**
 * Create reactive async state with loading/error handling.
 *
 * This is the core primitive - use it when you need full control.
 * For simpler cases, use createWidgetState() or createQueryState().
 *
 * @param initialData - Optional initial data (for SSR/prebaked scenarios)
 *
 * @example
 * const users = createAsyncState<User[]>();
 *
 * onMount(() => {
 *   users.run(async () => {
 *     const res = await fetch('/api/users');
 *     return res.json();
 *   });
 * });
 */
export function createAsyncState<T>(initialData: T | null = null): AsyncState<T> {
  let loading = $state(initialData === null);
  let error = $state<string | null>(null);
  let data = $state<T | null>(initialData);
  let queryTime = $state(0);

  async function run(fetcher: () => Promise<T>): Promise<T | null> {
    loading = true;
    error = null;
    const startTime = Date.now();

    try {
      const result = await fetcher();
      data = result;
      queryTime = Date.now() - startTime;
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      error = msg;
      queryTime = Date.now() - startTime;
      console.error('[AsyncState]', msg);
      return null;
    } finally {
      loading = false;
    }
  }

  function reset() {
    loading = initialData === null;
    error = null;
    data = initialData;
    queryTime = 0;
  }

  function setError(msg: string) {
    error = msg;
    loading = false;
  }

  function setData(newData: T) {
    data = newData;
    loading = false;
    error = null;
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
    get queryTime() {
      return queryTime;
    },
    run,
    reset,
    setError,
    setData,
  };
}

// ============================================================================
// WIDGET STATE (specialized for SQL widgets)
// ============================================================================

// Dynamic import to avoid SSR bundling of @duckdb/duckdb-wasm
// widgetQuery is loaded lazily when first needed
/** @type {typeof import('$lib/widgets/widget-utils').widgetQuery | null} */
let _widgetQuery: typeof import('$lib/widgets/widget-utils').widgetQuery | null = null;

async function getWidgetQuery() {
  if (!_widgetQuery) {
    const mod = await import('$lib/widgets/widget-utils');
    _widgetQuery = mod.widgetQuery;
  }
  return _widgetQuery;
}

export interface WidgetState<T> extends AsyncState<T[]> {
  /** Run a SQL query against the widget DB */
  query: (sql: string) => Promise<T[] | null>;
}

/**
 * Create reactive state for SQL-based widgets.
 *
 * Wraps widgetQuery with automatic state management.
 * Use this for dashboard widgets that query parquet files.
 *
 * @example
 * const topOwners = createWidgetState<OwnerRow>();
 *
 * async function loadData() {
 *   await topOwners.query(`
 *     SELECT "Owner", COUNT(*) as count
 *     FROM ownership
 *     GROUP BY "Owner"
 *     ORDER BY count DESC
 *     LIMIT 10
 *   `);
 * }
 *
 * onMount(() => loadData());
 */
export function createWidgetState<T = Record<string, unknown>>(): WidgetState<T> {
  const state = createAsyncState<T[]>([]);

  async function query(sql: string): Promise<T[] | null> {
    return state.run(async () => {
      const widgetQuery = await getWidgetQuery();
      const result = await widgetQuery<T>(sql);
      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }
      return result.data || [];
    });
  }

  return {
    ...state,
    query,
  };
}

// ============================================================================
// TOGGLE STATE
// ============================================================================

export interface ToggleState {
  readonly value: boolean;
  toggle: () => void;
  set: (v: boolean) => void;
  on: () => void;
  off: () => void;
}

/**
 * Create a simple boolean toggle.
 *
 * @example
 * const expanded = createToggle(false);
 *
 * <button onclick={expanded.toggle}>
 *   {expanded.value ? 'Collapse' : 'Expand'}
 * </button>
 */
export function createToggle(initial = false): ToggleState {
  let value = $state(initial);

  return {
    get value() {
      return value;
    },
    toggle: () => (value = !value),
    set: (v: boolean) => (value = v),
    on: () => (value = true),
    off: () => (value = false),
  };
}

// ============================================================================
// SELECTION STATE
// ============================================================================

export interface SelectionState<T> {
  readonly selected: Set<T>;
  readonly count: number;
  readonly hasSelection: boolean;
  isSelected: (item: T) => boolean;
  toggle: (item: T) => void;
  select: (item: T) => void;
  deselect: (item: T) => void;
  selectAll: (items: T[]) => void;
  clear: () => void;
  toArray: () => T[];
}

/**
 * Create a multi-selection state manager.
 *
 * @example
 * const selection = createSelection<string>();
 *
 * {#each items as item}
 *   <label>
 *     <input
 *       type="checkbox"
 *       checked={selection.isSelected(item.id)}
 *       onchange={() => selection.toggle(item.id)}
 *     />
 *     {item.name}
 *   </label>
 * {/each}
 *
 * <button onclick={selection.clear} disabled={!selection.hasSelection}>
 *   Clear ({selection.count} selected)
 * </button>
 */
export function createSelection<T>(): SelectionState<T> {
  let selected = $state(new Set<T>());

  return {
    get selected() {
      return selected;
    },
    get count() {
      return selected.size;
    },
    get hasSelection() {
      return selected.size > 0;
    },
    isSelected: (item: T) => selected.has(item),
    toggle: (item: T) => {
      const next = new Set(selected);
      if (next.has(item)) {
        next.delete(item);
      } else {
        next.add(item);
      }
      selected = next;
    },
    select: (item: T) => {
      if (!selected.has(item)) {
        selected = new Set([...selected, item]);
      }
    },
    deselect: (item: T) => {
      if (selected.has(item)) {
        const next = new Set(selected);
        next.delete(item);
        selected = next;
      }
    },
    selectAll: (items: T[]) => {
      selected = new Set(items);
    },
    clear: () => {
      selected = new Set();
    },
    toArray: () => [...selected],
  };
}

// ============================================================================
// PAGINATION STATE
// ============================================================================

export interface PaginationState {
  readonly page: number;
  readonly pageSize: number;
  readonly offset: number;
  readonly totalPages: number;
  readonly hasNext: boolean;
  readonly hasPrev: boolean;
  setTotal: (total: number) => void;
  next: () => void;
  prev: () => void;
  goTo: (page: number) => void;
  reset: () => void;
}

/**
 * Create pagination state manager.
 *
 * @example
 * const pagination = createPagination(20); // 20 items per page
 *
 * $effect(() => {
 *   pagination.setTotal(allItems.length);
 * });
 *
 * const visibleItems = $derived(
 *   allItems.slice(pagination.offset, pagination.offset + pagination.pageSize)
 * );
 */
export function createPagination(pageSize = 25): PaginationState {
  let page = $state(1);
  let total = $state(0);

  const totalPages = $derived(Math.ceil(total / pageSize) || 1);
  const hasNext = $derived(page < totalPages);
  const hasPrev = $derived(page > 1);
  const offset = $derived((page - 1) * pageSize);

  return {
    get page() {
      return page;
    },
    get pageSize() {
      return pageSize;
    },
    get offset() {
      return offset;
    },
    get totalPages() {
      return totalPages;
    },
    get hasNext() {
      return hasNext;
    },
    get hasPrev() {
      return hasPrev;
    },
    setTotal: (t: number) => {
      total = t;
      // Reset to page 1 if current page is now out of bounds
      if (page > Math.ceil(t / pageSize)) {
        page = 1;
      }
    },
    next: () => {
      if (page < totalPages) page++;
    },
    prev: () => {
      if (page > 1) page--;
    },
    goTo: (p: number) => {
      page = Math.max(1, Math.min(p, totalPages));
    },
    reset: () => {
      page = 1;
    },
  };
}

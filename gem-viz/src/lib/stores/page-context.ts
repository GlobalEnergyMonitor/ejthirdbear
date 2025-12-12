/**
 * Page Context Store
 *
 * Provides reactive access to current page params and computed IDs.
 * Eliminates repeated `get(page)?.params` calls across components.
 */
import { derived, type Readable } from 'svelte/store';
import { page } from '$app/stores';

/**
 * Current asset ID from URL params (for /asset/[id] routes)
 */
export const currentAssetId: Readable<string | null> = derived(page, ($page) => {
  return $page?.params?.id || null;
});

/**
 * Current entity ID from URL params (for /entity/[id] routes)
 */
export const currentEntityId: Readable<string | null> = derived(page, ($page) => {
  return $page?.params?.id || null;
});

/**
 * Detect if we're on an asset or entity page
 */
export const pageType: Readable<'asset' | 'entity' | 'other'> = derived(page, ($page) => {
  const pathname = $page?.url?.pathname || '';
  if (pathname.includes('/asset/')) return 'asset';
  if (pathname.includes('/entity/')) return 'entity';
  return 'other';
});

/**
 * Get the relevant ID based on page type
 */
export const contextId: Readable<string | null> = derived(
  [page, pageType],
  ([$page, $pageType]) => {
    if ($pageType === 'other') return null;
    return $page?.params?.id || null;
  }
);

/**
 * Helper to get current ID synchronously (for use in onMount)
 * @deprecated Prefer using the reactive stores when possible
 */
export function getCurrentId(): string | null {
  let id: string | null = null;
  const unsubscribe = page.subscribe(($page) => {
    id = $page?.params?.id || null;
  });
  unsubscribe();
  return id;
}

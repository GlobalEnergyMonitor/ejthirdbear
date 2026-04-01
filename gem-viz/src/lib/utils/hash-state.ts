/**
 * Hash-based URL state — works in-app, in embeds, and in Drupal iframes.
 * Single source of truth for reading/writing #key=value URL fragments.
 */

/** Read all hash params as a key-value map. SSR-safe. */
export function readHash(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.slice(1);
  if (!raw) return {};
  return Object.fromEntries(new URLSearchParams(raw));
}

/** Read a single key from the hash. SSR-safe. */
export function readHashParam(key: string): string | null {
  if (typeof window === 'undefined') return null;
  const raw = window.location.hash.slice(1);
  if (!raw) return null;
  return new URLSearchParams(raw).get(key);
}

/**
 * Write key-value pairs to URL hash, merging with existing params.
 * Pass null/undefined to remove a key. SSR-safe (no-op on server).
 */
export function writeHash(params: Record<string, string | null | undefined>): void {
  if (typeof window === 'undefined') return;
  const current = new URLSearchParams(window.location.hash.slice(1));
  for (const [key, value] of Object.entries(params)) {
    if (value != null && value !== '') {
      current.set(key, value);
    } else {
      current.delete(key);
    }
  }
  const s = current.toString();
  history.replaceState(null, '', s ? `#${s}` : location.pathname + location.search);
}

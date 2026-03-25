/**
 * Shim for $app/navigation — provides no-op navigation for widget builds.
 * Components use onNavigate prop instead of goto() in widget context.
 */

export function goto(url) {
  // In widget context, open in new tab as fallback
  window.open(url, '_blank', 'noopener');
}

export function beforeNavigate() {}
export function afterNavigate() {}
export function onNavigate() {}
export function invalidate() { return Promise.resolve(); }
export function invalidateAll() { return Promise.resolve(); }
export function preloadData() { return Promise.resolve(); }
export function preloadCode() { return Promise.resolve(); }
export function pushState() {}
export function replaceState() {}

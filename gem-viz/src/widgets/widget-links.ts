/**
 * Widget link helpers — absolute URL versions of $lib/links.ts.
 * No $app/paths dependency. Uses configurable app base URL.
 *
 * Supports:
 * - `linkBase`: overrides the default app base for all generated URLs
 *   (e.g., Drupal site base when embedding in a CMS).
 * - `navigate(url, target)`: routes navigation through postMessage when
 *   target is 'parent' or 'message', otherwise opens in a new tab.
 */

import { getAppBase } from './widget-api';

/**
 * Build an absolute URL for an in-app path.
 * If `linkBase` is provided, it overrides the default appBase.
 */
export function link(path: string, linkBase?: string): string {
  const base = linkBase || getAppBase();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  // Strip trailing slash from base, add between base and path
  return `${base.replace(/\/$/, '')}/${cleanPath}`;
}

export function assetLink(id: string, linkBase?: string): string {
  return link(`asset/${id}`, linkBase);
}

export function entityLink(id: string, linkBase?: string): string {
  return link(`entity/${id}`, linkBase);
}

export function portfolioLink(entityId: string, linkBase?: string): string {
  return link(`portfolio-explorer?entity=${entityId}`, linkBase);
}

/**
 * Navigate to a URL, respecting the linkTarget mode.
 *
 * @param url - Destination URL
 * @param linkTarget - Navigation mode:
 *   - 'parent' or 'message': postMessage to host page (Drupal handles navigation)
 *   - 'self': navigate current window
 *   - 'blank' or undefined: open in new tab (default)
 */
export function navigate(url: string, linkTarget?: string): void {
  const mode = (linkTarget || 'blank').toLowerCase();

  // Dispatch cancelable gem:navigate event — host page can preventDefault() to block
  if (typeof CustomEvent !== 'undefined') {
    const event = new CustomEvent('gem:navigate', {
      bubbles: true,
      cancelable: true,
      detail: { url, target: mode },
    });
    document.dispatchEvent(event);
    if (event.defaultPrevented) return;
  }

  if (mode === 'parent' || mode === 'message') {
    // Send navigation intent to host page — Drupal can intercept and handle
    window.parent?.postMessage({ type: 'gem-navigate', url }, '*');
    return;
  }

  if (mode === 'self') {
    window.location.href = url;
    return;
  }

  // Default: new tab
  window.open(url, '_blank', 'noopener');
}

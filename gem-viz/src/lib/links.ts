/**
 * @module links
 * @description URL and path helpers for consistent linking.
 *
 * Handles dev/production URL differences:
 * - Dev: `/network/` (SvelteKit handles routing)
 * - Prod: `/gem-viz/v0.1.x/network/index.html` (DO Spaces requires explicit paths)
 *
 * @example
 * import { assetLink, entityLink, link } from '$lib/links';
 * const url = assetLink('G100000109409');
 */

import { base } from '$app/paths';
import { building } from '$app/environment';

// SSR mode uses clean URLs, static builds need /index.html
// Use building context - during static builds this will be true
const isStaticBuild = building;

/**
 * Generate a link that works in both dev and production
 * @param path - Route path without leading slash (e.g., 'network', 'asset/G123')
 * @returns Full URL path
 */
export function link(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // SSR/dynamic mode: use clean URLs with trailing slash
  // Static builds (DO Spaces): use /index.html
  const useStaticPaths = isStaticBuild;

  // Handle index/home
  if (cleanPath === '' || cleanPath === 'index') {
    return useStaticPaths ? `${base}/index.html` : `${base}/`;
  }

  // SSR mode: trailing slash (SvelteKit/Node handles routing)
  // Static builds: explicit /index.html (DO Spaces requires it)
  return useStaticPaths ? `${base}/${cleanPath}/index.html` : `${base}/${cleanPath}/`;
}

/**
 * Generate asset page link
 */
export function assetLink(id: string): string {
  return link(`asset/${id}`);
}

/**
 * Generate entity page link
 */
export function entityLink(id: string): string {
  return link(`entity/${id}`);
}

/**
 * Generate factsheet page link
 */
export function factsheetLink(tracker: string): string {
  // Convert tracker name to URL slug
  const slug = tracker.toLowerCase().replace(/\s+/g, '-');
  return link(`factsheet/${slug}`);
}

/**
 * Generate tracker page link
 */
export function trackerLink(tracker: string): string {
  // Convert tracker name to URL slug
  // Handle special case: "Bioenergy Power" -> "bioenergy"
  let slug = tracker.toLowerCase().replace(/\s+/g, '-');
  if (slug === 'bioenergy-power') {
    slug = 'bioenergy';
  }
  return link(`tracker/${slug}`);
}

/**
 * Get the base path for static assets (parquet files, geojson, etc.)
 * Uses base path which works in both dev and production
 */
export function assetPath(filename: string): string {
  return `${base}/${filename}`;
}

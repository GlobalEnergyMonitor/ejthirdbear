/**
 * Link utilities for dev/production compatibility
 *
 * In dev mode: /network/
 * In production: /gem-viz/v0.1.11/network/index.html
 *
 * DO Spaces requires explicit /index.html - no auto-serving from directories
 */

import { base } from '$app/paths';
import { dev } from '$app/environment';

/**
 * Generate a link that works in both dev and production
 * @param path - Route path without leading slash (e.g., 'network', 'asset/G123')
 * @returns Full URL path
 */
export function link(path: string): string {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;

  // Handle index/home
  if (cleanPath === '' || cleanPath === 'index') {
    return dev ? `${base}/` : `${base}/index.html`;
  }

  // Dev mode: trailing slash (SvelteKit handles routing)
  // Production: explicit /index.html (DO Spaces requires it)
  return dev ? `${base}/${cleanPath}/` : `${base}/${cleanPath}/index.html`;
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
 * Get the base path for static assets (parquet files, geojson, etc.)
 * Uses base path which works in both dev and production
 */
export function assetPath(filename: string): string {
  return `${base}/${filename}`;
}

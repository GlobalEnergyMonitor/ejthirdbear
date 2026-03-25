/**
 * Widget link helpers — absolute URL versions of $lib/links.ts.
 * No $app/paths dependency. Uses configurable app base URL.
 */

import { getAppBase } from './widget-api';

export function link(path: string): string {
  const base = getAppBase();
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${base}/${cleanPath}/`;
}

export function assetLink(id: string): string {
  return link(`asset/${id}`);
}

export function entityLink(id: string): string {
  return link(`entity/${id}`);
}

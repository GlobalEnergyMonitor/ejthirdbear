import { writable } from 'svelte/store';

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
  latCol?: string;
  lonCol?: string;
}

export interface MapPolygon {
  type: 'polygon';
  coordinates: number[][]; // Array of [lon, lat] pairs
  latCol?: string;
  lonCol?: string;
}

export type MapFilter = MapBounds | MapPolygon | null;

/** Type guard to check if filter is a polygon */
export function isPolygonFilter(filter: MapFilter): filter is MapPolygon {
  return filter !== null && 'type' in filter && filter.type === 'polygon';
}

/** Type guard to check if filter is bounds */
export function isBoundsFilter(filter: MapFilter): filter is MapBounds {
  return filter !== null && !('type' in filter && filter.type === 'polygon');
}

export const mapFilter = writable<MapFilter>(null);

export function clearMapFilter() {
  mapFilter.set(null);
}

export function setMapFilter(filter: MapFilter) {
  mapFilter.set(filter);
}

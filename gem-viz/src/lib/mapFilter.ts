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

export const mapFilter = writable<MapFilter>(null);

export function clearMapFilter() {
  mapFilter.set(null);
}

export function setMapFilter(filter: MapFilter) {
  mapFilter.set(filter);
}

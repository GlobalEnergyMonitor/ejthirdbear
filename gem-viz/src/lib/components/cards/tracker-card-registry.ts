/**
 * Tracker Card Registry
 *
 * Maps facility types to their specialized card components and data fetchers.
 * To add a new tracker card:
 *   1. Create the card component (e.g., GasPlantCard.svelte)
 *   2. Add an entry to the `registry` below
 *   3. The asset page picks it up automatically via TrackerCard.svelte
 */

import type { AssetSummary } from '$lib/ownership-api';
import type { Component } from 'svelte';

export interface TrackerCardConfig {
  /** Dynamic import for the card Svelte component */
  loadComponent: () => Promise<{ default: Component }>;
  /** Fetch tracker-specific data; returns props object for the component, or null to skip */
  fetchProps: (asset: AssetSummary) => Promise<Record<string, unknown> | null>;
  /** Display label for the section heading */
  label: string;
}

/**
 * Extract the location ID from a coal plant compound asset ID.
 * Coal plant IDs use format: L{locationId}_G{unitId}
 * The location ID (L-prefix) is what fetchCoalPlantLocation needs.
 */
function extractLocationId(asset: AssetSummary): string | null {
  // Try raw fields first
  const rawLocationId =
    asset.raw?.['GEM Location ID'] ??
    asset.raw?.['gem_location_id'] ??
    asset.raw?.['GEM location ID'] ??
    null;
  if (rawLocationId && typeof rawLocationId === 'string') return rawLocationId;

  // Extract from compound ID format (L123_G456 → L123)
  if (asset.id && /^L\d+_G\d+$/.test(asset.id)) {
    return asset.id.split('_')[0];
  }

  return null;
}

const registry: Record<string, TrackerCardConfig> = {
  'Coal Plant': {
    loadComponent: () => import('./CoalPlantCard.svelte'),
    fetchProps: async (asset) => {
      const locationId = extractLocationId(asset);
      if (!locationId) return null;

      const { fetchCoalPlantLocation } = await import('$lib/ownership-api');
      const location = await fetchCoalPlantLocation(locationId);
      if (!location?.units?.length) return null;

      return { units: location.units, open: true };
    },
    label: 'Coal Plant Details',
  },

  // Future tracker cards go here:
  // 'Oil & Gas Plant': { ... },
  // 'Iron & Steel Plant': { ... },
  // 'Iron Ore Mine': { ... },
  // 'Natural Gas Transmission Pipeline': { ... },
  // 'Bioenergy Plant': { ... },
  // 'Cement or Concrete Plant': { ... },
};

/**
 * Look up the tracker card configuration for a given facility type.
 * Returns null if no specialized card exists for this type.
 */
export function getTrackerCardConfig(
  facilityType: string | null | undefined
): TrackerCardConfig | null {
  if (!facilityType) return null;
  return registry[facilityType] ?? null;
}

/** List all facility types that have specialized cards */
export function getRegisteredTrackerTypes(): string[] {
  return Object.keys(registry);
}

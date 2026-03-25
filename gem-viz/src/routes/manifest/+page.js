/**
 * Manifest / Admin Index
 *
 * Shows live API metadata + static configuration data.
 */

import {
  TrackerDatasets,
  OwnershipTrackerDatasets,
  DerivedDatasets,
  dataVersionInfo,
  getLiveDataSources,
} from '$lib/data-config/data-sources';
import { TRACKERS, TRACKER_TO_ASSET_TYPE, TRACKER_ID_FIELD } from '$lib/data-config/tracker-schema';
import { fetchApiMetadata, fetchCatalogFieldMappings, fetchCatalogTaxonomy } from '$lib/catalog-api';
import { env } from '$env/dynamic/public';

/** @type {import('./$types').PageLoad} */
export async function load() {
  const startTime = Date.now();

  // Fetch live data from API in parallel
  const [apiMeta, liveSources, fieldMappings, statusTaxonomy] = await Promise.all([
    fetchApiMetadata().catch(() => null),
    getLiveDataSources().catch(() => []),
    fetchCatalogFieldMappings().catch(() => null),
    fetchCatalogTaxonomy().catch(() => null),
  ]);

  const trackerConfigs = TRACKERS.map((name) => ({
    name,
    assetType: TRACKER_TO_ASSET_TYPE[name],
    idField: TRACKER_ID_FIELD[name],
  }));

  const dataSources = {
    ownership: Object.entries(OwnershipTrackerDatasets).map(([key, value]) => ({
      key,
      ...value,
    })),
    trackers: Object.entries(TrackerDatasets).map(([key, value]) => ({ key, ...value })),
    derived: Object.entries(DerivedDatasets).map(([key, value]) => ({ key, ...value })),
  };

  const loadTime = Date.now() - startTime;

  return {
    tables: [],
    trackerConfigs,
    dataSources,
    liveSources,
    staticFiles: [
      { path: 'static/points.geojson', description: 'Asset locations GeoJSON' },
      { path: 'static/version.json', description: 'Build version metadata' },
    ],
    dataVersionInfo,
    apiMeta,
    fieldMappings: fieldMappings?.results || [],
    statusTaxonomy,
    api: {
      baseUrl: env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net',
      note: 'Ownership Tracing API is the primary data source for runtime queries.',
    },
    meta: {
      loadTime,
      generatedAt: new Date().toISOString(),
      tableCount: 0,
      totalRows: 0,
      error: null,
    },
  };
}

/**
 * Manifest / Admin Index
 *
 * Shows static configuration data and API metadata.
 */

import {
  TrackerDatasets,
  OwnershipTrackerDatasets,
  DerivedDatasets,
  dataVersionInfo,
} from '$lib/data-config/data-sources';
import { getAllTrackerNames, getTrackerConfig } from '$lib/data-config/tracker-config';
import { env } from '$env/dynamic/public';

/**
 * Get static configuration data (always available)
 */
function getStaticData() {
  const trackerNames = getAllTrackerNames();
  const trackerConfigs = trackerNames.map((name) => ({
    name,
    config: getTrackerConfig(name),
  }));

  const dataSources = {
    ownership: Object.entries(OwnershipTrackerDatasets).map(([key, value]) => ({
      key,
      ...value,
    })),
    trackers: Object.entries(TrackerDatasets).map(([key, value]) => ({ key, ...value })),
    derived: Object.entries(DerivedDatasets).map(([key, value]) => ({ key, ...value })),
  };

  const staticFiles = [
    { path: 'static/points.geojson', description: 'Asset locations GeoJSON' },
    { path: 'static/version.json', description: 'Build version metadata' },
  ];

  return { trackerConfigs, dataSources, staticFiles };
}

/** @type {import('./$types').PageServerLoad} */
export async function load() {
  const startTime = Date.now();
  const staticData = getStaticData();

  const loadTime = Date.now() - startTime;

  return {
    tables: [],
    ...staticData,
    dataVersionInfo,
    api: {
      baseUrl: env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://6b7c36096b12.ngrok.app',
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

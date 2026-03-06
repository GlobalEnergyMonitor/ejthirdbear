/**
 * About Page - Load real stats from static files
 *
 * Uses fetch() against static assets instead of fs, so this load function
 * could be converted to a universal load (+page.js) in the future if needed
 * for static site generation. The only reason it's still +page.server.js is
 * to avoid shipping the full GeoJSON to the client during hydration.
 */

/** @type {import('./$types').PageServerLoad} */
export async function load({ fetch }) {
  const stats = {
    totalLocations: 0,
    totalCountries: 0,
    totalAssets: 13472,
    totalEntities: 3952,
    trackerBreakdown: [],
    buildTime: null,
    version: null,
  };

  // Load GeoJSON stats from static file
  try {
    const res = await fetch('/points.geojson');
    if (res.ok) {
      const geojson = await res.json();

      stats.totalLocations = geojson.metadata?.count || geojson.features?.length || 0;

      const trackerCounts = {};
      const countries = new Set();

      for (const feature of geojson.features || []) {
        const props = feature.properties || {};
        const tracker = props.tracker || 'Unknown';
        trackerCounts[tracker] = (trackerCounts[tracker] || 0) + 1;
        if (props.country) countries.add(props.country);
      }

      stats.totalCountries = countries.size;
      stats.trackerBreakdown = Object.entries(trackerCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
    }
  } catch {
    // GeoJSON stats are optional — continue with defaults
  }

  // Load version info from static file
  try {
    const res = await fetch('/version.json');
    if (res.ok) {
      const version = await res.json();
      stats.version = version.version;
      stats.buildTime = version.buildTime;
    }
  } catch {
    // Version info is optional — continue with defaults
  }

  return { stats };
}

/**
 * Geofence utilities: GeoJSON parsing and point-in-polygon testing.
 * Used by the screener to filter assets by a custom geographic region.
 */

/**
 * Parse a GeoJSON string into a coordinate ring (array of [lng, lat] pairs).
 * Accepts FeatureCollection, Feature, or bare Geometry.
 * Supports Polygon (uses first ring) and LineString (auto-closes into polygon).
 * Returns null on invalid input.
 */
export function parseGeoFence(geojson: string): number[][] | null {
  let obj: Record<string, unknown>;
  try {
    obj = JSON.parse(geojson);
  } catch {
    return null;
  }
  if (!obj || typeof obj !== 'object') return null;

  const geometry = extractGeometry(obj);
  if (!geometry) return null;

  const type = geometry.type as string;
  const coords = geometry.coordinates as unknown;

  if (type === 'Polygon') {
    const ring = (coords as number[][][])?.[0];
    if (validRing(ring)) return ring;
  }

  if (type === 'LineString') {
    const line = coords as number[][];
    if (!Array.isArray(line) || line.length < 3) return null;
    // Auto-close into a polygon ring
    const first = line[0];
    const last = line[line.length - 1];
    const ring = first[0] === last[0] && first[1] === last[1] ? line : [...line, first];
    if (validRing(ring)) return ring;
  }

  return null;
}

/** Walk GeoJSON structure to find the first Polygon or LineString geometry. */
function extractGeometry(
  obj: Record<string, unknown>
): { type: string; coordinates: unknown } | null {
  const type = obj.type as string | undefined;

  if (type === 'FeatureCollection') {
    const features = obj.features as Record<string, unknown>[] | undefined;
    if (!Array.isArray(features)) return null;
    for (const f of features) {
      const g = extractGeometry(f);
      if (g) return g;
    }
    return null;
  }

  if (type === 'Feature') {
    const geom = obj.geometry as Record<string, unknown> | undefined;
    if (!geom) return null;
    return extractGeometry(geom);
  }

  if (type === 'Polygon' || type === 'LineString') {
    return { type, coordinates: obj.coordinates };
  }

  return null;
}

/** Validate a ring has at least 3 coordinate pairs of [number, number]. */
function validRing(ring: unknown): ring is number[][] {
  if (!Array.isArray(ring) || ring.length < 3) return false;
  return ring.every(
    (p) => Array.isArray(p) && p.length >= 2 && typeof p[0] === 'number' && typeof p[1] === 'number'
  );
}

/**
 * Ray-casting point-in-polygon test.
 * @param point - [longitude, latitude]
 * @param ring  - Array of [longitude, latitude] pairs forming a closed polygon
 * @returns true if the point is inside the polygon
 */
export function pointInPolygon(point: [number, number], ring: number[][]): boolean {
  const [x, y] = point;
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0],
      yi = ring[i][1];
    const xj = ring[j][0],
      yj = ring[j][1];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

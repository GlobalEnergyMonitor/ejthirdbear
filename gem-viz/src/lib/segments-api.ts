/**
 * Segments API Client
 * Fetches pre-defined asset classes/segments from the GEM API
 */

const SEGMENTS_API_URL = 'https://gem-api.thirdbear.net/segments?format=json';

export interface Segment {
  id: string;
  name: string;
  description: string;
  asset_type: string;
  count: number;
  query: string;
  href: string;
}

export interface SegmentsResponse {
  segments: Segment[];
}

// Map our tracker slugs to API asset_type values
const trackerToAssetType: Record<string, string[]> = {
  'coal-plant': ['coal-plant'],
  'gas-plant': ['oil-gas-plant'],
  'coal-mine': ['coal-mine'],
  'iron-mine': ['iron-mine'],
  'steel-plant': ['steel-plant'],
  'gas-pipeline': ['gas-pipeline'],
  bioenergy: ['bioenergy'],
};

let cachedSegments: Segment[] | null = null;

/**
 * Fetch all segments from the API
 */
export async function fetchSegments(): Promise<Segment[]> {
  if (cachedSegments) {
    return cachedSegments;
  }

  try {
    const response = await fetch(SEGMENTS_API_URL);
    if (!response.ok) {
      throw new Error(`Failed to fetch segments: ${response.status}`);
    }
    const data: SegmentsResponse = await response.json();
    cachedSegments = data.segments;
    return cachedSegments;
  } catch (err) {
    if (import.meta.env.DEV) console.error('Error fetching segments:', err);
    return [];
  }
}

/**
 * Get segments relevant to a specific tracker
 */
export async function getSegmentsForTracker(trackerSlug: string): Promise<Segment[]> {
  const segments = await fetchSegments();
  const assetTypes = trackerToAssetType[trackerSlug] || [];

  if (assetTypes.length === 0) {
    return [];
  }

  return segments.filter((s) => assetTypes.includes(s.asset_type));
}

/**
 * Build a full API URL for a segment
 */
export function getSegmentApiUrl(segment: Segment): string {
  return `https://gem-api.thirdbear.net${segment.href}`;
}

/**
 * Build a screener URL for a segment (for our UI)
 */
export function getSegmentScreenerUrl(segment: Segment, baseUrl: string = ''): string {
  // Parse the query params from the href
  const url = new URL(`https://gem-api.thirdbear.net${segment.href}`);
  const params = new URLSearchParams();

  // Map API params to our screener params
  url.searchParams.forEach((value, key) => {
    if (key === 'asset_type') {
      // Map asset_type back to tracker name
      const trackerMap: Record<string, string> = {
        'coal-plant': 'Coal Plant',
        'oil-gas-plant': 'Gas Plant',
        'coal-mine': 'Coal Mine',
        'iron-mine': 'Iron Mine',
        'steel-plant': 'Steel Plant',
        'gas-pipeline': 'Gas Pipeline',
        bioenergy: 'Bioenergy Power',
      };
      params.set('tracker', trackerMap[value] || value);
    } else {
      params.set(key, value);
    }
  });

  return `${baseUrl}/screener/?${params.toString()}`;
}

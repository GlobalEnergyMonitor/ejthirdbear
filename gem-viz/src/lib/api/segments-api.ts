/**
 * Segments API Client
 * Fetches pre-defined asset classes/segments from the GEM API
 */

import { IDENTIFIER_TO_API_SLUG, URL_SLUG_TO_TRACKER } from '$lib/data-config/tracker-schema';
import { getAPIBase } from '$lib/ownership-api';

const getSegmentsUrl = () => `${getAPIBase()}/segments?format=json`;

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

// Map our tracker slugs to API asset_type values (derived from tracker-schema)
const trackerToAssetType: Record<string, string[]> = Object.fromEntries(
  Object.entries(IDENTIFIER_TO_API_SLUG)
    .filter(([key]) => key.includes('-') || key === 'bioenergy') // only slug-format keys
    .map(([slug, apiSlug]) => [slug, [apiSlug]])
);

let cachedSegments: Segment[] | null = null;

/**
 * Fetch all segments from the API
 */
export async function fetchSegments(): Promise<Segment[]> {
  if (cachedSegments) {
    return cachedSegments;
  }

  try {
    const response = await fetch(getSegmentsUrl());
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
  return `${getAPIBase()}${segment.href}`;
}

/**
 * Build a screener URL for a segment (for our UI)
 */
export function getSegmentScreenerUrl(segment: Segment, baseUrl: string = ''): string {
  // Parse the query params from the href
  const url = new URL(`${getAPIBase()}${segment.href}`);
  const params = new URLSearchParams();

  // Map API params to our screener params
  url.searchParams.forEach((value, key) => {
    if (key === 'asset_type') {
      // Map asset_type back to tracker name
      params.set('tracker', URL_SLUG_TO_TRACKER[value] || value);
    } else {
      params.set(key, value);
    }
  });

  return `${baseUrl}/screener/?${params.toString()}`;
}

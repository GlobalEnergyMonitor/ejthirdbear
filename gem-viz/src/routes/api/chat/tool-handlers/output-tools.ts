/**
 * Output generation tool handlers (screener URLs, maps).
 */

import { getEntity, getAsset, listAssets, resolveApiSlug } from '$lib/ownership-api';
import { type ToolArgs, type ToolResult, type ToolHandler } from './tool-utils';

async function generateScreenerUrl(args: ToolArgs): Promise<ToolResult> {
  const params = new URLSearchParams();
  const tracker = args.tracker as string;
  const status = args.status as string | undefined;
  const country = args.country as string | undefined;
  const userDesc = args.description as string | undefined;

  const filter: Record<string, string | undefined> = { tracker };
  if (status) filter.status = status;
  if (country) filter.geography = country;
  params.set('classes', JSON.stringify([filter]));

  const url = `/screener/results?${params.toString()}`;
  const desc =
    userDesc ||
    `Screener for ${tracker}${status ? ` (${status})` : ''}${country ? ` in ${country}` : ''}`;

  return {
    success: true,
    data: { url, description: desc, clickable: true },
  };
}

async function generateMap(args: ToolArgs): Promise<ToolResult> {
  const entityIds = (args.entity_ids as string[]) || [];
  const assetIds = (args.asset_ids as string[]) || [];
  const mapQuery = args.query as string | undefined;
  const mapTracker = args.tracker as string | undefined;
  const mapCountry = args.country as string | undefined;
  const title = args.title as string | undefined;
  const mapSlug = mapTracker ? resolveApiSlug(mapTracker) : null;

  if (entityIds.length === 0 && assetIds.length === 0 && !mapQuery && !mapTracker && !mapCountry) {
    return {
      success: false,
      error: 'Need entity_ids, asset_ids, or a search query/filter to generate a map',
    };
  }

  const mapFeatures: Array<{
    id: string;
    name: string;
    lat: number;
    lng: number;
    tracker: string;
    status: string;
    country: string;
    capacity: number | null;
    owner: string;
  }> = [];

  const seenIds = new Set<string>();

  // For entities: Get entity name, then search for assets by name
  for (const entityId of entityIds.slice(0, 3)) {
    try {
      const entity = await getEntity(entityId);
      const entityName = entity.name || entity.fullName;

      if (entityName) {
        const assetSearchResult = await listAssets({
          q: entityName,
          limit: 50,
        });

        for (const assetSummary of assetSearchResult.results) {
          if (seenIds.has(assetSummary.id)) continue;
          seenIds.add(assetSummary.id);

          if (assetSummary.latitude && assetSummary.longitude) {
            mapFeatures.push({
              id: assetSummary.id,
              name: assetSummary.name,
              lat: assetSummary.latitude,
              lng: assetSummary.longitude,
              tracker: assetSummary.facilityType || 'Unknown',
              status: assetSummary.status || 'unknown',
              country: assetSummary.country || 'Unknown',
              capacity: assetSummary.capacity,
              owner: assetSummary.ownerName || entityName,
            });
          } else {
            try {
              const asset = await getAsset(assetSummary.id);
              if (asset.latitude && asset.longitude) {
                mapFeatures.push({
                  id: asset.id,
                  name: asset.name,
                  lat: asset.latitude,
                  lng: asset.longitude,
                  tracker: asset.facilityType || 'Unknown',
                  status: asset.status || 'unknown',
                  country: asset.country || 'Unknown',
                  capacity: asset.capacity,
                  owner: asset.ownerName || entityName,
                });
              }
            } catch {
              // Skip assets we can't fetch
            }
          }
        }
      }
    } catch {
      // Entity fetch failed, skip
    }
  }

  // Query-based search
  if (mapQuery || (mapSlug && entityIds.length === 0 && assetIds.length === 0)) {
    try {
      const searchResult = await listAssets({
        q: mapQuery,
        asset_type: mapSlug ?? undefined,
        country: mapCountry,
        limit: 100,
      });
      for (const a of searchResult.results) {
        if (seenIds.has(a.id)) continue;
        seenIds.add(a.id);
        if (a.latitude && a.longitude) {
          mapFeatures.push({
            id: a.id,
            name: a.name,
            lat: a.latitude,
            lng: a.longitude,
            tracker: a.facilityType || 'Unknown',
            status: a.status || 'unknown',
            country: a.country || 'Unknown',
            capacity: a.capacity,
            owner: a.ownerName || 'Unknown',
          });
        }
      }
    } catch {
      /* skip */
    }
  }

  // Fetch specific assets by ID
  for (const assetId of assetIds.slice(0, 20)) {
    if (seenIds.has(assetId)) continue;
    seenIds.add(assetId);

    try {
      const asset = await getAsset(assetId);
      if (asset.latitude && asset.longitude) {
        mapFeatures.push({
          id: asset.id,
          name: asset.name,
          lat: asset.latitude,
          lng: asset.longitude,
          tracker: asset.facilityType || 'Unknown',
          status: asset.status || 'unknown',
          country: asset.country || 'Unknown',
          capacity: asset.capacity,
          owner: asset.ownerName || 'Unknown',
        });
      }
    } catch {
      // Asset not found, skip
    }
  }

  if (mapFeatures.length === 0) {
    return {
      success: true,
      data: {
        type: 'map',
        title: title || 'Asset Map',
        message:
          'No assets with coordinates found. Try searching for specific assets by name or ID.',
        features: [],
      },
    };
  }

  return {
    success: true,
    data: {
      type: 'map',
      title: title || `Assets (${mapFeatures.length} locations)`,
      features: mapFeatures,
      bounds: {
        minLat: Math.min(...mapFeatures.map((f) => f.lat)),
        maxLat: Math.max(...mapFeatures.map((f) => f.lat)),
        minLng: Math.min(...mapFeatures.map((f) => f.lng)),
        maxLng: Math.max(...mapFeatures.map((f) => f.lng)),
      },
    },
  };
}

export const outputHandlers: Record<string, ToolHandler> = {
  generate_screener_url: generateScreenerUrl,
  generate_map: generateMap,
};

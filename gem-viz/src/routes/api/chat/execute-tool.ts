/**
 * Gembot Tool Executor
 * Handles execution of tool calls from the chat API
 */

import {
  listEntities,
  getEntity,
  getEntityOwned,
  getEntityOwners,
  getOwnershipGraph,
  listAssets,
  getAsset,
} from '$lib/ownership-api';
import {
  getTopOwnersServer,
  getCountryBreakdownServer,
  getStatusDistributionServer,
  getTrackerStatsServer,
  getOwnerCountryBreakdownServer,
} from '$lib/server/motherduck';
import type { CartItem } from './tools';

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cart?: CartItem[]
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'search_entities': {
        const result = await listEntities({
          q: args.query as string,
          country: args.country as string | undefined,
          limit: (args.limit as number) || 10,
        });

        const entities = result.results.map((e) => ({
          id: e.id,
          name: e.name,
          fullName: e.fullName,
          headquartersCountry: e.headquartersCountry,
        }));

        return {
          success: true,
          data: {
            total: result.total,
            count: result.count,
            entities,
            bestMatch: null, // Haiku disambiguation removed for simplicity
          },
        };
      }

      case 'get_entity_details': {
        const entity = await getEntity(args.entity_id as string);
        return {
          success: true,
          data: {
            id: entity.id,
            name: entity.name,
            fullName: entity.fullName,
            headquartersCountry: entity.headquartersCountry,
            raw: entity.raw,
          },
        };
      }

      case 'get_entity_portfolio': {
        const owned = await getEntityOwned(args.entity_id as string);
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            subsidiaries: owned.map((o) => ({
              id: o.entityId,
              name: o.entityName,
              ownershipPct: o.ownershipPct,
            })),
            count: owned.length,
          },
        };
      }

      case 'get_entity_owners': {
        const owners = await getEntityOwners(args.entity_id as string);
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            owners: owners.map((o) => ({
              id: o.ownerEntityId,
              name: o.ownerName,
              ownershipPct: o.ownershipPct,
            })),
            count: owners.length,
          },
        };
      }

      case 'get_ownership_graph': {
        const graph = await getOwnershipGraph({
          root: args.root_id as string,
          direction: args.direction as 'up' | 'down',
          max_depth: (args.max_depth as number) || 5,
        });
        return {
          success: true,
          data: {
            root: graph.root,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            nodes: graph.nodes.slice(0, 50), // Limit for readability
            edges: graph.edges.slice(0, 100),
            truncated: graph.nodes.length > 50,
          },
        };
      }

      case 'search_assets': {
        const result = await listAssets({
          q: args.query as string | undefined,
          status: args.status as string | undefined,
          country: args.country as string | undefined,
          limit: (args.limit as number) || 20,
        });
        return {
          success: true,
          data: {
            total: result.total,
            count: result.count,
            assets: result.results.map((a) => ({
              id: a.id,
              name: a.name,
              type: a.facilityType,
              status: a.status,
              capacity: a.capacity,
              capacityUnit: a.capacityUnit,
              country: a.country,
              owner: a.ownerName,
            })),
          },
        };
      }

      case 'get_asset_details': {
        const asset = await getAsset(args.asset_id as string);
        return {
          success: true,
          data: {
            id: asset.id,
            name: asset.name,
            type: asset.facilityType,
            status: asset.status,
            capacity: asset.capacity,
            capacityUnit: asset.capacityUnit,
            country: asset.country,
            latitude: asset.latitude,
            longitude: asset.longitude,
            owner: asset.ownerName,
            ownerEntityId: asset.ownerEntityId,
            parent: asset.parentName,
            parentEntityId: asset.parentEntityId,
          },
        };
      }

      // === GLUE TOOLS ===

      case 'get_top_owners': {
        const result = await getTopOwnersServer({
          metric: (args.metric as 'assets' | 'capacity') || 'assets',
          tracker: args.tracker as string | null,
          limit: (args.limit as number) || 10,
        });
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch top owners' };
        }
        return {
          success: true,
          data: {
            metric: args.metric || 'assets',
            tracker: args.tracker || 'all',
            owners: result.data?.map((o) => ({
              name: o.owner_name,
              entityId: o.entity_id,
              value: o.value,
              assetCount: o.asset_count,
            })),
          },
        };
      }

      case 'get_top_owners_by_country': {
        const country = args.country as string;
        const tracker = args.tracker as string | undefined;
        const limit = (args.limit as number) || 10;

        // Use REST API to search assets by country (and optionally tracker in query)
        const searchQuery = tracker ? `${tracker}` : undefined;
        const assetsResult = await listAssets({
          q: searchQuery,
          country: country,
          limit: 200, // Get more to aggregate properly
        });

        if (assetsResult.count === 0) {
          return {
            success: true,
            data: {
              country,
              tracker: tracker || 'all',
              owners: [],
              message: `No assets found in ${country}${tracker ? ` for ${tracker}` : ''}`,
            },
          };
        }

        // Aggregate by owner
        const ownerCounts = new Map<string, { name: string; count: number; entityId: string | null }>();
        for (const asset of assetsResult.results) {
          const ownerName = asset.ownerName || 'Unknown';
          const existing = ownerCounts.get(ownerName);
          if (existing) {
            existing.count++;
          } else {
            ownerCounts.set(ownerName, {
              name: ownerName,
              count: 1,
              entityId: asset.ownerEntityId || null,
            });
          }
        }

        // Sort by count and take top N
        const sortedOwners = [...ownerCounts.values()]
          .sort((a, b) => b.count - a.count)
          .slice(0, limit);

        return {
          success: true,
          data: {
            country,
            tracker: tracker || 'all',
            totalAssetsSearched: assetsResult.count,
            owners: sortedOwners.map((o) => ({
              name: o.name,
              entityId: o.entityId,
              assetCount: o.count,
            })),
          },
        };
      }

      case 'get_country_breakdown': {
        const result = await getCountryBreakdownServer({
          tracker: args.tracker as string | null,
          limit: (args.limit as number) || 15,
        });
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch country breakdown' };
        }
        return {
          success: true,
          data: {
            tracker: args.tracker || 'all',
            countries: result.data?.map((c) => ({
              country: c.country,
              assetCount: c.asset_count,
              totalCapacity: c.total_capacity,
            })),
          },
        };
      }

      case 'get_status_breakdown': {
        const result = await getStatusDistributionServer(args.tracker as string | null);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch status breakdown' };
        }
        return {
          success: true,
          data: {
            tracker: args.tracker || 'all',
            statuses: result.data?.map((s) => ({
              status: s.status,
              count: s.count,
            })),
          },
        };
      }

      case 'get_tracker_summary': {
        const result = await getTrackerStatsServer();
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch tracker stats' };
        }
        return {
          success: true,
          data: {
            trackers: result.data?.map((t) => ({
              tracker: t.tracker,
              totalAssets: t.assetCount,
              totalCapacity: t.totalCapacity,
              operating: t.operatingCount,
              proposed: t.proposedCount,
            })),
          },
        };
      }

      case 'get_owner_geographic_footprint': {
        const result = await getOwnerCountryBreakdownServer(args.entity_id as string);
        if (!result.success) {
          return { success: false, error: result.error || 'Failed to fetch geographic footprint' };
        }
        return {
          success: true,
          data: {
            entityId: args.entity_id,
            countries: result.data?.map((c) => ({
              country: c.value,
              assetCount: c.count,
            })),
            totalCountries: result.data?.length || 0,
          },
        };
      }

      case 'compare_entities': {
        const entityIds = args.entity_ids as string[];
        if (!entityIds || entityIds.length < 2) {
          return { success: false, error: 'Need at least 2 entity IDs to compare' };
        }

        // Fetch data for each entity in parallel
        const comparisons = await Promise.all(
          entityIds.slice(0, 4).map(async (entityId) => {
            const [entity, portfolio, footprint] = await Promise.all([
              getEntity(entityId).catch(() => null),
              getEntityOwned(entityId).catch(() => []),
              getOwnerCountryBreakdownServer(entityId).catch(() => ({ success: true, data: [] })),
            ]);

            return {
              entityId,
              name: entity?.name || entityId,
              headquartersCountry: entity?.headquartersCountry,
              subsidiaryCount: portfolio.length,
              topSubsidiaries: portfolio.slice(0, 3).map((s) => s.entityName),
              geographicReach: footprint.data?.length || 0,
              topCountries: footprint.data?.slice(0, 3).map((c) => c.value) || [],
            };
          })
        );

        return {
          success: true,
          data: { comparisons },
        };
      }

      case 'find_common_owners': {
        // This is a complex query - we'll search for entities with assets in multiple countries
        const countries = args.countries as string[];
        const tracker = args.tracker as string | undefined;

        if (!countries || countries.length < 2) {
          return { success: false, error: 'Need at least 2 countries to find common owners' };
        }

        // For now, return a helpful message - this would need a custom SQL query
        return {
          success: true,
          data: {
            note: 'Cross-country owner analysis',
            countries,
            tracker: tracker || 'all',
            suggestion: `To find common owners across ${countries.join(' and ')}, try searching for major players in each country and comparing their portfolios.`,
          },
        };
      }

      case 'generate_screener_url': {
        const params = new URLSearchParams();
        const tracker = args.tracker as string;
        const status = args.status as string | undefined;
        const country = args.country as string | undefined;

        // Build the screener URL with filters
        const filters = [
          { tracker, field: null, operator: null, value: null, status, geography: country },
        ];
        params.set('classes', JSON.stringify(filters));

        const url = `/screener/results?${params.toString()}`;

        return {
          success: true,
          data: {
            url,
            description: `Screener for ${tracker}${status ? ` (${status})` : ''}${country ? ` in ${country}` : ''}`,
            clickable: true,
          },
        };
      }

      case 'generate_map': {
        const entityIds = (args.entity_ids as string[]) || [];
        const assetIds = (args.asset_ids as string[]) || [];
        const title = args.title as string | undefined;

        if (entityIds.length === 0 && assetIds.length === 0) {
          return { success: false, error: 'Need at least one entity_id or asset_id to generate a map' };
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
              message: 'No assets with coordinates found. Try searching for specific assets by name or ID.',
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
              minLat: Math.min(...mapFeatures.map(f => f.lat)),
              maxLat: Math.max(...mapFeatures.map(f => f.lat)),
              minLng: Math.min(...mapFeatures.map(f => f.lng)),
              maxLng: Math.max(...mapFeatures.map(f => f.lng)),
            },
          },
        };
      }

      // Cart tools - return instructions for client-side execution
      case 'get_investigation_cart': {
        const items = cart || [];
        const assetItems = items.filter((i) => i.type === 'asset');
        const entityItems = items.filter((i) => i.type === 'entity');
        return {
          success: true,
          data: {
            type: 'cart_read',
            action: 'get',
            total: items.length,
            assets: assetItems.map((i) => ({ id: i.id, name: i.name, tracker: i.tracker })),
            entities: entityItems.map((i) => ({ id: i.id, name: i.name })),
            summary: items.length === 0
              ? 'Cart is empty'
              : `${items.length} items: ${assetItems.length} assets, ${entityItems.length} entities`,
          },
        };
      }

      case 'add_to_cart': {
        const items = args.items as Array<{
          id: string;
          name: string;
          type: 'asset' | 'entity';
          tracker?: string;
          metadata?: { country?: string; status?: string; capacity?: number };
        }>;

        if (!items || items.length === 0) {
          return { success: false, error: 'No items provided to add' };
        }

        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'add',
            items,
            message: `Adding ${items.length} item(s) to investigation cart...`,
          },
        };
      }

      case 'remove_from_cart': {
        const ids = args.ids as string[];

        if (!ids || ids.length === 0) {
          return { success: false, error: 'No IDs provided to remove' };
        }

        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'remove',
            ids,
            message: `Removing ${ids.length} item(s) from investigation cart...`,
          },
        };
      }

      case 'clear_cart': {
        return {
          success: true,
          data: {
            type: 'cart_write',
            action: 'clear',
            message: 'Clearing investigation cart...',
          },
        };
      }

      default:
        return { success: false, error: `Unknown tool: ${name}` };
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: message };
  }
}

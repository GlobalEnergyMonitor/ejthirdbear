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
  resolveApiSlug,
} from '$lib/ownership-api';
import type { CartItem } from './tools';

const API_BASE =
  import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL ||
  import.meta.env.PUBLIC_OWNERSHIP_API_URL ||
  'https://gem-api.thirdbear.net';

/** Fetch JSON from API with error handling */
async function fetchApiJson(url: string): Promise<Record<string, unknown>> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }
  return response.json();
}

/** Clamp a numeric limit to a safe range */
function clampLimit(value: unknown, defaultVal: number, max: number): number {
  const n = typeof value === 'number' ? value : defaultVal;
  return Math.max(1, Math.min(n, max));
}

export async function executeTool(
  name: string,
  args: Record<string, unknown>,
  cart?: CartItem[]
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  try {
    switch (name) {
      case 'search_entities': {
        const result = await listEntities({
          q: String(args.query || ''),
          country: args.country as string | undefined,
          limit: clampLimit(args.limit, 10, 100),
        });

        const baseEntities = (result.results || []).filter(Boolean).map((e) => ({
          id: e.id,
          name: e.name,
          fullName: e.fullName,
          headquartersCountry: e.headquartersCountry,
          portfolioSize: undefined as number | undefined,
        }));

        // Optionally enrich with portfolio size
        if (args.include_portfolio && baseEntities.length <= 10) {
          await Promise.all(
            baseEntities.map(async (entity) => {
              try {
                const owned = await getEntityOwned(entity.id);
                entity.portfolioSize = owned.length;
              } catch {
                /* skip */
              }
            })
          );
        }

        return {
          success: true,
          data: {
            total: result.total,
            count: result.count,
            entities: baseEntities,
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
        const entityId = args.entity_id as string;
        const owned = await getEntityOwned(entityId);

        const data: Record<string, unknown> = {
          entityId,
          subsidiaries: owned.map((o) => ({
            id: o.entityId,
            name: o.entityName,
            ownershipPct: o.ownershipPct,
          })),
          subsidiaryCount: owned.length,
        };

        // Optionally search for physical assets
        if (args.include_assets) {
          try {
            const entity = await getEntity(entityId);
            const entityName = entity?.name || entity?.fullName;
            if (entityName) {
              const assetResult = await listAssets({ q: entityName, limit: 50 });
              const ownedAssets = assetResult.results.filter(
                (a) =>
                  a.owners?.some((o) => o.entityId === entityId) || a.ownerEntityId === entityId
              );
              data.assets = ownedAssets.map((a) => ({
                id: a.id,
                name: a.name,
                type: a.facilityType,
                status: a.status,
                country: a.country,
                capacity: a.capacity,
                capacityUnit: a.capacityUnit,
              }));
              data.assetCount = ownedAssets.length;
            }
          } catch {
            /* skip asset search on failure */
          }
        }

        return { success: true, data };
      }

      case 'get_entity_owners': {
        const entityId = args.entity_id as string;
        const owners = await getEntityOwners(entityId);

        const data: Record<string, unknown> = {
          entityId,
          directOwners: owners.map((o) => ({
            id: o.ownerEntityId,
            name: o.ownerName,
            ownershipPct: o.ownershipPct,
          })),
          count: owners.length,
        };

        // Optionally trace to ultimate parents
        if (args.include_ultimate && owners.length > 0) {
          try {
            const graph = await getOwnershipGraph({
              root: entityId,
              direction: 'up',
              max_depth: 10,
            });
            // Ultimate parents = nodes with no incoming "owned by" edges
            const childIds = new Set(graph.edges.map((e) => e.source));
            const ultimateParents = graph.nodes
              .filter((n) => n.id !== entityId && !childIds.has(n.id))
              .map((n) => ({ id: n.id, name: n.Name || n.id }));
            data.ultimateParents = ultimateParents;
          } catch {
            /* skip */
          }
        }

        return { success: true, data };
      }

      case 'get_ownership_graph': {
        const rootId = args.root_id as string;
        const direction = args.direction as string;
        const maxDepth = Math.min((args.max_depth as number) || 5, 10);

        if (direction === 'both') {
          // Fetch both directions and merge
          const [upGraph, downGraph] = await Promise.all([
            getOwnershipGraph({ root: rootId, direction: 'up', max_depth: maxDepth }),
            getOwnershipGraph({ root: rootId, direction: 'down', max_depth: maxDepth }),
          ]);
          const nodeMap = new Map<string, (typeof upGraph.nodes)[0]>();
          for (const n of [...upGraph.nodes, ...downGraph.nodes]) nodeMap.set(n.id, n);
          const edgeSet = new Set<string>();
          const allEdges = [...upGraph.edges, ...downGraph.edges].filter((e) => {
            const key = `${e.source}->${e.target}`;
            if (edgeSet.has(key)) return false;
            edgeSet.add(key);
            return true;
          });
          const allNodes = [...nodeMap.values()];
          return {
            success: true,
            data: {
              root: rootId,
              direction: 'both',
              nodeCount: allNodes.length,
              edgeCount: allEdges.length,
              nodes: allNodes.slice(0, 80),
              edges: allEdges.slice(0, 150),
              truncated: allNodes.length > 80,
            },
          };
        }

        const validDir = direction === 'down' ? 'down' : 'up';
        const graph = await getOwnershipGraph({
          root: rootId,
          direction: validDir,
          max_depth: maxDepth,
        });
        return {
          success: true,
          data: {
            root: graph.root,
            direction: validDir,
            nodeCount: graph.nodes.length,
            edgeCount: graph.edges.length,
            nodes: graph.nodes.slice(0, 50),
            edges: graph.edges.slice(0, 100),
            truncated: graph.nodes.length > 50,
          },
        };
      }

      case 'search_assets': {
        const tracker = args.tracker as string | undefined;
        const slug = tracker ? resolveApiSlug(tracker) : null;
        // Support both single and multi-value status/country
        const statusArr = Array.isArray(args.statuses)
          ? args.statuses
          : args.status
            ? [args.status]
            : undefined;
        const statuses = statusArr?.map((s: unknown) => String(s).toLowerCase());
        const countryArr = Array.isArray(args.countries)
          ? args.countries
          : args.country
            ? [args.country]
            : undefined;
        const countries = countryArr?.map((c: unknown) => String(c));
        const limit = clampLimit(args.limit, 20, 500);

        // Build query URL with multi-value support (duplicate params)
        const sp = new URLSearchParams();
        if (slug) sp.set('asset_type', slug);
        if (statuses) for (const s of statuses) sp.append('status', s);
        if (countries) for (const c of countries) sp.append('country', c);
        if (args.query) sp.set('q', String(args.query));
        sp.set('limit', String(limit));
        sp.set('format', 'json');

        // If facets requested, make a parallel faceted call
        let facetData: Record<string, unknown> | undefined;
        if (args.include_facets) {
          const facetSp = new URLSearchParams(sp);
          facetSp.set('facets', 'true');
          facetSp.set('limit', '1');
          try {
            const facetRaw = await fetchApiJson(`${API_BASE}/assets?${facetSp.toString()}`);
            facetData = facetRaw.facets as Record<string, unknown>;
          } catch {
            /* skip facets on error */
          }
        }

        const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
        const results = (raw.results as Array<Record<string, unknown>>) || [];

        return {
          success: true,
          data: {
            total: raw.total,
            count: raw.count,
            ...(facetData ? { facets: facetData } : {}),
            assets: results.slice(0, limit).map((a) => ({
              id: a.asset_id || a.gem_id || a.id,
              name: a.asset_name || a.name,
              type: a.asset_type || a.tracker,
              status: a.operating_status || a.status,
              capacity: a.capacity_value ?? a.capacity,
              capacityUnit: a.capacity_unit,
              country: a.country,
              latitude: a.latitude,
              longitude: a.longitude,
              owner: (a.owners as Array<Record<string, unknown>>)?.[0]?.name || null,
              owners: (a.owners as Array<Record<string, unknown>>)?.map((o) => ({
                name: o.name,
                entityId: o.entity_id,
                share: o.ownership_share,
                hqCountry: o.hq_country,
              })),
            })),
            filters: {
              tracker: tracker || 'all',
              statuses: statuses || [],
              countries: countries || [],
              query: args.query || null,
            },
          },
        };
      }

      case 'get_asset_details': {
        const asset = await getAsset(args.asset_id as string);
        const data: Record<string, unknown> = {
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
        };

        // Optionally trace ownership chain
        if (args.include_ownership_chain && asset.ownerEntityId) {
          try {
            const graph = await getOwnershipGraph({
              root: asset.ownerEntityId,
              direction: 'up',
              max_depth: 5,
            });
            data.ownershipChain = graph.nodes.slice(0, 20).map((n) => ({
              id: n.id,
              name: n.Name || n.id,
            }));
            data.ownershipEdges = graph.edges.slice(0, 30).map((e) => ({
              from: e.source,
              to: e.target,
              pct: e.value,
            }));
          } catch {
            /* skip */
          }
        }

        return { success: true, data };
      }

      // === GLUE TOOLS ===

      case 'get_top_owners': {
        const tracker = args.tracker as string | null;
        const limit = clampLimit(args.limit, 10, 50);
        const metric = (args.metric as string) === 'capacity' ? 'capacity' : 'assets';
        const slug = tracker ? resolveApiSlug(tracker) : null;

        // Sample up to 2000 assets and aggregate owners from owners[] array
        // (capped to avoid 30-90s tool calls on large trackers)
        const MAX_ASSETS = 2000;
        const BATCH = 500;
        const ownerMap = new Map<
          string,
          { name: string; entityId: string; assetCount: number; capacity: number }
        >();
        let totalScanned = 0;
        let totalAvailable = 0;

        let offset = 0;
        while (offset < MAX_ASSETS) {
          const page = await listAssets({
            limit: BATCH,
            offset,
            asset_type: slug ?? undefined,
          });
          totalAvailable = page.total;
          for (const asset of page.results) {
            if (asset.owners) {
              for (const owner of asset.owners) {
                if (!owner.entityId) continue;
                const existing = ownerMap.get(owner.entityId);
                if (existing) {
                  existing.assetCount++;
                  existing.capacity += asset.capacity || 0;
                } else {
                  ownerMap.set(owner.entityId, {
                    name: owner.name,
                    entityId: owner.entityId,
                    assetCount: 1,
                    capacity: asset.capacity || 0,
                  });
                }
              }
            }
          }
          totalScanned += page.results.length;
          offset += BATCH;
          if (page.results.length < BATCH) break;
        }

        const sorted = [...ownerMap.values()]
          .sort((a, b) =>
            metric === 'capacity' ? b.capacity - a.capacity : b.assetCount - a.assetCount
          )
          .slice(0, limit);

        return {
          success: true,
          data: {
            metric,
            tracker: tracker || 'all',
            sampled: totalScanned,
            totalAvailable,
            owners: sorted.map((o) => ({
              name: o.name,
              entityId: o.entityId,
              value: metric === 'capacity' ? o.capacity : o.assetCount,
              assetCount: o.assetCount,
            })),
            note:
              totalScanned < totalAvailable
                ? `Based on ${totalScanned.toLocaleString()} of ${totalAvailable.toLocaleString()} assets (sampled for speed)`
                : undefined,
          },
        };
      }

      case 'get_top_owners_by_country': {
        const country = args.country as string;
        const tracker = args.tracker as string | undefined;
        const status = args.status as string | undefined;
        const limit = clampLimit(args.limit, 10, 50);
        const slug = tracker ? resolveApiSlug(tracker) : null;

        // Fetch assets by country (and optionally tracker type and status)
        const assetsResult = await listAssets({
          country: country,
          asset_type: slug ?? undefined,
          status: status?.toLowerCase(),
          limit: 500,
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

        // Aggregate using owners[] array for complete coverage
        const ownerCounts = new Map<string, { name: string; count: number; entityId: string }>();
        for (const asset of assetsResult.results) {
          if (asset.owners && asset.owners.length > 0) {
            for (const owner of asset.owners) {
              if (!owner.entityId) continue;
              const existing = ownerCounts.get(owner.entityId);
              if (existing) {
                existing.count++;
              } else {
                ownerCounts.set(owner.entityId, {
                  name: owner.name,
                  count: 1,
                  entityId: owner.entityId,
                });
              }
            }
          } else if (asset.ownerName) {
            // Fallback to single owner field
            const key = asset.ownerEntityId || asset.ownerName;
            const existing = ownerCounts.get(key);
            if (existing) {
              existing.count++;
            } else {
              ownerCounts.set(key, {
                name: asset.ownerName,
                count: 1,
                entityId: asset.ownerEntityId || '',
              });
            }
          }
        }

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
        // Use facets for exact country counts, with optional cross-filters
        const tracker = args.tracker as string | null;
        const status = args.status as string | undefined;
        const limit = clampLimit(args.limit, 15, 200);
        const slug = tracker ? resolveApiSlug(tracker) : null;

        const sp = new URLSearchParams();
        if (slug) sp.set('asset_type', slug);
        if (status) sp.set('status', status.toLowerCase());
        sp.set('facets', 'true');
        sp.set('limit', '1');
        sp.set('format', 'json');

        const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
        const facets = raw.facets as Record<string, Record<string, number>> | undefined;
        const countryFacets = facets?.country || {};
        const countries = Object.entries(countryFacets)
          .map(([country, assetCount]) => ({ country, assetCount }))
          .sort((a, b) => b.assetCount - a.assetCount)
          .slice(0, limit);
        return {
          success: true,
          data: {
            tracker: tracker || 'all',
            status: status || 'all',
            total: raw.total,
            countries,
          },
        };
      }

      case 'get_status_breakdown': {
        // Use facets for exact status counts, with optional cross-filters
        const tracker = args.tracker as string | null;
        const country = args.country as string | undefined;
        const slug = tracker ? resolveApiSlug(tracker) : null;

        const sp = new URLSearchParams();
        if (slug) sp.set('asset_type', slug);
        if (country) sp.set('country', country);
        sp.set('facets', 'true');
        sp.set('limit', '1');
        sp.set('format', 'json');

        const raw = await fetchApiJson(`${API_BASE}/assets?${sp.toString()}`);
        const facets = raw.facets as Record<string, Record<string, number>> | undefined;
        const statusFacets = facets?.status || {};
        return {
          success: true,
          data: {
            tracker: tracker || 'all',
            country: country || 'all',
            total: raw.total,
            statuses: Object.entries(statusFacets)
              .map(([status, count]) => ({ status, count }))
              .sort((a, b) => b.count - a.count),
          },
        };
      }

      case 'get_tracker_summary': {
        // Use facets for exact counts — one call for totals, then per-type status breakdown
        const baseRaw = await fetchApiJson(`${API_BASE}/assets?facets=true&limit=1&format=json`);
        const baseFacets = baseRaw.facets as Record<string, Record<string, number>> | undefined;
        const typeFacets = baseFacets?.asset_type || {};
        const statusFacets = baseFacets?.status || {};

        // Slug mapping for per-type queries
        const slugMap: Record<string, string> = {
          'Coal Plant': 'coal-plant',
          'Oil & Gas Plant': 'oil-gas-plant',
          'Bioenergy Plant': 'bioenergy-plant',
          'Natural Gas Transmission Pipeline': 'gas-pipeline',
          'Cement or Concrete Plant': 'cement-plant',
          'Oil or NGL Pipeline': 'oil-pipeline',
          'Iron & Steel Plant': 'iron-steel-plant',
          'Iron Ore Mine': 'iron-ore-mine',
        };

        // Fetch per-type status breakdown for the top 4 types (parallel)
        const topTypes = Object.entries(typeFacets)
          .sort((a, b) => (b[1] as number) - (a[1] as number))
          .slice(0, 4);

        const perTypeStatus = await Promise.all(
          topTypes.map(async ([typeName]) => {
            const slug = slugMap[typeName];
            if (!slug) return { typeName, statuses: {} };
            const raw = await fetchApiJson(
              `${API_BASE}/assets?facets=true&limit=1&asset_type=${encodeURIComponent(slug)}&format=json`
            );
            const f = raw.facets as Record<string, Record<string, number>> | undefined;
            return { typeName, statuses: f?.status || {} };
          })
        );

        const trackers = Object.entries(typeFacets).map(([tracker, count]) => {
          const typeStatus = perTypeStatus.find((t) => t.typeName === tracker);
          return {
            tracker,
            totalAssets: count,
            operating: (typeStatus?.statuses as Record<string, number>)?.['operating'] || 0,
            retired: (typeStatus?.statuses as Record<string, number>)?.['retired'] || 0,
            proposed:
              ((typeStatus?.statuses as Record<string, number>)?.['proposed'] || 0) +
              ((typeStatus?.statuses as Record<string, number>)?.['announced'] || 0) +
              ((typeStatus?.statuses as Record<string, number>)?.['construction'] || 0),
          };
        });

        return {
          success: true,
          data: {
            trackers,
            totalAssets: baseRaw.total,
            statusSummary: statusFacets,
          },
        };
      }

      case 'get_owner_geographic_footprint': {
        const entityId = args.entity_id as string;
        const tracker = args.tracker as string | undefined;
        const slug = tracker ? resolveApiSlug(tracker) : null;
        // Get entity name, then search assets by that name to find their countries
        const entity = await getEntity(entityId);
        const entityName = entity?.name || entity?.fullName;
        if (!entityName) {
          return { success: false, error: `Entity ${entityId} not found` };
        }

        // Search assets associated with this entity
        const assetResult = await listAssets({
          q: entityName,
          asset_type: slug ?? undefined,
          limit: 500,
        });
        const countryMap = new Map<string, number>();

        for (const asset of assetResult.results) {
          // Check if this entity is actually an owner of this asset
          const isOwner =
            asset.owners?.some((o) => o.entityId === entityId) || asset.ownerEntityId === entityId;
          if (!isOwner) continue;

          const country = asset.country || 'Unknown';
          countryMap.set(country, (countryMap.get(country) || 0) + 1);
        }

        const countries = [...countryMap.entries()]
          .map(([country, assetCount]) => ({ country, assetCount }))
          .sort((a, b) => b.assetCount - a.assetCount);

        return {
          success: true,
          data: {
            entityId,
            entityName,
            countries,
            totalCountries: countries.length,
          },
        };
      }

      case 'compare_entities': {
        const entityIds = args.entity_ids as string[];
        const tracker = args.tracker as string | undefined;
        const slug = tracker ? resolveApiSlug(tracker) : null;
        if (!entityIds || entityIds.length < 2) {
          return { success: false, error: 'Need at least 2 entity IDs to compare' };
        }

        // Fetch data for each entity in parallel using REST API
        const comparisons = await Promise.all(
          entityIds.slice(0, 4).map(async (entityId) => {
            const [entity, portfolio] = await Promise.all([
              getEntity(entityId).catch(() => null),
              getEntityOwned(entityId).catch(() => []),
            ]);

            // Get geographic footprint via asset search
            let topCountries: string[] = [];
            let geographicReach = 0;
            let assetCount = 0;
            let totalCapacity = 0;
            const entityName = entity?.name || entity?.fullName;
            if (entityName) {
              const assetResult = await listAssets({
                q: entityName,
                asset_type: slug ?? undefined,
                limit: 200,
              }).catch(() => null);
              if (assetResult) {
                const countrySet = new Set<string>();
                for (const asset of assetResult.results) {
                  const isOwner =
                    asset.owners?.some((o) => o.entityId === entityId) ||
                    asset.ownerEntityId === entityId;
                  if (isOwner) {
                    assetCount++;
                    totalCapacity += asset.capacity || 0;
                    if (asset.country) countrySet.add(asset.country);
                  }
                }
                topCountries = [...countrySet].slice(0, 5);
                geographicReach = countrySet.size;
              }
            }

            return {
              entityId,
              name: entity?.name || entityId,
              headquartersCountry: entity?.headquartersCountry,
              subsidiaryCount: portfolio.length,
              topSubsidiaries: portfolio.slice(0, 3).map((s) => s.entityName),
              assetCount,
              totalCapacity: Math.round(totalCapacity),
              geographicReach,
              topCountries,
            };
          })
        );

        return {
          success: true,
          data: { comparisons },
        };
      }

      case 'find_common_owners': {
        const countries = args.countries as string[];
        const tracker = args.tracker as string | undefined;

        if (!countries || countries.length < 2) {
          return { success: false, error: 'Need at least 2 countries to find common owners' };
        }

        const slug = tracker ? resolveApiSlug(tracker) : null;

        // For each country, fetch assets and collect owners
        // ownerCountryMap: entityId → Set<country>
        const ownerInfo = new Map<
          string,
          { name: string; countries: Set<string>; totalAssets: number }
        >();

        for (const country of countries.slice(0, 4)) {
          const result = await listAssets({
            country,
            asset_type: slug ?? undefined,
            limit: 500,
          });
          for (const asset of result.results) {
            if (asset.owners) {
              for (const owner of asset.owners) {
                if (!owner.entityId) continue;
                const existing = ownerInfo.get(owner.entityId);
                if (existing) {
                  existing.countries.add(country);
                  existing.totalAssets++;
                } else {
                  ownerInfo.set(owner.entityId, {
                    name: owner.name,
                    countries: new Set([country]),
                    totalAssets: 1,
                  });
                }
              }
            }
          }
        }

        // Filter to owners present in ALL specified countries with min asset threshold
        const minAssets = Math.max(1, (args.min_assets as number) || 2);
        const commonOwners = [...ownerInfo.entries()]
          .filter(
            ([, info]) =>
              countries.every((c) => info.countries.has(c)) && info.totalAssets >= minAssets
          )
          .map(([entityId, info]) => ({
            entityId,
            name: info.name,
            countries: [...info.countries],
            totalAssets: info.totalAssets,
          }))
          .sort((a, b) => b.totalAssets - a.totalAssets)
          .slice(0, 20);

        return {
          success: true,
          data: {
            countries,
            tracker: tracker || 'all',
            commonOwners,
            count: commonOwners.length,
          },
        };
      }

      case 'generate_screener_url': {
        const params = new URLSearchParams();
        const tracker = args.tracker as string;
        const status = args.status as string | undefined;
        const country = args.country as string | undefined;
        const userDesc = args.description as string | undefined;

        // Build the screener URL with filters — only include non-null fields
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

      case 'generate_map': {
        const entityIds = (args.entity_ids as string[]) || [];
        const assetIds = (args.asset_ids as string[]) || [];
        const mapQuery = args.query as string | undefined;
        const mapTracker = args.tracker as string | undefined;
        const mapCountry = args.country as string | undefined;
        const title = args.title as string | undefined;
        const mapSlug = mapTracker ? resolveApiSlug(mapTracker) : null;

        if (
          entityIds.length === 0 &&
          assetIds.length === 0 &&
          !mapQuery &&
          !mapTracker &&
          !mapCountry
        ) {
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

        // Query-based search (when no specific IDs provided, or as supplement)
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
            summary:
              items.length === 0
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

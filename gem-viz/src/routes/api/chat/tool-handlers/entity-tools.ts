/**
 * Entity & ownership tool handlers.
 */

import {
  listEntities,
  getEntity,
  getEntityOwned,
  getEntityOwners,
  getOwnershipGraph,
  listAssets,
  resolveApiSlug,
} from '$lib/ownership-api';
import { clampLimit, type ToolArgs, type ToolResult, type ToolHandler } from './tool-utils';

async function searchEntities(args: ToolArgs): Promise<ToolResult> {
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

async function getEntityDetails(args: ToolArgs): Promise<ToolResult> {
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

async function getEntityPortfolio(args: ToolArgs): Promise<ToolResult> {
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

  if (args.include_assets) {
    try {
      const entity = await getEntity(entityId);
      const entityName = entity?.name || entity?.fullName;
      if (entityName) {
        const assetResult = await listAssets({ q: entityName, limit: 50 });
        const ownedAssets = assetResult.results.filter(
          (a) => a.owners?.some((o) => o.entityId === entityId) || a.ownerEntityId === entityId
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

async function getEntityOwnersHandler(args: ToolArgs): Promise<ToolResult> {
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

  if (args.include_ultimate && owners.length > 0) {
    try {
      const graph = await getOwnershipGraph({
        root: entityId,
        direction: 'up',
        max_depth: 10,
      });
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

async function getOwnershipGraphHandler(args: ToolArgs): Promise<ToolResult> {
  const rootId = args.root_id as string;
  const direction = args.direction as string;
  const maxDepth = Math.min((args.max_depth as number) || 5, 10);

  if (direction === 'both') {
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

async function compareEntities(args: ToolArgs): Promise<ToolResult> {
  const entityIds = args.entity_ids as string[];
  const tracker = args.tracker as string | undefined;
  const slug = tracker ? resolveApiSlug(tracker) : null;
  if (!entityIds || entityIds.length < 2) {
    return { success: false, error: 'Need at least 2 entity IDs to compare' };
  }

  const comparisons = await Promise.all(
    entityIds.slice(0, 4).map(async (entityId) => {
      const [entity, portfolio] = await Promise.all([
        getEntity(entityId).catch(() => null),
        getEntityOwned(entityId).catch(() => []),
      ]);

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

  return { success: true, data: { comparisons } };
}

async function findCommonOwners(args: ToolArgs): Promise<ToolResult> {
  const countries = args.countries as string[];
  const tracker = args.tracker as string | undefined;

  if (!countries || countries.length < 2) {
    return { success: false, error: 'Need at least 2 countries to find common owners' };
  }

  const slug = tracker ? resolveApiSlug(tracker) : null;
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

  const minAssets = Math.max(1, (args.min_assets as number) || 2);
  const commonOwners = [...ownerInfo.entries()]
    .filter(
      ([, info]) => countries.every((c) => info.countries.has(c)) && info.totalAssets >= minAssets
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

async function getOwnerGeographicFootprint(args: ToolArgs): Promise<ToolResult> {
  const entityId = args.entity_id as string;
  const tracker = args.tracker as string | undefined;
  const slug = tracker ? resolveApiSlug(tracker) : null;
  const entity = await getEntity(entityId);
  const entityName = entity?.name || entity?.fullName;
  if (!entityName) {
    return { success: false, error: `Entity ${entityId} not found` };
  }

  const assetResult = await listAssets({
    q: entityName,
    asset_type: slug ?? undefined,
    limit: 500,
  });
  const countryMap = new Map<string, number>();

  for (const asset of assetResult.results) {
    const isOwner =
      asset.owners?.some((o) => o.entityId === entityId) || asset.ownerEntityId === entityId;
    if (!isOwner) continue;
    const country = asset.country || 'Unknown';
    countryMap.set(country, (countryMap.get(country) || 0) + 1);
  }

  const resultCountries = [...countryMap.entries()]
    .map(([country, assetCount]) => ({ country, assetCount }))
    .sort((a, b) => b.assetCount - a.assetCount);

  return {
    success: true,
    data: {
      entityId,
      entityName,
      countries: resultCountries,
      totalCountries: resultCountries.length,
    },
  };
}

export const entityHandlers: Record<string, ToolHandler> = {
  search_entities: searchEntities,
  get_entity_details: getEntityDetails,
  get_entity_portfolio: getEntityPortfolio,
  get_entity_owners: getEntityOwnersHandler,
  get_ownership_graph: getOwnershipGraphHandler,
  compare_entities: compareEntities,
  find_common_owners: findCommonOwners,
  get_owner_geographic_footprint: getOwnerGeographicFootprint,
};

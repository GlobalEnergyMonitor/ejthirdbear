/**
 * Build-time relationship computation for asset pages
 *
 * Queries MotherDuck once per unique entity to build a complete
 * relationship graph that gets baked into static HTML.
 *
 * Zero runtime overhead. Pure static goodness.
 */

/**
 * Parse ownership path string into structured nodes
 *
 * Input: "Blackrock LLC -> BlackRock Inc [5.07%] -> RWE AG [6.3%] -> Asset [100%]"
 * Output: [
 *   { name: "Blackrock LLC", share: null },
 *   { name: "BlackRock Inc", share: 5.07 },
 *   { name: "RWE AG", share: 6.3 },
 *   { name: "Asset", share: 100 }
 * ]
 */
export function parseOwnershipPath(pathString) {
  if (!pathString) return [];

  const nodes = pathString.split(' -> ').map((node) => {
    const match = node.match(/^(.+?)(?: \[([0-9.]+)%\])?$/);
    return {
      name: match ? match[1].trim() : node.trim(),
      share: match && match[2] ? parseFloat(match[2]) : null,
    };
  });

  return nodes;
}

/**
 * Compute all relationships for a single asset
 *
 * Returns:
 * - sameOwnerAssets: Other assets owned by the same entity
 * - coLocatedAssets: Other assets at the same physical location
 * - ownershipChain: Parsed ownership hierarchy
 * - ownerStats: Portfolio summary for the owner entity
 */
export async function computeAssetRelationships(asset, motherduck, tableName) {
  const relationships = {
    sameOwnerAssets: [],
    coLocatedAssets: [],
    ownershipChain: [],
    ownerStats: null,
  };

  try {
    const ownerEntityId = asset['Owner GEM Entity ID'];
    const locationId = asset['GEM location ID'];
    const currentUnitId = asset['GEM unit ID'];

    // 1. Parse ownership chain
    if (asset['Ownership Path']) {
      relationships.ownershipChain = parseOwnershipPath(asset['Ownership Path']);
    }

    // 2. Query same owner assets (top 10 by capacity)
    if (ownerEntityId) {
      const sameOwnerQuery = `
        SELECT
          "Project",
          "GEM unit ID",
          "Owner GEM Entity ID",
          "Status",
          "Capacity (MW)",
          "Owner Headquarters Country" as "Country",
          "Tracker"
        FROM ${tableName}
        WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
          AND "GEM unit ID" != '${currentUnitId}'
        ORDER BY "Capacity (MW)" DESC NULLS LAST
        LIMIT 10
      `;

      const result = await motherduck.query(sameOwnerQuery);
      if (result.success) {
        relationships.sameOwnerAssets = result.data;
      }

      // Get owner portfolio stats
      const statsQuery = `
        SELECT
          COUNT(*) as total_assets,
          SUM(CAST("Capacity (MW)" AS DOUBLE)) as total_capacity_mw,
          COUNT(DISTINCT "Owner Headquarters Country") as countries,
          COUNT(DISTINCT "Tracker") as tracker_types
        FROM ${tableName}
        WHERE "Owner GEM Entity ID" = '${ownerEntityId}'
      `;

      const statsResult = await motherduck.query(statsQuery);
      if (statsResult.success && statsResult.data.length > 0) {
        relationships.ownerStats = statsResult.data[0];
      }
    }

    // 3. Query co-located assets (same physical location)
    if (locationId) {
      const coLocationQuery = `
        SELECT
          "Project",
          "GEM unit ID",
          "Owner GEM Entity ID",
          "Status",
          "Capacity (MW)",
          "Owner" as "Owner Name"
        FROM ${tableName}
        WHERE "GEM location ID" = '${locationId}'
          AND "GEM unit ID" != '${currentUnitId}'
        ORDER BY "Capacity (MW)" DESC NULLS LAST
      `;

      const result = await motherduck.query(coLocationQuery);
      if (result.success) {
        relationships.coLocatedAssets = result.data;
      }
    }
  } catch (error) {
    console.error(`Error computing relationships for ${asset['GEM unit ID']}:`, error);
  }

  return relationships;
}

/**
 * Build relationship cache for all assets
 *
 * Strategy: Group assets by owner entity, query once per entity,
 * then distribute results to all assets owned by that entity.
 *
 * This minimizes MotherDuck queries from O(n) to O(unique entities).
 */
export async function buildRelationshipCache(assets, motherduck, tableName) {
  console.log('\n🔗 Building relationship cache...');
  const startTime = Date.now();

  // Group assets by owner entity ID
  const assetsByOwner = new Map();
  const assetsByLocation = new Map();

  for (const [assetId, asset] of Object.entries(assets)) {
    const ownerEntityId = asset['Owner GEM Entity ID'];
    const locationId = asset['GEM location ID'];

    if (ownerEntityId) {
      if (!assetsByOwner.has(ownerEntityId)) {
        assetsByOwner.set(ownerEntityId, []);
      }
      assetsByOwner.get(ownerEntityId).push(assetId);
    }

    if (locationId) {
      if (!assetsByLocation.has(locationId)) {
        assetsByLocation.set(locationId, []);
      }
      assetsByLocation.get(locationId).push(assetId);
    }
  }

  console.log(`  📊 Unique owners: ${assetsByOwner.size}`);
  console.log(`  📍 Unique locations: ${assetsByLocation.size}`);

  const relationshipCache = {};

  // Query once per owner entity
  let queriesExecuted = 0;
  for (const [, assetIds] of assetsByOwner.entries()) {
    // Get one representative asset to use for the query
    const firstAsset = assets[assetIds[0]];

    // Compute relationships (this will query MotherDuck)
    const relationships = await computeAssetRelationships(
      firstAsset,
      motherduck,
      tableName
    );

    // Distribute results to all assets with this owner
    for (const assetId of assetIds) {
      const asset = assets[assetId];

      // Clone relationships and customize per asset
      relationshipCache[assetId] = {
        ...relationships,
        // Parse ownership chain per asset (varies by asset)
        ownershipChain: parseOwnershipPath(asset['Ownership Path']),
      };
    }

    queriesExecuted++;

    // Progress indicator
    if (queriesExecuted % 100 === 0) {
      console.log(`  ⏳ Processed ${queriesExecuted}/${assetsByOwner.size} owners...`);
    }
  }

  // Now add co-location data (separate pass to avoid complexity)
  for (const [locationId, assetIds] of assetsByLocation.entries()) {
    if (assetIds.length <= 1) continue; // Skip single-asset locations

    const coLocationQuery = `
      SELECT
        "Project",
        "GEM unit ID",
        "Owner" as "Owner Name",
        "Status",
        "Capacity (MW)"
      FROM ${tableName}
      WHERE "GEM location ID" = '${locationId}'
      ORDER BY "Capacity (MW)" DESC NULLS LAST
    `;

    const result = await motherduck.query(coLocationQuery);
    if (result.success) {
      // Add co-location data to all assets at this location
      for (const assetId of assetIds) {
        if (relationshipCache[assetId]) {
          // Filter out the current asset from co-located list
          relationshipCache[assetId].coLocatedAssets = result.data.filter(
            (a) => a['GEM unit ID'] !== assets[assetId]['GEM unit ID']
          );
        }
      }
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log(`  ✓ Built relationships in ${duration}s`);
  console.log(`  📦 Cache size: ${Object.keys(relationshipCache).length} assets`);

  return relationshipCache;
}

/**
 * Generate a compact relationship summary for embedding in HTML
 * Reduces cache size by omitting redundant data
 */
export function compactRelationships(relationships) {
  return {
    // Only keep essential fields for same owner assets
    so:
      relationships.sameOwnerAssets?.slice(0, 5).map((a) => ({
        p: a.Project,
        i: a['GEM unit ID'],
        s: a.Status,
        c: a['Capacity (MW)'],
        t: a.Tracker,
      })) || [],

    // Co-located assets
    cl:
      relationships.coLocatedAssets?.map((a) => ({
        p: a.Project,
        i: a['GEM unit ID'],
        s: a.Status,
        c: a['Capacity (MW)'],
        o: a['Owner Name'],
      })) || [],

    // Ownership chain
    oc:
      relationships.ownershipChain?.map((n) => ({
        n: n.name,
        s: n.share,
      })) || [],

    // Owner stats
    os: relationships.ownerStats
      ? {
          a: relationships.ownerStats.total_assets,
          c: relationships.ownerStats.total_capacity_mw,
          r: relationships.ownerStats.countries,
          t: relationships.ownerStats.tracker_types,
        }
      : null,
  };
}

/**
 * Expand compact relationships back to full format for rendering
 */
export function expandRelationships(compact) {
  return {
    sameOwnerAssets:
      compact.so?.map((a) => ({
        Project: a.p,
        'GEM unit ID': a.i,
        Status: a.s,
        'Capacity (MW)': a.c,
        Tracker: a.t,
      })) || [],

    coLocatedAssets:
      compact.cl?.map((a) => ({
        Project: a.p,
        'GEM unit ID': a.i,
        Status: a.s,
        'Capacity (MW)': a.c,
        'Owner Name': a.o,
      })) || [],

    ownershipChain:
      compact.oc?.map((n) => ({
        name: n.n,
        share: n.s,
      })) || [],

    ownerStats: compact.os
      ? {
          total_assets: compact.os.a,
          total_capacity_mw: compact.os.c,
          countries: compact.os.r,
          tracker_types: compact.os.t,
        }
      : null,
  };
}

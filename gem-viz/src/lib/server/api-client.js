/**
 * Runtime API client for SSR (Fly.io)
 * Fetches data directly from the ownership API
 * Includes server-side ID resolution for G-prefix IDs
 */

const API_BASE = 'https://gem-api.thirdbear.net';

/**
 * Resolve G-prefix ID to compound ID via /resolve/{id} API
 * @param {string} assetId
 * @returns {Promise<string>}
 */
async function resolveAssetId(assetId) {
  // Only resolve G-prefix IDs
  if (!assetId.startsWith('G') || assetId.includes('_')) {
    return assetId;
  }
  try {
    const res = await fetch(`${API_BASE}/resolve/${encodeURIComponent(assetId)}`, {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      const resolved = data.assets?.[0]?.asset_id;
      if (resolved) {
        console.log(`[Server ID] Resolved ${assetId} → ${resolved}`);
        return resolved;
      }
    }
  } catch {
    // API unavailable — return as-is
  }
  return assetId;
}

/**
 * Normalize raw API asset response to match client-side expected format
 * @param {Object} raw - Raw API response
 * @returns {Object} Normalized asset object
 */
function normalizeAsset(raw) {
  if (!raw) return null;
  return {
    id: raw.asset_id || raw.id || '',
    name: raw.asset_name || raw.name || '',
    facilityType: raw.asset_type || raw.facility_type || null,
    status: raw.operating_status || raw.status || null,
    capacity: raw.capacity_value ?? raw.capacity ?? null,
    capacityUnit: raw.capacity_unit || null,
    country: raw.country || null,
    latitude: raw.latitude ?? null,
    longitude: raw.longitude ?? null,
    ownerName: raw.owner_name || null,
    ownerEntityId: raw.owner_entity_id || null,
    parentName: raw.parent_name || null,
    parentEntityId: raw.parent_entity_id || null,
    raw,
  };
}

/**
 * Normalize ownership graph response to match client-side expected format
 * API returns: { nodes: [{asset_id, asset_name, ...}, {entity_id, name, ...}], edges: [...], paths: {...} }
 * Client expects: { nodes: [{id, Name, type, ...fullEntityData}], edges: [{source, target, value}], paths: {...} }
 * @param {Object} raw - Raw API graph response
 * @returns {Object} Normalized graph object
 */
function normalizeGraph(raw) {
  if (!raw) return { nodes: [], edges: [], paths: {} };

  const nodes = (raw.nodes || []).map((node) => {
    const isAsset = node.node_type === 'asset' || node.asset_id;
    return {
      // Core identifiers
      id: node.asset_id || node.entity_id || node.id || '',
      entity_id: node.entity_id || null,
      Name: node.asset_name || node.name || node.full_name || '',
      name: node.asset_name || node.name || node.full_name || '',
      full_name: node.full_name || node.name || '',
      // Type info
      type: isAsset ? 'asset' : 'entity',
      node_type: node.node_type || (isAsset ? 'asset' : 'entity'),
      entity_type: node.entity_type || null,
      // Graph position
      is_root: node.is_root,
      is_terminal: node.is_terminal,
      // Entity metadata (for summary tables)
      headquarters_country: node.headquarters_country || node.hq_country || null,
      registration_country: node.registration_country || null,
      publiclylisted: node.publiclylisted || node.publicly_listed || false,
      legal_entity_type: node.legal_entity_type || null,
    };
  });

  const edges = (raw.edges || []).map((edge) => ({
    source: edge.source,
    target: edge.target,
    value: edge.value ?? edge.ownership_percentage ?? null,
    type: edge.type,
    depth: edge.depth,
    imputed_share: edge.imputed_share || false,
  }));

  // Pass through paths data for cumulative ownership calculations
  // API returns: { "E123": [{ cumulative_pct: 20.5, route: [...] }, ...], ... }
  const paths = raw.paths || {};

  return { nodes, edges, paths, root: raw.root };
}

async function fetchJSON(path, timeout = 30000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    const res = await fetch(`${API_BASE}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timeoutId);
    if (!res.ok) throw new Error(`API error: ${res.status}`);
    return res.json();
  } catch (err) {
    clearTimeout(timeoutId);
    throw err;
  }
}

export async function fetchAssetData(assetId) {
  try {
    // Resolve G-prefix to compound ID
    const resolvedId = await resolveAssetId(assetId);

    const [rawAsset, rawGraph] = await Promise.all([
      fetchJSON(`/assets/${encodeURIComponent(resolvedId)}`),
      fetchJSON(
        `/ownership/graph?root=${encodeURIComponent(resolvedId)}&direction=up`
      ),
    ]);
    // Normalize to match client-side expected format
    const asset = normalizeAsset(rawAsset);
    const graph = normalizeGraph(rawGraph);
    return { asset, graph, success: true };
  } catch (err) {
    console.error(`[API] Failed to fetch asset ${assetId}:`, err.message);
    return { asset: null, graph: null, success: false, error: err.message };
  }
}

export async function fetchEntityData(entityId) {
  try {
    const [entity, owners, owned] = await Promise.all([
      fetchJSON(`/entities/${encodeURIComponent(entityId)}`),
      fetchJSON(`/entities/${encodeURIComponent(entityId)}/owners`),
      fetchJSON(`/entities/${encodeURIComponent(entityId)}/owned`),
    ]);
    return { entity, owners, owned, success: true };
  } catch (err) {
    console.error(`[API] Failed to fetch entity ${entityId}:`, err.message);
    return { entity: null, owners: null, owned: null, success: false, error: err.message };
  }
}

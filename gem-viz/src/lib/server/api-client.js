/**
 * Runtime API client for Cloudflare Workers (no fs access)
 * Fetches data directly from the ownership API
 */

const API_BASE = 'https://gem-ownership-api.fly.dev';

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
    const [asset, graph] = await Promise.all([
      fetchJSON(`/assets/${encodeURIComponent(assetId)}`),
      fetchJSON(`/ownership/graph?root=${encodeURIComponent(assetId)}&direction=up&max_depth=12`),
    ]);
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

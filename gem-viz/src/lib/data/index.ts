/**
 * Data Layer - Central Hub
 * =========================
 *
 * All data fetching flows through the REST API.
 *
 * ```typescript
 * import { getAsset, listAssets } from '$lib/data';
 * ```
 */

// =============================================================================
// REST API CLIENT
// =============================================================================

export {
  // Entity operations
  listEntities,
  getEntity,
  getEntityOwners,
  getEntityOwned,
  getEntityGraphUp,
  getEntityGraphDown,
  // Asset operations
  listAssets,
  getAsset,
  // Universal graph
  getOwnershipGraph,
  // ID resolution
  resolveAssetId,
  // Types
  type EntitySummary,
  type AssetSummary,
  type DirectOwnership,
  type DirectOwned,
  type GraphNode,
  type GraphEdge,
  type OwnershipGraphResponse,
  type EntityGraphResponse,
  type PaginatedResponse,
} from '$lib/ownership-api';

// =============================================================================
// SMART ASSET FETCHER
// =============================================================================

export {
  fetchAssetData,
  type AssetDataResult,
} from '$lib/asset-data';

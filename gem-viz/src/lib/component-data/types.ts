/**
 * GEM Viz Component Data Types
 *
 * These interfaces define the data contracts for visualization components.
 * Backend implementations should return data matching these shapes.
 *
 * Reference: Observable notebooks bdcdb445752833fa and 32dcab6db3a0f0b6
 */

// =============================================================================
// Common Types
// =============================================================================

export interface GEMAsset {
  id: string; // GEM unit ID (e.g., "G100001057899")
  name: string; // Project/Plant/Mine name
  project?: string; // Project name (may differ from unit name)
  status?: string; // Operating, Retired, Construction, etc.
  tracker?: string; // GCPT, GGIT, etc.
  capacityMw?: number;
  locationId?: string; // GEM location ID
  ownerEntityId?: string; // Owner's entity ID
  country?: string;
  lat?: number;
  lon?: number;
  share?: number; // Ownership percentage
}

export interface GEMEntity {
  id: string; // Entity ID (e.g., "E100000000834")
  Name: string;
  type?: 'entity' | 'asset';
}

export interface OwnershipEdge {
  source: string; // Parent entity ID
  target: string; // Child entity/asset ID
  value: number | null; // Ownership percentage (0-100)
  depth?: number; // Distance from asset
  type?: 'intermediateEdge' | 'leafEdge';
  refUrl?: string | null;
  imputedShare?: boolean;
}

// =============================================================================
// Component Data Interfaces
// =============================================================================

/** AssetMap component data */
export interface AssetMapData {
  assetId: string;
  name: string;
  lat: number | null;
  lon: number | null;
  locationId?: string;
}

/** RelationshipNetwork component data (from getAssetOwners) */
export interface AssetOwnersData {
  assetId: string;
  assetName: string;
  edges: OwnershipEdge[];
  nodes: GEMEntity[];
  immediateOwners: unknown[];
  parentOwners: unknown[];
  allEntityIds: string[];
}

/** OwnershipHierarchy / MermaidOwnership component data */
export interface OwnershipPathData {
  assetId: string;
  assetName: string;
  edges: OwnershipEdge[];
  nodes: Array<{ id: string; Name: string }>;
}

/** AssetScreener / OwnershipChart / OwnershipExplorer (from getSpotlightOwnerData) */
export interface SpotlightOwnerData {
  spotlightOwner: GEMEntity;
  subsidiariesMatched: Map<string, GEMAsset[]>;
  directlyOwned: GEMAsset[];
  assets: GEMAsset[];
  entityMap: Map<string, GEMEntity>;
  matchedEdges: Map<string, { value: number | null }>;
  assetClassName: string;
}

/** NetworkGraph component data */
export interface NetworkGraphData {
  edges: Array<{
    'Owner Entity ID': string;
    'GEM unit ID': string;
    'Share (%)'?: number | null;
    Owner?: string;
  }>;
}

/** SimpleMap GeoJSON data */
export interface MapPointsFeature {
  type: 'Feature';
  geometry: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  properties: {
    id: string;
    name: string;
    status?: string;
    tracker?: string;
    capacity_mw?: number;
  };
}

export interface MapPointsData {
  type: 'FeatureCollection';
  features: MapPointsFeature[];
}

// =============================================================================
// Query Result Types
// =============================================================================

export interface QueryResult<T> {
  success: boolean;
  data?: T[];
  error?: string;
  executionTime?: number;
  rowCount?: number;
}

// =============================================================================
// Re-exports from ownership-data.ts for convenience
// =============================================================================

// These are re-exported for backward compatibility (excluding OwnershipEdge which is defined above)
export type { EntityNode } from '$lib/ownership-data';

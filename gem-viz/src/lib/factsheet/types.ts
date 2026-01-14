/**
 * Shared types for factsheet and project card components
 */

/** Asset data structure used across project cards */
export interface Asset {
  id: string;
  name: string;
  unitName?: string;
  status: string;
  capacity?: number;
  capacityUnit?: string;
  capacityFactor?: number;
  country?: string;
  state?: string;
  location?: string;
  lat?: number;
  lon?: number;
  owner?: string;
  parent?: string;
  startYear?: number;
  plannedRetirement?: number;
  remainingLifetime?: number;
  plantAge?: number;
  annualCO2?: number;
  lifetimeCO2?: number;
  heatRate?: number;
  technology?: string;
  coalType?: string;
  mineType?: string;
  miningMethod?: string;
  production?: number;
  productionUnit?: string;
  wikiUrl?: string;
  tracker?: string;
  database?: string;
}

/** Percentile data for capacity comparisons */
export interface PercentileData {
  global: number;
  country: number;
}

/** Field metadata from tracker CSV */
export interface FieldInfo {
  columnName: string;
  category: string;
  definition: string;
  fieldValue?: string | null;
  valueDefinition?: string | null;
}

/** Field distribution statistics */
export interface FieldStats {
  value: string | number | null;
  count: number;
}

/** Status groupings for badge colors */
export const STATUS_GROUPS: Record<string, string> = {
  announced: 'planned',
  'pre-permit': 'planned',
  permitted: 'planned',
  construction: 'planned',
  proposed: 'planned',
  cancelled: 'cancelled',
  shelved: 'cancelled',
  operating: 'operating',
  mothballed: 'retired',
  retired: 'retired',
} as const;

/** Get status group for an asset status */
export function getStatusGroup(status: string | undefined): string {
  if (!status) return 'unknown';
  return STATUS_GROUPS[status.toLowerCase()] || 'unknown';
}

/** Check if asset is a mine based on tracker or fields */
export function isMineAsset(asset: Partial<Asset>): boolean {
  return (
    asset.tracker?.toLowerCase().includes('mine') === true ||
    asset.mineType != null ||
    asset.miningMethod != null
  );
}

/** Category display order for factsheet */
export const CATEGORIES_ORDERED = [
  'IDs',
  'Names',
  'Geography',
  'Main',
  'Size',
  'Age',
  'Details',
  'Reference',
  'Ownership',
  'End users',
  'Methane',
] as const;

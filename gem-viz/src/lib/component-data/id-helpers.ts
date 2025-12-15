/**
 * Centralized ID helpers for GEM Viz
 *
 * Single source of truth for asset ID resolution across all components.
 * GEM Unit ID is the canonical asset identifier for URLs and lookups.
 *
 * Integrates with tracker-config for tracker-specific ID field mappings.
 * See also: $lib/data-config for comprehensive tracker metadata.
 */

import { getTrackerConfig } from '$lib/data-config';

// Column name constants (lowercase for comparison)
export const ID_COLUMNS = {
  GEM_UNIT_ID: 'gem unit id',
  GEM_ENTITY_ID: 'gem entity id',
  OWNER_ENTITY_ID: 'owner gem entity id',
  PROJECT_ID: 'project id',
  WIKI_PAGE: 'wiki page',
} as const;

// Priority order for finding asset ID columns
const ASSET_ID_PRIORITIES = [
  'gem unit id',
  'gem_unit_id',
  'id',
  'wiki page',
  'project id',
];

// Priority order for finding name columns
const NAME_PRIORITIES = ['project', 'unit name', 'plant', 'mine', 'facility', 'name'];

/**
 * Find the best ID column from available columns
 * Prefers GEM Unit ID, falls back to other ID patterns
 */
export function findIdColumn(cols: string[]): string | null {
  const lower = cols.map((c) => c.toLowerCase());

  for (const p of ASSET_ID_PRIORITIES) {
    const idx = lower.indexOf(p);
    if (idx !== -1) return cols[idx];
  }

  // Fallback to anything containing "_id"
  const idCol = cols.find((c) => c.toLowerCase().includes('_id'));
  return idCol || cols[0] || null;
}

/**
 * Find the GEM Unit ID column specifically (for asset URLs)
 */
export function findUnitIdColumn(cols: string[]): string | null {
  const lower = cols.map((c) => c.toLowerCase());
  const idx = lower.indexOf(ID_COLUMNS.GEM_UNIT_ID);
  return idx !== -1 ? cols[idx] : null;
}

/**
 * Find the Owner Entity ID column (for ownership relationships)
 */
export function findOwnerEntityIdColumn(cols: string[]): string | null {
  return cols.find((c) => {
    const lower = c.toLowerCase();
    return lower.includes('owner') && lower.includes('entity') && lower.includes('id');
  }) || null;
}

/**
 * Find the best name column from available columns
 */
export function findNameColumn(cols: string[]): string | null {
  const lower = cols.map((c) => c.toLowerCase());

  for (const p of NAME_PRIORITIES) {
    const idx = lower.indexOf(p);
    if (idx !== -1) return cols[idx];
  }

  return null;
}

/**
 * Find common columns in a schema
 * Returns an object with resolved column names (or null if not found)
 */
export function findCommonColumns(cols: string[]): {
  idCol: string | null;
  unitIdCol: string | null;
  nameCol: string | null;
  statusCol: string | null;
  ownerCol: string | null;
  countryCol: string | null;
  trackerCol: string | null;
  ownerEntityIdCol: string | null;
} {
  const lower = cols.map((c) => c.toLowerCase());

  return {
    idCol: findIdColumn(cols),
    unitIdCol: findUnitIdColumn(cols),
    nameCol: findNameColumn(cols),
    statusCol: cols[lower.indexOf('status')] || null,
    ownerCol: cols.find((c) => {
      const l = c.toLowerCase();
      return l === 'owner' || l === 'parent';
    }) || null,
    countryCol: cols.find((c) => {
      const l = c.toLowerCase();
      return l === 'country' || l === 'country/area';
    }) || null,
    trackerCol: cols[lower.indexOf('tracker')] || null,
    ownerEntityIdCol: findOwnerEntityIdColumn(cols),
  };
}

/**
 * Extract the asset ID from a data row
 * Always prefers GEM Unit ID for URL generation
 */
export function getAssetId(
  row: Record<string, unknown>,
  cols: { unitIdCol?: string | null; idCol?: string | null }
): string | null {
  const { unitIdCol, idCol } = cols;

  // Prefer GEM Unit ID
  if (unitIdCol && row[unitIdCol]) {
    return String(row[unitIdCol]);
  }

  // Fallback to generic ID column
  if (idCol && row[idCol]) {
    return String(row[idCol]);
  }

  return null;
}

/**
 * Extract the entity ID from a data row (for owners/entities)
 */
export function getEntityId(
  row: Record<string, unknown>,
  cols: { ownerEntityIdCol?: string | null; idCol?: string | null }
): string | null {
  const { ownerEntityIdCol, idCol } = cols;

  if (ownerEntityIdCol && row[ownerEntityIdCol]) {
    return String(row[ownerEntityIdCol]);
  }

  if (idCol && row[idCol]) {
    return String(row[idCol]);
  }

  return null;
}

/**
 * Extract asset name from a record using common field names
 */
export function extractAssetName(record: Record<string, unknown>, fallback: string): string {
  return (
    (record['Project'] as string) ||
    (record['Unit Name'] as string) ||
    (record['Plant'] as string) ||
    (record['Mine'] as string) ||
    (record['Name'] as string) ||
    fallback
  );
}

/**
 * Check if a string looks like a composite ID (E..._G...)
 */
export function isCompositeId(id: string): boolean {
  return /^E\d+_G\d+$/.test(id);
}

/**
 * Extract GEM Unit ID from a composite ID if present
 * Returns the original ID if not composite
 */
export function extractUnitIdFromComposite(id: string): string {
  if (isCompositeId(id)) {
    const parts = id.split('_');
    return parts[1]; // Return the G... part
  }
  return id;
}

/**
 * Build the canonical asset URL path
 * Always uses bare GEM Unit ID format: /asset/G100001057899
 */
export function assetPath(id: string): string {
  const cleanId = extractUnitIdFromComposite(id);
  return `/asset/${cleanId}`;
}

/**
 * Build the canonical entity URL path
 */
export function entityPath(id: string): string {
  return `/entity/${id}`;
}

/**
 * Get the ID field name for a specific tracker using tracker-config
 * This is the canonical way to find the primary ID field for a tracker
 *
 * Usage:
 *   const idField = getIdFieldForTracker('Coal Plant');
 *   // Returns: 'GEM unit ID'
 */
export function getIdFieldForTracker(trackerName: string): string | null {
  const config = getTrackerConfig(trackerName);
  return config?.idField || null;
}

/**
 * Extract asset ID using tracker-specific configuration
 * Falls back to generic ID extraction if tracker config not found
 *
 * Usage:
 *   const id = extractAssetIdByTracker('Coal Plant', coalPlantRow);
 *   // Uses 'GEM unit ID' field from tracker config
 */
export function extractAssetIdByTracker(
  trackerName: string,
  record: Record<string, unknown>
): string | null {
  const config = getTrackerConfig(trackerName);

  if (config && config.idField in record) {
    return (record[config.idField] as string) || null;
  }

  // Fallback to generic ID extraction using priority list
  const recordKeys = Object.keys(record);
  const lowerKeys = recordKeys.map((k) => k.toLowerCase());

  for (const idField of ASSET_ID_PRIORITIES) {
    const idx = lowerKeys.indexOf(idField);
    if (idx !== -1 && record[recordKeys[idx]]) {
      return String(record[recordKeys[idx]]);
    }
  }

  return null;
}

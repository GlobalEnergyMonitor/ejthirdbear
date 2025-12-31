/**
 * ============================================================================
 * GEM VIZ ID HELPERS
 * ============================================================================
 *
 * This module is the single source of truth for ALL ID handling in GEM Viz.
 *
 * There are TWO distinct ID systems in play:
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 1. GEM DATABASE IDS                                                     │
 * │    - Assigned by Global Energy Monitor's database                       │
 * │    - Prefixed: G (assets), E (entities), plus tracker-specific IDs      │
 * │    - Examples: G100000109409, E100001000348, ProjectID-12345            │
 * │    - Used for: URLs, database lookups, cross-referencing                │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 2. SANITIZED GRAPH IDS                                                  │
 * │    - Generated from entity/company NAMES for visualization              │
 * │    - Format: alphanumeric + underscore + 4-char hash suffix             │
 * │    - Examples: BlackRock_Inc_7k2m, RWE_AG_a3f9                          │
 * │    - Used for: Ownership graphs, Mermaid diagrams, D3 visualizations    │
 * └─────────────────────────────────────────────────────────────────────────┘
 *
 * WHY TWO SYSTEMS?
 * ----------------
 * GEM IDs only exist for tracked entities with database records. But ownership
 * paths mention many intermediate companies that aren't in the GEM database.
 * For example:
 *
 *   "Vanguard Group [5%] -> BlackRock Inc [10%] -> RWE AG [100%] -> Asset"
 *
 * Here, "Vanguard Group" might not have a GEM Entity ID, but we still need
 * a stable identifier for it in our ownership visualizations. That's where
 * sanitized graph IDs come in - they're derived from the name itself.
 *
 * COLLISION PREVENTION
 * --------------------
 * The sanitizeId() function uses a hash suffix to prevent collisions:
 *
 *   - Without hash: "ABC Corp." and "ABC Corp" both become "ABC_Corp_"
 *   - With hash:    "ABC Corp." -> "ABC_Corp__a1b2", "ABC Corp" -> "ABC_Corp_c3d4"
 *
 * This matters because ownership paths often contain slight variations of
 * company names, and we need each unique name to have a unique ID.
 *
 * ============================================================================
 */

import { getTrackerConfig } from '$lib/data-config';

// ============================================================================
// PART 1: GEM DATABASE ID SYSTEM
// ============================================================================

/**
 * GEM uses specific column names for different ID types.
 * These are the canonical lowercase versions for comparison.
 *
 * ID PREFIXES:
 *   G - Asset/Unit IDs (e.g., G100000109409)
 *   E - Entity IDs for owners/companies (e.g., E100001000348)
 *
 * TRACKER-SPECIFIC IDS:
 *   Some trackers use their own ID schemes:
 *   - Coal/Gas/Bioenergy Plants: "GEM unit ID" (G-prefix)
 *   - Coal Mines: "GEM Mine ID"
 *   - Iron Mines: "GEM Asset ID"
 *   - Gas Pipelines: "ProjectID"
 *   - Steel Plants: "Steel Plant ID"
 */
export const ID_COLUMNS = {
  GEM_UNIT_ID: 'gem unit id',
  GEM_ENTITY_ID: 'gem entity id',
  OWNER_ENTITY_ID: 'owner gem entity id',
  PROJECT_ID: 'project id',
  WIKI_PAGE: 'wiki page',
} as const;

/**
 * When searching for an asset's ID column, we check these in order.
 * GEM Unit ID is preferred as it's the most universal across trackers.
 */
const ASSET_ID_PRIORITIES = ['gem unit id', 'gem_unit_id', 'id', 'wiki page', 'project id'];

/**
 * When searching for an asset's display name, we check these columns in order.
 * Different trackers use different naming conventions.
 */
const NAME_PRIORITIES = ['project', 'unit name', 'plant', 'mine', 'facility', 'name'];

/**
 * Find the best ID column from a list of available columns.
 *
 * Use this when you have a schema and need to determine which column
 * contains the primary asset identifier.
 *
 * @example
 * const cols = ['Name', 'GEM Unit ID', 'Status', 'Country'];
 * const idCol = findIdColumn(cols);
 * // Returns: 'GEM Unit ID'
 */
export function findIdColumn(cols: string[]): string | null {
  const lower = cols.map((c) => c.toLowerCase());

  for (const p of ASSET_ID_PRIORITIES) {
    const idx = lower.indexOf(p);
    if (idx !== -1) return cols[idx];
  }

  // Fallback: anything containing "_id" (e.g., "project_id", "asset_id")
  const idCol = cols.find((c) => c.toLowerCase().includes('_id'));
  return idCol || cols[0] || null;
}

/**
 * Find the GEM Unit ID column specifically.
 *
 * This is the canonical asset identifier used in URLs: /asset/G100000109409
 * Returns null if the schema doesn't have this column (rare, but possible
 * for some tracker types).
 */
export function findUnitIdColumn(cols: string[]): string | null {
  const lower = cols.map((c) => c.toLowerCase());
  const idx = lower.indexOf(ID_COLUMNS.GEM_UNIT_ID);
  return idx !== -1 ? cols[idx] : null;
}

/**
 * Find the Owner Entity ID column.
 *
 * This links assets to their owning entities. The column name varies slightly
 * across datasets ("Owner GEM Entity ID", "owner_entity_id", etc.) so we
 * match on the presence of all three keywords: "owner", "entity", and "id".
 */
export function findOwnerEntityIdColumn(cols: string[]): string | null {
  return (
    cols.find((c) => {
      const lower = c.toLowerCase();
      return lower.includes('owner') && lower.includes('entity') && lower.includes('id');
    }) || null
  );
}

/**
 * Find the best name/display column from available columns.
 *
 * Different trackers use different naming conventions:
 * - Coal/Gas Plants: "Project" or "Unit Name"
 * - Mines: "Mine"
 * - Steel Plants: "Plant"
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
 * Find all common columns in a schema at once.
 *
 * This is more efficient than calling individual find functions when you
 * need multiple column mappings.
 *
 * @returns Object with resolved column names (null if not found)
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
    ownerCol:
      cols.find((c) => {
        const l = c.toLowerCase();
        return l === 'owner' || l === 'parent';
      }) || null,
    countryCol:
      cols.find((c) => {
        const l = c.toLowerCase();
        return l === 'country' || l === 'country/area';
      }) || null,
    trackerCol: cols[lower.indexOf('tracker')] || null,
    ownerEntityIdCol: findOwnerEntityIdColumn(cols),
  };
}

/**
 * Extract the asset ID from a data row.
 *
 * Always prefers GEM Unit ID for URL generation, falling back to
 * generic ID columns if necessary.
 *
 * @param row - The data row
 * @param cols - Pre-resolved column names from findCommonColumns()
 */
export function getAssetId(
  row: Record<string, unknown>,
  cols: { unitIdCol?: string | null; idCol?: string | null }
): string | null {
  const { unitIdCol, idCol } = cols;

  // Prefer GEM Unit ID (canonical for URLs)
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
 * Extract the entity ID from a data row.
 *
 * Used for owner/company lookups. Entity IDs have E-prefix (e.g., E100001000348).
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
 * Extract asset name from a record, trying common field names in order.
 *
 * @param record - The data record
 * @param fallback - Value to return if no name field found
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

// ============================================================================
// PART 2: COMPOSITE IDS (LEGACY)
// ============================================================================

/**
 * COMPOSITE IDS: A LEGACY FORMAT
 *
 * Earlier versions of the app used composite IDs that combined entity and
 * asset IDs: "E100000000834_G100000109409"
 *
 * This was needed when the URL structure was based on both owner and asset.
 * Now we use bare GEM Unit IDs for URLs (/asset/G100000109409) but we still
 * need to handle composite IDs for backwards compatibility.
 */

/**
 * Check if a string looks like a composite ID (E..._G...)
 */
export function isCompositeId(id: string): boolean {
  return /^E\d+_G\d+$/.test(id);
}

/**
 * Extract the GEM Unit ID (G-prefix part) from a composite ID.
 * Returns the original ID if it's not composite.
 *
 * @example
 * extractUnitIdFromComposite('E100000000834_G100000109409')
 * // Returns: 'G100000109409'
 *
 * extractUnitIdFromComposite('G100000109409')
 * // Returns: 'G100000109409' (unchanged)
 */
export function extractUnitIdFromComposite(id: string): string {
  if (isCompositeId(id)) {
    const parts = id.split('_');
    return parts[1]; // Return the G... part
  }
  return id;
}

// ============================================================================
// PART 3: URL PATH BUILDERS
// ============================================================================

/**
 * Build the canonical asset URL path.
 *
 * Always uses bare GEM Unit ID format: /asset/G100000109409
 * Handles composite IDs by extracting the unit ID portion.
 */
export function assetPath(id: string): string {
  const cleanId = extractUnitIdFromComposite(id);
  return `/asset/${cleanId}`;
}

/**
 * Build the canonical entity URL path.
 *
 * Entity pages show an owner's full portfolio of assets.
 */
export function entityPath(id: string): string {
  return `/entity/${id}`;
}

// ============================================================================
// PART 4: TRACKER-SPECIFIC ID HANDLING
// ============================================================================

/**
 * Get the ID field name for a specific tracker.
 *
 * Different GEM trackers use different primary ID fields:
 * - Coal/Gas Plants: 'GEM unit ID'
 * - Coal Mines: 'GEM Mine ID'
 * - Steel Plants: 'Steel Plant ID'
 * - Gas Pipelines: 'ProjectID'
 *
 * This function looks up the correct field from tracker-config.
 *
 * @example
 * getIdFieldForTracker('Coal Plant')  // Returns: 'GEM unit ID'
 * getIdFieldForTracker('Steel Plant') // Returns: 'Steel Plant ID'
 */
export function getIdFieldForTracker(trackerName: string): string | null {
  const config = getTrackerConfig(trackerName);
  return config?.idField || null;
}

/**
 * Extract asset ID using tracker-specific configuration.
 *
 * This is the most robust way to get an asset's ID when you know its tracker.
 * Falls back to generic ID extraction if tracker config isn't found.
 *
 * @example
 * const row = { 'GEM unit ID': 'G100000109409', 'Project': 'Sines' };
 * extractAssetIdByTracker('Coal Plant', row)
 * // Returns: 'G100000109409'
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

// ============================================================================
// PART 5: SANITIZED GRAPH IDS
// ============================================================================

/**
 * SANITIZED GRAPH IDS: FOR OWNERSHIP VISUALIZATIONS
 *
 * When we parse ownership paths like:
 *   "BlackRock Advisors LLC -> BlackRock Inc [5%] -> RWE AG [6%] -> Asset"
 *
 * We need stable IDs for each entity in the chain. But these entities don't
 * always have GEM Entity IDs (E-prefix). So we generate IDs from their names.
 *
 * REQUIREMENTS:
 * 1. Valid for use as graph node IDs (alphanumeric + underscore only)
 * 2. Deterministic (same name always produces same ID)
 * 3. Collision-resistant (similar names produce different IDs)
 *
 * SOLUTION:
 * We sanitize the name (remove special chars) and append a short hash of the
 * original name. This ensures that "ABC Corp" and "ABC Corp." get different IDs.
 */

/**
 * Hash function for generating collision-resistant ID suffixes.
 *
 * Uses the djb2 algorithm - it's fast and produces good distribution.
 * We only use 4 characters from the hash, which gives us 1.6M possible
 * suffixes (36^4). Combined with the name prefix, collisions are very rare.
 *
 * @internal
 */
function hashString(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    // hash * 33 + char, using XOR for the addition (djb2 variant)
    hash = (hash * 33) ^ str.charCodeAt(i);
  }
  // Convert to base36 (0-9, a-z) for compact representation
  // Take last 4 chars for a short but unique-ish suffix
  return (hash >>> 0).toString(36).slice(-4);
}

/**
 * Sanitize an entity name into a valid graph node ID.
 *
 * This is the PRIMARY function for generating IDs from names. Use it whenever
 * you need to create an ID for an entity that might not have a GEM Entity ID.
 *
 * FORMAT: {sanitized_name}_{4_char_hash}
 *
 * @param name - The entity name (e.g., "BlackRock Inc.")
 * @param maxLen - Maximum length for the ID (default 50)
 * @returns A valid graph ID (e.g., "BlackRock_Inc__a1b2")
 *
 * @example
 * sanitizeId('BlackRock Inc')   // 'BlackRock_Inc_7k2m'
 * sanitizeId('BlackRock Inc.')  // 'BlackRock_Inc__a1b2' (different hash!)
 * sanitizeId('RWE AG')          // 'RWE_AG_f3d9'
 *
 * // Long names are truncated but hash ensures uniqueness
 * sanitizeId('Very Long Company Name That Exceeds The Limit Incorporated')
 * // 'Very_Long_Company_Name_That_Exceeds_The_L_8k3f'
 */
export function sanitizeId(name: string, maxLen = 50): string {
  // Step 1: Remove all non-alphanumeric characters (replace with underscore)
  const cleaned = name.replace(/[^a-zA-Z0-9]/g, '_');

  // Step 2: Generate hash from ORIGINAL name (before cleaning)
  // This ensures that "ABC Corp" and "ABC Corp." get different hashes
  const hash = hashString(name);

  // Step 3: Truncate cleaned name to leave room for underscore + 4-char hash
  const truncated = cleaned.slice(0, maxLen - 5);

  // Step 4: Combine: {cleaned_name}_{hash}
  return `${truncated}_${hash}`;
}

/**
 * Check if an ID looks like a sanitized graph ID (has hash suffix).
 *
 * Useful for determining if an ID came from sanitizeId() vs being a
 * GEM database ID.
 *
 * @example
 * isSanitizedId('BlackRock_Inc_7k2m')  // true
 * isSanitizedId('G100000109409')        // false
 * isSanitizedId('E100001000348')        // false
 */
export function isSanitizedId(id: string): boolean {
  // Sanitized IDs end with underscore + 4 alphanumeric chars
  // and don't start with G or E (GEM database ID prefixes)
  return /^[^GE].*_[a-z0-9]{4}$/.test(id) || /^[GE][^0-9].*_[a-z0-9]{4}$/.test(id);
}

/**
 * Determine the type of an ID.
 *
 * Helps route IDs to the correct handler (asset page vs entity page vs graph node).
 *
 * @example
 * getIdType('G100000109409')        // 'gem_asset'
 * getIdType('E100001000348')        // 'gem_entity'
 * getIdType('BlackRock_Inc_7k2m')   // 'sanitized'
 * getIdType('E100_G200')            // 'composite'
 * getIdType('something_else')       // 'unknown'
 */
export function getIdType(
  id: string
): 'gem_asset' | 'gem_entity' | 'composite' | 'sanitized' | 'unknown' {
  if (/^G\d+$/.test(id)) return 'gem_asset';
  if (/^E\d+$/.test(id)) return 'gem_entity';
  if (isCompositeId(id)) return 'composite';
  if (isSanitizedId(id)) return 'sanitized';
  return 'unknown';
}

// ============================================================================
// PART 6: ID VALIDATION AND NORMALIZATION
// ============================================================================

/**
 * Normalize a GEM asset ID.
 *
 * Handles various input formats and always returns a clean G-prefix ID:
 * - Composite IDs: extracts the G portion
 * - Bare IDs: returns as-is
 * - Invalid: returns null
 *
 * @example
 * normalizeAssetId('G100000109409')           // 'G100000109409'
 * normalizeAssetId('E100_G100000109409')      // 'G100000109409'
 * normalizeAssetId('BlackRock_Inc_7k2m')      // null (not an asset ID)
 */
export function normalizeAssetId(id: string): string | null {
  const type = getIdType(id);

  if (type === 'gem_asset') return id;
  if (type === 'composite') return extractUnitIdFromComposite(id);

  return null;
}

/**
 * Normalize a GEM entity ID.
 *
 * @example
 * normalizeEntityId('E100001000348')  // 'E100001000348'
 * normalizeEntityId('G100000109409')  // null (not an entity ID)
 */
export function normalizeEntityId(id: string): string | null {
  return getIdType(id) === 'gem_entity' ? id : null;
}

/**
 * Check if an ID is a valid GEM asset ID (G-prefix with digits).
 */
export function isValidAssetId(id: string): boolean {
  return /^G\d+$/.test(id);
}

/**
 * Check if an ID is a valid GEM entity ID (E-prefix with digits).
 */
export function isValidEntityId(id: string): boolean {
  return /^E\d+$/.test(id);
}

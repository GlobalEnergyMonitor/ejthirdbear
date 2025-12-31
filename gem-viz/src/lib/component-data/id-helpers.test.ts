/**
 * Unit tests for id-helpers
 *
 * Tests the core ID resolution and extraction utilities used throughout GEM Viz.
 */

import { describe, it, expect } from 'vitest';
import {
  findIdColumn,
  findUnitIdColumn,
  findOwnerEntityIdColumn,
  findNameColumn,
  findCommonColumns,
  getAssetId,
  getEntityId,
  extractAssetName,
  isCompositeId,
  extractUnitIdFromComposite,
  assetPath,
  entityPath,
  // Sanitized graph IDs
  sanitizeId,
  getIdType,
  isValidAssetId,
  isValidEntityId,
  normalizeAssetId,
} from './id-helpers';

describe('findIdColumn', () => {
  it('finds GEM Unit ID as first priority', () => {
    const cols = ['Name', 'GEM Unit ID', 'Status', 'Country'];
    expect(findIdColumn(cols)).toBe('GEM Unit ID');
  });

  it('finds gem_unit_id with underscore format', () => {
    const cols = ['name', 'gem_unit_id', 'status'];
    expect(findIdColumn(cols)).toBe('gem_unit_id');
  });

  it('falls back to id column', () => {
    const cols = ['name', 'id', 'status'];
    expect(findIdColumn(cols)).toBe('id');
  });

  it('falls back to column containing _id', () => {
    const cols = ['name', 'project_id', 'status'];
    expect(findIdColumn(cols)).toBe('project_id');
  });

  it('returns first column as last resort', () => {
    const cols = ['name', 'status', 'country'];
    expect(findIdColumn(cols)).toBe('name');
  });

  it('returns null for empty array', () => {
    expect(findIdColumn([])).toBeNull();
  });
});

describe('findUnitIdColumn', () => {
  it('finds GEM Unit ID column', () => {
    const cols = ['Name', 'GEM Unit ID', 'Status'];
    expect(findUnitIdColumn(cols)).toBe('GEM Unit ID');
  });

  it('is case insensitive', () => {
    const cols = ['name', 'gem unit id', 'status'];
    expect(findUnitIdColumn(cols)).toBe('gem unit id');
  });

  it('returns null when not found', () => {
    const cols = ['Name', 'Status', 'Country'];
    expect(findUnitIdColumn(cols)).toBeNull();
  });
});

describe('findOwnerEntityIdColumn', () => {
  it('finds Owner GEM Entity ID column', () => {
    const cols = ['Name', 'Owner GEM Entity ID', 'Status'];
    expect(findOwnerEntityIdColumn(cols)).toBe('Owner GEM Entity ID');
  });

  it('matches variations with owner, entity, and id', () => {
    const cols = ['name', 'owner_entity_id', 'status'];
    expect(findOwnerEntityIdColumn(cols)).toBe('owner_entity_id');
  });

  it('returns null when not found', () => {
    const cols = ['Name', 'Owner', 'Status'];
    expect(findOwnerEntityIdColumn(cols)).toBeNull();
  });
});

describe('findNameColumn', () => {
  it('finds Project column first', () => {
    const cols = ['Project', 'Unit Name', 'Status'];
    expect(findNameColumn(cols)).toBe('Project');
  });

  it('finds Unit Name when Project not present', () => {
    const cols = ['ID', 'Unit Name', 'Status'];
    expect(findNameColumn(cols)).toBe('Unit Name');
  });

  it('finds Plant column', () => {
    const cols = ['ID', 'Plant', 'Status'];
    expect(findNameColumn(cols)).toBe('Plant');
  });

  it('returns null when no name column found', () => {
    const cols = ['ID', 'Status', 'Country'];
    expect(findNameColumn(cols)).toBeNull();
  });
});

describe('findCommonColumns', () => {
  it('finds all common columns in typical schema', () => {
    const cols = [
      'GEM Unit ID',
      'Project',
      'Status',
      'Owner',
      'Country',
      'Tracker',
      'Owner GEM Entity ID',
    ];
    const result = findCommonColumns(cols);

    expect(result.unitIdCol).toBe('GEM Unit ID');
    expect(result.nameCol).toBe('Project');
    expect(result.statusCol).toBe('Status');
    expect(result.ownerCol).toBe('Owner');
    expect(result.countryCol).toBe('Country');
    expect(result.trackerCol).toBe('Tracker');
    expect(result.ownerEntityIdCol).toBe('Owner GEM Entity ID');
  });

  it('returns nulls for missing columns', () => {
    const cols = ['ID', 'Name'];
    const result = findCommonColumns(cols);

    expect(result.statusCol).toBeNull();
    expect(result.trackerCol).toBeNull();
  });
});

describe('getAssetId', () => {
  it('prefers GEM Unit ID', () => {
    const row = { 'GEM Unit ID': 'G100000109409', ID: '12345' };
    const cols = { unitIdCol: 'GEM Unit ID', idCol: 'ID' };
    expect(getAssetId(row, cols)).toBe('G100000109409');
  });

  it('falls back to generic ID', () => {
    const row = { ID: '12345' };
    const cols = { unitIdCol: null, idCol: 'ID' };
    expect(getAssetId(row, cols)).toBe('12345');
  });

  it('returns null when no ID found', () => {
    const row = { Name: 'Test' };
    const cols = { unitIdCol: null, idCol: null };
    expect(getAssetId(row, cols)).toBeNull();
  });
});

describe('getEntityId', () => {
  it('prefers Owner Entity ID', () => {
    const row = { 'Owner GEM Entity ID': 'E100001000348', ID: '12345' };
    const cols = { ownerEntityIdCol: 'Owner GEM Entity ID', idCol: 'ID' };
    expect(getEntityId(row, cols)).toBe('E100001000348');
  });

  it('falls back to generic ID', () => {
    const row = { ID: 'E12345' };
    const cols = { ownerEntityIdCol: null, idCol: 'ID' };
    expect(getEntityId(row, cols)).toBe('E12345');
  });
});

describe('extractAssetName', () => {
  it('extracts Project name first', () => {
    const record = { Project: 'Sines Power Station', 'Unit Name': 'Unit 1' };
    expect(extractAssetName(record, 'fallback')).toBe('Sines Power Station');
  });

  it('extracts Unit Name when Project missing', () => {
    const record = { 'Unit Name': 'Unit 1' };
    expect(extractAssetName(record, 'fallback')).toBe('Unit 1');
  });

  it('extracts Plant name', () => {
    const record = { Plant: 'Coal Plant A' };
    expect(extractAssetName(record, 'fallback')).toBe('Coal Plant A');
  });

  it('returns fallback when no name found', () => {
    const record = { Status: 'active' };
    expect(extractAssetName(record, 'Unknown Asset')).toBe('Unknown Asset');
  });
});

describe('isCompositeId', () => {
  it('recognizes composite ID format', () => {
    expect(isCompositeId('E100000000834_G100000109409')).toBe(true);
  });

  it('rejects bare GEM Unit ID', () => {
    expect(isCompositeId('G100000109409')).toBe(false);
  });

  it('rejects bare Entity ID', () => {
    expect(isCompositeId('E100000000834')).toBe(false);
  });

  it('rejects random strings', () => {
    expect(isCompositeId('hello_world')).toBe(false);
  });
});

describe('extractUnitIdFromComposite', () => {
  it('extracts GEM Unit ID from composite', () => {
    expect(extractUnitIdFromComposite('E100000000834_G100000109409')).toBe('G100000109409');
  });

  it('returns original ID if not composite', () => {
    expect(extractUnitIdFromComposite('G100000109409')).toBe('G100000109409');
  });
});

describe('assetPath', () => {
  it('generates asset path from GEM Unit ID', () => {
    expect(assetPath('G100000109409')).toBe('/asset/G100000109409');
  });

  it('extracts unit ID from composite and generates path', () => {
    expect(assetPath('E100000000834_G100000109409')).toBe('/asset/G100000109409');
  });
});

describe('entityPath', () => {
  it('generates entity path', () => {
    expect(entityPath('E100001000348')).toBe('/entity/E100001000348');
  });
});

// ============================================================================
// PART 5: SANITIZED GRAPH IDS
// ============================================================================

describe('sanitizeId', () => {
  it('converts name to valid graph ID with hash suffix', () => {
    const id = sanitizeId('BlackRock Inc');
    expect(id).toMatch(/^BlackRock_Inc_[a-z0-9]{4}$/);
  });

  it('removes special characters', () => {
    const id = sanitizeId('Company (Holdings) Ltd.');
    expect(id).toMatch(/^Company__Holdings__Ltd__[a-z0-9]{4}$/);
  });

  it('produces different IDs for similar names', () => {
    const id1 = sanitizeId('ABC Corp');
    const id2 = sanitizeId('ABC Corp.');
    expect(id1).not.toBe(id2);
  });

  it('is deterministic - same input always gives same output', () => {
    const id1 = sanitizeId('Test Company');
    const id2 = sanitizeId('Test Company');
    expect(id1).toBe(id2);
  });

  it('truncates long names but keeps hash for uniqueness', () => {
    const longName =
      'Very Long Company Name That Exceeds The Maximum Length Limit Incorporated LLC';
    const id = sanitizeId(longName);
    expect(id.length).toBeLessThanOrEqual(50);
    expect(id).toMatch(/_[a-z0-9]{4}$/);
  });

  it('respects custom maxLen parameter', () => {
    const id = sanitizeId('Test Company Name', 20);
    expect(id.length).toBeLessThanOrEqual(20);
  });
});

describe('getIdType', () => {
  it('identifies GEM asset IDs', () => {
    expect(getIdType('G100000109409')).toBe('gem_asset');
  });

  it('identifies GEM entity IDs', () => {
    expect(getIdType('E100001000348')).toBe('gem_entity');
  });

  it('identifies composite IDs', () => {
    expect(getIdType('E100000000834_G100000109409')).toBe('composite');
  });

  it('identifies sanitized graph IDs', () => {
    const sanitized = sanitizeId('BlackRock Inc');
    expect(getIdType(sanitized)).toBe('sanitized');
  });

  it('returns unknown for unrecognized formats', () => {
    expect(getIdType('random_string')).toBe('unknown');
  });
});

describe('isValidAssetId', () => {
  it('returns true for valid G-prefix IDs', () => {
    expect(isValidAssetId('G100000109409')).toBe(true);
  });

  it('returns false for E-prefix IDs', () => {
    expect(isValidAssetId('E100001000348')).toBe(false);
  });

  it('returns false for sanitized IDs', () => {
    expect(isValidAssetId('BlackRock_Inc_7k2m')).toBe(false);
  });
});

describe('isValidEntityId', () => {
  it('returns true for valid E-prefix IDs', () => {
    expect(isValidEntityId('E100001000348')).toBe(true);
  });

  it('returns false for G-prefix IDs', () => {
    expect(isValidEntityId('G100000109409')).toBe(false);
  });
});

describe('normalizeAssetId', () => {
  it('passes through valid asset IDs', () => {
    expect(normalizeAssetId('G100000109409')).toBe('G100000109409');
  });

  it('extracts asset ID from composite', () => {
    expect(normalizeAssetId('E100_G100000109409')).toBe('G100000109409');
  });

  it('returns null for non-asset IDs', () => {
    expect(normalizeAssetId('E100001000348')).toBeNull();
    expect(normalizeAssetId('BlackRock_Inc_7k2m')).toBeNull();
  });
});

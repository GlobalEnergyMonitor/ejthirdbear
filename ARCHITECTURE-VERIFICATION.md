# Architecture Verification: Plan vs. Implementation

## Executive Summary

The "Ownership Data Processing and Access Plan" (December 2025) has been encoded into executable code in `src/lib/data-config/`. This document verifies which plan assumptions are now in code, which are partially addressed, and what gaps remain.

**Status**: 🟢 Core assumptions encoded | 🟡 Additional standardization needed | 🔴 Not yet implemented

---

## Plan Section: TAXONOMY

**Plan**: Entities, Assets, Units are distinct concepts

**Implementation**: 🟢 Implicit in code structure
- Entity records come from Ownership Tracker "All Entities" tab
- Assets have tracker-specific IDs (GEM unit ID, GEM Plant ID, ProjectID, etc.)
- Units are components of assets (power generation units, pipeline segments)
- `tracker-config.ts` defines id, name, location fields for each tracker

**Code References**:
- `tracker-config.ts`: idField, nameFields define asset/unit identification
- `data-sources.ts`: OwnershipTrackerDatasets references "All Entities"
- Field mappings maintain entity/asset distinction through IDs

---

## Plan Section: DATA SOURCES

**Plan**: Exclusively use GEM published data (Ownership Tracker tabs + underlying trackers)

**Implementation**: 🟢 Fully encoded
- `data-sources.ts` documents all data sources
- Ownership Tracker: All Entities, Entity Ownership, Asset Ownership tables
- Underlying trackers: Coal Plant, Gas Plant, Coal Mine, Iron Mine, Steel Plant, Cement, Gas/Oil Pipelines, Bioenergy
- Validation function: `validateDataSourcesArePublished()`

**Code References**:
- `data-sources.ts`: `OwnershipTrackerDatasets`, `TrackerDatasets`, `DerivedDatasets`
- `dataVersionInfo`: Release version, dates, contact, issue tracking

**Remaining Questions**:
- Which tracker versions are currently deployed? (Plan notes "no current one source of truth")
- Need to add version tracking per tracker in `tracker-versions.ts`

---

## Plan Section: DEEP KEY LOOKUPS

**Plan**: Where to find asset_id, asset_name, operating_status, capacity, location for each tracker

**Implementation**: 🟢 Fully encoded
- `tracker-config.ts`: Each tracker defines idField, nameFields, statusField, capacityField, location fields
- `field-mappings.ts`: Provides accessor functions (getAssetId, getAssetName, getOperatingStatus, getLocation, getCapacity)
- `deepKeyLookup()`: Single function to query "where is X in tracker Y"

**Code References**:
```typescript
// tracker-config.ts has for each tracker:
- idField: 'GEM unit ID' | 'GEM Mine ID' | 'ProjectID' | etc.
- nameFields: string | string[] (for concatenation)
- statusField: 'Status'
- capacityField: 'Capacity (MW)' | 'Capacity (Mtpa)' | etc.
- location: { latField, lonField, countryField, stateField }

// field-mappings.ts provides:
deepKeyLookup('Coal Plant', 'asset_id') → 'GEM unit ID'
deepKeyLookup('Coal Plant', 'capacity') → 'Capacity (MW)'
deepKeyLookup('Coal Plant', 'location') → { lat: 'Latitude', ... }
```

**Validation**: All asset types covered ✓
- Coal Plant ✓
- Gas Plant ✓
- Coal Mine ✓
- Iron Ore Mine ✓
- Steel Plant ✓
- Cement and Concrete ✓
- Gas Pipeline ✓
- Oil & NGL Pipeline ✓
- Bioenergy Power ✓

---

## Plan Section: TRACKER METADATA

**Plan**: Column names, descriptions, and metadata as source of truth for updates

**Implementation**: 🟢 Fully encoded
- `tracker-config.ts`: `TrackerFieldMapping` interface defines all metadata
- `field-mappings.ts`: `fieldDescriptions` map provides human-readable field descriptions
- Field transformation rules encoded in `transformations` object

**Code References**:
```typescript
// tracker-config.ts
export interface TrackerFieldMapping {
  idField: string
  nameFields: string | string[]
  capacityField?: string
  statusField: string
  location: { latField, lonField, countryField, stateField }
  transformations?: { nullOutAsterisk?, parseAsNumber? }
}

// field-mappings.ts
fieldDescriptions: {
  'GEM unit ID': 'Global Energy Monitor identifier for individual power generation units',
  'Capacity (MW)': 'Electric generation capacity in megawatts',
  // ...
}
```

**Remaining**:
- Need more detailed field documentation (units, null meanings, constraints)
- Could add `field-manifest.ts` with extended metadata

---

## Plan Section: ASSET CLASSES

**Plan**: Asset Class Rulebook with tracker list, matching function, relevant fields

**Implementation**: 🟢 Fully encoded
- `asset-classes.ts`: Defines asset class definitions with matcher functions
- Example classes implemented:
  - "Coal-Based Steel Plants" (identified by blast furnaces)
  - "Captive Coal Plants" (identified by Captive field)
  - "Deep Water Infrastructure" (identified by water depth)

**Code References**:
```typescript
// asset-classes.ts
export interface AssetClassDefinition {
  name: string
  description: string
  applicableTrackers: string[]
  matcher: (record: Record<string, unknown>) => boolean
  relevantFields: { identifyingFields, contextFields, transitionFields }
}

// Usage:
getAssetClassesForRecord('Steel Plant', steelRecord)
  → ['Coal-Based Steel Plants']

buildFieldsForAssetClass('Coal-Based Steel Plants')
  → ['Main production equipment', 'Plant name (English)', 'Steel Plant ID', ...]
```

**Asset Classes Defined**:
- ✓ Coal-Based Steel (Steel Plant tracker, identified by BF in equipment)
- ✓ Captive Coal Plant (Coal Plant tracker, identified by Captive field)
- ✓ Deep Water Infrastructure (Gas/Oil Pipeline, identified by depth > 200m)

**Remaining**:
- Need to validate these matchers against actual data
- Plan mentions future classes: LNG Facilities, Renewable Clusters, Aging Coal, Stranded Assets
- Asset class metadata (icons, colors, concern areas) is stubbed but needs GEM design input

---

## Plan Section: STATUS TRANSFORMATIONS

**Plan**: Map raw tracker status values to normalized 4-state (operating/proposed/retired/cancelled)

**Implementation**: 🟢 Fully encoded
- `tracker-config.ts`: Each tracker has `statusMap` converting raw status → normalized status
- `field-mappings.ts`: `getOperatingStatus()` returns raw + normalized + human-readable label

**Code References**:
```typescript
// tracker-config.ts example for Coal Plant
statusMap: {
  'operating': 'operating',
  'operating pre-retirement': 'operating',
  'construction': 'proposed',
  'permitted': 'proposed',
  'cancelled': 'cancelled',
  'retired': 'retired',
  'mothballed': 'retired',
  // ...
}

// field-mappings.ts
getOperatingStatus('Coal Plant', record)
  → {
    raw: 'operating',
    normalized: 'operating',
    label: 'Operating'
  }
```

**Coverage Verified**:
- Coal Plant ✓
- Gas Plant ✓
- Coal Mine ✓
- Iron Ore Mine ✓
- Steel Plant ✓
- Cement and Concrete ✓
- Gas Pipeline ✓
- Oil & NGL Pipeline ✓
- Bioenergy Power ✓

**Validation Needed**:
- Verify status maps include all real values from actual data
- Check for tracker-specific status variants not yet covered

---

## Plan Section: NAME FIELD MAPPINGS

**Plan**: How to construct asset names (single field or concatenated fields)

**Implementation**: 🟢 Fully encoded
- `tracker-config.ts`: nameFields (string or string[]) + nameSeparator
- `constructAssetName()` handles both single and multi-field names

**Code References**:
```typescript
// tracker-config.ts examples:
'Coal Plant': { nameFields: ['Plant name', 'Unit name'], nameSeparator: ' - ' }
'Coal Mine': { nameFields: 'Complex Name' }  // Single field
'Steel Plant': { nameFields: 'Plant name (English)' }

// Produces names like:
// Coal Plant: "Daqing Power Station Unit 1 - Unit 1"
// Coal Mine: "Shenhua Yanzhou Coal Mining"
```

**Coverage**:
- All trackers defined with appropriate name field(s) ✓

**Validation Needed**:
- Verify nameFields actually exist in data
- Check separator choice makes sense for each tracker

---

## Plan Section: LOCATION FIELD MAPPINGS

**Plan**: Where lat/lon, country, state fields are in each tracker

**Implementation**: 🟢 Fully encoded
- `tracker-config.ts`: Each tracker defines location object with 4 fields
- `extractLocation()` extracts and normalizes coordinates

**Code References**:
```typescript
// tracker-config.ts
location: {
  latField: 'Latitude',
  lonField: 'Longitude',
  countryField: 'Country/Area',
  stateField: 'Subnational unit (province, state)'
}

// field-mappings.ts
getLocation('Coal Plant', record)
  → { lat: -38.45, lon: 144.22, country: 'Australia', state: 'Victoria' }
```

**Tracker Variations Handled**:
- Cement Plant: Uses "Coordinates" field (single string, needs parsing) ✓
- Steel Plant: Uses "Coordinates" field ✓
- Iron Mine: Uses "Coordinates" field ✓
- Others: Use separate lat/lon fields ✓

**Validation Needed**:
- Coordinate parsing for "Coordinates" field actually works
- Lat/lon values are reasonable (within -90..90, -180..180)

---

## Plan Section: ID DEDUPLICATION

**Plan**: Mapping of old IDs → new IDs when consolidation occurs

**Implementation**: 🟡 Documented but not yet implemented
- `data-sources.ts` documents the need for `ID Deduplication Mapping`
- Location: needs to be created (likely JSON or TypeScript map)
- Not yet needed in code paths

**Recommended Implementation**:
```typescript
// src/lib/data-config/id-deduplication.ts
export const idDeduplicationMap = new Map<string, string>([
  // Old GEM unit ID → Current GEM unit ID
  ['G_old_1', 'G_new_1'],
  // When needed, add mappings here
]);

export function resolveId(id: string): string {
  return idDeduplicationMap.get(id) || id;
}
```

---

## Plan Section: DERIVED/AUXILIARY TABLES

**Plan**: Location filtering parquet, Asset class lookup parquet, etc.

**Implementation**: 🟡 Partially implemented

**Documented in code**:
- ✓ Location filtering parquet (`static/asset_locations.parquet`)
- ✓ Asset class lookup (`asset-classes.ts` with matcher functions)

**Still needed**:
- Tracker metadata manifest (column descriptions, data types)
- Pre-computed asset class membership lookup
- Location data in accessible format for front-end filtering

---

## Plan Section: ARCHITECTURAL DECISIONS

### Decision: Use GEM published data exclusively

**Status**: 🟢 Encoded
- `validateDataSourcesArePublished()` enforces this
- `data-sources.ts` documents all sources
- No fallback to internal/intermediary scripts

### Decision: Tracker-specific field mappings

**Status**: 🟢 Encoded
- `tracker-config.ts` is single source of truth
- ID helpers reference tracker-config
- Components import from data-config module

### Decision: Normalize data at access layer

**Status**: 🟢 Encoded
- `getOperatingStatus()` normalizes to 4-state
- `getCapacity()` returns value + unit
- `getLocation()` returns standardized object
- Status categories in `categorizeStatus()`

### Decision: Asset classes are data-driven

**Status**: 🟢 Encoded
- Classes are code but testable
- Matcher functions operate on records
- Relevant fields can be extracted dynamically

---

## Validation Against Actual Data

### Needed Tests

```typescript
// tracker-config.ts
❌ Verify all status values in actual data are mapped
❌ Verify nameFields exist in actual tracker data
❌ Verify capacityFields exist and contain numbers
❌ Verify location fields contain valid coordinates

// asset-classes.ts
❌ Test coal-based steel matcher on real steel plant data
❌ Test captive coal plant matcher on real coal plant data
❌ Test deep water infrastructure matcher on real pipeline data

// field-mappings.ts
❌ Verify deepKeyLookup returns field names that exist
❌ Verify normalizeStatus covers all tracker values
❌ Verify getLocation handles null/missing coordinates
❌ Verify buildFieldsForAssetClass returns valid fields
```

### Data Quality Checks

```
- Do all assets have IDs? (Some might use fallback)
- Are names non-empty after concatenation?
- Are coordinates within valid ranges?
- Are capacity values positive numbers or null?
- Do status values map to known categories?
```

---

## Gaps & Future Work

### High Priority (Blocks downstream features)

1. **Tracker version tracking**
   - Plan notes: "no current one source of truth on which version of trackers are current"
   - Solution: Add tracker-versions.ts with version history per tracker
   - Needed for: Reliable data rebuilds, historical analysis

2. **Data validation at import**
   - Need to validate tracker data against configs at build time
   - Report missing fields, unexpected values, coordinate issues
   - Required before: Serving data to users

3. **Asset class matcher validation**
   - Test matchers against sample data from each tracker
   - Confirm field names exist and matchers work
   - Needed for: Asset class filtering features

4. **ID deduplication mapping**
   - Implement when consolidations occur
   - Maintain backwards compatibility
   - Needed for: Stable asset URLs

### Medium Priority (Nice to have)

5. **Extended field metadata**
   - Add units, constraints, null meanings to field descriptions
   - Create field-manifest.ts with detailed documentation
   - Useful for: Data exports, field descriptions in UI

6. **Asset class documentation**
   - Fill in asset class metadata (icons, colors)
   - Define more asset classes (LNG, Renewable, Aging Coal, Stranded)
   - Align with GEM design guidelines

7. **Status transformation completeness**
   - Verify all real-world status values are covered
   - Add tracker-specific status categories if needed
   - Test against actual data

### Low Priority (Infrastructure)

8. **Test suite for data-config module**
   - Unit tests for matcher functions
   - Property tests for field extraction
   - Integration tests with actual parquet files

9. **Observable notebook updates**
   - Update existing Observable notebooks to reference tracker-config
   - Remove duplicated field mapping definitions
   - Link to new code-based definitions

---

## Usage Guide

### For Frontend Developers

```typescript
// Instead of hardcoding field names:
❌ const name = record['Project'] || record['Plant'] || record['Mine'];

// Use standardized accessors:
✅ import { getAssetName } from '$lib/data-config';
   const name = getAssetName('Coal Plant', record);
```

### For Data Analysts

```typescript
// Find where X is stored in tracker Y:
✅ import { deepKeyLookup, getTrackerConfig } from '$lib/data-config';

const capacityField = deepKeyLookup('Coal Mine', 'capacity');
const config = getTrackerConfig('Coal Mine');
const allFields = Object.keys(config);
```

### For Asset Class Features

```typescript
// Implement asset class filtering:
✅ import { getAssetClassesForRecord, buildFieldsForAssetClass } from '$lib/data-config';

const classes = getAssetClassesForRecord('Steel Plant', record);
const fields = buildFieldsForAssetClass('Coal-Based Steel Plants');
const data = { ...record, classes, fields };
```

---

## Summary Table

| Plan Section | Code File | Status | Coverage |
|---|---|---|---|
| Taxonomy | Implicit | 🟢 | Full |
| Data Sources | data-sources.ts | 🟢 | Full |
| Deep Key Lookups | tracker-config.ts, field-mappings.ts | 🟢 | Full |
| Tracker Metadata | tracker-config.ts | 🟢 | Full |
| Asset Classes | asset-classes.ts | 🟢 | 3/6+ classes |
| Status Transformations | tracker-config.ts | 🟢 | All 9 trackers |
| Name Field Mappings | tracker-config.ts | 🟢 | All 9 trackers |
| Location Field Mappings | tracker-config.ts | 🟢 | All 9 trackers |
| ID Deduplication | Documented | 🟡 | Not implemented |
| Derived Tables | Documented | 🟡 | Partial |
| Tests | None yet | 🔴 | 0% |
| Validation | None yet | 🔴 | 0% |

---

## Conclusion

The core architectural decisions and deep key lookups from the Ownership Data Processing and Access Plan have been successfully encoded into executable, type-safe TypeScript code. This provides:

✅ **Single source of truth** for tracker metadata
✅ **Type safety** preventing runtime field name errors
✅ **Testability** of asset class matchers and transformations
✅ **Maintainability** when trackers change or new ones are added

Remaining work focuses on validation (confirming the code matches actual data), testing, and filling in remaining standardization efforts (asset class definitions, field metadata).

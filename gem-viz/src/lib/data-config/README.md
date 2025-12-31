# GEM Data Configuration Module

This module encodes the **Ownership Data Processing and Access Plan** (December 2025) into executable, type-safe TypeScript code.

## Overview

Instead of maintaining data specifications in documentation, these files define data contracts that are:

- **Executable**: Code can reference and validate against these definitions
- **Type-safe**: TypeScript interfaces prevent runtime errors
- **Single source of truth**: Reduces duplication and inconsistency

## Files

### `tracker-config.ts`

Tracker metadata: field mappings for all asset types.

Encodes:

- Which field contains the asset ID for each tracker
- How to construct asset names (single or concatenated fields)
- Capacity field names and units
- Status field and raw→normalized status mappings
- Location fields (latitude, longitude, country, state)
- Special transformations (e.g., replacing `*` with null)

**Plan Section**: "Deep key lookups" - Asset Type / Tracker names and spreadsheet tabs

### `asset-classes.ts`

Asset class definitions and matching rules.

Defines:

- "Coal-Based Steel Plants" - steel plants with blast furnaces
- "Captive Coal Plants" - coal plants serving non-grid purposes
- "Deep Water Infrastructure" - offshore pipelines and platforms
- Plus metadata (icons, colors, concern areas)

Each asset class includes:

- Applicable trackers
- Matcher function to identify assets in this class
- Relevant fields to expose for this class

**Plan Section**: "Asset classes" - Asset Class Rulebook with tracker/function/field definitions

### `field-mappings.ts`

Standardized accessors for common field types.

Provides:

- `getAssetId()` - Extract asset ID using tracker rules
- `getAssetName()` - Construct name using tracker rules
- `getOperatingStatus()` - Normalize status to 4-state (operating/proposed/retired/cancelled)
- `getLocation()` - Extract lat/lon/country/state
- `getCapacity()` - Extract capacity with units
- `deepKeyLookup()` - "Where do I find X in tracker Y?"

**Plan Section**: "Deep key lookups" - Single interface for accessing various field types

### `data-sources.ts`

Documents where all data comes from and how it's versioned.

Defines:

- Ownership Tracker tabs (All Entities, Entity Ownership, Asset Ownership)
- Individual tracker datasets (Coal Plant, Gas Plant, Coal Mine, etc.)
- Derived/auxiliary datasets (deduplication mapping, location filtering, asset class lookup)
- Versioning and release information
- Data quality standards

**Plan Section**: "Data sources" - GEM published datasets and versions

### `index.ts`

Re-exports all public APIs from this module.

## Usage Examples

### Finding field names for a tracker

```typescript
import { getTrackerConfig } from '$lib/data-config';

const config = getTrackerConfig('Coal Plant');
console.log(config.idField); // 'GEM unit ID'
console.log(config.capacityField); // 'Capacity (MW)'
console.log(config.nameFields); // ['Plant name', 'Unit name']
```

### Extracting standardized data

```typescript
import { getAssetName, getOperatingStatus, getLocation, getCapacity } from '$lib/data-config';

const coalPlantRecord = {
  /* ... */
};

const name = getAssetName('Coal Plant', coalPlantRecord);
const status = getOperatingStatus('Coal Plant', coalPlantRecord);
const location = getLocation('Coal Plant', coalPlantRecord);
const capacity = getCapacity('Coal Plant', coalPlantRecord);

// All results are normalized and type-safe
console.log(status.normalized); // 'operating' | 'proposed' | 'retired' | 'cancelled'
console.log(capacity.unit); // 'MW'
```

### Finding assets of a specific class

```typescript
import { getAssetClassesForRecord } from '$lib/data-config';

const steelPlantRecord = {
  'Main production equipment': 'BF (Blast Furnace), DRI',
  /* ... */
};

const classes = getAssetClassesForRecord('Steel Plant', steelPlantRecord);
// Returns: ['Coal-Based Steel Plants']
```

### Deep key lookup

```typescript
import { deepKeyLookup } from '$lib/data-config';

// Where do I find capacity data in Coal Mine?
const capacityField = deepKeyLookup('Coal Mine', 'capacity');
// Returns: 'Capacity (Mtpa)'

// Where do I find location fields in Gas Pipeline?
const locationFields = deepKeyLookup('Gas Pipeline', 'location');
// Returns: { lat: 'Latitude', lon: 'Longitude', country: 'Countries', state: 'States/Provinces' }
```

## Mapping Plan Sections to Code

| Plan Section                 | Code File                                | Key Types/Functions                                              |
| ---------------------------- | ---------------------------------------- | ---------------------------------------------------------------- |
| Taxonomy (Entity/Asset/Unit) | All files                                | Types define these concepts implicitly                           |
| Data sources                 | `data-sources.ts`                        | `OwnershipTrackerDatasets`, `TrackerDatasets`, `DerivedDatasets` |
| Deep key lookups             | `field-mappings.ts`, `tracker-config.ts` | `deepKeyLookup()`, `getTrackerConfig()`                          |
| Tracker metadata             | `tracker-config.ts`                      | `TrackerFieldMapping`, `trackerConfigs` map                      |
| Asset classes                | `asset-classes.ts`                       | `AssetClassDefinition`, `allAssetClasses`                        |
| Status transformations       | `tracker-config.ts`, `field-mappings.ts` | `statusMap` in config, `normalizeStatus()`                       |
| Name field mappings          | `tracker-config.ts`                      | `nameFields` + `nameSeparator`                                   |
| Location field mappings      | `tracker-config.ts`                      | `location` object with lat/lon/country/state                     |
| Capacity field mappings      | `tracker-config.ts`                      | `capacityField` + `capacityUnit`                                 |
| ID field mappings            | `tracker-config.ts`                      | `idField`                                                        |

## Core Architectural Decisions

### 1. Data is always from published sources

All data comes from GEM's publicly published datasets. This is enforced by `validateDataSourcesArePublished()` and documented in `data-sources.ts`.

### 2. Tracker-specific field mappings are centralized

Rather than scattering field names throughout component code, `tracker-config.ts` is the single source of truth. Components import from there.

### 3. Normalization happens at the access layer

Functions like `getOperatingStatus()` and `getCapacity()` normalize data to consistent formats (4-state status, numbers with units).

### 4. Asset classes are data-driven

Asset class definitions are code, but their matching logic is testable. This enables features like:

- Asset class filtering UI
- Bulk analysis by asset class
- Asset class-specific data exports

### 5. Taxonomy is implicit, not explicit

The plan defines Entity, Asset, Unit as taxonomy concepts. Rather than creating a `taxonomy.ts` file, these are implicit in:

- Entity records come from `All Entities` sheet
- Assets have IDs from trackers (GEM unit ID, GEM Plant ID, etc.)
- Units are the granular elements of plants/mines

## Future Enhancements

### ID Deduplication Mapping

When IDs are consolidated (e.g., two "G..." IDs merge into one), maintain a mapping:

```typescript
// src/lib/data-config/id-deduplication.ts
export const idDeduplicationMap = new Map([
  ['G_old_id_1', 'G_new_id_1'],
  ['G_old_id_2', 'G_new_id_1'],
  // ...
]);
```

### Field Metadata/Manifest

Comprehensive metadata for all columns (description, units, null meanings, constraints):

```typescript
// src/lib/data-config/field-manifest.ts
export const fieldMetadata = {
  'GEM unit ID': {
    description: '...',
    type: 'string',
    pattern: '^G\\d+$',
    // ...
  },
};
```

### Tracker Versioning

Point-in-time snapshot of tracker states for historical analysis:

```typescript
// src/lib/data-config/tracker-versions.ts
export const trackerVersionHistory = {
  'Coal Plant': [
    { version: '2.0', date: '2025-11-15' },
    { version: '1.9', date: '2025-10-01' },
  ],
};
```

## Testing

Key tests to add:

```typescript
// tracker-config.ts
- All trackers have all required fields
- Status maps cover real data (no missing statuses)
- Name fields exist in actual data

// asset-classes.ts
- Matchers work on real asset records
- Applicable trackers match tracker-config
- No tracker in matchers is unknown

// field-mappings.ts
- Deep key lookups return valid field names
- Normalization produces consistent output
- Capacity extraction handles units correctly

// data-sources.ts
- All URLs are accessible
- Row counts are reasonable
- validateDataSourcesArePublished() returns true
```

## Related Documentation

- **Ownership Data Processing and Access Plan** (Dec 2025) - the specification this code encodes
- **Observable Notebook** (bdcdb445752833fa) - the original implementation of ownership graph logic
- **GitHub: Ownership_External_Dataset** - actual data and processing scripts
- **GEM Brand Guidelines** - color and design standards

## Glossary

- **Tracker**: A GEM asset type tracker (e.g., Coal Plant Tracker)
- **Asset Type**: The category of energy infrastructure (coal plant, pipeline, mine, etc.)
- **Asset**: An instance of energy infrastructure (a specific coal plant or pipeline)
- **Unit**: A sub-asset or component (a generating unit within a power plant, a segment of a pipeline)
- **Asset Class**: A set of assets from one or more trackers with shared characteristics
- **Deep Key Lookup**: Where to find a specific type of data (status, capacity, location) in a tracker
- **Operating Status**: The state of an asset (operating, proposed, retired, cancelled)

# GEM Data Config - Quick Reference Guide

All ownership and asset data handling should go through `$lib/data-config/`. This centralizes field names, transformations, and business logic.

## Import All From One Place

```typescript
import {
  // Tracker configuration
  getTrackerConfig,
  getAllTrackerNames,
  getTrackersByType,

  // Field access
  getAssetId,
  getAssetName,
  getOperatingStatus,
  getLocation,
  getCapacity,
  deepKeyLookup,

  // Asset classes
  getAssetClass,
  getAssetClassesForRecord,

  // Data sources
  dataVersionInfo,
  validateDataSourcesArePublished,
} from '$lib/data-config';
```

## Most Common Tasks

### 1. Extract standard fields from any asset record

```typescript
const tracker = 'Coal Plant';
const record = { /* data from CSV/parquet */ };

const id = getAssetId(tracker, record);
const name = getAssetName(tracker, record);
const status = getOperatingStatus(tracker, record);
const location = getLocation(tracker, record);
const capacity = getCapacity(tracker, record);

// Results are normalized and type-safe:
console.log(status.normalized);  // 'operating' | 'proposed' | 'retired' | 'cancelled'
console.log(capacity.value);      // number or null
console.log(capacity.unit);       // 'MW'
console.log(location.lat);        // number or null
```

### 2. Find where something is stored in a tracker

```typescript
// Where is the asset ID field in Gas Plant?
deepKeyLookup('Gas Plant', 'asset_id');        // 'GEM unit ID'

// Where is capacity in Coal Mine?
deepKeyLookup('Coal Mine', 'capacity');        // 'Capacity (Mtpa)'

// Where are location fields in Gas Pipeline?
deepKeyLookup('Gas Pipeline', 'location');     // { lat: '...', lon: '...', ... }

// Where is status?
deepKeyLookup('Steel Plant', 'operating_status');  // 'Status'

// Where is the name constructed from?
deepKeyLookup('Coal Plant', 'asset_name');     // ['Plant name', 'Unit name']
```

### 3. Check what asset classes a record belongs to

```typescript
const steelRecord = { 'Main production equipment': 'BF (Blast Furnace)', /* ... */ };

const classes = getAssetClassesForRecord('Steel Plant', steelRecord);
// Returns: ['Coal-Based Steel Plants']

// Or get all classes for a tracker
import { getAssetClassesForTracker } from '$lib/data-config';
const coalClasses = getAssetClassesForTracker('Coal Plant');
// Returns: [CaptiveCoalPlantClass, ...]
```

### 4. Get all relevant fields for an asset class

```typescript
import { buildFieldsForAssetClass } from '$lib/data-config';

const coalSteelFields = buildFieldsForAssetClass('Coal-Based Steel Plants');
// Returns: ['Main production equipment', 'Plant name (English)', 'Steel Plant ID', 'Latitude', ...]

// Use when exporting data for a specific asset class
const filtered = coalSteelFields.map(field => ({
  [field]: record[field]
}));
```

### 5. Get the tracker configuration object

```typescript
const config = getTrackerConfig('Coal Plant');

console.log(config.idField);          // 'GEM unit ID'
console.log(config.nameFields);       // ['Plant name', 'Unit name']
console.log(config.capacityField);    // 'Capacity (MW)'
console.log(config.statusField);      // 'Status'
console.log(config.location.latField);  // 'Latitude'
console.log(config.statusMap);        // { 'operating': 'operating', ... }
```

### 6. Normalize operating status

```typescript
const rawStatus = 'operating pre-retirement';
const status = getOperatingStatus('Coal Plant', { Status: rawStatus });

console.log(status.raw);        // 'operating pre-retirement' (from data)
console.log(status.normalized); // 'operating' (normalized 4-state)
console.log(status.label);      // 'Operating' (human-readable)
```

### 7. Work with location data

```typescript
const location = getLocation('Coal Plant', record);

// All fields are normalized to standard names:
// location.lat   → number or null
// location.lon   → number or null
// location.country → string or null
// location.state → string or null

if (location.lat && location.lon) {
  // Can use coordinates for mapping
  mapPoint([location.lon, location.lat]);  // [lng, lat] for GeoJSON
}
```

### 8. Get metadata about a field

```typescript
import { getFieldDescription, fieldDescriptions } from '$lib/data-config';

getFieldDescription('GEM unit ID');
// 'Global Energy Monitor identifier for individual power generation units'

getFieldDescription('Capacity (MW)');
// 'Electric generation capacity in megawatts'

// Or browse all descriptions
Object.entries(fieldDescriptions).forEach(([field, desc]) => {
  console.log(`${field}: ${desc}`);
});
```

## Types

```typescript
interface TrackerFieldMapping {
  name: string;
  assetType: 'mine' | 'plant' | 'pipeline';
  idField: string;
  nameFields: string | string[];
  nameSeparator?: string;
  capacityField?: string;
  capacityUnit?: string;
  statusField: string;
  statusMap: Record<string, OperatingStatus>;
  location: { latField, lonField, countryField, stateField };
  transformations?: { nullOutAsterisk?, parseAsNumber? };
}

type OperatingStatus = 'operating' | 'proposed' | 'retired' | 'cancelled' | 'unknown';

interface NormalizedOperatingStatus {
  raw: string | undefined;
  normalized: OperatingStatus;
  label: string;  // 'Operating', 'Proposed/Under Construction', etc.
}

interface LocationData {
  lat: number | null;
  lon: number | null;
  country: string | null;
  state: string | null;
}

interface CapacityData {
  value: number | null;
  unit: string | null;  // 'MW', 'Mtpa', 'ttpa', 'Bcm/y', 'BOEd'
  fieldName: string | null;  // Original field name
}
```

## All Supported Trackers

```typescript
// Get list of all trackers
getAllTrackerNames();
// Returns: ['Bioenergy Power', 'Coal Plant', 'Coal Mine', 'Gas Plant', ...]

// Get trackers by type
getTrackersByType('mine');      // [Coal Mine, Iron Ore Mine]
getTrackersByType('plant');     // [Coal Plant, Gas Plant, Bioenergy Power, ...]
getTrackersByType('pipeline');  // [Gas Pipeline, Oil & NGL Pipeline]
```

## All Supported Asset Classes

```typescript
// Get an asset class definition
getAssetClass('Coal-Based Steel Plants');

// Get all asset classes
import { allAssetClasses } from '$lib/data-config';
allAssetClasses.forEach(ac => {
  console.log(ac.name);
  console.log(ac.applicableTrackers);
  console.log(ac.relevantFields);
});
```

## Data Sources

```typescript
import {
  OwnershipTrackerDatasets,
  TrackerDatasets,
  DerivedDatasets,
  dataVersionInfo,
} from '$lib/data-config';

// Check version info
console.log(dataVersionInfo.currentReleaseVersion);  // '1.0'
console.log(dataVersionInfo.releaseDate);            // '2025-12-01'

// Get ownership data source
const allEntities = OwnershipTrackerDatasets.allEntities;
console.log(allEntities.name);    // 'All Entities'
console.log(allEntities.rowCount); // ~50000

// Get tracker source
const coalPlant = TrackerDatasets.coalPlant;
console.log(coalPlant.version);    // 'v2.0'
console.log(coalPlant.url);        // GitHub URL

// Validate we're using only public data
validateDataSourcesArePublished();  // true or logs warning
```

## Common Mistakes to Avoid

```typescript
❌ // Don't hardcode field names
const name = record['Plant'] || record['Project'];

✅ // Use getAssetName instead
const name = getAssetName(tracker, record);

---

❌ // Don't create your own status normalization
const isOperating = record['Status'] === 'operating';

✅ // Use getOperatingStatus
const status = getOperatingStatus(tracker, record);
if (status.normalized === 'operating') { ... }

---

❌ // Don't assume field names are consistent
const lat = record.Latitude || record.latitude || record.LAT;

✅ // Use getLocation
const location = getLocation(tracker, record);
if (location.lat) { ... }

---

❌ // Don't check for asset classes manually
const isCaptive = record.Captive && record.Captive.length > 0;

✅ // Use asset class matching
const classes = getAssetClassesForRecord('Coal Plant', record);
if (classes.includes('Captive Coal Plants')) { ... }

---

❌ // Don't maintain separate capacity field mapping
const capacityField = tracker === 'Coal Plant' ? 'Capacity (MW)' : ...;

✅ // Use deepKeyLookup
const capacityField = deepKeyLookup(tracker, 'capacity');
```

## When to Add New Configuration

### Add a new tracker
1. Add to `tracker-config.ts` in `trackerConfigs` map
2. Include all fields: idField, nameFields, statusField, capacityField, location, statusMap
3. Add data source to `TrackerDatasets` in `data-sources.ts`
4. Update `getAllTrackerNames()` tests

### Add a new asset class
1. Create definition in `asset-classes.ts`
2. Add to `allAssetClasses` array
3. Define `matcher()` function and `relevantFields`
4. Add metadata to `assetClassMetadata`

### Update field names for a tracker
1. Update in `tracker-config.ts` for the tracker
2. All downstream code automatically uses new names
3. No need to search/replace field names elsewhere

### Change status mapping for a tracker
1. Update `statusMap` in `tracker-config.ts`
2. Run tests to verify all real statuses are covered
3. Document why the mapping changed

## Testing

When you add new code that uses data-config, test it:

```typescript
// Test tracker config is valid
getTrackerConfig('Coal Plant') != null
getTrackerConfig('Unknown Tracker') == null

// Test field extraction
getAssetName('Coal Plant', record) != null
getAssetName('Unknown Tracker', record) == null

// Test status normalization
getOperatingStatus('Coal Plant', { Status: 'operating' }).normalized === 'operating'
getOperatingStatus('Coal Plant', { Status: 'unknown' }).normalized === 'unknown'

// Test asset class matching
getAssetClassesForRecord('Coal Plant', { Captive: 'Coal mine' }).length > 0
getAssetClassesForRecord('Coal Plant', { Captive: '' }).length === 0
```

## Documentation

- **Full spec**: `src/lib/data-config/README.md`
- **Architecture verification**: `ARCHITECTURE-VERIFICATION.md`
- **Individual files**:
  - `tracker-config.ts` - Field mappings for each tracker
  - `asset-classes.ts` - Asset class definitions
  - `field-mappings.ts` - Access pattern utilities
  - `data-sources.ts` - Data source documentation

/**
 * Asset Class Definitions for the Ownership Screener
 *
 * Taxonomy of asset classes that drive screener Step 1 (class selection + narrowing).
 * Field naming: isArray=true means a comma-delimited field split before matching.
 *
 * GEM tracker names: Bioenergy Power, Cement or Concrete Plant, Coal Mine,
 * Coal Plant, Gas Pipeline, Iron Mine, Iron & Steel Plant, Oil & Gas Plant,
 * Oil or NGL Pipeline. App handles 7 (missing Cement, Oil/NGL Pipeline).
 *
 * Source: https://docs.google.com/spreadsheets/d/1oMAVQi8yrsm_Daj8v55FnbcCqZ4JacHjf8o53HFX3BU
 */

// =============================================================================
// TYPES
// =============================================================================

/** Operators for matching field values */
export type FieldOp =
  | 'not_null'      // field has any non-empty value
  | 'is_null'       // field is null/empty
  | 'eq'            // field == value
  | 'neq'           // field != value
  | 'gt'            // field > value (numeric)
  | 'gte'           // field >= value (numeric)
  | 'lt'            // field < value (numeric)
  | 'includes_any'  // array field contains at least one of values[]
  | 'includes'      // array field contains value
  | 'between';      // numeric field between min and max

/** A single filter condition on a tracker field */
export interface FieldFilter {
  /** Column name in the tracker data */
  field: string;
  /** Operator */
  op: FieldOp;
  /** Value for eq/neq/gt/gte/lt/includes */
  value?: string | number;
  /** Values for includes_any */
  values?: string[];
  /** Min/max for between */
  min?: number;
  max?: number;
  /**
   * If true, the raw field value is a delimited string (e.g. "iron & steel, aluminum")
   * that must be split before matching. Default delimiter is comma.
   */
  isArray?: boolean;
  /** Delimiter for array fields. Default: "," */
  delimiter?: string;
  /**
   * If this filter references sub-unit data (e.g. DRI furnace rows inside a
   * steel plant), note the sub-unit table/context here. The matcher needs to
   * check "does ANY sub-unit of this plant match?" rather than a flat field.
   */
  subUnitContext?: string;
}

/** A sub-class option shown as a checkbox in the narrowing modal */
export interface SubClassOption {
  id: string;
  label: string;
  description?: string;
  /** Filter(s) that identify assets in this sub-class */
  filters: FieldFilter[];
  /** If true, this checkbox starts checked when the class is selected */
  defaultChecked?: boolean;
}

/**
 * A group of sub-class options. Used when sub-classes have two levels
 * (e.g., Captive Coal → industry type → specific use within industry).
 */
export interface SubClassGroup {
  id: string;
  label: string;
  description?: string;
  options: SubClassOption[];
}

/** Date-range filter config */
export interface DateFilterConfig {
  field: string;
  label: string;
}

/** Top-level asset class definition */
export interface AssetClass {
  id: string;
  label: string;
  description: string;
  /** Grouping category for UI sections */
  category: AssetClassCategory;
  /** Which GEM tracker(s) this class draws data from */
  trackers: string[];
  /**
   * Base filter(s) that ALL assets in this class must pass.
   * If empty/undefined, class includes all assets from the listed trackers.
   */
  baseFilters?: FieldFilter[];
  /**
   * Sub-class options for narrowing. Flat list of checkboxes.
   * Use `subClassGroups` for two-level nesting.
   */
  subClasses?: SubClassOption[];
  /** Two-level sub-class nesting (group → options) */
  subClassGroups?: SubClassGroup[];
  /** Which standard cross-cutting filters apply */
  availableFilters: {
    geography?: boolean;
    status?: boolean;
    capacity?: boolean;
    dateRange?: DateFilterConfig;
  };
  /** Implementation/data notes */
  notes?: string;
}

export type AssetClassCategory =
  | 'coal-plant'
  | 'coal-mine'
  | 'steel-iron'
  | 'chemical'
  | 'bioenergy'
  | 'cement'
  | 'multi-tracker';

// =============================================================================
// CONSTANTS — Captive industry groupings
// =============================================================================

/**
 * Captive Coal Plant industry categories.
 * The "Captive" field on Coal Plant tracker is a comma-delimited string
 * of industry names. These are grouped into user-facing categories.
 */
export const CAPTIVE_INDUSTRY_GROUPS = {
  metals: {
    label: 'Metals',
    values: ['iron & steel', 'aluminum', 'nickel', 'other metals & mining'],
  },
  coal_mining: {
    label: 'Coal mining and products',
    values: ['coal mining & coal products'],
  },
  chemicals: {
    label: 'Chemicals',
    values: ['chemicals'],
  },
  pulp_paper: {
    label: 'Pulp & Paper',
    values: ['pulp & paper'],
  },
  other: {
    label: 'Other',
    values: [
      'machinery',
      'cement & building',
      'oil & refining',
      'industrial park',
      'agriculture',
      'textiles',
      'automobiles',
      'other',
      'unknown',
      'sugar',
      'rubber',
      'electronics',
      'cryptocurrency',
      'data center',
    ],
  },
} as const;

/** All known captive industry values (flat) */
export const ALL_CAPTIVE_VALUES = Object.values(CAPTIVE_INDUSTRY_GROUPS).flatMap(
  (g) => g.values
);

// =============================================================================
// COAL PLANT CLASSES
// =============================================================================

/** Captive Coal Plants — "Captive" field is comma-delimited industry names */
export const CaptiveCoalPlants: AssetClass = {
  id: 'captive-coal-plants',
  label: 'Captive Coal Plants',
  description: 'Coal plants whose power goes to a specific private user, not the grid.',
  category: 'coal-plant',
  trackers: ['Coal Plant'],
  baseFilters: [
    { field: 'Captive', op: 'not_null' },
  ],
  subClasses: [
    {
      id: 'captive-metals',
      label: 'Metals',
      description: 'Iron & steel, aluminum, nickel, other metals & mining',
      defaultChecked: false,
      filters: [{
        field: 'Captive',
        op: 'includes_any',
        values: [...CAPTIVE_INDUSTRY_GROUPS.metals.values],
        isArray: true,
      }],
    },
    {
      id: 'captive-coal-mining',
      label: 'Coal mining and products',
      defaultChecked: false,
      filters: [{
        field: 'Captive',
        op: 'includes',
        value: 'coal mining & coal products',
        isArray: true,
      }],
    },
    {
      id: 'captive-chemicals',
      label: 'Chemicals',
      defaultChecked: false,
      filters: [{
        field: 'Captive',
        op: 'includes',
        value: 'chemicals',
        isArray: true,
      }],
    },
    {
      id: 'captive-pulp-paper',
      label: 'Pulp & Paper',
      defaultChecked: false,
      filters: [{
        field: 'Captive',
        op: 'includes',
        value: 'pulp & paper',
        isArray: true,
      }],
    },
    {
      id: 'captive-other',
      label: 'Other',
      description: 'Machinery, cement, oil & refining, industrial park, agriculture, textiles, automobiles, sugar, rubber, electronics, cryptocurrency, data center, etc.',
      defaultChecked: false,
      filters: [{
        field: 'Captive',
        op: 'includes_any',
        values: [...CAPTIVE_INDUSTRY_GROUPS.other.values],
        isArray: true,
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
};

/** Coal Plants by Retirement Date — "Planned retirement" year field */
export const CoalPlantsByRetirement: AssetClass = {
  id: 'coal-plants-retirement',
  label: 'Coal Plants by Retirement Date',
  description: 'Coal plants grouped by whether they have a planned or expected retirement date.',
  category: 'coal-plant',
  trackers: ['Coal Plant'],
  subClasses: [
    {
      id: 'no-retirement-date',
      label: 'No planned/expected retirement date',
      defaultChecked: true,
      filters: [{
        field: 'Planned retirement',
        op: 'is_null',
      }],
    },
    {
      id: 'has-retirement-date',
      label: 'Planned/expected retirement date',
      description: 'Can further filter by year',
      defaultChecked: true,
      filters: [{
        field: 'Planned retirement',
        op: 'not_null',
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
    dateRange: {
      field: 'Planned retirement',
      label: 'Retirement year',
    },
  },
};

/** Coal Plant Conversions — "Conversion to (fuel)" prefix matching */
export const CoalPlantConversions: AssetClass = {
  id: 'coal-plant-conversions',
  label: 'Coal Plant Conversions',
  description: 'Coal plants being converted to other fuel types.',
  category: 'coal-plant',
  trackers: ['Coal Plant'],
  baseFilters: [
    { field: 'Conversion to (fuel)', op: 'not_null' },
  ],
  subClasses: [
    {
      id: 'converting-oil-gas',
      label: 'Converting to oil/gas',
      description: 'Includes fossil gas (natural gas, LNG) and fossil liquids (fuel oil, diesel, petroleum coke)',
      defaultChecked: true,
      filters: [{
        // "Conversion to (fuel)" values contain prefixes like "fossil gas:" or "fossil liquids:"
        field: 'Conversion to (fuel)',
        op: 'includes_any',
        values: ['fossil gas:', 'fossil liquids:'],
      }],
    },
    {
      id: 'converting-bioenergy',
      label: 'Converting to bioenergy',
      description: 'Includes wood/biomass, agricultural waste, biocoal, refuse, paper mill wastes',
      defaultChecked: true,
      filters: [{
        field: 'Conversion to (fuel)',
        op: 'includes',
        value: 'bioenergy:',
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
};

// =============================================================================
// COAL MINE CLASSES
// =============================================================================

/** Coal Mines by Use — "Percentage of Met/Thermal Coal" fields (not "Coal Type" which is grade) */
export const CoalMinesByUse: AssetClass = {
  id: 'coal-mines-by-use',
  label: 'Coal Mines by Use',
  description: 'Metallurgical (coking) vs thermal coal mines.',
  category: 'coal-mine',
  trackers: ['Coal Mine'],
  subClasses: [
    {
      id: 'metallurgical-coal',
      label: 'Metallurgical coal',
      description: 'Mines producing coking coal for steel production (Percentage of Met Coal > 0)',
      defaultChecked: true,
      filters: [{
        field: 'Percentage of Met Coal',
        op: 'gt',
        value: 0,
      }],
    },
    {
      id: 'thermal-coal',
      label: 'Thermal coal',
      description: 'Mines producing coal for heat/electricity (Percentage of Thermal Coal > 0)',
      defaultChecked: true,
      filters: [{
        field: 'Percentage of Thermal Coal',
        op: 'gt',
        value: 0,
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
};

/** Coal Mines by Closure Date — "Closing Year" field */
export const CoalMinesByClosure: AssetClass = {
  id: 'coal-mines-by-closure',
  label: 'Coal Mines by Closure Date',
  description: 'Coal mines grouped by planned or expected closure date.',
  category: 'coal-mine',
  trackers: ['Coal Mine'],
  subClasses: [
    {
      id: 'no-closure-date',
      label: 'No planned/expected closure date',
      defaultChecked: true,
      filters: [{
        field: 'Closing Year',
        op: 'is_null',
      }],
    },
    {
      id: 'has-closure-date',
      label: 'Planned/expected closure date',
      description: 'Can further filter by year',
      defaultChecked: true,
      filters: [{
        field: 'Closing Year',
        op: 'not_null',
      }],
    },
    {
      id: 'recently-closed',
      label: 'Recently closed',
      description: 'Can further filter by year',
      defaultChecked: false,
      filters: [{
        // Recently closed = status is retired/closed AND closure date is recent
        field: 'Status',
        op: 'eq',
        value: 'retired',
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
    dateRange: {
      field: 'Closing Year',
      label: 'Closure year',
    },
  },
};

// =============================================================================
// STEEL & IRON CLASSES
// =============================================================================

/** Fossil-Based Iron & Steel Plants — sub-unit matching on BF capacity + DRI reductant */
export const FossilBasedSteelPlants: AssetClass = {
  id: 'fossil-steel-plants',
  label: 'Fossil-Based Iron & Steel Plants',
  description: 'Steel and iron plants using coal or other fossil fuels.',
  category: 'steel-iron',
  trackers: ['Iron & Steel Plant'],
  subClasses: [
    {
      id: 'blast-furnaces',
      label: 'Blast Furnaces (coal-based)',
      description: 'Plants with nominal BF capacity > 0',
      defaultChecked: true,
      filters: [{
        // Plant-level field: "Nominal BF capacity (ttpa)" > 0
        field: 'Nominal BF capacity (ttpa)',
        op: 'gt',
        value: 0,
      }],
    },
    {
      id: 'coal-dri',
      label: 'Coal-based DRI units',
      description: 'DRI furnaces using coal as reductant',
      defaultChecked: true,
      filters: [{
        field: 'Reductant',
        op: 'eq',
        value: 'coal',
        subUnitContext: 'Iron unit data > DRI furnaces',
      }],
    },
    {
      id: 'other-fossil-dri',
      label: 'Other fossil DRI units',
      description: 'DRI furnaces using methane or syngas',
      defaultChecked: true,
      filters: [{
        field: 'Reductant',
        op: 'includes_any',
        values: ['methane', 'syngas'],
        subUnitContext: 'Iron unit data > DRI furnaces',
      }],
      // NOTE: "Unknown reductant" DRI units are intentionally excluded
      // by default. They could be shown unchecked as a separate option.
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
  notes: 'Sub-unit matching: a plant matches if ANY of its child units match the filter.',
};

/** Blast Furnaces by Relining Schedule — sub-unit "Relining Status" field */
export const BlastFurnaceRelinings: AssetClass = {
  id: 'bf-relinings',
  label: 'Blast Furnaces by Relining Schedule',
  description: 'Blast furnaces grouped by their relining status.',
  category: 'steel-iron',
  trackers: ['Iron & Steel Plant'],
  baseFilters: [
    // Only plants with blast furnaces
    { field: 'Nominal BF capacity (ttpa)', op: 'gt', value: 0 },
  ],
  subClasses: [
    {
      id: 'relining-planned',
      label: 'Planned relinings',
      defaultChecked: true,
      filters: [{
        field: 'Relining Status',
        op: 'eq',
        value: 'planned',
        subUnitContext: 'Iron unit data > Blast furnace relinings',
      }],
    },
    {
      id: 'relining-completed',
      label: 'Completed relinings',
      defaultChecked: true,
      filters: [{
        field: 'Relining Status',
        op: 'eq',
        value: 'completed',
        subUnitContext: 'Iron unit data > Blast furnace relinings',
      }],
    },
    {
      id: 'relining-other',
      label: 'Other relinings',
      description: 'In progress, cancelled, or unknown status',
      defaultChecked: false,
      filters: [{
        field: 'Relining Status',
        op: 'includes_any',
        values: ['in progress', 'cancelled', 'unknown'],
        subUnitContext: 'Iron unit data > Blast furnace relinings',
      }],
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
    dateRange: {
      field: 'Relining Start Date',
      label: 'Relining date',
    },
  },
  notes: 'Relining data is in a sub-table, not a flat plant field. Filter by "Relining Start Date BETWEEN _ AND _".',
};

// =============================================================================
// TBD CLASSES (placeholders)
// =============================================================================

/** Chemical Plants — TBD */
export const ChemicalPlants: AssetClass = {
  id: 'chemical-plants',
  label: 'Chemical Plants',
  description: 'Chemical plant asset classes. Definitions TBD.',
  category: 'chemical',
  trackers: [],  // TODO: which tracker? May need new tracker
  subClasses: [],
  availableFilters: {
    geography: true,
    status: true,
  },
  notes: 'TBD — awaiting class definitions from the team.',
};

/** Bioenergy Plants — TBD */
export const BioenergyPlants: AssetClass = {
  id: 'bioenergy-plants',
  label: 'Bioenergy Plants',
  description: 'Bioenergy plant asset classes. Definitions TBD.',
  category: 'bioenergy',
  trackers: ['Bioenergy Power'],
  subClasses: [],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
  notes: 'TBD — awaiting class definitions from the team.',
};

/** Cement & Concrete Plants — TBD */
export const CementPlants: AssetClass = {
  id: 'cement-plants',
  label: 'Concrete and Cement Plants',
  description: 'Cement and concrete plant asset classes. Definitions TBD.',
  category: 'cement',
  trackers: ['Cement or Concrete Plant'],  // Not yet in app TRACKERS config
  subClasses: [],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
  notes: 'TBD — "Cement or Concrete Plant" tracker not yet in app config.',
};

// =============================================================================
// MULTI-TRACKER CLASSES
// =============================================================================

/** Captive Power Plants for Data Centers — multi-tracker (O&G + Coal) */
export const CaptivePowerDataCenters: AssetClass = {
  id: 'captive-power-data-centers',
  label: 'Captive Power Plants for Data Centers',
  description: 'Power plants whose output goes to data center operations.',
  category: 'multi-tracker',
  trackers: ['Oil & Gas Plant', 'Coal Plant'],
  subClasses: [
    {
      id: 'captive-gas-data-center',
      label: 'Captive Oil & Gas Plants for data centers',
      description: 'Can further filter by fuel type: Gas only, Oil only, LNG only, Multi fuel',
      defaultChecked: true,
      filters: [{
        // O&G Plants use unit-level "Captive Industry" field
        field: 'Captive Industry',
        op: 'eq',
        value: 'data center',
        subUnitContext: 'Oil & Gas Plant > Units',
      }],
    },
    {
      id: 'captive-coal-data-center',
      label: 'Captive Coal Plants for data centers',
      defaultChecked: true,
      filters: [{
        field: 'Captive',
        op: 'includes',
        value: 'data center',
        isArray: true,
      }],
    },
    // Future: bioenergy, nuclear if data becomes available
  ],
  availableFilters: {
    geography: true,
    status: true,
    capacity: true,
  },
  notes: 'Gas plant fuel classification filter ("Gas only", "Oil only", "LNG only", "Multi fuel") is an additional narrowing option within the gas sub-class.',
};

/** Coal-Related Assets — multi-tracker cross-cutting class */
export const CoalRelatedAssets: AssetClass = {
  id: 'coal-related-assets',
  label: 'Coal-Related Assets',
  description: 'All coal-based or coal-related assets across multiple trackers.',
  category: 'multi-tracker',
  trackers: ['Coal Plant', 'Coal Mine', 'Iron & Steel Plant'],
  // NOTE: When Chemical and Cement trackers are defined, add them here
  subClasses: [
    {
      id: 'coal-related-coal-plants',
      label: 'Coal Plants',
      defaultChecked: true,
      filters: [{
        // All Coal Plant tracker assets are coal-related by definition
        field: '_tracker',
        op: 'eq',
        value: 'Coal Plant',
      }],
    },
    {
      id: 'coal-related-coal-mines',
      label: 'Coal Mines',
      defaultChecked: true,
      filters: [{
        field: '_tracker',
        op: 'eq',
        value: 'Coal Mine',
      }],
    },
    {
      id: 'coal-related-steel',
      label: 'Coal-based iron & steel',
      description: 'Blast furnaces and coal-based DRI',
      defaultChecked: true,
      filters: [
        // Steel plants that have BF capacity OR coal-based DRI
        // This is an OR condition: either filter matches
        {
          field: 'Nominal BF capacity (ttpa)',
          op: 'gt',
          value: 0,
        },
        // TODO: also include coal-DRI plants (OR logic needed)
      ],
    },
    {
      id: 'coal-related-chemical',
      label: 'Coal-based chemical plants',
      description: 'TBD — pending chemical tracker class definitions',
      defaultChecked: true,
      filters: [],  // TODO: define when chemical classes are ready
    },
    {
      id: 'coal-related-cement',
      label: 'Coal-based concrete & cement plants',
      description: 'TBD — pending cement tracker integration',
      defaultChecked: true,
      filters: [],  // TODO: define when cement tracker is added
    },
  ],
  availableFilters: {
    geography: true,
    status: true,
  },
};

// =============================================================================
// SINGLE-TRACKER BASE CLASSES
// =============================================================================

/** Factory for simple single-tracker base classes with standard filters */
function makeBaseClass(
  id: string,
  label: string,
  description: string,
  category: AssetClassCategory,
  tracker: string,
): AssetClass {
  return { id, label, description, category, trackers: [tracker], availableFilters: { geography: true, status: true, capacity: true } };
}

export const CoalPlants = makeBaseClass('coal-plants', 'Coal Plants', 'All coal-fired power plants.', 'coal-plant', 'Coal Plant');

export const CoalMines: AssetClass = {
  ...makeBaseClass('coal-mines', 'Coal Mines', 'All coal extraction operations.', 'coal-mine', 'Coal Mine'),
  subClasses: CoalMinesByUse.subClasses,
};

export const GasPlants = makeBaseClass('gas-plants', 'Gas Plants', 'Oil & gas power plants.', 'multi-tracker', 'Oil & Gas Plant');
export const GasPipelines = makeBaseClass('gas-pipelines', 'Gas Pipelines', 'Natural gas transmission pipelines.', 'multi-tracker', 'Gas Pipeline');
export const IronMines = makeBaseClass('iron-mines', 'Iron Mines', 'Iron ore extraction operations.', 'steel-iron', 'Iron Mine');
export const SteelPlants = makeBaseClass('steel-plants', 'Iron & Steel Plants', 'All iron and steel production facilities.', 'steel-iron', 'Iron & Steel Plant');
export const BioenergyPower = makeBaseClass('bioenergy-power', 'Bioenergy Power', 'All bioenergy power plants.', 'bioenergy', 'Bioenergy Power');

// =============================================================================
// REGISTRY
// =============================================================================

/** All defined asset classes, in display order */
export const ALL_ASSET_CLASSES: AssetClass[] = [
  // Multi-tracker
  CoalRelatedAssets,
  CaptivePowerDataCenters,

  // Coal plant
  CaptiveCoalPlants,
  CoalPlantsByRetirement,
  CoalPlantConversions,

  // Coal mine
  CoalMinesByUse,
  CoalMinesByClosure,

  // Steel & iron
  FossilBasedSteelPlants,
  BlastFurnaceRelinings,

  // TBD
  ChemicalPlants,
  BioenergyPlants,
  CementPlants,

  // Single-tracker base classes
  CoalPlants,
  CoalMines,
  GasPlants,
  GasPipelines,
  IronMines,
  SteelPlants,
  BioenergyPower,
];

// =============================================================================
// LOOKUP HELPERS
// =============================================================================

/** Get an asset class by ID */
export function getAssetClassById(id: string): AssetClass | undefined {
  return ALL_ASSET_CLASSES.find((ac) => ac.id === id);
}

/** Get all asset classes for a given category */
export function getAssetClassesByCategory(category: AssetClassCategory): AssetClass[] {
  return ALL_ASSET_CLASSES.filter((ac) => ac.category === category);
}

/** Get all asset classes that involve a given tracker */
export function getAssetClassesForTracker(tracker: string): AssetClass[] {
  return ALL_ASSET_CLASSES.filter((ac) => ac.trackers.includes(tracker));
}

/** Get only the "advanced" classes (those with sub-classes or multi-tracker) */
export function getAdvancedClasses(): AssetClass[] {
  return ALL_ASSET_CLASSES.filter(
    (ac) =>
      (ac.subClasses && ac.subClasses.length > 0) ||
      (ac.subClassGroups && ac.subClassGroups.length > 0) ||
      ac.trackers.length > 1
  );
}

/** Get only the single-tracker base classes (simple presets) */
export function getBaseClasses(): AssetClass[] {
  return ALL_ASSET_CLASSES.filter(
    (ac) =>
      ac.trackers.length === 1 &&
      (!ac.subClasses || ac.subClasses.length === 0) &&
      (!ac.subClassGroups || ac.subClassGroups.length === 0) &&
      !ac.baseFilters?.length
  );
}

// =============================================================================
// FIELD FILTER EVALUATION
// =============================================================================

/**
 * Evaluate a FieldFilter against a record.
 *
 * For array fields (isArray: true), splits the raw value on delimiter
 * before matching. For sub-unit fields (subUnitContext), the caller
 * must handle the sub-unit lookup externally — this function only
 * handles flat record fields.
 */
export function evaluateFilter(
  filter: FieldFilter,
  record: Record<string, unknown>
): boolean {
  // Sub-unit filters can't be evaluated on a flat record
  if (filter.subUnitContext) {
    console.warn(
      `[asset-class] Filter on "${filter.field}" requires sub-unit context "${filter.subUnitContext}". Skipping.`
    );
    return false;
  }

  // Special pseudo-field: _tracker matches the record's tracker/asset type
  if (filter.field === '_tracker') {
    const tracker = String(record['Asset Type'] || record['Tracker'] || '');
    if (filter.op === 'eq') return tracker === filter.value;
    if (filter.op === 'neq') return tracker !== filter.value;
    return false;
  }

  const raw = record[filter.field];

  // Handle null/empty checks first
  if (filter.op === 'is_null') {
    return raw == null || String(raw).trim() === '' || String(raw).toLowerCase() === 'nan';
  }
  if (filter.op === 'not_null') {
    return raw != null && String(raw).trim() !== '' && String(raw).toLowerCase() !== 'nan';
  }

  // For remaining ops, get the value (possibly as array)
  const strVal = String(raw ?? '').trim();
  const delimiter = filter.delimiter || ',';

  if (filter.isArray) {
    // Split delimited value into array of trimmed lowercase strings
    const parts = strVal
      .split(delimiter)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);

    if (filter.op === 'includes' && filter.value != null) {
      return parts.includes(String(filter.value).toLowerCase());
    }
    if (filter.op === 'includes_any' && filter.values) {
      const targets = filter.values.map((v) => v.toLowerCase());
      return parts.some((p) => targets.includes(p));
    }
    // eq on array: exact match of any element
    if (filter.op === 'eq' && filter.value != null) {
      return parts.includes(String(filter.value).toLowerCase());
    }
    return false;
  }

  // Scalar field matching
  switch (filter.op) {
    case 'eq':
      return strVal.toLowerCase() === String(filter.value ?? '').toLowerCase();
    case 'neq':
      return strVal.toLowerCase() !== String(filter.value ?? '').toLowerCase();
    case 'gt':
      return Number(raw) > Number(filter.value ?? 0);
    case 'gte':
      return Number(raw) >= Number(filter.value ?? 0);
    case 'lt':
      return Number(raw) < Number(filter.value ?? 0);
    case 'between':
      return Number(raw) >= (filter.min ?? -Infinity) && Number(raw) <= (filter.max ?? Infinity);
    case 'includes':
      return strVal.toLowerCase().includes(String(filter.value ?? '').toLowerCase());
    case 'includes_any':
      return (filter.values ?? []).some((v) =>
        strVal.toLowerCase().includes(v.toLowerCase())
      );
    default:
      return false;
  }
}

/**
 * Test if a record matches ALL filters in a list (AND logic).
 */
export function matchesAllFilters(
  filters: FieldFilter[],
  record: Record<string, unknown>
): boolean {
  return filters.every((f) => evaluateFilter(f, record));
}

/**
 * Test if a record matches ANY filter in a list (OR logic).
 */
export function matchesAnyFilter(
  filters: FieldFilter[],
  record: Record<string, unknown>
): boolean {
  return filters.some((f) => evaluateFilter(f, record));
}

/**
 * Given an asset class and selected sub-class IDs, build the complete
 * filter function for matching records.
 *
 * Logic:
 * 1. Record must pass ALL baseFilters (AND)
 * 2. Record must match at least ONE selected sub-class (OR across sub-classes)
 * 3. Within each sub-class, ALL filters must match (AND)
 *
 * If no sub-classes are selected, only baseFilters apply.
 */
export function buildClassMatcher(
  assetClass: AssetClass,
  selectedSubClassIds?: string[]
): (record: Record<string, unknown>) => boolean {
  return (record: Record<string, unknown>) => {
    // Step 1: base filters
    if (assetClass.baseFilters && assetClass.baseFilters.length > 0) {
      if (!matchesAllFilters(assetClass.baseFilters, record)) return false;
    }

    // Step 2: sub-class filters (OR logic across selected sub-classes)
    if (selectedSubClassIds && selectedSubClassIds.length > 0 && assetClass.subClasses) {
      const selectedSubs = assetClass.subClasses.filter((sc) =>
        selectedSubClassIds.includes(sc.id)
      );
      if (selectedSubs.length > 0) {
        return selectedSubs.some((sc) => matchesAllFilters(sc.filters, record));
      }
    }

    return true;
  };
}

/**
 * aggregate-api.ts
 *
 * Bridge between CoalQuery state and the API's per-field aggregation endpoints.
 *
 * Handles:
 *   - Building per-field API URLs
 *   - Plant-mode location_id injection + client-side collapse
 *   - Cross-tracker column-join on shared group keys
 *
 * NO plantRollup metadata — the user's chosen aggregation function is used for
 * both the API call and the client-side collapse. This is intentional: it's a
 * research tool, and researchers should see what computation they're asking for.
 *
 * When granularity='project' for coal-plant fields:
 *   1. API call adds location_id to group_by (collapses units to plants)
 *   2. API uses the user's chosen fn (sum/avg/count)
 *   3. Client collapses location_id with the same fn
 *
 * This means:
 *   - "sum capacity by country, per plant" → SUM(SUM per plant) = correct
 *   - "avg capacity by country, per plant" → AVG(AVG per plant) ≈ close enough,
 *     and the researcher can switch to "per unit" if they want unit-level avg
 *   - "avg age by country, per plant" → AVG(AVG per plant) = correct (uniform)
 *
 * API CONTRACT:
 *   GET /catalog/metadata/{tracker}/fields/{field_name}/{agg_fn}
 *   Params: status, country, group_by (all repeated for multiple values)
 *   Grouped: { field, name, data_type, aggregate, group_by, total_groups, groups: [{...keys, value}] }
 *   Scalar:  { field, name, data_type, aggregate, value: number }
 */

import {
  getField,
  type CoalQuery,
  type CoalQueryAggregate,
  type Tracker,
  type AggFn,
} from './coal-field-schema';
import { STATUS_GROUPS, displayStatusToApiKey, isCoarseStatus } from './tracker-schema';

const API_BASE = import.meta.env.PUBLIC_OWNERSHIP_API_BASE_URL || 'https://gem-api.thirdbear.net';

// ── Types ──────────────────────────────────────────────────────────────────

interface AggregateGroup {
  [groupKey: string]: string | number;
  value: number;
}

export interface SummaryRow {
  [key: string]: string | number | null;
}


// ── Single-tracker fetch ───────────────────────────────────────────────────

/**
 * Fetch one aggregation for one field from one tracker.
 *
 * PLANT MODE (coal-plant only, when granularity='project'):
 *   Adds location_id to group_by so the API returns one row per plant.
 *   Uses the user's chosen fn for both the API call and the collapse.
 *   Coal-mine calls are never affected — mines have no sub-units.
 */
async function fetchOneTrackerAggregate(
  query: CoalQuery,
  aggregate: CoalQueryAggregate,
  tracker: Tracker,
): Promise<AggregateGroup[]> {
  const field = getField(aggregate.field);
  if (!field) throw new Error(`Unknown field: ${aggregate.field}`);

  const needsPlantCollapse =
    query.granularity === 'project' &&
    tracker === 'coal-plant' &&
    field.aggregatable != null &&
    !field.skipPlantCollapse;

  const apiGroupBy = needsPlantCollapse
    ? ['location_id', ...query.groupBy]
    : [...query.groupBy];

  // Build filter params using the same group-aware status logic as appendCoalFilters
  const url = new URL(
    `${API_BASE}/catalog/metadata/${tracker.endsWith('s') ? tracker : tracker + 's'}/fields/${field.apiFieldKey ?? aggregate.field}/${aggregate.fn}`
  );
  const f = query.filters;
  if (f.status?.length) {
    const selectedSet = new Set(f.status);
    const handled = new Set<string>();
    for (const sg of STATUS_GROUPS) {
      const inGroup = (sg.statuses as readonly string[]).filter((s) => selectedSet.has(s));
      if (inGroup.length === 0) continue;
      if (inGroup.length === sg.statuses.length && isCoarseStatus(sg.id)) {
        url.searchParams.append('status', sg.id);
      } else {
        for (const v of inGroup) {
          const apiKey = displayStatusToApiKey(v);
          if (apiKey) url.searchParams.append('sub_status', apiKey);
        }
      }
      for (const v of inGroup) handled.add(v);
    }
    for (const v of f.status) {
      if (!handled.has(v)) {
        if (isCoarseStatus(v)) {
          url.searchParams.append('status', v);
        } else {
          const apiKey = displayStatusToApiKey(v);
          if (apiKey) url.searchParams.append('sub_status', apiKey);
        }
      }
    }
  }
  if (f.country_area?.length) {
    for (const c of f.country_area) url.searchParams.append('country', c);
  }
  for (const g of apiGroupBy) url.searchParams.append('group_by', g);
  const response = await fetch(url);

  if (!response.ok) {
    if (import.meta.env.DEV) console.warn(`Aggregate fetch failed: ${url} → ${response.status}`);
    return [];
  }

  const data = await response.json();
  let groups: AggregateGroup[] = data.groups ?? [];

  if (needsPlantCollapse && groups.length > 0) {
    groups = collapseLocationId(groups, query.groupBy, aggregate.fn);
  }

  return groups;
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Fetch one aggregation, routing to the correct tracker.
 *
 * Each aggregatable field belongs to exactly one tracker in the current
 * coal schema. Cross-tracker numeric aggregation (summing a single field
 * across both trackers) is not supported and will throw.
 */
export async function fetchAggregate(
  query: CoalQuery,
  aggregate: CoalQueryAggregate,
): Promise<AggregateGroup[]> {
  const field = getField(aggregate.field);
  if (!field) throw new Error(`Unknown field: ${aggregate.field}`);

  const relevantTrackers = query.trackers.filter(t => field.trackers.includes(t));

  if (relevantTrackers.length === 0) {
    return [];
  }

  if (relevantTrackers.length > 1) {
    throw new Error(
      `Field '${aggregate.field}' exists in multiple selected trackers ` +
      `(${relevantTrackers.join(', ')}). Cross-tracker numeric aggregation ` +
      `is not implemented.`
    );
  }

  return fetchOneTrackerAggregate(query, aggregate, relevantTrackers[0]);
}

/**
 * Fetch all aggregates in parallel and merge into summary table rows.
 *
 * Each aggregate becomes a column keyed as "fn:field" (e.g., "sum:capacity_mw").
 * Rows are keyed by the visible group-by fields.
 *
 * Cross-tracker: tracker-specific fields produce separate columns, joined on
 * shared group-by keys. A country row might have capacity_mw from plants AND
 * capacity_mtpa from mines. Countries with only one tracker type get null
 * for the other's columns — not zero.
 */
export async function fetchSummaryTable(query: CoalQuery): Promise<SummaryRow[]> {
  const results = await Promise.all(
    query.aggregates.map(async (agg) => ({
      agg,
      groups: await fetchAggregate(query, agg),
    }))
  );

  const merged = new Map<string, SummaryRow>();
  const allColKeys = results.map(r => `${r.agg.fn}:${r.agg.field}`);

  for (const { agg, groups } of results) {
    const colKey = `${agg.fn}:${agg.field}`;
    for (const group of groups) {
      const rowKey = query.groupBy.map(k => String(group[k] ?? '')).join('|||');
      if (!merged.has(rowKey)) {
        const row: SummaryRow = {};
        query.groupBy.forEach(k => { row[k] = group[k]; });
        merged.set(rowKey, row);
      }
      merged.get(rowKey)![colKey] = group.value;
    }
  }

  // Missing values are null, not zero
  for (const row of merged.values()) {
    for (const colKey of allColKeys) {
      if (!(colKey in row)) row[colKey] = null;
    }
  }

  return Array.from(merged.values());
}

// ── Client-side re-aggregation ─────────────────────────────────────────────

/**
 * Collapse location_id from plant-level rows to visible-group-level rows.
 *
 * Input:  [{location_id: "L001", country_area: "China", value: 900}, ...]
 * Output: [{country_area: "China", value: 542.3}, ...]
 *
 * Uses the same function the user chose — no hidden plantRollup logic.
 */
function collapseLocationId(
  plantRows: AggregateGroup[],
  visibleGroupKeys: string[],
  displayFn: AggFn,
): AggregateGroup[] {
  const buckets = new Map<string, number[]>();

  for (const row of plantRows) {
    const bucketKey = visibleGroupKeys.map(k => String(row[k] ?? '')).join('|||');
    if (!buckets.has(bucketKey)) buckets.set(bucketKey, []);
    if (typeof row.value === 'number') buckets.get(bucketKey)!.push(row.value);
  }

  const result: AggregateGroup[] = [];
  for (const [bucketKey, values] of buckets) {
    const keyParts = bucketKey.split('|||');
    const row: AggregateGroup = { value: 0 };
    visibleGroupKeys.forEach((k, i) => { row[k] = keyParts[i]; });

    switch (displayFn) {
      case 'sum':
        row.value = values.reduce((a, b) => a + b, 0);
        break;
      case 'avg':
        row.value = values.reduce((a, b) => a + b, 0) / values.length;
        break;
      case 'count':
        row.value = values.length;
        break;
    }

    result.push(row);
  }

  return result;
}

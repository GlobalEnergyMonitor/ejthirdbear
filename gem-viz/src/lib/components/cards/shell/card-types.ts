/**
 * card-types.ts
 *
 * Shared primitive types for the tracker card system.
 *
 * CardShell owns the outer chrome (header, tab bar, layout).
 * CardSection renders a labelled group of FieldDef rows.
 * Each tracker card (CoalPlantCard, CoalMineCard, …) provides its own
 * data derivation, tab content via Svelte snippets, and asset-specific CSS.
 *
 * Adding a new tracker card:
 *   1. Create <TrackerName>-types.ts with your asset's field interface
 *   2. Create <TrackerName>Card.svelte using <CardShell> + <CardSection>
 *   3. Add fetchProps + loadComponent to tracker-card-registry.ts
 */

/** Maps to the four CSS badge classes (badge-operating, etc.) */
export type StatusGroup = 'operating' | 'planned' | 'cancelled' | 'retired';

/**
 * A single labelled field row inside a CardSection.
 * Rows where `value` is null/undefined/"" are hidden by default.
 */
export interface FieldDef {
  label: string;
  value: string | number | null | undefined;
  /** Appended after the value: "42 Mtpa", "75 m" */
  unit?: string;
  /** Render value as an anchor tag */
  link?: string;
  /** CSS tooltip on the label */
  tooltip?: string;
  /** CSS tooltip on the value */
  valueTooltip?: string;
  /**
   * 'hide'  (default) — omit the row when value is empty
   * 'dash'  — show "—" placeholder instead of hiding
   */
  emptyBehavior?: 'hide' | 'dash';
}

/**
 * A labelled group of field rows, rendered by <CardSection>.
 * `title` is optional — omit for the first/only section in a tab
 * where the tab name already provides context.
 */
export interface CardSection {
  title?: string;
  fields: FieldDef[];
}

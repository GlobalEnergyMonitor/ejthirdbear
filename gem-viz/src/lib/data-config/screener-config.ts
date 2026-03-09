/**
 * Screener-specific configuration
 *
 * Contains:
 * - Example companies for owner search suggestions
 * - Any screener-specific display settings
 */

// =============================================================================
// EXAMPLE COMPANIES BY TRACKER
// =============================================================================

export interface ExampleCompany {
  name: string;
  id: string;
}

/**
 * Example companies to suggest when searching for owners.
 * Grouped by tracker type for relevance.
 */
export const EXAMPLE_COMPANIES_BY_TRACKER: Record<string, ExampleCompany[]> = {
  'Coal Plant': [
    { name: 'China Energy Investment', id: 'E100001000348' },
    { name: 'NTPC Limited', id: 'E100001000001' },
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    { name: 'Adani Power', id: 'E100001000003' },
  ],
  'Steel Plant': [
    { name: 'ArcelorMittal', id: 'E100001000100' },
    { name: 'Nippon Steel', id: 'E100001000101' },
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    { name: 'POSCO', id: 'E100001000103' },
  ],
  'Oil & NGL Pipeline': [
    { name: 'ExxonMobil', id: 'E100001000200' },
    { name: 'Shell', id: 'E100001000201' },
    { name: 'TotalEnergies', id: 'E100001000202' },
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
  ],
  'Gas Pipeline': [
    { name: 'Gazprom', id: 'E100001000300' },
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    { name: 'Enterprise Products', id: 'E100001000302' },
    { name: 'Enbridge', id: 'E100001000303' },
  ],
  LNG: [
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    { name: 'Qatar Energy', id: 'E100001000400' },
    { name: 'Cheniere Energy', id: 'E100001000401' },
    { name: 'Woodside Energy', id: 'E100001000402' },
  ],
  default: [
    { name: 'Mitsubishi Corporation', id: 'E100001000500' },
    { name: 'ExxonMobil', id: 'E100001000200' },
    { name: 'Shell', id: 'E100001000201' },
    { name: 'TotalEnergies', id: 'E100001000202' },
  ],
};

/**
 * Get example companies for a set of trackers.
 * Returns unique companies relevant to the selected trackers.
 */
export function getExampleCompanies(trackers: string[]): ExampleCompany[] {
  if (trackers.length === 0) {
    return EXAMPLE_COMPANIES_BY_TRACKER.default;
  }

  const examples: ExampleCompany[] = [];
  const seen = new Set<string>();

  for (const tracker of trackers) {
    const trackerExamples = EXAMPLE_COMPANIES_BY_TRACKER[tracker] || [];
    for (const ex of trackerExamples) {
      if (!seen.has(ex.name)) {
        seen.add(ex.name);
        examples.push(ex);
      }
    }
  }

  return examples.length > 0 ? examples.slice(0, 4) : EXAMPLE_COMPANIES_BY_TRACKER.default;
}

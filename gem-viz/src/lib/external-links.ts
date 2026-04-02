/**
 * Centralized external link configuration for GEM resources.
 *
 * All globalenergymonitor.org URLs, GitHub repos, and contact info
 * in one place so they stay consistent across the app.
 */

// ─── Base domains ──────────────────────────────────────────────────────────
export const GEM_DOMAIN = 'https://globalenergymonitor.org';
export const GEM_GITHUB_ORG = 'https://github.com/GlobalEnergyMonitor';

// ─── Contact ───────────────────────────────────────────────────────────────
export const GEM_DATA_EMAIL = 'data@globalenergymonitor.org';
export const GEM_OWNERSHIP_ISSUES = `${GEM_GITHUB_ORG}/Ownership_External_Dataset/issues`;
export const GEM_OWNERSHIP_DOCS = `${GEM_GITHUB_ORG}/Ownership_External_Dataset`;

// ─── CORS origins (for resolve-id endpoint) ────────────────────────────────
export const GEM_CORS_ORIGINS = [GEM_DOMAIN, 'https://www.globalenergymonitor.org'];

// ─── Tracker project pages ─────────────────────────────────────────────────

/** Map of tracker slug → GEM project page URL */
const TRACKER_PROJECT_PAGES: Record<string, string> = {
  'coal-plant': `${GEM_DOMAIN}/projects/global-coal-plant-tracker/`,
  'gas-plant': `${GEM_DOMAIN}/projects/global-gas-plant-tracker/`,
  'coal-mine': `${GEM_DOMAIN}/projects/global-coal-mine-tracker/`,
  'iron-mine': `${GEM_DOMAIN}/projects/global-iron-mine-tracker/`,
  'steel-plant': `${GEM_DOMAIN}/projects/global-steel-plant-tracker/`,
  'gas-pipeline': `${GEM_DOMAIN}/projects/global-gas-pipeline-tracker/`,
  bioenergy: `${GEM_DOMAIN}/projects/global-bioenergy-power-tracker/`,
  'oil-pipeline': `${GEM_DOMAIN}/projects/global-oil-gas-extraction-tracker/`,
  'cement-plant': `${GEM_DOMAIN}/projects/global-cement-tracker/`,
};

/** Get the GEM project page for a tracker by slug or display name */
export function gemTrackerPage(trackerSlugOrName: string): string {
  const slug = trackerSlugOrName.toLowerCase().replace(/ /g, '-');
  return TRACKER_PROJECT_PAGES[slug] || `${GEM_DOMAIN}/projects/`;
}

/** Map of tracker slug → GitHub repo URL */
const TRACKER_GITHUB_REPOS: Record<string, string> = {
  'coal-plant': `${GEM_GITHUB_ORG}/coal-plant-tracker`,
  'gas-plant': `${GEM_GITHUB_ORG}/gas_plant_tracker`,
  'coal-mine': `${GEM_GITHUB_ORG}/coal-mine-tracker`,
  'iron-mine': `${GEM_GITHUB_ORG}/iron_mine_tracker`,
  'steel-plant': `${GEM_GITHUB_ORG}/steel_plant_tracker`,
  'cement-plant': `${GEM_GITHUB_ORG}/cement_tracker`,
  'gas-pipeline': `${GEM_GITHUB_ORG}/gas_infrastructure_tracker`,
  'oil-pipeline': `${GEM_GITHUB_ORG}/oil_pipeline_tracker`,
  bioenergy: `${GEM_GITHUB_ORG}/bioenergy_tracker`,
};

/** Get the GitHub repo URL for a tracker by slug */
export function gemTrackerRepo(trackerSlug: string): string | null {
  return TRACKER_GITHUB_REPOS[trackerSlug] || null;
}

// ─── Citation display names ────────────────────────────────────────────────

/** Map tracker display name → GEM project page (used by Citation component) */
export const TRACKER_CITATION_URLS: Record<string, string> = {
  'Coal Plant': TRACKER_PROJECT_PAGES['coal-plant'],
  'Coal Mine': TRACKER_PROJECT_PAGES['coal-mine'],
  'Gas Plant': TRACKER_PROJECT_PAGES['gas-plant'],
  'Steel Plant': TRACKER_PROJECT_PAGES['steel-plant'],
  'Iron Mine': TRACKER_PROJECT_PAGES['iron-mine'],
  Bioenergy: TRACKER_PROJECT_PAGES['bioenergy'],
  'Oil/Gas': TRACKER_PROJECT_PAGES['oil-pipeline'],
};

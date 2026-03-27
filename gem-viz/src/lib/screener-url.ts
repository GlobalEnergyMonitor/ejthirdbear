import { link } from '$lib/links';

const DUMMY_BASE = 'https://gem.local';

/**
 * Screener URL contract + developer map (in-code docs)
 *
 * Query params:
 * - `classes`: JSON.stringify(ScreenerClassParamItem[])
 * - `owners`: comma-separated entity IDs (e.g. "E1,E2,E3")
 *
 * Canonical screener edit surfaces:
 * - `src/lib/screener-url.ts` (URL building/parsing)
 * - `src/lib/components/ScreenerStepNav.svelte` (step links)
 * - `src/routes/screener/+page.svelte` (Step 1, classes payload build)
 * - `src/routes/screener/owners/+page.svelte` (Step 2, owner selection handoff)
 * - `src/routes/screener/results/+page.svelte` (Step 3, filters/query execution)
 * - `src/routes/screener/visualize/+page.svelte` (Step 4 navigation)
 * - `src/lib/components/AssetClassesPanel.svelte` (shared selected-class parsing/rendering)
 * - `src/lib/data-config/screener-api.ts` (query/data pipeline)
 * - `src/lib/data-config/asset-class-definitions.ts` (class/subclass matcher rules)
 *
 * If you change query shape or flow wiring, validate:
 * 1) StepNav preserves classes/owners as expected
 * 2) Step 1 -> 2/3 handoff
 * 3) Step 2 -> 3 owner filtering
 * 4) Step 3 remove/edit class behavior
 * 5) Step 4 back-navigation to Step 3
 */

export type ScreenerRoutePath =
  | 'screener'
  | 'screener/owners'
  | 'screener/results'
  | 'screener/visualize';

export interface ScreenerClassParamItem {
  id?: string;
  assetClassId?: string;
  name?: string;
  tracker?: string;
  filters?: {
    geography?: string;
    status?: string;
    statuses?: string[];
    geofence?: number[][];
  };
  selectedSubClasses?: string[];
  gemTrackers?: string[];
}

export interface ScreenerUrlParams {
  classes?: string | null;
  owners?: string | null;
  q?: string | null;
}

export function buildScreenerUrl(path: ScreenerRoutePath, params: ScreenerUrlParams = {}): string {
  const url = new URL(link(path), DUMMY_BASE);

  if (params.classes) {
    url.searchParams.set('classes', params.classes);
  } else {
    url.searchParams.delete('classes');
  }

  if (params.owners) {
    url.searchParams.set('owners', params.owners);
  } else {
    url.searchParams.delete('owners');
  }

  if (params.q) {
    url.searchParams.set('q', params.q);
  } else {
    url.searchParams.delete('q');
  }

  return `${url.pathname}${url.search}`;
}

export function parseJsonSearchParam<T>(paramValue: string): T | null {
  if (!paramValue) return null;

  try {
    return JSON.parse(paramValue) as T;
  } catch {
    // URLSearchParams is already decoded in most cases, but keep this fallback
    // for legacy double-encoded links.
    try {
      return JSON.parse(decodeURIComponent(paramValue)) as T;
    } catch {
      return null;
    }
  }
}

/** Same as buildScreenerUrl but routes to /embed/screener/* paths */
export function buildEmbedScreenerUrl(
  path: 'embed/screener' | 'embed/screener/owners' | 'embed/screener/results',
  params: ScreenerUrlParams = {}
): string {
  return buildScreenerUrl(path as ScreenerRoutePath, params);
}

/**
 * Read/write screener state as URL hash params (for Drupal iframe embedding).
 * Hash is never sent to server so Drupal never sees state changes.
 * Format: #classes=<encoded>&owners=<ids>
 */
export function readScreenerHash(): ScreenerUrlParams {
  if (typeof window === 'undefined') return {};
  const raw = window.location.hash.slice(1);
  if (!raw) return {};
  const p = new URLSearchParams(raw);
  return {
    classes: p.get('classes') || null,
    owners: p.get('owners') || null,
    q: p.get('q') || null,
  };
}

export function writeScreenerHash(params: ScreenerUrlParams) {
  if (typeof window === 'undefined') return;
  const p = new URLSearchParams();
  if (params.classes) p.set('classes', params.classes);
  if (params.owners) p.set('owners', params.owners);
  if (params.q) p.set('q', params.q);
  const hash = p.toString();
  history.replaceState(null, '', hash ? '#' + hash : location.pathname + location.search);
}

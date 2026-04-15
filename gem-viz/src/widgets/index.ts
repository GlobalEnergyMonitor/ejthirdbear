/**
 * GEM Widget System — Entry point for dynamic (non-iframe) embeds.
 *
 * ## What is this?
 * A Shadow DOM widget system that renders GEM visualizations directly into a
 * host page without an iframe. Components are Svelte 5, isolated in shadow
 * roots, and lazy-loaded per widget type.
 *
 * ## Two embed systems
 * - **iframe embeds** (`src/routes/embed/*`): each route is a full SvelteKit
 *   page rendered in an <iframe>. Simple, fully isolated, works everywhere.
 * - **dynamic widgets** (`src/widgets/`): Svelte components mounted directly
 *   into the host page DOM via Shadow DOM. No iframe — better UX (no resize
 *   jank), but requires JS and CORS-compatible API.
 *
 * `static/embed.js` selects the mode: `data-mode="dynamic"` → widgets,
 * default → iframe. If dynamic mount fails it falls back to iframe.
 *
 * ## Build pipeline
 * `src/widgets/` is compiled by a separate Vite entry point (see
 * `vite.config.js` widget build). Output lands in `static/widgets/` as
 * ES module chunks. The main SvelteKit build does NOT include these files.
 * Shared dependencies (Svelte runtime, etc.) are bundled into the widget
 * chunks so they work standalone.
 *
 * ## How embed.js uses this
 * 1. `embed.js` is loaded on the host page (Drupal, WordPress, etc.).
 * 2. For `data-mode="dynamic"` elements it imports
 *    `{baseUrl}/widgets/index.js` as a dynamic ES module.
 * 3. Calls `configure({ apiBase, appBase })` then `parseSrc(dataSrc)` to
 *    extract the widget type + props from the `data-src` URL.
 * 4. Calls `mountWidget(shadowRoot, type, props)` which lazy-loads the
 *    matching Svelte component chunk and mounts it.
 * 5. CSS design tokens are injected into the shadow root via `widget-styles.ts`;
 *    Google Fonts are injected once into the host `<head>`.
 *
 * ## widget-api.ts / widget-data.ts
 * Standalone counterparts of `ownership-api.ts` / `ownership-data.ts`.
 * No SvelteKit dependencies (`$app/*`, `import.meta.env`). API base URL is
 * configurable via `configure()` for cross-origin use from any CMS.
 *
 * ## Adding a new widget type
 * 1. Create `src/widgets/GemMyWidget.svelte` (accepts typed `$props()`).
 * 2. Add an entry to `WIDGET_MAP` below:
 *      'my-widget': () => import('./GemMyWidget.svelte'),
 * 3. The key becomes the URL path segment: `/embed/my-widget?...`.
 *    `parseSrc()` maps URL params → props automatically; add a remap
 *    rule in `parseSrc()` if param names differ from prop names.
 * 4. Add a matching iframe route at `src/routes/embed/my-widget/+page.svelte`
 *    if you also want iframe-mode support (recommended).
 *
 * ## Direct usage
 *   import { configure, mountWidget } from '/widgets/index.js';
 *   configure({ apiBase: 'https://gem-api.thirdbear.net' });
 *   const shadow = el.attachShadow({ mode: 'open' });
 *   mountWidget(shadow, 'entity', { entityId: 'E12345' });
 */

import { mount, unmount } from 'svelte';
import { configure as configureApi } from './widget-api';
import { injectStyles } from './widget-styles';

// ============================================================================
// WIDGET REGISTRY — lazy-loaded chunks
// ============================================================================

const WIDGET_MAP: Record<string, () => Promise<{ default: unknown }>> = {
  entity: () => import('./GemEntityCard.svelte'),
  asset: () => import('./GemAssetCard.svelte'),
  'ownership-flower': () => import('./GemOwnershipFlower.svelte'),
  'coal-plant': () => import('./GemCoalPlantCard.svelte'),
  'coal-plant-test': () => import('./GemCoalPlantCard.svelte'),
  'ownership-graph': () => import('./GemOwnershipGraph.svelte'),
  'project-card': () => import('./GemProjectCard.svelte'),
  'asset-ring': () => import('./GemAssetRing.svelte'),
  'ultimate-owners': () => import('./GemUltimateOwners.svelte'),
  'network-3d': () => import('./GemNetworkGraph.svelte'),
  'asset-search': () => import('./GemAssetSearch.svelte'),
  'tracker-factsheet': () => import('./GemTrackerFactsheet.svelte'),
  controlchain: () => import('./GemControlChain.svelte'),
  'coal-data-explorer': () => import('./GemCoalDataExplorer.svelte'),
  viz: () => import('./GemViz.svelte'),
  screener: () => import('./GemScreener.svelte'),
  'portfolio-explorer': () => import('./GemPortfolioExplorer.svelte'),
};

export function listWidgets(): string[] {
  return Object.keys(WIDGET_MAP);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

export function configure(opts: { apiBase?: string; appBase?: string }) {
  configureApi(opts);
}

// ============================================================================
// MOUNT / UNMOUNT
// ============================================================================

/** Track mounted widget instances for cleanup */
const mountedWidgets = new WeakMap<ShadowRoot, unknown>();

/**
 * Mount a widget into a Shadow DOM root.
 *
 * @param shadowRoot - The shadow root to render into
 * @param widgetType - Widget type key (e.g., 'entity', 'ownership-flower')
 * @param props - Widget props extracted from data-src params
 * @returns Promise that resolves when widget is mounted
 */
export async function mountWidget(
  shadowRoot: ShadowRoot,
  widgetType: string,
  props: Record<string, unknown>
): Promise<void> {
  const loader = WIDGET_MAP[widgetType];
  if (!loader) {
    throw new Error(
      `Unknown widget type: "${widgetType}". Available: ${Object.keys(WIDGET_MAP).join(', ')}`
    );
  }

  // Inject shared CSS tokens into shadow root
  injectStyles(shadowRoot);

  // Create a mount target inside shadow root
  const target = document.createElement('div');
  target.className = 'gem-widget-root';
  shadowRoot.appendChild(target);

  // Load the widget component chunk
  const mod = await loader();

  // Mount the Svelte component
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const instance = mount(mod.default as any, { target, props });
  mountedWidgets.set(shadowRoot, instance);

  // Dispatch gem:loaded for direct API users (embed-source.js dispatches a richer version)
  shadowRoot.host?.dispatchEvent(
    new CustomEvent('gem:loaded', {
      composed: true,
      bubbles: true,
      detail: { widgetType },
    })
  );
}

/**
 * Unmount a widget from a Shadow DOM root.
 */
export function unmountWidget(shadowRoot: ShadowRoot): void {
  const instance = mountedWidgets.get(shadowRoot);
  if (instance) {
    unmount(instance);
    mountedWidgets.delete(shadowRoot);
  }
}

// ============================================================================
// URL PARSING — extract widget type + props from embed data-src
// ============================================================================

/**
 * Parse a data-src URL into widget type and props.
 * e.g., "/embed/entity?id=E12345&showFlower=true"
 *   → { type: 'entity', props: { entityId: 'E12345', showFlower: true } }
 */
export function parseSrc(dataSrc: string): { type: string; props: Record<string, unknown> } {
  let url: URL;
  try {
    url = new URL(dataSrc, 'https://placeholder');
  } catch {
    return { type: '', props: {} };
  }

  // Extract widget type from path: /embed/entity → "entity"
  const pathMatch = url.pathname.match(/\/embed\/([^/]+)/);
  const type = pathMatch?.[1] || '';

  // Convert URL params to props
  const props: Record<string, unknown> = {};
  url.searchParams.forEach((value, key) => {
    // Skip embed-shell params
    if (['embed', 'embedId', 'autoHeight', 'branding', 'padding'].includes(key)) return;

    // Parse booleans
    if (value === 'true') {
      props[key] = true;
      return;
    }
    if (value === 'false') {
      props[key] = false;
      return;
    }

    // Parse numbers
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') {
      props[key] = num;
      return;
    }

    props[key] = value;
  });

  // Remap common param names to widget prop names
  // embed/entity uses ?id= but widget uses entityId
  if (type === 'entity' && props.id && !props.entityId) {
    props.entityId = props.id;
    delete props.id;
  }
  // embed/asset uses ?id= but widget uses assetId
  if (type === 'asset' && props.id && !props.assetId) {
    props.assetId = props.id;
    delete props.id;
  }
  // embed/project-card uses ?id= but widget uses assetId
  if (type === 'project-card' && props.id && !props.assetId) {
    props.assetId = props.id;
    delete props.id;
  }

  return { type, props };
}


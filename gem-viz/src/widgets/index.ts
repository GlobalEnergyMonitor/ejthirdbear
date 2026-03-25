/**
 * GEM Widget System — Entry point for dynamic (non-iframe) embeds.
 *
 * Usage from embed.js or direct:
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

const WIDGET_MAP: Record<string, () => Promise<{ default: any }>> = {
  entity: () => import('./GemEntityCard.svelte'),
  asset: () => import('./GemAssetCard.svelte'),
  'ownership-flower': () => import('./GemOwnershipFlower.svelte'),
  // Future widgets:
  // 'ownership-graph': () => import('./GemOwnershipGraph.svelte'),
  // 'project-card': () => import('./GemProjectCard.svelte'),
  // 'coal-plant': () => import('./GemCoalPlantCard.svelte'),
  // 'asset-ring': () => import('./GemAssetRing.svelte'),
  // 'ultimate-owners': () => import('./GemUltimateOwners.svelte'),
  // 'network-3d': () => import('./GemNetworkGraph.svelte'),
  // 'asset-search': () => import('./GemAssetSearch.svelte'),
  // 'tracker-factsheet': () => import('./GemTrackerFactsheet.svelte'),
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
const mountedWidgets = new WeakMap<ShadowRoot, any>();

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
  props: Record<string, any>
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
  const instance = mount(mod.default, { target, props });
  mountedWidgets.set(shadowRoot, instance);
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
export function parseSrc(dataSrc: string): { type: string; props: Record<string, any> } {
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
  const props: Record<string, any> = {};
  url.searchParams.forEach((value, key) => {
    // Skip embed-shell params
    if (['embed', 'embedId', 'autoHeight', 'branding', 'padding'].includes(key)) return;

    // Parse booleans
    if (value === 'true') { props[key] = true; return; }
    if (value === 'false') { props[key] = false; return; }

    // Parse numbers
    const num = Number(value);
    if (!isNaN(num) && value.trim() !== '') { props[key] = num; return; }

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

  return { type, props };
}

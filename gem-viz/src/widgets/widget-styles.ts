/**
 * Widget CSS injection for Shadow DOM.
 * Loads the full design system CSS from the app server, with a minimal inline fallback.
 * Also injects Google Fonts <link> into the host page head (once).
 */

import { getAppBase } from './widget-api';

const FONTS_URL =
  'https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700&family=Barlow+Semi+Condensed:wght@400;500;600;700&display=swap';

let fontsInjected = false;

/** Inject Google Fonts into the host page <head> (idempotent) */
export function ensureFonts() {
  if (fontsInjected || typeof document === 'undefined') return;
  if (document.querySelector(`link[href="${FONTS_URL}"]`)) {
    fontsInjected = true;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = FONTS_URL;
  document.head.appendChild(link);
  fontsInjected = true;
}

/**
 * Minimal inline CSS tokens — enough for widgets to render correctly
 * even before the full stylesheet loads.
 */
export const FALLBACK_CSS = `
:host {
  display: block;
  font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  color: #1a1a2e;
  line-height: 1.5;
}
*, *::before, *::after { box-sizing: border-box; }

/* Core tokens (subset) */
:host {
  --font-family: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-family-display: 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif;
  --font-family-data: 'Barlow Semi-Condensed', 'Arial Narrow', sans-serif;
  --font-family-mono: var(--font-family-data);
  --font-family-sans: var(--font-family);

  --font-weight-regular: 400;
  --font-weight-medium: 500;
  --font-weight-semibold: 600;
  --font-weight-bold: 700;

  --font-size-xs: 12px;
  --font-size-sm: 14px;
  --font-size-base: 16px;
  --font-size-body: 16px;
  --font-size-md: 18px;
  --font-size-lg: 20px;
  --font-size-xl: 24px;
  --font-size-2xl: 32px;

  --line-height-tight: 1.1;
  --line-height-normal: 1.5;

  --tracking-caps: 0.04em;
  --tracking-wide: 0.02em;
  --tracking-widest: 0.08em;

  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;

  --gem-primary-blue: #1d4961;
  --gem-teal: #1d4961;
  --gem-teal-50: #8ea4b0;
  --gem-teal-25: #c7d1d8;
  --gem-teal-10: #e9eef1;
  --gem-navy: #1d4961;
  --gem-navy-50: #8ea4b0;
  --gem-navy-25: #c7d1d8;
  --gem-navy-10: #e9eef1;
  --gem-mint: #00b388;
  --gem-orange: #e07c38;

  --color-text-primary: #1a1a2e;
  --color-text-secondary: #4a4a5a;
  --color-text-tertiary: #8a8a9a;

  --color-bg-primary: #ffffff;
  --color-bg-secondary: #f8fafc;
  --color-bg-tertiary: #f0f2f4;

  --color-border: #e5e7eb;
  --color-border-light: #f0f0f0;
  --color-border-dark: #ccc;

  --color-error: #dc2626;
  --color-error-light: #fef2f2;
  --color-success: #34a853;
  --color-success-light: #e6f4ea;

  --color-gray-200: #dce3e5;
  --color-gray-400: #9eaaad;

  --border-width: 1px;
  --radius-sm: 2px;
  --radius-md: 4px;
  --radius-lg: 6px;
  --radius-xl: 8px;
  --radius-full: 9999px;
  --radius-card: 16px;

  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.05);
  --shadow-md: 0 2px 8px rgba(0, 0, 0, 0.08);
  --shadow-lg: 0 4px 16px rgba(0, 0, 0, 0.12);

  --transition-fast: 0.15s ease;
  --duration-fast: 150ms;
  --ease-out: cubic-bezier(0, 0, 0.2, 1);

  --color-tracker-coal: #7F142A;
  --color-tracker-gas: #E07C38;
  --color-tracker-oil-gas: #E07C38;
  --color-tracker-iron-steel: #5C6B73;
  --color-tracker-iron-ore: #8B6914;
  --color-tracker-bioenergy: #4A7C59;
  --color-tracker-pipeline: #3D5A80;
  --color-tracker-cement: #9E8C6C;

  --color-status-operating: #00b388;
  --color-status-planned: #1d4961;
  --color-status-retired: #8a8a9a;
  --color-status-cancelled: #dc2626;
}

/* Dark mode */
:host(.dark) {
  --color-bg-primary: #1a1a2e;
  --color-bg-secondary: #2a2a3e;
  --color-bg-tertiary: #3a3a4e;
  --color-text-primary: #f0f0f0;
  --color-text-secondary: #b0b0c0;
  --color-text-tertiary: #808090;
  --color-border: #3a3a4e;
  --color-border-light: #2a2a3e;
  --color-border-dark: #5a5a6e;
}

/* Embed state classes */
.embed-loading {
  padding: 20px;
  text-align: center;
  color: var(--color-text-secondary);
  font-size: var(--font-size-body);
}
.embed-error {
  padding: 20px;
  border: 1px solid var(--color-error);
  background: var(--color-error-light);
  text-align: center;
}
.embed-error p { margin: 0 0 8px 0; }
.embed-hint {
  font-size: var(--font-size-sm);
  color: var(--color-text-secondary);
}
`;

/** Full CSS cache — loaded once from app server */
let fullCssCache: string | null = null;
let fullCssPromise: Promise<string> | null = null;

/**
 * Load the full shared-styles.css from the app server.
 * Returns the CSS text, cached after first load.
 */
export async function loadFullCSS(): Promise<string> {
  if (fullCssCache) return fullCssCache;
  if (fullCssPromise) return fullCssPromise;

  fullCssPromise = fetch(`${getAppBase()}/widgets/shared-styles.css`)
    .then((r) => {
      if (!r.ok) throw new Error(`Failed to load widget CSS: ${r.status}`);
      return r.text();
    })
    .then((css) => {
      // Strip @import rules — fonts already injected by ensureFonts(),
      // and @import is not allowed in constructable stylesheets (replaceSync throws)
      css = css.replace(/@import\s+url\([^)]*\)\s*;?\s*/g, '');
      // Remap :root to :host for Shadow DOM
      fullCssCache = css.replace(/:root\b/g, ':host');
      return fullCssCache;
    })
    .catch(() => {
      // Fallback to inline tokens
      fullCssCache = FALLBACK_CSS;
      return fullCssCache;
    });

  return fullCssPromise;
}

// =============================================================================
// Constructable Stylesheets — share one parsed CSSStyleSheet across all widgets
// =============================================================================

const supportsAdoptedStyleSheets =
  typeof ShadowRoot !== 'undefined' && 'adoptedStyleSheets' in ShadowRoot.prototype;

/** Single shared sheet, starts with fallback CSS, upgrades to full CSS when loaded */
let sharedSheet: CSSStyleSheet | null = null;

function getSharedSheet(): CSSStyleSheet {
  if (!sharedSheet) {
    sharedSheet = new CSSStyleSheet();
    sharedSheet.replaceSync(FALLBACK_CSS);
    // Kick off async upgrade — all adopters update automatically
    loadFullCSS().then((css) => {
      if (css !== FALLBACK_CSS && sharedSheet) {
        sharedSheet.replaceSync(css);
      }
    });
  }
  return sharedSheet;
}

/**
 * Inject CSS into a Shadow DOM root.
 * Uses constructable stylesheets when available (one parsed sheet shared across
 * all widget instances). Falls back to <style> element injection.
 */
export function injectStyles(shadowRoot: ShadowRoot): void {
  ensureFonts();

  if (supportsAdoptedStyleSheets) {
    shadowRoot.adoptedStyleSheets = [getSharedSheet()];
    return;
  }

  // Fallback: <style> element injection (pre-Safari 16.4)
  const style = document.createElement('style');
  style.textContent = FALLBACK_CSS;
  shadowRoot.prepend(style);

  // Upgrade to full CSS in background
  loadFullCSS().then((css) => {
    if (css !== FALLBACK_CSS) {
      style.textContent = css;
    }
  });
}

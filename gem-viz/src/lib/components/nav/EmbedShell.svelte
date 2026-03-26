<script>
  /**
   * EmbedShell — reusable embed wrapper with postMessage auto-height,
   * dark mode, branding footer, and shared embed state styles.
   *
   * Used by both /embed/+layout.svelte and root +layout.svelte (when ?embed=true).
   */
  import { onMount } from 'svelte';
  import { beforeNavigate, goto } from '$app/navigation';
  import { GEM_DOMAIN } from '$lib/external-links';

  let {
    theme = 'light',
    padding = '16',
    autoHeight = true,
    embedId = '',
    branding = false,
    linkBase = '',
    linkTarget = '_blank',
    children,
  } = $props();

  // ── Link rewriting for CMS embeds (Drupal etc.) ──
  // When linkBase is set, all internal links are rewritten to point to the
  // CMS wrapper pages instead of gem-viz routes.
  // linkBase: e.g. "https://drupal-site.com/data-tools" or "/data-tools"
  // linkTarget: "_blank" (default), "_top" (navigate parent frame), "_self"

  function isInternalHref(href) {
    if (!href) return false;
    if (href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('javascript:')) return false;
    if (/^https?:\/\//i.test(href)) return false;
    return true;
  }

  function rewriteHref(href) {
    if (!linkBase) return href;
    // Strip trailing slash from linkBase, ensure href starts with /
    const base = linkBase.replace(/\/+$/, '');
    const path = href.startsWith('/') ? href : '/' + href;
    return base + path;
  }

  function handleLinkClick(e) {
    if (!linkBase) return;
    const anchor = e.target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!isInternalHref(href)) return;

    e.preventDefault();
    e.stopPropagation();
    const newUrl = rewriteHref(href);

    if (linkTarget === '_top' && window.parent !== window) {
      window.top.location.href = newUrl;
    } else if (linkTarget === '_self') {
      window.location.href = newUrl;
    } else {
      window.open(newUrl, '_blank', 'noopener,noreferrer');
    }
  }

  // Preserve embed query params when navigating within the iframe.
  // Without this, clicking a breadcrumb link in /cards?embed=true would
  // navigate to /explore (no embed param) and show full app chrome inside the iframe.
  const EMBED_PARAMS = ['embed', 'embedId', 'theme', 'padding', 'autoHeight', 'branding', 'linkBase', 'linkTarget'];

  beforeNavigate((nav) => {
    if (nav.willUnload) return;
    if (!nav.to?.url) return;

    // If linkBase is set, intercept all internal goto() navigations and
    // redirect to the CMS wrapper URL instead.
    if (linkBase) {
      nav.cancel();
      const path = nav.to.url.pathname + nav.to.url.search + nav.to.url.hash;
      const newUrl = rewriteHref(path);

      if (linkTarget === '_top' && window.parent !== window) {
        window.top.location.href = newUrl;
      } else if (linkTarget === '_self') {
        window.location.href = newUrl;
      } else {
        window.open(newUrl, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (nav.to.url.searchParams.has('embed')) return;

    const from = nav.from?.url;
    if (!from?.searchParams.has('embed')) return;

    nav.cancel();
    const url = new URL(nav.to.url);
    for (const key of EMBED_PARAMS) {
      const val = from.searchParams.get(key);
      if (val) url.searchParams.set(key, val);
    }
    goto(url.toString(), { replaceState: true });
  });

  const postHeight = () => {
    if (!autoHeight) return;
    if (typeof window === 'undefined') return;
    if (window.parent === window) return;

    const height = Math.max(
      document.documentElement?.scrollHeight || 0,
      document.body?.scrollHeight || 0
    );

    if (!height) return;

    window.parent.postMessage(
      {
        source: 'gem-embed',
        type: 'resize',
        height,
        embedId,
      },
      '*'
    );
  };

  onMount(() => {
    if (!autoHeight) return;
    if (typeof window === 'undefined') return;
    if (window.parent === window) return;

    postHeight();

    const observer = new ResizeObserver(() => postHeight());
    observer.observe(document.documentElement);

    window.addEventListener('load', postHeight);
    const timeout = window.setTimeout(postHeight, 150);

    return () => {
      observer.disconnect();
      window.removeEventListener('load', postHeight);
      window.clearTimeout(timeout);
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="embed-container" class:dark={theme === 'dark'} style="padding: {padding}px;" onclick={handleLinkClick}>
  {@render children()}
  {#if branding}
    <footer class="gem-branding">
      <a href={GEM_DOMAIN} target="_blank" rel="noopener">
        Powered by Global Energy Monitor
      </a>
    </footer>
  {/if}
</div>

<style>
  .embed-container {
    min-height: 100vh;
    background: transparent;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }

  .embed-container.dark {
    --color-bg-primary: var(--color-gray-900);
    --color-bg-secondary: var(--color-gray-800);
    --color-text-primary: var(--color-gray-100);
    --color-text-secondary: var(--color-gray-400);
    --color-border: var(--color-gray-700);
  }

  .gem-branding {
    margin-top: var(--space-3);
    padding: 8px 0 0;
    text-align: center;
    border-top: var(--border-width) solid var(--color-border-light);
  }

  .gem-branding a {
    font-size: 11px;
    color: var(--color-text-tertiary);
    text-decoration: none;
    letter-spacing: 0.02em;
  }

  .gem-branding a:hover {
    color: var(--color-text-secondary);
    text-decoration: underline;
  }

  :global(.embed-container *) {
    box-sizing: border-box;
  }

  /* ── Shared embed states (loading / error / hint / empty) ── */
  :global(.embed-loading) {
    padding: var(--space-5);
    text-align: center;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
  }

  :global(.embed-error) {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-error);
    background: var(--color-error-light);
    text-align: center;
  }

  :global(.embed-error p) {
    margin: 0 0 var(--space-2) 0;
  }

  :global(.embed-error code) {
    font-family: var(--font-family-mono);
    background: var(--color-bg-primary);
    padding: 2px 6px;
  }

  :global(.embed-hint) {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  :global(.embed-empty) {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 300px;
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
  }
</style>

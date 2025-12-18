<script>
  /**
   * SiteNav - Persistent navigation component
   * Used in +layout.svelte for consistent navigation across all pages
   */

  import { page, navigating } from '$app/stores';
  import { link } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';

  // Cart count for badge
  const cartCount = $derived($investigationCart.length);

  // Current path for active state
  const currentPath = $derived($page.url.pathname);

  // Loading state
  const isNavigating = $derived(!!$navigating);

  // Check if link is active
  function isActive(path) {
    if (path === '' || path === 'index') {
      return currentPath === '/' || /** @type {string} */ (currentPath) === '/index.html';
    }
    return currentPath.includes(`/${path}`);
  }

  // Navigation links
  const navLinks = [
    { path: 'index', label: 'Home' },
    { path: 'explore', label: 'Explore' },
    { path: 'network', label: 'Network' },
    { path: 'report', label: 'Investigation', showBadge: true },
    { path: 'asset', label: 'Assets' },
    { path: 'about', label: 'About' },
  ];
</script>

<nav class="site-nav">
  {#if isNavigating}
    <div class="loading-bar"></div>
  {/if}
  <div class="nav-brand">
    <a href={link('index')}>GEM Viz</a>
  </div>
  <div class="nav-links">
    {#each navLinks as { path, label, showBadge }}
      <a
        href={link(path)}
        class:active={isActive(path)}
        class:has-badge={showBadge && cartCount > 0}
      >
        {label}
        {#if showBadge && cartCount > 0}
          <span class="badge">{cartCount}</span>
        {/if}
      </a>
    {/each}
  </div>
</nav>

<style>
  .site-nav {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 40px;
    border-bottom: 1px solid var(--color-black);
    background: var(--color-white);
    position: sticky;
    top: 0;
    z-index: 100;
  }

  /* Subtle loading bar */
  .loading-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 1px;
    background: var(--color-black);
    animation: loading 1s ease-in-out infinite;
  }

  @keyframes loading {
    0% { width: 0; left: 0; }
    50% { width: 40%; left: 30%; }
    100% { width: 0; left: 100%; }
  }

  .nav-brand a {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-black);
    text-decoration: none;
  }

  .nav-brand a:hover {
    text-decoration: underline;
  }

  .nav-links {
    display: flex;
    gap: 20px;
  }

  .nav-links a {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
    text-decoration: none;
    padding: 4px 0;
    border-bottom: 1px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    transition: color 0.15s, border-color 0.15s;
  }

  .nav-links a:hover {
    color: var(--color-black);
    border-bottom-color: var(--color-border);
  }

  .nav-links a.active {
    color: var(--color-black);
    border-bottom-color: var(--color-black);
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 14px;
    height: 14px;
    padding: 0 3px;
    background: var(--color-black);
    color: var(--color-white);
    font-size: 9px;
    font-weight: normal;
    font-variant-numeric: tabular-nums;
  }

  @media (max-width: 768px) {
    .site-nav {
      padding: 12px 20px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .nav-links {
      width: 100%;
      justify-content: flex-start;
      gap: 12px;
      flex-wrap: wrap;
    }

    .nav-links a {
      font-size: 10px;
    }
  }

  @media print {
    .site-nav {
      position: relative;
      border-bottom: none;
    }

    .nav-links {
      display: none;
    }
  }

  /* Hide on pages that have their own full-width layout (like network) */
  :global(.full-width-page) .site-nav {
    display: none;
  }
</style>

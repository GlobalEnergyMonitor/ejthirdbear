<script>
  /**
   * SiteNav - Persistent navigation component
   * Used in +layout.svelte for consistent navigation across all pages
   */

  import { page } from '$app/stores';
  import { link } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';

  // Cart count for badge
  const cartCount = $derived($investigationCart.length);

  // Current path for active state
  const currentPath = $derived($page.url.pathname);

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
    border-bottom: 1px solid #000;
    background: #fff;
    position: sticky;
    top: 0;
    z-index: 100;
  }

  .nav-brand a {
    font-size: 14px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #000;
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
    color: #000;
    text-decoration: none;
    padding: 4px 0;
    border-bottom: 2px solid transparent;
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .nav-links a:hover {
    border-bottom-color: #999;
  }

  .nav-links a.active {
    border-bottom-color: #000;
    font-weight: 600;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    background: #000;
    color: white;
    font-size: 9px;
    font-weight: bold;
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

  /* Hide on pages that have their own full-width layout (like network) */
  :global(.full-width-page) .site-nav {
    display: none;
  }
</style>

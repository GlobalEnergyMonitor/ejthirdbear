<script>
  /**
   * SiteNav - GEM-branded navigation component
   * White background, teal logo, rounded container
   */

  import { page, navigating } from '$app/stores';
  import { link } from '$lib/links';
  import { investigationCart } from '$lib/investigationCart';
  import { openCommandPalette } from '$lib/stores/commandPalette';
  import { Search, Menu, X } from 'lucide-svelte';

  // Cart count for badge
  const cartCount = $derived($investigationCart.length);

  // Current path for active state
  const currentPath = $derived($page.url.pathname);

  // Loading state
  const isNavigating = $derived(!!$navigating);

  // Mobile menu state
  let menuOpen = $state(false);

  // Check if link is active
  function isActive(path) {
    if (path === '' || path === 'index') {
      return currentPath === '/' || /** @type {string} */ (currentPath) === '/index.html';
    }
    return currentPath.includes(`/${path}`);
  }

  // Trigger command palette via store
  function openSearch() {
    openCommandPalette();
    menuOpen = false;
  }

  // Toggle mobile menu
  function toggleMenu() {
    menuOpen = !menuOpen;
  }

  // Close menu when navigating
  $effect(() => {
    if ($navigating) {
      menuOpen = false;
    }
  });

  // Navigation links
  const navLinks = [
    // { path: 'compose', label: 'Compose' },
    { path: 'screener', label: 'Screener' },
    { path: 'controlchain', label: 'ControlChain' },
    { path: 'fieldguide', label: 'FieldGuide' },
    { path: 'cards', label: 'Cards' },
    // { path: 'report', label: 'Report', showBadge: true },
    { path: 'downloads', label: 'Downloads' },
  ];
</script>

<div class="nav-wrapper">
  <nav class="site-nav">
    {#if isNavigating}
      <div class="loading-bar"></div>
    {/if}
    <div class="nav-inner">
      <a href={link('index')} class="nav-logo">
        <span class="logo-text">gem</span>
        <span class="logo-suffix">viz</span>
      </a>

      <!-- Desktop navigation -->
      <div class="nav-links desktop-only">
        {#each navLinks as { path, label, showBadge, icon }}
          <a href={link(path)} class:active={isActive(path)}>
            {#if icon}<span class="nav-icon">{icon}</span>{/if}
            {label}
            {#if showBadge && cartCount > 0}
              <span class="badge">{cartCount}</span>
            {/if}
          </a>
        {/each}
        <button class="search-btn" onclick={openSearch} title="Search (⌘K)">
          <Search size={18} />
        </button>
      </div>

      <!-- Mobile hamburger -->
      <button class="menu-btn mobile-only" onclick={toggleMenu} aria-label="Toggle menu">
        {#if menuOpen}
          <X size={24} />
        {:else}
          <Menu size={24} />
        {/if}
      </button>
    </div>

    <!-- Mobile menu dropdown -->
    {#if menuOpen}
      <div class="mobile-menu">
        {#each navLinks as { path, label, showBadge, icon }}
          <a href={link(path)} class:active={isActive(path)} onclick={() => (menuOpen = false)}>
            {#if icon}<span class="nav-icon">{icon}</span>{/if}
            {label}
            {#if showBadge && cartCount > 0}
              <span class="badge">{cartCount}</span>
            {/if}
          </a>
        {/each}
        <button class="search-btn-mobile" onclick={openSearch}>
          <Search size={18} />
          Search
        </button>
      </div>
    {/if}
  </nav>
</div>

<style>
  .nav-wrapper {
    position: sticky;
    top: 0;
    z-index: 1000;
    padding: 0 20px 12px 20px;
  }

  .site-nav {
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    max-width: var(--container-xl);
    margin: 0 auto;
    overflow: hidden;
  }

  .nav-inner {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 24px;
    height: 64px;
    box-sizing: border-box;
  }

  /* Loading bar */
  .loading-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    height: 2px;
    background: #1d4961;
    animation: loading 1s ease-in-out infinite;
  }

  @keyframes loading {
    0% {
      width: 0;
      left: 0;
    }
    50% {
      width: 40%;
      left: 30%;
    }
    100% {
      width: 0;
      left: 100%;
    }
  }

  /* Logo */
  .nav-logo {
    display: flex;
    align-items: baseline;
    text-decoration: none;
    gap: 0;
  }

  .logo-text {
    font-family: 'Plus Jakarta Sans', var(--font-family), sans-serif;
    font-size: 42px;
    font-weight: 800;
    color: #1d4961;
    letter-spacing: -2px;
    line-height: 1;
  }

  .logo-suffix {
    font-family: 'Plus Jakarta Sans', var(--font-family), sans-serif;
    font-size: 16px;
    font-weight: 700;
    color: rgba(29, 73, 97, 0.5);
    letter-spacing: 0.5px;
    text-transform: lowercase;
    margin-left: 2px;
  }

  .nav-logo:hover .logo-text {
    color: #0f3a4e;
  }

  .nav-logo:hover .logo-suffix {
    color: rgba(29, 73, 97, 0.7);
  }

  /* Desktop navigation */
  .nav-links {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nav-links a {
    font-family: var(--font-family);
    font-size: 14px;
    font-weight: 700;
    color: #444;
    text-decoration: none;
    padding: 8px 14px;
    border-radius: 6px;
    transition: all 0.15s ease;
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }

  .nav-links a:hover {
    color: #1d4961;
    background: rgba(29, 73, 97, 0.08);
  }

  .nav-links a.active {
    color: #1d4961;
    background: rgba(29, 73, 97, 0.12);
    font-weight: 700;
  }

  .search-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    padding: 0;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: transparent;
    color: #666;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-left: 8px;
  }

  .search-btn:hover {
    border-color: #1d4961;
    color: #1d4961;
    background: rgba(29, 73, 97, 0.05);
  }

  /* Nav icon (for Gembot) */
  .nav-icon {
    font-size: 1em;
    line-height: 1;
  }

  /* Badge */
  .badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: #fe4f2d;
    color: #fff;
    font-size: 11px;
    font-weight: 700;
    border-radius: 9px;
    font-variant-numeric: tabular-nums;
  }

  /* Mobile hamburger */
  .menu-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: none;
    background: transparent;
    color: #444;
    cursor: pointer;
    transition: color 0.15s ease;
    border-radius: 6px;
  }

  .menu-btn:hover {
    color: #1d4961;
    background: rgba(29, 73, 97, 0.08);
  }

  /* Mobile menu */
  .mobile-menu {
    display: none;
    flex-direction: column;
    background: #fff;
    border-top: 1px solid #eee;
    padding: 12px 16px 20px;
  }

  .mobile-menu a {
    font-family: var(--font-family);
    font-size: 16px;
    font-weight: 700;
    color: #444;
    text-decoration: none;
    padding: 14px 12px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mobile-menu a:hover {
    color: #1d4961;
    background: rgba(29, 73, 97, 0.08);
  }

  .mobile-menu a.active {
    color: #1d4961;
    background: rgba(29, 73, 97, 0.12);
    font-weight: 700;
  }

  .search-btn-mobile {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 8px;
    padding: 14px 16px;
    border: 1px solid #ddd;
    border-radius: 6px;
    background: transparent;
    color: #444;
    font-family: var(--font-family);
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .search-btn-mobile:hover {
    border-color: #1d4961;
    color: #1d4961;
  }

  /* Responsive */
  .desktop-only {
    display: flex;
  }

  .mobile-only {
    display: none;
  }

  @media (max-width: 768px) {
    .nav-wrapper {
      padding: 0 12px 8px 12px;
    }

    .site-nav {
      border-radius: 10px;
    }

    .nav-inner {
      padding: 10px 16px;
      height: 56px;
    }

    .logo-text {
      font-size: 34px;
      letter-spacing: -1.5px;
    }

    .logo-suffix {
      font-size: 13px;
    }

    .desktop-only {
      display: none;
    }

    .mobile-only {
      display: flex;
    }

    .mobile-menu {
      display: flex;
    }
  }

  @media print {
    .nav-wrapper {
      position: relative;
      padding: 0;
    }

    .site-nav {
      box-shadow: none;
      border-radius: 0;
    }

    .nav-links,
    .menu-btn {
      display: none;
    }
  }

  /* Hide on pages that have their own full-width layout */
  :global(.full-width-page) .nav-wrapper {
    display: none;
  }
</style>

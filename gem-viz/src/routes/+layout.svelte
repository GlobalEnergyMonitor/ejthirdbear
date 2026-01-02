<script>
  import { onMount } from 'svelte';
  import { onNavigate } from '$app/navigation';
  import '../app.css';
  import SiteNav from '$lib/components/SiteNav.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import { link } from '$lib/links';
  import { initKeyboardNav } from '$lib/keyboard-nav';
  import { timing, shouldAnimate } from '$lib/animations';

  // Build info injected by Vite at build time
  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
  const appVersion = __APP_VERSION__;

  // Page transition state
  let navigating = $state(false);

  // Handle page transitions
  onNavigate((navigation) => {
    // Only animate for actual page changes, not hash links
    if (!shouldAnimate()) return;
    if (navigation.from?.route.id !== navigation.to?.route.id) {
      navigating = true;
      return new Promise((resolve) => {
        setTimeout(() => {
          navigating = false;
          resolve();
        }, timing.quick);
      });
    }
  });

  // Initialize keyboard navigation
  onMount(() => {
    const cleanup = initKeyboardNav();
    return cleanup;
  });
</script>

<svelte:head>
  <meta name="build-time" content={buildTime} />
  <meta name="build-hash" content={buildHash} />
</svelte:head>

<CommandPalette />

<div class="app">
  <SiteNav />
  <div class="page-content" class:navigating>
    <slot />
  </div>

  <footer>
    <div class="footer-content">
      <a href={link('about')} class="version" title="View methodology and changelog"
        >v{appVersion}</a
      >
      <span class="build-info" title={buildTime}>build: {buildHash}</span>
    </div>
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .page-content {
    flex: 1;
    opacity: 1;
    transform: translateY(0);
    transition:
      opacity 80ms ease,
      transform 80ms ease;
  }

  .page-content.navigating {
    opacity: 0;
    transform: translateY(4px);
  }

  @media (prefers-reduced-motion: reduce) {
    .page-content {
      transition: none;
    }
    .page-content.navigating {
      opacity: 1;
      transform: none;
    }
  }

  footer {
    margin-top: auto;
    padding: 30px 40px;
    font-family: Georgia, serif;
  }

  .footer-content {
    width: 100%;
    margin: 0;
    padding: 0 40px;
    display: flex;
    gap: 20px;
    align-items: center;
    font-size: 12px;
    color: #000;
  }

  .version {
    font-family: Georgia, serif;
    color: #000;
    text-decoration: none;
  }

  .version:hover {
    text-decoration: underline;
  }

  .build-info {
    font-family: monospace;
    font-size: 10px;
    color: #666;
    cursor: help;
  }
</style>

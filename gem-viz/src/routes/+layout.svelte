<script>
  import '../app.css';
  import SiteNav from '$lib/components/SiteNav.svelte';
  import SiteFooter from '$lib/components/SiteFooter.svelte';
  import CommandPalette from '$lib/components/CommandPalette.svelte';
  import { link } from '$lib/links';

  // Build info injected by Vite at build time
  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
  const appVersion = __APP_VERSION__;
</script>

<svelte:head>
  <meta name="build-time" content={buildTime} />
  <meta name="build-hash" content={buildHash} />
</svelte:head>

<a href="#main-content" class="skip-link">Skip to content</a>
<div class="app">
  <SiteNav />
  <main id="main-content">
    <slot />
  </main>
  <CommandPalette />
  <SiteFooter />

  <footer class="build-footer">
    <a href={link('about')} class="version" title="View methodology and changelog">v{appVersion}</a>
    <span class="build-info" title={buildTime}>build: {buildHash}</span>
  </footer>
</div>

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  .build-footer {
    padding: 12px 40px;
    display: flex;
    gap: 20px;
    align-items: center;
    font-size: 12px;
    color: var(--color-black);
    background: #f5f5f5;
  }

  .version {
    font-family: Georgia, serif;
    color: var(--color-black);
    text-decoration: none;
  }

  .version:hover {
    text-decoration: underline;
  }

  .build-info {
    font-family: monospace;
    font-size: 10px;
    color: var(--color-text-secondary);
    cursor: help;
  }
</style>

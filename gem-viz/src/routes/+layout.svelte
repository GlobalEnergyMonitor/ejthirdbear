<script>
  import '../app.css';
  import SiteNav from '$lib/components/nav/SiteNav.svelte';
  import SiteFooter from '$lib/components/nav/SiteFooter.svelte';
  import CommandPalette from '$lib/components/search/CommandPalette.svelte';
  import ApiCallLog from '$lib/components/data/ApiCallLog.svelte';
  import EmbedShell from '$lib/components/nav/EmbedShell.svelte';
  import { clearApiLog } from '$lib/api-log.svelte';
  import { link } from '$lib/links';
  import { page } from '$app/stores';
  import { beforeNavigate } from '$app/navigation';

  let { children } = $props();

  // Clear API call log on route change so it only shows calls for the current page
  beforeNavigate(() => clearApiLog());

  // Build info injected by Vite at build time
  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
  const appVersion = __APP_VERSION__;
</script>

<svelte:head>
  <meta name="build-time" content={buildTime} />
  <meta name="build-hash" content={buildHash} />
</svelte:head>

{#if $page.url.pathname.startsWith('/embed') || $page.url.pathname.startsWith('/e/')}
  {@render children()}
{:else if $page.url.searchParams.get('embed') === 'true'}
  <EmbedShell
    theme={$page.url.searchParams.get('theme') || 'light'}
    padding={$page.url.searchParams.get('padding') || '16'}
    autoHeight={$page.url.searchParams.get('autoHeight') !== 'false'}
    embedId={$page.url.searchParams.get('embedId') || ''}
    branding={$page.url.searchParams.get('branding') === 'true'}
  >
    {@render children()}
  </EmbedShell>
{:else}
  <a href="#main-content" class="skip-link">Skip to content</a>
  <div class="app">
    <SiteNav />
    <main id="main-content">
      {@render children()}
    </main>
    <CommandPalette />
    <div class="api-log-wrapper">
      <ApiCallLog />
    </div>
    <SiteFooter />

    <footer class="build-footer">
      <a href={link('about')} class="version" title="View methodology and changelog"
        >v{appVersion}</a
      >
      <span class="build-info" title={buildTime}>build: {buildHash}</span>
    </footer>
  </div>
{/if}

<style>
  .app {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
  }

  main {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: var(--space-8) var(--space-6);
  }

  main > :global(*) {
    width: 100%;
    max-width: var(--container-xl);
  }

  .api-log-wrapper {
    padding: 0 var(--space-6);
    max-width: var(--container-xl);
    margin: 0 auto;
    width: 100%;
  }

  .build-footer {
    padding: var(--space-3) var(--space-10);
    display: flex;
    gap: var(--space-5);
    align-items: center;
    font-size: var(--font-size-body);
    color: var(--color-black);
    background: var(--color-bg-tertiary);
  }

  .version {
    font-family: var(--font-family);
    color: var(--color-black);
    text-decoration: none;
  }

  .version:hover {
    text-decoration: underline;
  }

  .build-info {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-base);
    color: var(--color-text-secondary);
    cursor: help;
  }
</style>

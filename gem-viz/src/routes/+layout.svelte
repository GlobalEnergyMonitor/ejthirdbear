<script>
  import '../app.css';
  import SiteNav from '$lib/components/SiteNav.svelte';
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

<div class="app">
  <SiteNav />
  <slot />

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

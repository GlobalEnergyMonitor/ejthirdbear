<script>
  import '../app.css';

  /* global __BUILD_TIME__, __BUILD_HASH__ */
  // Get version and build info
  const appVersion = '0.1.1';
  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
</script>

<svelte:head>
  <meta name="build-time" content={buildTime} />
  <meta name="build-hash" content={buildHash} />
</svelte:head>

<div class="app">
  <slot />

  <footer>
    <div class="footer-content">
      <span class="version">v{appVersion}</span>
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
  }

  .build-info {
    font-family: monospace;
    font-size: 10px;
    color: #666;
    cursor: help;
  }
</style>

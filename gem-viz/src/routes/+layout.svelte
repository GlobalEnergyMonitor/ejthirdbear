<script>
  import '../app.css';

  // Get version from package.json
  const appVersion = '0.1.0';
</script>

<div class="app">
  <slot />

  <footer>
    <div class="footer-content">
      <span class="version">v{appVersion}</span>
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
</style>

<script>
  import NetworkGraph from '$lib/NetworkGraph.svelte';
</script>

<svelte:head>
  <title>Ownership Network — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <h1>Ownership Network</h1>
    <p class="subtitle">Explore the global ownership web in 3D.</p>
  </header>

  <p class="intro">
    Visualizing <strong>every ownership connection</strong> in the Global Energy Monitor database. Each
    node is an entity (company, government, fund). Each edge is an ownership relationship. 3D mode is
    on by default so you can orbit, pan, and discover structure at a glance.
  </p>

  <NetworkGraph />
</main>

<style>
  main {
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: 24px 40px 28px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 12px;
    margin-bottom: 6px;
  }

  h1 {
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .subtitle {
    margin: 4px 0 0 0;
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #000;
  }

  .intro {
    font-size: 12px;
    margin: 0 0 16px 0;
    color: #666;
    max-width: 760px;
    line-height: 1.45;
  }
</style>

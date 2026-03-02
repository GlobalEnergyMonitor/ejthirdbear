<script>
  import NetworkGraph from '$lib/NetworkGraph.svelte';
</script>

<svelte:head>
  <title>Ownership Network — Global Energy Monitor</title>
  <meta
    name="description"
    content="Explore corporate ownership networks and relationships between entities in the global energy sector through interactive network visualizations."
  />
</svelte:head>

<div class="page">
  <header>
    <h1>Ownership Network</h1>
  </header>

  <p class="intro">
    Visualizing <strong>every ownership connection</strong> in the Global Energy Monitor database. Each
    node is an entity (company, government, fund). Each edge is an ownership relationship.
  </p>

  <NetworkGraph />
</div>

<style>
  .page {
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: var(--space-5) var(--space-10);
    display: flex;
    flex-direction: column;
  }

  header {
    padding-bottom: var(--space-4);
    margin-bottom: var(--space-5);
  }

  h1 {
    font-size: var(--font-size-xl);
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: var(--tracking-tight);
    margin: 0;
  }

  .intro {
    font-size: var(--font-size-body);
    margin: 0 0 var(--space-5) 0;
    color: var(--color-text-secondary);
  }
</style>

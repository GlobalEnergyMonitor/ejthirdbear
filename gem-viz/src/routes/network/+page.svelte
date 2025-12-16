<script>
  import NetworkGraph from '$lib/NetworkGraph.svelte';
</script>

<svelte:head>
  <title>Ownership Network — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <h1>Ownership Network</h1>
  </header>

  <p class="intro">
    Visualizing <strong>every ownership connection</strong> in the Global Energy Monitor database. Each
    node is an entity (company, government, fund). Each edge is an ownership relationship.
  </p>

  <NetworkGraph />
</main>

<style>
  main {
    width: 100%;
    height: 100vh;
    margin: 0;
    padding: 20px 40px;
    display: flex;
    flex-direction: column;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 20px;
  }

  h1 {
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  .intro {
    font-size: 12px;
    margin: 0 0 20px 0;
    color: #666;
  }
</style>

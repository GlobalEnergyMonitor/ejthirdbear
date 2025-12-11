<script>
  import { base } from '$app/paths';
  import SimpleMap from '$lib/SimpleMap.svelte';
</script>

<svelte:head>
  <title>GEM Viz — Global Energy Monitor Data Visualization</title>
</svelte:head>

<main>
  <header>
    <h1>Global Energy Monitor</h1>
    <nav>
      <a href="{base}/network.html">Ownership Network</a>
      <a href="{base}/asset.html">View All Assets</a>
    </nav>
  </header>

  <SimpleMap />
</main>

<style>
  main {
    width: 100%;
    margin: 0;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid #000;
    padding-bottom: 15px;
    margin-bottom: 30px;
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  h1 {
    font-size: 16px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0;
  }

  nav {
    display: flex;
    gap: 20px;
  }

  nav a {
    color: #000;
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  nav a:hover {
    text-decoration: none;
  }
</style>

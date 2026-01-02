<script>
  import { onMount } from 'svelte';
  import { assetPath, link } from '$lib/links';
  import { buildShareUrl } from '$lib/filter-state';
  import { loadFeaturedPresets, loadLocalPresets } from '$lib/presets';

  let featuredPresets = $state([]);
  let localPresets = $state([]);
  let loadingFeatured = $state(true);
  let featuredError = $state('');

  function formatScope(scope) {
    if (scope === 'all') return 'All trackers';
    if (Array.isArray(scope)) return scope.join(', ');
    return String(scope || 'All trackers');
  }

  function formatIcon(icon) {
    if (!icon) return 'PR';
    const token = String(icon).trim();
    if (!token) return 'PR';
    if (token.length <= 3) return token.toUpperCase();
    return token.slice(0, 2).toUpperCase();
  }

  function refreshLocalPresets() {
    localPresets = loadLocalPresets();
  }

  onMount(async () => {
    refreshLocalPresets();
    try {
      featuredPresets = await loadFeaturedPresets(fetch);
    } catch (err) {
      featuredError = 'Failed to load featured presets.';
      console.error('[Presets] Failed to load featured presets:', err);
    } finally {
      loadingFeatured = false;
    }
  });

  const composeBase = link('compose');
</script>

<svelte:head>
  <title>Presets - GEM Viz</title>
</svelte:head>

<main>
  <header class="page-header">
    <span class="page-type">Tool</span>
    <h1>Preset Gallery</h1>
    <p>Curated starting points plus your local presets.</p>
  </header>

  <section class="preset-section">
    <div class="section-header">
      <h2>Featured Presets</h2>
      {#if loadingFeatured}
        <span class="section-status">Loading...</span>
      {:else if featuredError}
        <span class="section-status error">{featuredError}</span>
      {:else}
        <span class="section-status">{featuredPresets.length} presets</span>
      {/if}
    </div>

    {#if !loadingFeatured && featuredPresets.length === 0}
      <p class="empty-state">No featured presets yet.</p>
    {:else}
      <div class="preset-grid">
        {#each featuredPresets as preset}
          <article class="preset-card">
            <div class="preset-icon">{formatIcon(preset.icon)}</div>
            <h3>{preset.title}</h3>
            {#if preset.description}
              <p>{preset.description}</p>
            {/if}
            <div class="preset-meta">
              <span>{formatScope(preset.trackerScope)}</span>
            </div>
            <div class="preset-actions">
              <a class="btn" href={buildShareUrl(preset.filters, composeBase)}> Open in Compose </a>
              {#if preset.sourceFile}
                <a class="btn ghost" href={assetPath(`presets/${preset.sourceFile}`)}>JSON</a>
              {/if}
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>

  <section class="preset-section">
    <div class="section-header">
      <h2>My Presets</h2>
      <div class="section-actions">
        <span class="section-status">{localPresets.length} saved</span>
        <button class="btn ghost" onclick={refreshLocalPresets}>Refresh</button>
      </div>
    </div>

    {#if localPresets.length === 0}
      <p class="empty-state">No local presets yet. Save one in the composer.</p>
    {:else}
      <div class="preset-grid">
        {#each localPresets as preset}
          <article class="preset-card">
            <div class="preset-icon">{formatIcon(preset.icon)}</div>
            <h3>{preset.title}</h3>
            {#if preset.description}
              <p>{preset.description}</p>
            {/if}
            <div class="preset-meta">
              <span>Local preset</span>
            </div>
            <div class="preset-actions">
              <a class="btn" href={buildShareUrl(preset.filters, composeBase)}> Open in Compose </a>
            </div>
          </article>
        {/each}
      </div>
    {/if}
  </section>
</main>

<style>
  main {
    padding: 30px 40px 60px;
  }

  .page-header {
    margin-bottom: 24px;
  }

  .page-type {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: #666;
  }

  h1 {
    margin: 8px 0 6px;
    font-size: 32px;
    font-weight: normal;
    font-family: Georgia, serif;
  }

  .page-header p {
    margin: 0;
    color: #666;
    font-size: 14px;
  }

  .preset-section {
    margin-top: 28px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-bottom: 12px;
  }

  .section-header h2 {
    margin: 0;
    font-size: 16px;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-status {
    font-size: 12px;
    color: #666;
  }

  .section-status.error {
    color: #b00020;
  }

  .empty-state {
    font-size: 13px;
    color: #666;
    margin: 0;
  }

  .preset-grid {
    display: grid;
    gap: 14px;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .preset-card {
    border: 1px solid #ddd;
    background: #fff;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .preset-card h3 {
    margin: 0;
    font-size: 16px;
  }

  .preset-card p {
    margin: 0;
    font-size: 13px;
    color: #444;
  }

  .preset-icon {
    width: 36px;
    height: 36px;
    border: 1px solid #ddd;
    display: grid;
    place-items: center;
    font-size: 11px;
    text-transform: uppercase;
  }

  .preset-meta {
    font-size: 11px;
    color: #666;
  }

  .preset-actions {
    display: flex;
    gap: 8px;
    margin-top: auto;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 10px;
    font-size: 12px;
    border: 1px solid #000;
    background: #000;
    color: #fff;
    text-decoration: none;
    cursor: pointer;
  }

  .btn.ghost {
    background: #fff;
    color: #000;
    border-color: #ddd;
  }

  .btn.ghost:hover {
    border-color: #000;
  }

  @media (max-width: 720px) {
    main {
      padding: 24px 20px 50px;
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

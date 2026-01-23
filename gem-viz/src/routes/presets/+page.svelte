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
    padding: var(--space-7) var(--space-10) var(--space-16);
  }

  .page-header {
    margin-bottom: var(--space-6);
  }

  .page-type {
    font-size: var(--font-size-body);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
  }

  h1 {
    margin: var(--space-2) 0 var(--space-1);
    font-size: var(--font-size-3xl);
    font-weight: normal;
    font-family: var(--font-family-serif);
  }

  .page-header p {
    margin: 0;
    color: var(--color-text-secondary);
    font-size: var(--font-size-lg);
  }

  .preset-section {
    margin-top: var(--space-7);
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    margin-bottom: var(--space-3);
  }

  .section-header h2 {
    margin: 0;
    font-size: var(--font-size-xl);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .section-actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .section-status {
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .section-status.error {
    color: var(--color-error);
  }

  .empty-state {
    font-size: var(--font-size-md);
    color: var(--color-text-secondary);
    margin: 0;
  }

  .preset-grid {
    display: grid;
    gap: var(--space-3);
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .preset-card {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-white);
    padding: var(--space-4);
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .preset-card h3 {
    margin: 0;
    font-size: var(--font-size-xl);
  }

  .preset-card p {
    margin: 0;
    font-size: var(--font-size-md);
    color: var(--color-text-primary);
  }

  .preset-icon {
    width: var(--space-9);
    height: var(--space-9);
    border: var(--border-width) solid var(--color-border);
    display: grid;
    place-items: center;
    font-size: var(--font-size-sm);
    text-transform: uppercase;
  }

  .preset-meta {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
  }

  .preset-actions {
    display: flex;
    gap: var(--space-2);
    margin-top: auto;
  }

  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-1) var(--space-2);
    font-size: var(--font-size-body);
    border: var(--border-width) solid var(--color-black);
    background: var(--color-black);
    color: var(--color-white);
    text-decoration: none;
    cursor: pointer;
  }

  .btn.ghost {
    background: var(--color-white);
    color: var(--color-black);
    border-color: var(--color-border);
  }

  .btn.ghost:hover {
    border-color: var(--color-black);
  }

  @media (max-width: 720px) {
    main {
      padding: var(--space-6) var(--space-5) var(--space-12);
    }

    .section-header {
      flex-direction: column;
      align-items: flex-start;
    }
  }
</style>

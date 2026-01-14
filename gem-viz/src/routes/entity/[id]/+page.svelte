<script>
  // ============================================================================
  // ENTITY DETAIL PAGE
  // Shows entity profile with ownership links and direct relationships
  // ============================================================================

  // --- IMPORTS ---
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { assetLink, entityLink } from '$lib/links';
  import { getEntity, getEntityOwners, getEntityOwned } from '$lib/ownership-api';

  // Components
  import ConnectionFinder from '$lib/widgets/ConnectionFinder.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import Citation from '$lib/components/Citation.svelte';
  import UltimateOwners from '$lib/components/UltimateOwners.svelte';
  import ExternalLinks from '$lib/components/ExternalLinks.svelte';

  // --- PROPS (from +page.server.js) ---
  let { data } = $props();

  // --- STATE ---
  let loading = $state(!data?.entity);
  /** @type {string | null} */
  let error = $state(null);
  let entityId = $state(data?.entityId || '');
  let entityName = $state(data?.entityName || '');
  let entity = $state(data?.entity || null);
  let owners = $state(data?.owners || []);
  let owned = $state(data?.owned || []);

  // --- HELPERS ---
  /** Check if ID is asset (G-prefix) vs entity (E-prefix) */
  function isLikelyAssetId(id) {
    return id && /^G\d+$/.test(id);
  }

  // --- DATA FETCHING (client-side fallback) ---
  onMount(async () => {
    const paramsId = $page.params?.id;

    // Redirect if asset ID was passed to entity page
    if (isLikelyAssetId(paramsId)) {
      goto(assetLink(paramsId), { replaceState: true });
      return;
    }

    // If server data exists, we're done
    if (data?.entity) {
      loading = false;
      return;
    }

    try {
      loading = true;
      error = null;
      if (!paramsId) throw new Error('Missing entity ID');
      entityId = paramsId;

      const [entityData, ownersData, ownedData] = await Promise.all([
        getEntity(paramsId),
        getEntityOwners(paramsId),
        getEntityOwned(paramsId),
      ]);

      entity = entityData;
      entityName = entityData.name || paramsId;
      owners = ownersData || [];
      owned = ownedData || [];
    } catch (err) {
      console.error('Entity load error:', err);
      error = err?.message || 'Failed to load entity';
    } finally {
      loading = false;
    }
  });
</script>

<!-- ============================================================================
     TEMPLATE
     ============================================================================ -->

<svelte:head>
  <title>{entityName || entityId || 'Entity'} — GEM Viz</title>
</svelte:head>

<main>
  <!-- Header -->
  <header>
    <span class="entity-type">Entity Profile</span>
  </header>

  {#if loading}
    <p class="loading">Loading entity from Ownership API…</p>
  {:else if error}
    <p class="loading error">{error}</p>
  {:else}
    <article class="entity-detail">
      <!-- Hero: Name + Summary -->
      <div class="entity-header">
        <div class="header-content">
          <h1>{entityName || `ID: ${entityId}`}</h1>
          <p class="entity-subtitle">
            {#if owners.length || owned.length}
              {owners.length} direct owner{owners.length !== 1 ? 's' : ''}
              · {owned.length} direct holding{owned.length !== 1 ? 's' : ''}
            {/if}
          </p>
          <div class="page-actions">
            <AddToCartButton
              id={entityId}
              name={entityName || entityId}
              type="entity"
              metadata={{ directOwners: owners.length, directHoldings: owned.length }}
            />
            <ExternalLinks type="entity" name={entityName} />
          </div>
        </div>
      </div>

      <!-- Meta Grid -->
      <div class="meta-grid">
        <div class="meta-item">
          <span class="label">GEM Entity ID</span>
          <span class="value"><code>{entityId}</code></span>
        </div>
        <div class="meta-item">
          <span class="label">Direct Owners</span>
          <span class="value">{owners.length.toLocaleString()}</span>
        </div>
        <div class="meta-item">
          <span class="label">Direct Holdings</span>
          <span class="value">{owned.length.toLocaleString()}</span>
        </div>
        {#if entity?.headquartersCountry}
          <div class="meta-item">
            <span class="label">Headquarters Country</span>
            <span class="value">{entity.headquartersCountry}</span>
          </div>
        {/if}
      </div>

      <!-- Co-Ownership Network -->
      <section class="connection-section">
        <ConnectionFinder {entityId} {entityName} title="Co-Ownership Network" />
      </section>

      <!-- Ultimate Owners -->
      <UltimateOwners {entityId} />

      <!-- Direct Owners -->
      <section class="relationship-section">
        <h2>Direct Owners</h2>
        {#if owners.length === 0}
          <p class="section-subtitle">No direct owners listed in the API.</p>
        {:else}
          <ul class="relationship-list">
            {#each owners as owner}
              <li class="relationship-row">
                <a href={entityLink(owner.ownerEntityId)} class="relationship-link">
                  {owner.ownerName || owner.ownerEntityId}
                  <span class="relationship-id">{owner.ownerEntityId}</span>
                </a>
                {#if owner.ownershipPct != null}
                  <span class="relationship-share">{owner.ownershipPct.toFixed(1)}%</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Direct Holdings -->
      <section class="relationship-section">
        <h2>Direct Holdings</h2>
        {#if owned.length === 0}
          <p class="section-subtitle">No direct holdings listed in the API.</p>
        {:else}
          <ul class="relationship-list">
            {#each owned as holding}
              <li class="relationship-row">
                <a href={entityLink(holding.entityId)} class="relationship-link">
                  {holding.entityName || holding.entityId}
                  <span class="relationship-id">{holding.entityId}</span>
                </a>
                {#if holding.ownershipPct != null}
                  <span class="relationship-share">{holding.ownershipPct.toFixed(1)}%</span>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}
      </section>

      <!-- Citation -->
      <Citation variant="footer" trackers={[]} />
    </article>
  {/if}
</main>

<!-- ============================================================================
     STYLES
     ============================================================================ -->
<style>
  /* Layout */
  main {
    width: 100%;
    padding: 40px;
  }

  /* Loading states */
  .loading {
    padding: 30px 0 10px 0;
    color: var(--color-gray-600);
  }
  .loading.error {
    color: var(--color-error);
  }

  /* Header */
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--color-black);
    padding-bottom: 15px;
    margin-bottom: 30px;
  }
  .entity-type {
    font-size: 10px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  /* Entity Detail */
  .entity-detail {
    font-family: Georgia, serif;
  }
  .entity-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    gap: 30px;
    margin-bottom: 30px;
  }
  .header-content {
    flex: 1;
  }
  h1 {
    font-size: 32px;
    font-weight: normal;
    margin: 0 0 10px 0;
    line-height: 1.2;
  }
  .entity-subtitle {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin: 0;
    font-family: system-ui, sans-serif;
  }
  .page-actions {
    margin-top: 12px;
  }

  .relationship-section {
    margin-top: 28px;
    padding-top: 10px;
  }

  .relationship-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 10px;
  }

  .relationship-row {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    border-bottom: 1px solid var(--color-border-subtle);
    padding-bottom: 8px;
  }

  .relationship-link {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .relationship-link:hover {
    text-decoration: underline;
  }

  .relationship-id {
    display: block;
    font-size: 11px;
    color: var(--color-text-tertiary);
  }

  .relationship-share {
    font-size: 12px;
    font-weight: 600;
  }

  /* Section Headings */
  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 40px 0 20px 0;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 10px;
  }

  /* Meta Grid */
  .meta-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    margin-bottom: 40px;
    padding: 20px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .meta-item {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }
  .label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-tertiary);
    font-weight: bold;
  }
  .value {
    font-size: 14px;
    color: var(--color-black);
  }

  /* Sections */
  .connection-section {
    margin: 30px 0;
  }
  .section-subtitle {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: -15px 0 20px 0;
    font-family: system-ui, sans-serif;
  }

  /* Responsive */
  @media (max-width: 768px) {
    .entity-header {
      flex-direction: column;
      gap: 20px;
    }
    .meta-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

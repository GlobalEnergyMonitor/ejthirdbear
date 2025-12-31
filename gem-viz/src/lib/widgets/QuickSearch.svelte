<script lang="ts">
  /**
   * QuickSearch Widget
   * Search for assets or entities by name
   *
   * NOTE: This widget has a unique pattern with debounced input and parallel queries,
   * so it doesn't use the standard composables. The loading flow is user-triggered.
   */

  import { tick } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { assetLink, entityLink } from '$lib/links';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import { staggerIn } from '$lib/animations';

  interface AssetResult {
    name: string;
    id: string;
    tracker: string;
    status: string;
    country: string;
  }

  interface EntityResult {
    name: string;
    id: string;
    asset_count: number;
  }

  interface SearchResults {
    assets: AssetResult[];
    entities: EntityResult[];
  }

  // Props
  let { placeholder = 'Search assets or owners...', limit = 10 } = $props();

  // State
  let query = $state('');
  let loading = $state(false);
  let results = $state<SearchResults>({ assets: [], entities: [] });
  let queryTime = $state(0);
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let resultsEl = $state<HTMLElement | null>(null);

  async function animateResults() {
    await tick();
    if (resultsEl) {
      const items = resultsEl.querySelectorAll('li');
      if (items.length > 0) {
        staggerIn(Array.from(items), { staggerDelay: 30, duration: 300, distance: 10 });
      }
    }
  }

  async function search() {
    if (query.length < 2) {
      results = { assets: [], entities: [] };
      return;
    }

    loading = true;

    const searchTerm = query.replace(/'/g, "''"); // Escape quotes

    // Use LIKE for reliable substring matching with smart relevance scoring
    const assetSql = `
      WITH base AS (
        SELECT DISTINCT
          o."Project" as name,
          o."GEM unit ID" as id,
          o."Tracker" as tracker,
          o."Status" as status,
          l."Country.Area" as country
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE LOWER(o."Project") LIKE LOWER('%${searchTerm}%')
      ),
      scored AS (
        SELECT *,
          CASE
            WHEN LOWER(name) = LOWER('${searchTerm}') THEN 100
            WHEN LOWER(name) LIKE LOWER('${searchTerm}%') THEN 60
            WHEN LOWER(name) LIKE LOWER('% ${searchTerm}%') THEN 40
            ELSE 20
          END as score
        FROM base
      )
      SELECT name, id, tracker, status, country, score
      FROM scored
      ORDER BY score DESC
      LIMIT ${limit}
    `;

    const entitySql = `
      WITH base AS (
        SELECT
          "Owner" as name,
          "Owner GEM Entity ID" as id,
          COUNT(DISTINCT "GEM unit ID") as asset_count
        FROM ownership
        WHERE LOWER("Owner") LIKE LOWER('%${searchTerm}%')
          AND "Owner" IS NOT NULL
        GROUP BY "Owner", "Owner GEM Entity ID"
      ),
      scored AS (
        SELECT *,
          CASE
            WHEN LOWER(name) = LOWER('${searchTerm}') THEN 100
            WHEN LOWER(name) LIKE LOWER('${searchTerm}%') THEN 60
            WHEN LOWER(name) LIKE LOWER('% ${searchTerm}%') THEN 40
            ELSE 20
          END as text_score,
          LOG10(GREATEST(asset_count, 1)) * 20 as importance_score
        FROM base
      )
      SELECT name, id, asset_count, (text_score + importance_score) as score
      FROM scored
      ORDER BY score DESC, asset_count DESC
      LIMIT ${limit}
    `;

    const [assetResult, entityResult] = await Promise.all([
      widgetQuery<AssetResult>(assetSql),
      widgetQuery<EntityResult>(entitySql),
    ]);

    results = {
      assets: assetResult.success ? assetResult.data || [] : [],
      entities: entityResult.success ? entityResult.data || [] : [],
    };

    queryTime = Math.max(assetResult.executionTime || 0, entityResult.executionTime || 0);
    loading = false;
    // Animate results appearing
    animateResults();
  }

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    query = target.value;
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(search, 300);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      query = '';
      results = { assets: [], entities: [] };
    }
  }
</script>

<div class="widget quick-search">
  <div class="search-box">
    <input
      type="text"
      {placeholder}
      value={query}
      oninput={handleInput}
      onkeydown={handleKeydown}
    />
    {#if loading}
      <span class="spinner"></span>
    {/if}
  </div>

  {#if query.length >= 2}
    <div class="results" bind:this={resultsEl}>
      {#if results.assets.length > 0}
        <div class="result-section">
          <h4>Assets</h4>
          <ul>
            {#each results.assets as asset}
              <li>
                <a href={assetLink(asset.id)}>
                  <TrackerIcon tracker={asset.tracker} size={10} />
                  <span class="name">{asset.name}</span>
                  <span class="meta">{asset.country}</span>
                </a>
                <AddToCartButton
                  id={asset.id}
                  name={asset.name}
                  type="asset"
                  tracker={asset.tracker}
                  variant="icon"
                  size="small"
                />
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if results.entities.length > 0}
        <div class="result-section">
          <h4>Owners</h4>
          <ul>
            {#each results.entities as entity}
              <li>
                <a href={entityLink(entity.id)}>
                  <span class="entity-icon">E</span>
                  <span class="name">{entity.name}</span>
                  <span class="meta">{entity.asset_count} assets</span>
                </a>
                <AddToCartButton
                  id={entity.id}
                  name={entity.name}
                  type="entity"
                  metadata={{ assetCount: entity.asset_count }}
                  variant="icon"
                  size="small"
                />
              </li>
            {/each}
          </ul>
        </div>
      {/if}

      {#if results.assets.length === 0 && results.entities.length === 0 && !loading}
        <div class="no-results">No results for "{query}"</div>
      {/if}

      {#if queryTime > 0}
        <div class="query-time">{queryTime}ms</div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .widget {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
  }

  .search-box {
    position: relative;
  }
  input {
    width: 100%;
    padding: 12px 16px;
    font-size: 14px;
    border: 2px solid #000;
    background: #fff;
  }
  input:focus {
    outline: none;
    border-color: #000;
  }
  .spinner {
    position: absolute;
    right: 16px;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
    border: 2px solid #ddd;
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: translateY(-50%) rotate(360deg);
    }
  }

  .results {
    margin-top: 12px;
    max-height: 400px;
    overflow-y: auto;
  }
  .result-section {
    margin-bottom: 16px;
  }
  .result-section h4 {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #999;
    margin: 0 0 8px 0;
  }
  .result-section ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .result-section li {
    border-bottom: 1px solid #f0f0f0;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .result-section li:last-child {
    border-bottom: none;
  }
  .result-section a {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 0;
    text-decoration: none;
    color: #333;
    flex: 1;
  }
  .result-section a:hover {
    background: #f9f9f9;
  }
  .name {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }
  .meta {
    font-size: 11px;
    color: #999;
  }
  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: #000;
    color: white;
    border-radius: 50%;
    font-size: 9px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .no-results {
    font-size: 13px;
    color: #666;
    text-align: center;
    padding: 20px 0;
  }
  .query-time {
    font-size: 10px;
    color: #999;
    text-align: right;
    font-family: monospace;
    margin-top: 8px;
  }
</style>

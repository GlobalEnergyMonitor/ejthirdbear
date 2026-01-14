<script>
  /**
   * ConnectionFinder Widget
   * Find connections between entities - shared assets, co-ownership
   */

  import { onMount } from 'svelte';
  import { widgetQuery } from './widget-utils';
  import { assetLink, entityLink } from '$lib/links';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import { investigationCart } from '$lib/investigationCart';

  // Props
  let { entityId = null, entityName = '', title = 'Connected Entities' } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let connections = $state([]);
  let queryTime = $state(0);

  async function loadConnections() {
    if (!entityId && !entityName) {
      connections = [];
      loading = false;
      return;
    }

    loading = true;
    error = null;

    // Find other entities that co-own assets with this entity
    const whereClause = entityId
      ? `"Owner GEM Entity ID" = '${entityId}'`
      : `"Owner" = '${entityName.replace(/'/g, "''")}'`;

    const sql = `
      WITH my_assets AS (
        SELECT DISTINCT "GEM unit ID" as asset_id
        FROM ownership
        WHERE ${whereClause}
      ),
      co_owners AS (
        SELECT
          o."Owner" as entity_name,
          o."Owner GEM Entity ID" as entity_id,
          COUNT(DISTINCT o."GEM unit ID") as shared_assets,
          GROUP_CONCAT(DISTINCT o."Project") as sample_projects
        FROM ownership o
        INNER JOIN my_assets m ON o."GEM unit ID" = m.asset_id
        WHERE o."Owner GEM Entity ID" != '${entityId || ''}'
          AND o."Owner" IS NOT NULL
          AND o."Owner" != '${entityName.replace(/'/g, "''")}'
        GROUP BY o."Owner", o."Owner GEM Entity ID"
        ORDER BY shared_assets DESC
        LIMIT 20
      )
      SELECT * FROM co_owners
    `;

    const result = await widgetQuery(sql);

    if (result.success) {
      connections = (result.data || []).map((row) => ({
        ...row,
        samples: row.sample_projects ? String(row.sample_projects).split(',').slice(0, 3) : [],
      }));
      queryTime = result.executionTime || 0;
    } else {
      error = result.error;
    }

    loading = false;
  }

  onMount(() => {
    loadConnections();
  });

  $effect(() => {
    void entityId;
    void entityName;
    loadConnections();
  });

  // Add all co-owners to investigation cart
  function addAllToCart() {
    const items = connections.map((conn) => ({
      id: conn.entity_id,
      name: conn.entity_name,
      type: /** @type {'entity'} */ ('entity'),
      metadata: { assetCount: conn.shared_assets },
    }));
    const added = investigationCart.addMany(items);
    // Could show a toast here
  }
</script>

<div class="widget connection-finder">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{queryTime}ms</span>
  </header>

  {#if loading}
    <div class="loading">Finding connections...</div>
  {:else if error}
    <div class="error">{error}</div>
  {:else if connections.length === 0}
    <div class="empty">No co-owners found</div>
  {:else}
    <div class="intro-row">
      <p class="intro">Entities that co-own assets with {entityName || entityId}:</p>
      <button class="btn btn-outline btn-sm" onclick={addAllToCart}>
        + Add all {connections.length}
      </button>
    </div>
    <ul class="connections">
      {#each connections as conn}
        <li>
          <div class="conn-main">
            <a href={entityLink(conn.entity_id)} class="entity">
              <span class="entity-icon">E</span>
              <span class="name">{conn.entity_name}</span>
            </a>
            <span class="shared">{conn.shared_assets} shared</span>
            <AddToCartButton
              id={conn.entity_id}
              name={conn.entity_name}
              type="entity"
              metadata={{ sharedAssets: conn.shared_assets }}
              variant="icon"
              size="small"
            />
          </div>
          {#if conn.samples.length > 0}
            <span class="samples">
              {conn.samples.join(', ')}
            </span>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .widget {
    background: var(--color-white);
    border: 1px solid var(--color-border);
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid var(--color-gray-100);
    padding-bottom: 8px;
  }
  h3 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .query-time {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-family: monospace;
  }

  .loading,
  .error,
  .empty {
    font-size: 13px;
    color: var(--color-text-secondary);
    padding: 20px 0;
    text-align: center;
  }
  .error {
    color: var(--color-error);
  }

  .intro-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .intro {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: 0;
  }

  .connections {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  .connections li {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-gray-100);
  }
  .connections li:last-child {
    border-bottom: none;
  }
  .conn-main {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .entity {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    text-decoration: none;
    color: var(--color-gray-700);
    flex: 1;
  }
  .entity:hover .name {
    text-decoration: underline;
  }
  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: var(--color-gray-700);
    color: white;
    border-radius: 50%;
    font-size: 9px;
    font-weight: bold;
    flex-shrink: 0;
  }
  .name {
    font-size: 13px;
  }
  .shared {
    font-size: 11px;
    color: var(--color-gray-700);
    font-weight: 600;
  }
  .samples {
    width: 100%;
    font-size: 11px;
    color: var(--color-text-tertiary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 22px;
  }
</style>

<script lang="ts">
  /**
   * ConnectionFinder Widget
   * Find connections between entities - shared assets, co-ownership
   *
   * REFACTORED: Uses createAsyncState() composable for state management
   */

  import { onMount } from 'svelte';
  import { createAsyncState } from '$lib/composables.svelte';
  import { widgetQuery } from './widget-utils';
  import { entityLink } from '$lib/links';
  import AddToCartButton from '$lib/components/AddToCartButton.svelte';
  import LoadingWrapper from '$lib/components/LoadingWrapper.svelte';
  import { investigationCart } from '$lib/investigationCart';

  interface Connection {
    entity_name: string;
    entity_id: string;
    shared_assets: number;
    sample_projects: string;
    samples: string[];
  }

  // Props
  let {
    entityId = null as string | null,
    entityName = '',
    title = 'Connected Entities',
  } = $props();

  // State - using composable instead of 4 separate $state() calls
  const state = createAsyncState<Connection[]>([]);

  async function loadConnections() {
    if (!entityId && !entityName) {
      state.setData([]);
      return;
    }

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

    await state.run(async () => {
      const result = await widgetQuery<Omit<Connection, 'samples'>>(sql);
      if (!result.success) {
        throw new Error(result.error || 'Query failed');
      }
      // Transform results to include parsed samples
      return (result.data || []).map((row) => ({
        ...row,
        samples: row.sample_projects ? String(row.sample_projects).split(',').slice(0, 3) : [],
      }));
    });
  }

  onMount(() => {
    loadConnections();
  });

  $effect(() => {
    void entityId;
    void entityName;
    loadConnections();
  });

  // Convenience accessor for template
  const connections = $derived(state.data || []);

  // Add all co-owners to investigation cart
  function addAllToCart() {
    const items = connections.map((conn) => ({
      id: conn.entity_id,
      name: conn.entity_name,
      type: 'entity' as const,
      metadata: { assetCount: conn.shared_assets },
    }));
    investigationCart.addMany(items);
  }
</script>

<div class="widget connection-finder">
  <header>
    <h3>{title}</h3>
    <span class="query-time">{state.queryTime}ms</span>
  </header>

  <LoadingWrapper
    loading={state.loading}
    error={state.error}
    empty={connections.length === 0}
    loadingMessage="Finding connections..."
    emptyMessage="No co-owners found"
  >
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
  </LoadingWrapper>
</div>

<style>
  .widget {
    background: #fff;
    border: 1px solid #ddd;
    padding: 16px;
  }
  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 12px;
    border-bottom: 1px solid #eee;
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
    color: #999;
    font-family: monospace;
  }

  .intro-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .intro {
    font-size: 12px;
    color: #666;
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
    border-bottom: 1px solid #f0f0f0;
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
    color: #333;
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
    background: #333;
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
    color: #333;
    font-weight: 600;
  }
  .samples {
    width: 100%;
    font-size: 11px;
    color: #999;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    padding-left: 22px;
  }
</style>

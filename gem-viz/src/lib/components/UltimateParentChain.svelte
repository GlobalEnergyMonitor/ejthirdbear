<script>
  /**
   * UltimateParentChain - Shows ownership path from ultimate parent to asset
   *
   * Displays a horizontal breadcrumb-style chain showing how ownership flows
   * from the top-level parent down to the asset. Each entity is clickable.
   *
   * @example
   * <UltimateParentChain chain={ownershipChain} assetId="G123" assetName="Plant X" />
   *
   * Renders:
   * BlackRock Inc → Vanguard Group → RWE AG → [Plant X]
   *     5%              10%           100%
   */
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';

  // ---------------------------------------------------------------------------
  // Props
  // ---------------------------------------------------------------------------
  let {
    /** Chain items from extractOwnershipChainWithIds (sorted ultimate parent first) */
    chain = [],
    /** Asset ID for the terminal node */
    assetId = '',
    /** Asset name for display */
    assetName = '',
    /** Whether to show ownership percentages */
    showPercentages = true,
    /** Compact mode for smaller displays */
    compact = false,
  } = $props();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /**
   * Navigate to entity or asset page
   */
  function handleClick(item, isAsset = false) {
    if (isAsset && assetId) {
      goto(assetLink(assetId));
    } else if (item.id) {
      // Check if it's a GEM Entity ID (E-prefix) or sanitized name
      const isEntityId = item.id.startsWith('E') && /^E\d+$/.test(item.id);
      if (isEntityId) {
        goto(entityLink(item.id));
      }
      // For sanitized name IDs, we can't navigate (no canonical entity page)
    }
  }

  /**
   * Check if an item is navigable
   */
  function isNavigable(item) {
    return item.id && item.id.startsWith('E') && /^E\d+$/.test(item.id);
  }

  // Filter out the asset itself (depth 0) from the chain - we'll show it separately
  const parentChain = $derived(chain.filter((item) => item.depth > 0));

  // Ultimate parent is first in the sorted chain (highest depth)
  const ultimateParent = $derived(parentChain.length > 0 ? parentChain[0] : null);
</script>

<!-- ---------------------------------------------------------------------------
     Template
     --------------------------------------------------------------------------- -->
{#if parentChain.length > 0}
  <nav class="ultimate-parent-chain" class:compact aria-label="Ownership chain">
    {#if ultimateParent && parentChain.length > 1}
      <span class="chain-label">Ultimate parent:</span>
    {/if}

    <ol class="chain">
      {#each parentChain as item, i}
        <li class="chain-item">
          {#if isNavigable(item)}
            <button
              type="button"
              class="entity-link"
              class:is-ultimate={i === 0}
              onclick={() => handleClick(item)}
            >
              {item.name}
            </button>
          {:else}
            <span class="entity-name" class:is-ultimate={i === 0}>
              {item.name}
            </span>
          {/if}

          {#if showPercentages && item.share !== null}
            <span class="ownership-pct">{item.share.toFixed(0)}%</span>
          {/if}

          {#if i < parentChain.length - 1}
            <span class="arrow" aria-hidden="true">→</span>
          {/if}
        </li>
      {/each}

      <!-- Terminal node: the asset itself -->
      {#if assetName}
        <li class="chain-item">
          <span class="arrow" aria-hidden="true">→</span>
          <span class="asset-node">{assetName}</span>
        </li>
      {/if}
    </ol>
  </nav>
{/if}

<!-- ---------------------------------------------------------------------------
     Styles
     --------------------------------------------------------------------------- -->
<style>
  .ultimate-parent-chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    font-family: system-ui, sans-serif;
    font-size: 12px;
  }

  .ultimate-parent-chain.compact {
    font-size: 11px;
    gap: 4px;
  }

  .chain-label {
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #888;
    margin-right: 4px;
  }

  .chain {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0;
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .chain-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .entity-link {
    background: none;
    border: none;
    padding: 2px 0;
    font: inherit;
    color: #000;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
  }

  .entity-link:hover {
    text-decoration-color: currentColor;
  }

  .entity-link.is-ultimate {
    font-weight: 600;
  }

  .entity-name {
    color: #333;
  }

  .entity-name.is-ultimate {
    font-weight: 600;
    color: #000;
  }

  .ownership-pct {
    font-size: 10px;
    color: #666;
    background: #f0f0f0;
    padding: 1px 4px;
    margin-left: 2px;
  }

  .compact .ownership-pct {
    font-size: 9px;
    padding: 0 3px;
  }

  .arrow {
    color: #999;
    margin: 0 6px;
    font-weight: 300;
  }

  .compact .arrow {
    margin: 0 4px;
  }

  .asset-node {
    font-weight: 600;
    color: #000;
    background: #000;
    color: #fff;
    padding: 2px 8px;
  }

  .compact .asset-node {
    padding: 1px 6px;
  }
</style>

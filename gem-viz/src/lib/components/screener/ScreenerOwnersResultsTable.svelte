<script lang="ts">
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';
  import { describeOwnership } from '$lib/data-config/screener-config';

  export let filteredOwners = [];
  export let classDescription = '';
  export let searchQuery = '';
  export let expandedOwnerId: string | null = null;
  export let assetClassName = '';
  export let trackerSlug = '';
  export let isInInvestigation: (_entityId: string) => boolean;
  export let onToggleExpanded: (_entityId: string) => void;
  export let onToggleInvestigation: (_owner: any) => void;
  export let onClearSearch: () => void;
</script>

<div class="results-box">
  <div class="matched-intro">
    <strong>Matched Owners:</strong> Click any company name to explore ownership chains and intermediaries
  </div>

  <table class="results-table">
    <thead>
      <tr>
        <th class="col-expand"></th>
        <th class="col-select"></th>
        <th class="col-company">Company name:</th>
        <th class="col-filtered">Ownership in {classDescription}:</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredOwners as owner (owner.entityId || owner.name)}
        {@const inInvestigation = isInInvestigation(owner.entityId)}
        {@const isExpanded = expandedOwnerId === owner.entityId}
        <tr class:in-investigation={inInvestigation} class:expanded={isExpanded}>
          <td class="col-expand">
            <button
              class="expand-btn"
              class:expanded={isExpanded}
              onclick={() => onToggleExpanded(owner.entityId)}
              title={isExpanded ? 'Hide ownership tree' : 'Show ownership tree'}
            >
              {isExpanded ? '▼' : '▶'}
            </button>
          </td>
          <td class="col-select">
            <button
              class="select-btn"
              class:selected={inInvestigation}
              onclick={() => onToggleInvestigation(owner)}
              title={inInvestigation ? 'Remove from investigation' : 'Add to investigation'}
            >
              {inInvestigation ? '✓' : '+'}
            </button>
          </td>
          <td class="col-company">
            <button class="company-btn" onclick={() => onToggleExpanded(owner.entityId)}>
              {owner.name}
            </button>
          </td>
          <td class="col-filtered">{describeOwnership(owner.filteredAssets, classDescription)}</td>
        </tr>
        {#if isExpanded}
          <tr class="tree-row">
            <td colspan="5" class="tree-cell">
              <div class="expanded-viz">
                <AssetScreenerChart
                  entityId={owner.entityId}
                  entityName={owner.name}
                  {assetClassName}
                  {trackerSlug}
                />
              </div>
            </td>
          </tr>
        {/if}
      {:else}
        <tr>
          <td colspan="4" class="empty-row">
            {#if searchQuery}
              No owners matching "{searchQuery}" found.
              <button class="link-btn" onclick={onClearSearch}>Clear search</button>
            {:else}
              <div class="no-data-notice">
                <strong>No ownership data available for {classDescription}.</strong>
                <p>
                  Owner aggregation currently covers Coal Plants, Gas Plants, Steel Plants, and
                  Bioenergy. Coal Mines, Iron Mines, and Gas Pipelines have asset data in the REST
                  API but owner relationships are not yet queryable for those tracker types.
                </p>
              </div>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .results-box {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: var(--radius-md);
    padding: var(--space-5);
  }

  .matched-intro {
    padding: var(--space-2) var(--space-3);
    margin-bottom: var(--space-4);
    font-size: var(--font-size-sm);
    color: #4a5568;
  }

  .matched-intro strong {
    color: #1d4961;
  }

  .results-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
  }

  .results-table th {
    text-align: left;
    padding: var(--space-3);
    color: #1d4961;
    font-weight: 600;
    border-bottom: 2px solid #e2e8f0;
  }

  .results-table td {
    padding: var(--space-4) var(--space-3);
    vertical-align: top;
    border-bottom: 1px solid #edf2f7;
    color: #4a5568;
    line-height: 1.5;
  }

  .results-table tr:hover td {
    background: #f7fafc;
  }

  .col-expand {
    width: 32px;
    text-align: center;
  }

  .expand-btn {
    width: 24px;
    height: 24px;
    border: none;
    background: none;
    color: #a0aec0;
    font-size: 10px;
    cursor: pointer;
    transition: all 0.15s ease;
    border-radius: 4px;
  }

  .expand-btn:hover {
    background: #edf2f7;
    color: #1d4961;
  }

  .expand-btn.expanded {
    color: #1d4961;
    background: #e8f4f4;
  }

  .col-select {
    width: 40px;
    text-align: center;
  }

  .select-btn {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    border: 2px solid #cbd5e0;
    background: white;
    color: #a0aec0;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .select-btn:hover {
    border-color: #1d4961;
    color: #1d4961;
  }

  .select-btn.selected {
    background: #1d4961;
    border-color: #1d4961;
    color: white;
  }

  tr.in-investigation {
    background: rgba(29, 73, 97, 0.04);
  }

  tr.expanded {
    background: #f0f7f9;
  }

  tr.expanded td {
    border-bottom-color: transparent;
  }

  .tree-row {
    background: #f7fafc;
  }

  .tree-row:hover td {
    background: #f7fafc;
  }

  .tree-cell {
    padding: 0 !important;
    border-bottom: 2px solid #e2e8f0;
  }

  .expanded-viz {
    padding: 16px;
    background: #fafaf7;
  }

  .company-btn {
    background: none;
    border: none;
    color: #1d4961;
    font-weight: 500;
    font-size: inherit;
    text-align: left;
    cursor: pointer;
    padding: 0;
  }

  .company-btn:hover {
    text-decoration: underline;
  }

  .link-btn {
    background: none;
    border: none;
    color: #1d4961;
    text-decoration: underline;
    cursor: pointer;
    font-size: inherit;
    padding: 0;
  }

  .col-company {
    width: 22%;
  }

  .col-filtered {
    width: 35%;
  }

  .empty-row {
    text-align: center;
    color: #a0aec0;
    padding: var(--space-8) !important;
  }

  .no-data-notice {
    text-align: left;
    max-width: 500px;
    margin: 0 auto;
    padding: var(--space-4);
    background: #fff7ed;
    border: 1px solid #fed7aa;
    border-radius: var(--radius-sm);
    color: #9a3412;
  }

  .no-data-notice strong {
    display: block;
    margin-bottom: var(--space-2);
    color: #7c2d12;
  }

  .no-data-notice p {
    margin: 0;
    font-size: var(--font-size-sm);
    line-height: 1.5;
    color: #c2410c;
  }

  @media (max-width: 768px) {
    .results-table {
      font-size: 13px;
    }

    .col-company {
      width: 30%;
    }

    .col-filtered {
      width: 35%;
    }
  }
</style>

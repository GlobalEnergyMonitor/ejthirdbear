<script lang="ts">
  import AssetScreenerChart from '$lib/components/screener/AssetScreenerChart.svelte';

  export let filteredOwners = [];
  export let classDescription = '';
  export let searchQuery = '';
  export let expandedOwnerId: string | null = null;
  export let assetClassName = '';
  export let trackerSlug = '';
  export let viewMode: 'all' | 'filtered' = 'all';
  export let selectedOwnerCount = 0;
  export let onToggleExpanded: (_entityId: string) => void;
  export let onClearSearch: () => void;
</script>

<div class="owners-table-wrap">
  <table class="owners-table">
    <thead>
      <tr>
        <th class="th-company">Company</th>
        <th class="th-count">Total Assets</th>
        <th class="th-count">Matching</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredOwners as owner, idx (owner.entityId || owner.name)}
        {@const isExpanded = expandedOwnerId === owner.entityId}
        <tr
          class="owner-row"
          class:expanded={isExpanded}
          class:even={idx % 2 === 0}
          onclick={() => onToggleExpanded(owner.entityId)}
        >
          <td class="td-company">
            <span class="arrow" class:open={isExpanded}></span>
            <span class="owner-name">{owner.name}</span>
          </td>
          <td class="td-count">
            <span class="count-num">{owner.totalAssets?.toLocaleString() ?? '—'}</span>
          </td>
          <td class="td-count">
            <span class="count-num count-match">{owner.filteredAssets?.toLocaleString() ?? '—'}</span>
          </td>
        </tr>
        {#if isExpanded}
          <tr class="detail-row">
            <td colspan="3" class="detail-cell">
              <AssetScreenerChart
                entityId={owner.entityId}
                entityName={owner.name}
                {assetClassName}
                {trackerSlug}
                filteredAssetCount={owner.filteredAssets}
              />
            </td>
          </tr>
        {/if}
      {:else}
        <tr>
          <td colspan="3" class="empty-cell">
            {#if searchQuery}
              No owners matching "{searchQuery}."
              <button class="clear-link" onclick={onClearSearch}>Clear search</button>
            {:else if viewMode === 'filtered' && selectedOwnerCount > 0}
              <strong>No selected owners matched {classDescription}.</strong>
              <p>Try editing your owner selection or clearing some asset filters.</p>
            {:else}
              <strong>No ownership records found for {classDescription}.</strong>
              <p>This usually means no assets matched the current filters.</p>
            {/if}
          </td>
        </tr>
      {/each}
    </tbody>
  </table>
</div>

<style>
  .owners-table-wrap {
    border: 1px solid var(--color-gray-200, #e2e8f0);
    border-radius: 2px;
    overflow: hidden;
  }

  .owners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
    line-height: 1.4;
    font-family: Georgia, serif;
  }

  /* ── Header ─────────────────────────────────── */
  thead tr {
    border-bottom: 1px solid var(--color-gray-200, #e2e8f0);
  }

  th {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--color-text-tertiary, #94a3b8);
    text-align: left;
    background: var(--color-gray-50, #f8fafc);
  }

  .th-count {
    width: 80px;
    text-align: right;
  }

  /* ── Body rows ──────────────────────────────── */
  .owner-row {
    cursor: pointer;
    transition: background 80ms ease;
  }

  .owner-row:hover {
    background: var(--color-gray-50, #f8fafc);
  }

  .owner-row.even {
    background: rgba(0, 0, 0, 0.015);
  }

  .owner-row.even:hover {
    background: var(--color-gray-50, #f8fafc);
  }

  .owner-row.expanded {
    background: rgba(42, 127, 143, 0.06);
  }

  .owner-row.expanded:hover {
    background: rgba(42, 127, 143, 0.08);
  }

  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-gray-100, #f1f5f9);
    vertical-align: middle;
  }

  .owner-row.expanded td {
    border-bottom-color: transparent;
  }

  /* ── Company cell ───────────────────────────── */
  .td-company {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .arrow {
    display: inline-block;
    width: 0;
    height: 0;
    border-style: solid;
    border-width: 4px 0 4px 6px;
    border-color: transparent transparent transparent var(--color-gray-300, #cbd5e1);
    transition:
      transform 150ms ease,
      border-color 150ms ease;
    flex-shrink: 0;
  }

  .arrow.open {
    transform: rotate(90deg);
    border-left-color: var(--gem-teal, #2a7f8f);
  }

  .owner-row:hover .arrow {
    border-left-color: var(--color-gray-500, #64748b);
  }

  .owner-row:hover .arrow.open {
    border-left-color: var(--gem-teal, #2a7f8f);
  }

  .owner-name {
    color: var(--color-text-primary, #1e293b);
    font-weight: 500;
  }

  .owner-row:hover .owner-name {
    text-decoration: underline;
    text-underline-offset: 2px;
    color: var(--gem-teal, #2a7f8f);
  }

  /* ── Count cell ─────────────────────────────── */
  .td-count {
    text-align: right;
  }

  .count-num {
    font-family: var(--font-family-data, 'IBM Plex Mono', monospace);
    font-size: 13px;
    font-weight: 500;
    color: var(--color-text-tertiary, #94a3b8);
    font-variant-numeric: tabular-nums;
  }

  .count-match {
    color: var(--color-text-secondary, #475569);
    font-weight: 600;
  }

  /* ── Expanded detail ────────────────────────── */
  .detail-row {
    background: var(--color-gray-50, #f8fafc);
  }

  .detail-row:hover {
    background: var(--color-gray-50, #f8fafc);
  }

  .detail-cell {
    padding: 0 !important;
    border-bottom: 2px solid var(--color-gray-200, #e2e8f0);
  }

  /* ── Empty state ────────────────────────────── */
  .empty-cell {
    text-align: center;
    padding: 40px 20px !important;
    color: var(--color-text-tertiary, #94a3b8);
    font-style: italic;
  }

  .empty-cell strong {
    display: block;
    font-style: normal;
    color: var(--color-text-secondary, #475569);
    margin-bottom: 4px;
  }

  .empty-cell p {
    margin: 0;
    font-size: 13px;
  }

  .clear-link {
    background: none;
    border: none;
    color: var(--gem-teal, #2a7f8f);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  /* ── Responsive ─────────────────────────────── */
  @media (max-width: 640px) {
    .owners-table {
      font-size: 13px;
    }

    .th-count {
      width: 60px;
    }

    td,
    th {
      padding: 8px 10px;
    }
  }
</style>

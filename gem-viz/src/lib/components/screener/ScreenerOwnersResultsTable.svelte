<script lang="ts">
  export let filteredOwners = [];
  export let classDescription = '';
  export let searchQuery = '';
  export let viewMode: 'all' | 'filtered' = 'all';
  export let selectedOwnerCount = 0;
  export let bulkMatchProvenance: Record<string, string[]> = {};
  export let onToggleExpanded: (_entityId: string, _event?: MouseEvent) => void;
  export let onClearSearch: () => void;
</script>

<div class="owners-table-wrap">
  <table class="owners-table">
    <thead>
      <tr>
        <th class="th-company">Company</th>
        <th class="th-count">Total Projects</th>
        <th class="th-count" title="Projects matching {classDescription}">Matching</th>
      </tr>
    </thead>
    <tbody>
      {#each filteredOwners as owner, idx (owner.entityId || owner.name)}
        <tr
          class="owner-row"
          class:even={idx % 2 === 0}
          onclick={(e) => onToggleExpanded(owner.entityId, e)}
        >
          <td class="td-company">
            <span class="owner-name">{owner.name}</span>
            {#if bulkMatchProvenance[owner.entityId]?.length}
              {@const terms = bulkMatchProvenance[owner.entityId]}
              <span class="match-badge" aria-label="Bulk search match: {terms.join(', ')}">
                🔍
                <span class="match-tooltip">Matched from: {terms.join(', ')}</span>
              </span>
            {/if}
          </td>
          <td class="td-count">
            <span class="count-num">{owner.totalAssets?.toLocaleString() ?? '—'}</span>
          </td>
          <td class="td-count">
            <span class="count-num count-match"
              >{owner.filteredAssets?.toLocaleString() ?? '—'}</span
            >
          </td>
        </tr>
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

  td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--color-gray-100, #f1f5f9);
    vertical-align: middle;
  }

  /* ── Company cell ───────────────────────────── */
  .td-company {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .owner-name {
    color: var(--color-text-primary, #1e293b);
    font-weight: 500;
  }

  .match-badge {
    position: relative;
    font-size: 11px;
    opacity: 0.45;
    cursor: pointer;
    user-select: none;
    flex-shrink: 0;
  }

  .match-badge:hover {
    opacity: 1;
  }

  .match-tooltip {
    display: none;
    position: absolute;
    bottom: calc(100% + 6px);
    left: 50%;
    transform: translateX(-50%);
    background: #1e293b;
    color: #fff;
    font-size: 11px;
    font-family: var(--font-family-mono, monospace);
    font-weight: 400;
    padding: 4px 8px;
    white-space: nowrap;
    z-index: 20;
    pointer-events: none;
  }

  .match-badge:hover .match-tooltip {
    display: block;
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

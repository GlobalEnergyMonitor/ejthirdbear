<script lang="ts">
  import { link } from '$lib/links';

  export let filteredOwners = [];
  export let classDescription = '';
  export let searchQuery = '';
  export let viewMode: 'all' | 'filtered' = 'all';
  export let selectedOwnerCount = 0;
  export let bulkMatchProvenance: Record<string, string[]> = {};
  export let onToggleExpanded: (_entityId: string, _event?: MouseEvent) => void;
  export let onClearSearch: () => void;
  /** Base URL override for links (e.g., Drupal host) */
  export let linkBase = '';
  /** Navigation mode: 'parent'|'message' → postMessage, else new tab */
  export let linkTarget = '';

  function portfolioUrl(entityId: string): string {
    if (linkBase) return `${linkBase.replace(/\/$/, '')}/portfolio-explorer?entity=${entityId}`;
    return link(`portfolio-explorer?entity=${entityId}`);
  }

  function handlePortfolioClick(e: MouseEvent, url: string) {
    if (linkTarget === 'parent' || linkTarget === 'message') {
      e.preventDefault();
      e.stopPropagation();
      window.parent?.postMessage({ type: 'gem-navigate', url }, '*');
    }
  }
</script>

<div class="owners-table-wrap">
  <table class="owners-table">
    <thead>
      <tr>
        <th class="th-company">Company</th>
        <th class="th-count">Total Assets</th>
        <th class="th-count">
          <span class="th-label-tip">
            Matching
            <span class="th-tip-icon">ⓘ</span>
            <span class="th-tip-body">Assets that are {classDescription}</span>
          </span>
        </th>
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
            {#if owner.entityId}
              <a
                class="portfolio-link"
                href={portfolioUrl(owner.entityId)}
                target="_blank"
                rel="noopener"
                title="Explore {owner.name}'s full portfolio"
                onclick={(e) => {
                  e.stopPropagation();
                  handlePortfolioClick(e, portfolioUrl(owner.entityId));
                }}
              >
                Portfolio &rarr;
              </a>
            {/if}
          </td>
          <td class="td-count">
            <span class="count-num"
              >{owner.totalProjects?.toLocaleString() ?? '-'}
              ({owner.totalAssets?.toLocaleString() ?? '—'} units)
            </span>
          </td>
          <td class="td-count">
            <span class="count-num count-match"
              >{owner?.filteredProjects.toLocaleString() ?? '-'}
              {#if owner.filteredAssets > owner.filteredProjects}
                ({owner.filteredAssets?.toLocaleString() ?? '—'} units)
              {/if}
            </span>
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
    border: var(--border-width) solid var(--color-border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .owners-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-sm);
    line-height: 1.4;
    font-family: var(--font-family);
  }

  /* ── Header ─────────────────────────────────── */
  thead tr {
    border-bottom: 1px solid var(--color-gray-200, #e2e8f0);
  }

  th {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-xs);
    font-weight: var(--font-weight-medium);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--color-text-tertiary);
    text-align: left;
    background: var(--color-bg-secondary);
  }

  .th-count {
    width: 130px;
    text-align: right;
    white-space: nowrap;
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
    background: var(--color-bg-secondary);
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
    gap: var(--space-2);
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
    bottom: calc(100% + var(--space-2));
    left: 50%;
    transform: translateX(-50%);
    background: var(--gem-navy);
    color: var(--gem-white);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    font-weight: var(--font-weight-regular);
    padding: var(--space-1) var(--space-2);
    white-space: nowrap;
    z-index: var(--z-tooltip, 20);
    pointer-events: none;
    border-radius: var(--radius-sm);
  }

  .match-badge:hover .match-tooltip {
    display: block;
  }

  .owner-row:hover .owner-name {
    text-decoration: underline;
    text-underline-offset: 2px;
    color: var(--gem-teal);
  }

  .portfolio-link {
    font-size: 10px;
    font-weight: 500;
    color: var(--gem-teal);
    text-decoration: none;
    opacity: 0;
    transition: opacity 120ms ease;
    white-space: nowrap;
    margin-left: auto;
    flex-shrink: 0;
  }
  .portfolio-link:hover {
    text-decoration: underline;
  }
  .owner-row:hover .portfolio-link {
    opacity: 1;
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
    white-space: nowrap;
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
    color: var(--gem-teal);
    text-decoration: underline;
    cursor: pointer;
    font: inherit;
    padding: 0;
  }

  /* ── Header tooltip ─────────────────────────── */
  .th-label-tip {
    position: relative;
    display: inline-flex;
    align-items: center;
    gap: 3px;
    cursor: default;
  }

  .th-tip-icon {
    font-size: 10px;
    opacity: 0.5;
    line-height: 1;
  }

  .th-tip-body {
    display: none;
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    background: var(--gem-navy, #003348);
    color: var(--gem-white, #fff);
    font-size: var(--font-size-xs, 11px);
    font-family: var(--font-family-mono, monospace);
    font-weight: var(--font-weight-regular, 400);
    text-transform: none;
    letter-spacing: 0;
    padding: 4px 8px;
    white-space: nowrap;
    border-radius: var(--radius-sm, 4px);
    pointer-events: none;
    z-index: var(--z-tooltip, 20);
  }

  .th-label-tip:hover .th-tip-body {
    display: block;
  }

  /* ── Responsive ─────────────────────────────── */
  @media (max-width: 640px) {
    .owners-table {
      font-size: 13px;
    }

    .th-count {
      width: 100px;
    }

    td,
    th {
      padding: 8px 10px;
    }
  }
</style>

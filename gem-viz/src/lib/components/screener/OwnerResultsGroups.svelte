<script lang="ts">
  import EntityMicroCard from '$lib/components/cards/EntityMicroCard.svelte';
  import DataSourceBadge from '$lib/components/data/DataSourceBadge.svelte';

  type EntityResult = {
    id: string;
    name: string;
    headquartersCountry?: string;
    assetCount?: number;
  };

  type SearchGroup = {
    term: string;
    results: EntityResult[];
    matchCount: number;
  };

  let {
    searchLoading = false,
    groups = [],
    isSelected,
    onSelectOwner,
  }: {
    searchLoading?: boolean;
    groups?: SearchGroup[];
    isSelected: (_owner: EntityResult) => boolean;
    onSelectOwner: (_owner: EntityResult, _toggle?: boolean) => void;
  } = $props();
</script>

{#if !searchLoading && groups.length > 0}
  <div class="search-results">
    <div class="results-source-row">
      <DataSourceBadge source="api" label="Entity Search" />
    </div>
    {#each groups as group}
      <div class="result-group">
        <div class="group-header">
          {#if group.matchCount === 1}
            <span class="match-count exact">Found: "{group.term}"</span>
          {:else if group.matchCount > 1}
            <span class="match-count multiple">{group.matchCount} results for "{group.term}"</span>
            <span class="select-hint">Select the companies you want to analyze</span>
          {:else}
            <span class="match-count none">No results for "{group.term}"</span>
          {/if}
        </div>
        <div class="results-grid">
          {#each group.results as entity}
            <div class="result-wrapper" class:selected={isSelected(entity)}>
              <EntityMicroCard
                name={entity.name}
                location={entity.headquartersCountry || ''}
                assetCount={entity.assetCount || 0}
                onclick={() => onSelectOwner(entity)}
              />
              {#if isSelected(entity)}
                <div class="result-check">✓</div>
              {/if}
            </div>
          {/each}
        </div>
        {#if group.matchCount > 1}
          <div class="group-actions">
            <button
              class="select-all-btn"
              onclick={() => group.results.forEach((e) => onSelectOwner(e, false))}
            >
              Select all {group.matchCount} companies
            </button>
          </div>
        {/if}
      </div>
    {/each}
  </div>
{/if}

<style>
  .search-results {
    margin-top: var(--space-4);
    padding-top: var(--space-4);
    padding-bottom: var(--space-16);
    border-top: var(--border-width) solid var(--color-border);
    scroll-margin-top: 80px;
  }

  .results-source-row {
    margin-bottom: var(--space-4);
    display: flex;
    justify-content: flex-end;
  }

  .result-group {
    margin-bottom: var(--space-10);
  }

  .result-group:last-child {
    margin-bottom: 0;
  }

  .group-header {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: max-content;
    gap: var(--space-3);
    align-items: baseline;
    margin-bottom: var(--space-4);
  }

  .match-count {
    font-size: var(--font-size-body);
    font-weight: 400;
    color: var(--color-text-secondary);
  }

  .match-count.none {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  .select-hint {
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    font-weight: 400;
  }

  .group-actions {
    margin-top: var(--space-4);
  }

  .select-all-btn {
    padding: 0;
    font-size: var(--font-size-body);
    background: none;
    color: var(--color-text-secondary);
    border: none;
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .select-all-btn:hover {
    color: var(--color-text-primary);
  }

  .results-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: var(--space-4);
    max-height: min(480px, calc(100vh - 300px));
    overflow-y: auto;
    padding: 8px;
  }

  .result-wrapper {
    position: relative;
    min-width: 0;
    transition:
      opacity var(--duration-base) var(--ease-in-out-quad),
      transform var(--duration-base) var(--ease-out-back);
    cursor: pointer;
  }

  .result-wrapper:hover {
    opacity: 0.85;
    transform: translateY(-2px);
  }

  .result-wrapper.selected {
    opacity: 1;
  }

  .result-wrapper.selected::before {
    content: '';
    position: absolute;
    inset: -4px;
    border: var(--border-width) solid var(--color-text-tertiary);
    pointer-events: none;
  }

  .result-check {
    position: absolute;
    top: -6px;
    right: -6px;
    width: 16px;
    height: 16px;
    background: var(--color-text-primary);
    color: var(--color-white);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: var(--font-size-base);
    font-weight: 500;
  }

  @media (max-width: 1024px) {
    .results-grid {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (max-width: 768px) {
    .results-grid {
      grid-template-columns: 1fr;
    }

    .group-header {
      grid-auto-flow: row;
    }
  }
</style>

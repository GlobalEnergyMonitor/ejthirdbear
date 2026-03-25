<script lang="ts">
  /**
   * Embeddable search widget with friendly tuning controls.
   *
   * Props (also configurable via URL params in embed mode):
   *   - apiBase: base URL for API calls (default: '')
   *   - limit: max results (default: 10)
   *   - placeholder: input placeholder
   *   - showTuner: show search style presets + filters
   *   - compact: smaller styling for sidebar use
   *   - initialQuery: pre-fill search
   */
  import SearchTuner from './SearchTuner.svelte';
  import { formatDate } from '$lib/format';
  import type { SearchResult, TagCount } from '$lib/db';

  interface Props {
    apiBase?: string;
    limit?: number;
    placeholder?: string;
    showTuner?: boolean;
    compact?: boolean;
    initialQuery?: string;
  }

  let {
    apiBase = '',
    limit = 10,
    placeholder = 'Search Coal Wire…',
    showTuner = false,
    compact = false,
    initialQuery = '',
  }: Props = $props();

  // svelte-ignore state_referenced_locally — intentional: seed once from prop
  let query = $state(initialQuery);
  let results = $state<SearchResult[]>([]);
  let loading = $state(false);
  let searched = $state(false);
  let bm25Weight = $state(0.5);
  let section = $state('');
  let sections = $state<string[]>([]);
  let hasEmbeddings = $state(false);
  let dateFrom = $state('');
  let dateTo = $state('');
  let country = $state('');
  let topic = $state('');
  let countries = $state<TagCount[]>([]);
  let topics = $state<TagCount[]>([]);
  let tunerOpen = $state(false);

  let debounceTimer: ReturnType<typeof setTimeout>;

  // Load metadata on mount
  $effect(() => {
    fetch(`${apiBase}/api/search?q=`)
      .then((r) => r.json())
      .then((d) => {
        sections = d.sections ?? [];
        hasEmbeddings = d.stats?.has_embeddings ?? false;
        countries = d.countries ?? [];
        topics = d.topics ?? [];
      })
      .catch(() => {});
  });

  $effect(() => {
    if (initialQuery) doSearch();
  });

  function onInput() {
    clearTimeout(debounceTimer);
    if (!query.trim()) {
      results = [];
      searched = false;
      return;
    }
    debounceTimer = setTimeout(doSearch, 200);
  }

  async function doSearch() {
    if (!query.trim()) return;
    loading = true;
    searched = true;
    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(limit),
        mode: hasEmbeddings ? 'hybrid' : 'bm25',
        bm25w: String(bm25Weight),
      });
      if (section) params.set('section', section);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (country) params.set('country', country);
      if (topic) params.set('topic', topic);

      const res = await fetch(`${apiBase}/api/search?${params}`);
      const data = await res.json();
      results = data.results;
    } catch {
      results = [];
    } finally {
      loading = false;
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter') {
      clearTimeout(debounceTimer);
      doSearch();
    }
  }

</script>

<div class="search-widget" class:compact>
  <div class="search-input-row">
    <input
      type="search"
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKeydown}
      {placeholder}
    />
    {#if loading}
      <span class="spinner"></span>
    {/if}
  </div>

  {#if showTuner}
    <button class="tuner-toggle" onclick={() => tunerOpen = !tunerOpen}>
      {tunerOpen ? 'Hide options' : 'Search options'}
    </button>

    {#if tunerOpen}
      <div class="tuner-panel">
        <SearchTuner
          bind:section
          {sections}
          bind:dateFrom
          bind:dateTo
          bind:country
          bind:topic
          {countries}
          {topics}
          onchange={doSearch}
        />
      </div>
    {/if}
  {/if}

  <div class="results">
    {#if searched && !loading && results.length === 0}
      <p class="no-results">No results found</p>
    {/if}

    {#each results as result}
      <div class="result">
        <div class="result-meta">
          <span class="issue">#{result.issue_number}</span>
          <span class="date">{formatDate(result.date)}</span>
          {#if result.section}
            <span class="section-tag">{result.section}</span>
          {/if}
          {#if result.match_type && result.match_type !== 'bm25'}
            <span class="match-tag" class:hybrid={result.match_type === 'hybrid'} class:semantic={result.match_type === 'semantic'}>
              {result.match_type === 'hybrid' ? 'words + meaning' : 'by meaning'}
            </span>
          {/if}
        </div>
        <div class="result-title">
          {#if result.url}
            <a href={result.url} target="_blank" rel="noopener">{result.title}</a>
          {:else}
            {result.title}
          {/if}
        </div>
        {#if result.snippet}
          <div class="snippet">{@html result.snippet}</div>
        {/if}
      </div>
    {/each}
  </div>
</div>

<style>
  .search-widget {
    font-family: inherit;
  }

  .search-input-row {
    position: relative;
  }

  input[type='search'] {
    width: 100%;
    padding: 0.6rem 0.75rem;
    font-size: 0.95rem;
    font-family: var(--font-family);
    border: 1.5px solid var(--color-border);
    border-radius: var(--radius-lg);
    outline: none;
    box-sizing: border-box;
    color: var(--color-text-primary);
    background: var(--color-bg-primary);
  }

  input[type='search']:focus {
    border-color: var(--color-text-secondary);
  }

  .compact input[type='search'] {
    padding: 0.45rem 0.6rem;
    font-size: var(--font-size-base);
  }

  .spinner {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-text-secondary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
  }

  /* Tuner */
  .tuner-toggle {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    cursor: pointer;
    padding: 0.25rem 0;
    font-family: var(--font-family);
  }

  .tuner-toggle:hover {
    color: var(--color-text-secondary);
  }

  .tuner-panel {
    background: var(--color-bg-secondary);
    border: 1px solid var(--color-border-light);
    border-radius: var(--radius-lg);
    padding: 0.7rem;
    margin-bottom: 0.5rem;
  }

  /* Results */
  .result {
    padding: 0.6rem 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .compact .result {
    padding: 0.4rem 0;
  }

  .result-meta {
    display: flex;
    gap: 0.5rem;
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    margin-bottom: 0.15rem;
  }

  .issue {
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-family-data);
    color: var(--color-text-secondary);
  }

  .section-tag {
    background: var(--color-bg-tertiary);
    padding: 0 4px;
    border-radius: var(--radius-sm);
  }

  .match-tag {
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    padding: 1px 5px;
    border-radius: var(--radius-sm);
    background: var(--color-bg-tertiary);
    color: var(--color-text-tertiary);
  }

  .result-title {
    font-size: 0.88rem;
    font-weight: var(--font-weight-semibold);
  }

  .compact .result-title {
    font-size: var(--font-size-base);
  }

  .result-title a {
    color: inherit;
    text-decoration: none;
  }

  .result-title a:hover {
    text-decoration: underline;
  }

  .snippet {
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.45;
    margin-top: 0.15rem;
  }

  .compact .snippet {
    font-size: var(--font-size-sm);
  }

  .snippet :global(mark) {
    background: var(--color-highlight);
    padding: 0 2px;
    border-radius: var(--radius-sm);
  }

  .no-results {
    text-align: center;
    color: var(--color-text-tertiary);
    padding: 1.5rem 0;
    font-size: var(--font-size-base);
  }
</style>

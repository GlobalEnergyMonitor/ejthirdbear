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
          bind:bm25Weight
          bind:section
          {sections}
          {hasEmbeddings}
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
    border: 1.5px solid #ccc;
    border-radius: 6px;
    outline: none;
    box-sizing: border-box;
    font-family: inherit;
  }

  input[type='search']:focus {
    border-color: #666;
  }

  .compact input[type='search'] {
    padding: 0.45rem 0.6rem;
    font-size: 0.85rem;
  }

  .spinner {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border: 2px solid #ddd;
    border-top-color: #555;
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
    color: #999;
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0.25rem 0;
    font-family: inherit;
  }

  .tuner-toggle:hover {
    color: #555;
  }

  .tuner-panel {
    background: #fafafa;
    border: 1px solid #eee;
    border-radius: 8px;
    padding: 0.7rem;
    margin-bottom: 0.5rem;
  }

  /* Results */
  .result {
    padding: 0.6rem 0;
    border-bottom: 1px solid #eee;
  }

  .compact .result {
    padding: 0.4rem 0;
  }

  .result-meta {
    display: flex;
    gap: 0.5rem;
    font-size: 0.7rem;
    color: #999;
    margin-bottom: 0.15rem;
  }

  .issue {
    font-weight: 600;
    color: #666;
  }

  .section-tag {
    background: #f0f0f0;
    padding: 0 4px;
    border-radius: 2px;
  }

  .match-tag {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
  }

  .match-tag.hybrid {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .match-tag.semantic {
    background: #e3f2fd;
    color: #1565c0;
  }

  .result-title {
    font-size: 0.88rem;
    font-weight: 600;
  }

  .compact .result-title {
    font-size: 0.82rem;
  }

  .result-title a {
    color: inherit;
    text-decoration: none;
  }

  .result-title a:hover {
    text-decoration: underline;
  }

  .snippet {
    font-size: 0.8rem;
    color: #555;
    line-height: 1.45;
    margin-top: 0.15rem;
  }

  .compact .snippet {
    font-size: 0.75rem;
  }

  .snippet :global(mark) {
    background: #fff3b0;
    padding: 0 2px;
    border-radius: 2px;
  }

  .no-results {
    text-align: center;
    color: #999;
    padding: 1.5rem 0;
    font-size: 0.85rem;
  }
</style>

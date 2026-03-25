<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import SearchTuner from '$lib/components/SearchTuner.svelte';
  import { formatDate } from '$lib/format';
  import { downloadCSV, copyToClipboard } from '$lib/export';
  import type { SearchResult, SearchStats, IssueInfo, TagCount } from '$lib/db';
  import type { DebugInfo } from '$lib/search';

  type ResultWithDebug = SearchResult & { debug?: DebugInfo };

  let query = $state('');
  let results = $state<ResultWithDebug[]>([]);
  let loading = $state(false);
  let searched = $state(false);
  let stats = $state<SearchStats | null>(null);
  let recentIssues = $state<IssueInfo[]>([]);
  let selectedIdx = $state(-1);

  // Tuner state
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
  let debugMode = $state(false);

  let searchInput: HTMLInputElement;
  let debounceTimer: ReturnType<typeof setTimeout>;

  onMount(async () => {
    const [statsRes, issuesRes, searchMeta] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/issues?limit=10'),
      fetch('/api/search?q='),
    ]);
    stats = await statsRes.json();
    const issuesData = await issuesRes.json();
    recentIssues = issuesData.issues ?? [];
    const meta = await searchMeta.json();
    sections = meta.sections ?? [];
    hasEmbeddings = meta.stats?.has_embeddings ?? false;
    countries = meta.countries ?? [];
    topics = meta.topics ?? [];

    // Restore search state from URL (makes shared links work)
    const params = page.url?.searchParams;
    if (params?.get('q')) {
      query = params.get('q')!;
      section = params.get('section') ?? '';
      country = params.get('country') ?? '';
      topic = params.get('topic') ?? '';
      if (section || country || topic) tunerOpen = true;
      doSearch();
    } else {
      searchInput?.focus();
    }
  });

  function onInput() {
    clearTimeout(debounceTimer);
    selectedIdx = -1;
    if (!query.trim()) {
      results = [];
      searched = false;
      return;
    }
    debounceTimer = setTimeout(() => doSearch(), 200);
  }

  async function doSearch() {
    if (!query.trim()) return;
    loading = true;
    searched = true;
    try {
      const params = new URLSearchParams({
        q: query,
        limit: '30',
        mode: hasEmbeddings ? 'hybrid' : 'bm25',
        bm25w: String(bm25Weight),
      });
      if (section) params.set('section', section);
      if (dateFrom) params.set('from', dateFrom);
      if (dateTo) params.set('to', dateTo);
      if (country) params.set('country', country);
      if (topic) params.set('topic', topic);
      if (debugMode) params.set('debug', 'true');

      // Update URL for shareable links + back/forward nav
      const shareUrl = new URL(window.location.href);
      shareUrl.search = '';
      shareUrl.searchParams.set('q', query);
      if (section) shareUrl.searchParams.set('section', section);
      if (country) shareUrl.searchParams.set('country', country);
      if (topic) shareUrl.searchParams.set('topic', topic);
      history.replaceState(null, '', shareUrl.toString());

      const res = await fetch(`/api/search?${params}`);
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
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (selectedIdx < results.length - 1) selectedIdx++;
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (selectedIdx > 0) selectedIdx--;
    } else if (e.key === 'Escape') {
      query = '';
      results = [];
      searched = false;
      selectedIdx = -1;
    }
  }

</script>

<svelte:head>
  <title>Coal Wire Search</title>
</svelte:head>

<main>
  <header>
    <h1>Coal Wire Search</h1>
    {#if stats}
      <p class="subtitle">
        {stats.total_articles.toLocaleString()} articles across {stats.total_issues.toLocaleString()} issues
        {#if stats.date_range?.min}
          <span class="date-range">({formatDate(stats.date_range.min)} – {formatDate(stats.date_range.max)})</span>
        {/if}
      </p>
    {:else}
      <p class="subtitle">Search Global Energy Monitor's weekly coal digest</p>
    {/if}
  </header>

  <div class="search-box">
    <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18" aria-hidden="true">
      <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
    </svg>
    <input
      type="search"
      bind:this={searchInput}
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKeydown}
      placeholder="Search coal wire archives…"
      aria-label="Search Coal Wire archives"
    />
    {#if loading}
      <span class="spinner"></span>
    {/if}
    {#if query}
      <button class="clear-btn" onclick={() => { query = ''; results = []; searched = false; }} aria-label="Clear search">
        ✕
      </button>
    {/if}
  </div>

  <div class="controls-row">
    <button class="tuner-toggle" onclick={() => tunerOpen = !tunerOpen} aria-expanded={tunerOpen}>
      <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14" aria-hidden="true">
        <path d="M17 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM17 15.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM3.75 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM4.5 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM10 11a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5A.75.75 0 0110 11zM10.75 2.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM10 5a2 2 0 100 4 2 2 0 000-4zM3.75 10a2 2 0 100 4 2 2 0 000-4zM16.25 10a2 2 0 100 4 2 2 0 000-4z" />
      </svg>
      {tunerOpen ? 'Hide search options' : 'Search options'}
    </button>
    <button class="tuner-toggle" onclick={() => { debugMode = !debugMode; if (searched) doSearch(); }}>
      {debugMode ? 'Hide scoring' : 'Show scoring'}
    </button>
  </div>

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

  {#if searched}
    <div class="results-header">
      {#if loading}
        <span>Searching…</span>
      {:else}
        <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
        {#if results.length > 0}
          <span class="results-actions">
            <button onclick={() => downloadCSV(results)}>Export CSV</button>
          </span>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="results" aria-live="polite" aria-label="Search results">
    {#if searched && !loading && results.length === 0}
      <div class="no-results">
        <p>No results for "<strong>{query}</strong>"</p>
        <p class="hint">Try broader terms or check spelling</p>
      </div>
    {/if}

    {#each results as result, i}
      <article class="result" class:selected={i === selectedIdx}>
        <div class="result-meta">
          {#if result.url}
            <a href={result.url} target="_blank" rel="noopener" class="issue">#{result.issue_number}</a>
          {:else}
            <span class="issue">#{result.issue_number}</span>
          {/if}
          <span class="date">{formatDate(result.date)}</span>
          {#if result.section}
            <span class="section">{result.section}</span>
          {/if}
          {#if result.match_type && result.match_type !== 'bm25'}
            <span class="match-type" class:hybrid={result.match_type === 'hybrid'} class:semantic={result.match_type === 'semantic'}>
              {result.match_type === 'hybrid' ? 'words + meaning' : 'by meaning'}
            </span>
          {/if}
        </div>
        <h3>
          {#if result.url}
            <a href={result.url} target="_blank" rel="noopener">{result.title}</a>
          {:else}
            {result.title}
          {/if}
        </h3>
        {#if result.snippet}
          <p class="snippet">{@html result.snippet}</p>
        {/if}
        {#if debugMode && result.debug}
          <table class="receipt">
            <tbody>
              {#if result.debug.bm25_position != null}
                <tr><td>BM25 rank</td><td>#{result.debug.bm25_position}</td></tr>
                <tr><td>BM25 score</td><td>{result.debug.bm25_score != null ? (result.debug.bm25_score < 0.001 ? result.debug.bm25_score.toExponential(2) : result.debug.bm25_score.toFixed(4)) : '—'}</td></tr>
              {:else}
                <tr><td>BM25 rank</td><td>—</td></tr>
              {/if}
              {#if result.debug.semantic_position != null}
                <tr><td>Semantic rank</td><td>#{result.debug.semantic_position}</td></tr>
                <tr><td>Cosine sim</td><td>{result.debug.semantic_score?.toFixed(4) ?? '—'}</td></tr>
              {:else}
                <tr><td>Semantic rank</td><td>—</td></tr>
              {/if}
              <tr class="receipt-rule"><td colspan="2"></td></tr>
              {#if result.debug.explanation?.includes('penalized')}
                <tr><td>Penalty</td><td>{result.debug.explanation.match(/missing "([^"]+)"/)?.[0] ?? 'partial match'}</td></tr>
              {/if}
              <tr class="receipt-total"><td>RRF total</td><td>{result.debug.rrf_score?.toFixed(6) ?? result.debug.bm25_score?.toFixed(6) ?? '—'}</td></tr>
              <tr><td>Wt</td><td>{(bm25Weight * 100).toFixed(0)}% word / {((1 - bm25Weight) * 100).toFixed(0)}% meaning</td></tr>
            </tbody>
          </table>
        {/if}
      </article>
    {/each}
  </div>

  {#if !searched && recentIssues.length > 0}
    <section class="recent">
      <h2>Recent Issues</h2>
      <div class="issues-list">
        {#each recentIssues as issue}
          <a href={issue.url || `https://globalenergymonitor.org/coalwire/`} target="_blank" rel="noopener" class="issue-card">
            <span class="issue-num">#{issue.issue_number}</span>
            <span class="issue-date">{formatDate(issue.date)}</span>
            <span class="issue-count">{issue.article_count} items</span>
          </a>
        {/each}
      </div>
    </section>
  {/if}
</main>

<style>
  main {
    max-width: 720px;
    margin: 0 auto;
    padding: var(--space-12) var(--space-6) var(--space-16);
  }

  header {
    margin-bottom: var(--space-10);
  }

  h1 {
    font-size: var(--font-size-2xl);
    font-weight: var(--font-weight-bold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide, 0.02em);
    margin: 0 0 var(--space-2);
  }

  .subtitle {
    color: var(--color-text-secondary);
    margin: 0;
    font-size: var(--font-size-sm);
  }

  .date-range {
    color: var(--color-text-tertiary);
  }

  .search-box {
    position: relative;
    margin-bottom: var(--space-2);
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    color: var(--color-text-tertiary);
    pointer-events: none;
  }

  input[type='search'] {
    width: 100%;
    padding: var(--space-3) var(--space-10) var(--space-3) var(--space-10);
    font-size: var(--font-size-base);
    font-family: var(--font-family);
    border: 1px solid var(--color-border);
    outline: none;
    box-sizing: border-box;
    background: var(--color-bg-primary);
    color: var(--color-text-primary);
  }

  input[type='search']:focus {
    border-color: var(--color-text-primary);
  }

  input[type='search']::-webkit-search-cancel-button {
    display: none;
  }

  .clear-btn {
    position: absolute;
    right: var(--space-3);
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    color: var(--color-text-tertiary);
    cursor: pointer;
    font-size: var(--font-size-sm);
    padding: var(--space-1);
    line-height: 1;
  }

  .spinner {
    position: absolute;
    right: var(--space-8);
    top: 50%;
    transform: translateY(-50%);
    width: 14px;
    height: 14px;
    border: 2px solid var(--color-border);
    border-top-color: var(--color-text-primary);
    border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }

  @keyframes spin {
    to { transform: translateY(-50%) rotate(360deg); }
  }

  .controls-row {
    display: flex;
    gap: var(--space-4);
    margin-bottom: var(--space-3);
  }

  .tuner-toggle {
    display: inline;
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    padding: 0;
  }

  .tuner-panel {
    border-top: 1px solid var(--color-border);
    padding: var(--space-4) 0;
    margin-bottom: var(--space-3);
  }

  .results-header {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-2);
  }

  .results-actions {
    display: flex;
    gap: var(--space-3);
    margin-left: auto;
  }

  .results-actions button {
    background: none;
    border: none;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    cursor: pointer;
    padding: 0;
    text-decoration: underline;
  }

  .result {
    padding: var(--space-4) 0;
    border-top: 1px solid var(--color-border-light);
  }

  .result-meta {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-1);
  }

  .issue {
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-decoration: none;
  }

  .section, .match-type {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  h3 {
    margin: 0;
    font-size: var(--font-size-base);
    font-weight: var(--font-weight-semibold);
    line-height: 1.35;
  }

  h3 a {
    color: var(--color-text-primary);
    text-decoration: none;
  }

  .snippet {
    margin: var(--space-1) 0 0;
    font-size: var(--font-size-sm);
    color: var(--color-text-secondary);
    line-height: 1.5;
  }

  .snippet :global(mark) {
    background: var(--color-highlight);
    padding: 0 1px;
  }

  .no-results {
    text-align: center;
    padding: var(--space-12) 0;
    color: var(--color-text-tertiary);
    font-size: var(--font-size-sm);
  }

  .no-results p { margin: var(--space-1) 0; }

  .receipt {
    margin-top: var(--space-2);
    border-collapse: collapse;
    font-family: var(--font-family-data);
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
    line-height: 1;
  }

  .receipt td { padding: 1px 0; }
  .receipt td:first-child { padding-right: var(--space-6); white-space: nowrap; }
  .receipt td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .receipt-rule td { border-bottom: 1px dashed var(--color-border); padding-bottom: 2px; }
  .receipt-rule + tr td { padding-top: 3px; }
  .receipt-total td { font-weight: var(--font-weight-bold); color: var(--color-text-primary); padding-top: 2px; }

  .recent {
    margin-top: var(--space-10);
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-4);
  }

  .recent h2 {
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    font-weight: var(--font-weight-semibold);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 0 0 var(--space-4);
  }

  .issues-list {
    display: flex;
    flex-direction: column;
  }

  .issue-card {
    display: flex;
    align-items: baseline;
    gap: var(--space-4);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--color-border-light);
    text-decoration: none;
    color: var(--color-text-primary);
    font-size: var(--font-size-sm);
  }

  .issue-num {
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-family-data);
    min-width: 2.5rem;
    color: var(--color-text-tertiary);
  }

  .issue-date {
    color: var(--color-text-secondary);
  }

  .issue-count {
    font-family: var(--font-family-data);
    color: var(--color-text-tertiary);
    margin-left: auto;
  }

  @media (max-width: 600px) {
    main { padding: var(--space-6) var(--space-4) var(--space-12); }
    h1 { font-size: var(--font-size-xl); }
    input[type='search'] { font-size: 16px; }
    .result-meta { flex-wrap: wrap; }
    .results-header { flex-wrap: wrap; }
    .results-actions { margin-left: 0; }
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import SearchTuner from '$lib/components/SearchTuner.svelte';
  import { formatDate } from '$lib/format';
  import { downloadCSV, copyToClipboard } from '$lib/export';
  import type { SearchResult, SearchStats, IssueInfo, TagCount } from '$lib/db';

  let query = $state('');
  let results = $state<SearchResult[]>([]);
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
    <svg class="search-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
      <path fill-rule="evenodd" d="M9 3.5a5.5 5.5 0 100 11 5.5 5.5 0 000-11zM2 9a7 7 0 1112.452 4.391l3.328 3.329a.75.75 0 11-1.06 1.06l-3.329-3.328A7 7 0 012 9z" clip-rule="evenodd" />
    </svg>
    <input
      type="search"
      bind:this={searchInput}
      bind:value={query}
      oninput={onInput}
      onkeydown={handleKeydown}
      placeholder="Search coal wire archives…"
    />
    {#if loading}
      <span class="spinner"></span>
    {/if}
    {#if query}
      <button class="clear-btn" onclick={() => { query = ''; results = []; searched = false; }}>
        ✕
      </button>
    {/if}
  </div>

  <button class="tuner-toggle" onclick={() => tunerOpen = !tunerOpen}>
    <svg viewBox="0 0 20 20" fill="currentColor" width="14" height="14">
      <path d="M17 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM17 15.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM3.75 15a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5a.75.75 0 01.75-.75zM4.5 2.75a.75.75 0 00-1.5 0v5.5a.75.75 0 001.5 0v-5.5zM10 11a.75.75 0 01.75.75v5.5a.75.75 0 01-1.5 0v-5.5A.75.75 0 0110 11zM10.75 2.75a.75.75 0 00-1.5 0v1.5a.75.75 0 001.5 0v-1.5zM10 5a2 2 0 100 4 2 2 0 000-4zM3.75 10a2 2 0 100 4 2 2 0 000-4zM16.25 10a2 2 0 100 4 2 2 0 000-4z" />
    </svg>
    {tunerOpen ? 'Hide search options' : 'Search options'}
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

  {#if searched}
    <div class="results-header">
      {#if loading}
        <span>Searching…</span>
      {:else}
        <span>{results.length} result{results.length !== 1 ? 's' : ''}</span>
        {#if results.length > 0}
          <span class="results-actions">
            <button onclick={() => downloadCSV(results)}>Export CSV</button>
            <button onclick={async () => {
              const url = new URL(window.location.href);
              url.searchParams.set('q', query);
              if (section) url.searchParams.set('section', section);
              if (country) url.searchParams.set('country', country);
              if (topic) url.searchParams.set('topic', topic);
              const ok = await copyToClipboard(url.toString());
              if (ok) alert('Link copied!');
            }}>Copy link</button>
          </span>
        {/if}
      {/if}
    </div>
  {/if}

  <div class="results">
    {#if searched && !loading && results.length === 0}
      <div class="no-results">
        <p>No results for "<strong>{query}</strong>"</p>
        <p class="hint">Try broader terms or check spelling</p>
      </div>
    {/if}

    {#each results as result, i}
      <article class="result" class:selected={i === selectedIdx}>
        <div class="result-meta">
          <a href="/issue/{result.issue_number}" class="issue">#{result.issue_number}</a>
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
      </article>
    {/each}
  </div>

  {#if !searched && recentIssues.length > 0}
    <section class="recent">
      <h2>Recent Issues</h2>
      <div class="issues-list">
        {#each recentIssues as issue}
          <a href="/issue/{issue.issue_number}" class="issue-card">
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
    padding: 3rem 1rem 4rem;
  }

  header {
    text-align: center;
    margin-bottom: 2rem;
  }

  h1 {
    font-size: 1.6rem;
    margin: 0 0 0.3rem;
    letter-spacing: -0.02em;
  }

  .subtitle {
    color: #777;
    margin: 0;
    font-size: 0.85rem;
  }

  .date-range {
    color: #999;
  }

  /* Search box */
  .search-box {
    position: relative;
    margin-bottom: 0.4rem;
  }

  .search-icon {
    position: absolute;
    left: 0.85rem;
    top: 50%;
    transform: translateY(-50%);
    color: #aaa;
    pointer-events: none;
  }

  input[type='search'] {
    width: 100%;
    padding: 0.7rem 2.5rem 0.7rem 2.5rem;
    font-size: 1rem;
    border: 1.5px solid #ddd;
    border-radius: 10px;
    outline: none;
    transition: border-color 0.15s, box-shadow 0.15s;
    box-sizing: border-box;
    background: #fff;
  }

  input[type='search']:focus {
    border-color: #888;
    box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.04);
  }

  input[type='search']::-webkit-search-cancel-button {
    display: none;
  }

  .clear-btn {
    position: absolute;
    right: 0.7rem;
    top: 50%;
    transform: translateY(-50%);
    border: none;
    background: none;
    color: #999;
    cursor: pointer;
    font-size: 0.85rem;
    padding: 0.25rem;
    line-height: 1;
  }

  .clear-btn:hover {
    color: #333;
  }

  .spinner {
    position: absolute;
    right: 2.2rem;
    top: 50%;
    transform: translateY(-50%);
    width: 16px;
    height: 16px;
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
    display: flex;
    align-items: center;
    gap: 0.35rem;
    background: none;
    border: none;
    color: #999;
    font-size: 0.75rem;
    cursor: pointer;
    padding: 0.2rem 0;
    font-family: inherit;
    margin-bottom: 0.5rem;
  }

  .tuner-toggle:hover {
    color: #555;
  }

  .tuner-panel {
    background: #fff;
    border: 1px solid #eee;
    border-radius: 10px;
    padding: 0.85rem;
    margin-bottom: 1rem;
  }

  /* Results */
  .results-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    color: #999;
    margin-bottom: 0.5rem;
    padding: 0 0.25rem;
  }

  .results-actions {
    display: flex;
    gap: 0.3rem;
    margin-left: auto;
  }

  .results-actions button {
    background: none;
    border: 1px solid #ddd;
    border-radius: 4px;
    color: #777;
    font-size: 0.7rem;
    padding: 0.2rem 0.5rem;
    cursor: pointer;
    font-family: inherit;
  }

  .results-actions button:hover {
    border-color: #aaa;
    color: #333;
  }

  .result {
    padding: 0.85rem 0.75rem;
    border-radius: 8px;
    transition: background 0.1s;
  }

  .result:hover, .result.selected {
    background: #f0f0f0;
  }

  .result + .result {
    border-top: 1px solid #eee;
  }

  .result-meta {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    font-size: 0.75rem;
    color: #999;
    margin-bottom: 0.2rem;
  }

  .issue {
    font-weight: 600;
    color: #666;
    text-decoration: none;
  }

  .issue:hover {
    color: #333;
    text-decoration: underline;
  }

  .section {
    background: #f0f0f0;
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .match-type {
    font-size: 0.65rem;
    padding: 1px 5px;
    border-radius: 3px;
    letter-spacing: 0.02em;
  }

  .match-type.hybrid {
    background: #e8f5e9;
    color: #2e7d32;
  }

  .match-type.semantic {
    background: #e3f2fd;
    color: #1565c0;
  }

  h3 {
    margin: 0.15rem 0;
    font-size: 0.95rem;
    font-weight: 600;
  }

  h3 a {
    color: #1a1a1a;
    text-decoration: none;
  }

  h3 a:hover {
    text-decoration: underline;
  }

  .snippet {
    margin: 0.2rem 0 0;
    font-size: 0.82rem;
    color: #555;
    line-height: 1.5;
  }

  .snippet :global(mark) {
    background: #fff3b0;
    padding: 0 2px;
    border-radius: 2px;
  }

  .no-results {
    text-align: center;
    padding: 3rem 0;
  }

  .no-results p {
    margin: 0.25rem 0;
    color: #888;
  }

  .hint {
    font-size: 0.82rem;
  }

  /* Recent issues */
  .recent {
    margin-top: 2rem;
  }

  .recent h2 {
    font-size: 0.9rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 0.75rem;
  }

  .issues-list {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .issue-card {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 0.6rem 0.75rem;
    border-radius: 6px;
    text-decoration: none;
    color: #333;
    transition: background 0.1s;
  }

  .issue-card:hover {
    background: #f0f0f0;
  }

  .issue-num {
    font-weight: 600;
    font-size: 0.85rem;
    min-width: 3rem;
  }

  .issue-date {
    font-size: 0.82rem;
    color: #777;
  }

  .issue-count {
    font-size: 0.75rem;
    color: #aaa;
    margin-left: auto;
  }
</style>

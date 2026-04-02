<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import SearchTuner from '$lib/components/SearchTuner.svelte';
  import { formatDate } from '$lib/format';
  import type { SearchResult, SearchStats, IssueInfo, TagCount } from '$lib/db';
  import type { DebugInfo } from '$lib/search';

  type ResultWithDebug = SearchResult & { debug?: DebugInfo; content?: string };

  let query = $state('');
  let results = $state<ResultWithDebug[]>([]);
  let expanded = $state<Set<number>>(new Set());
  let sortBy = $state<'relevance' | 'date'>('relevance');

  const sortedResults = $derived.by(() => {
    if (sortBy === 'date') {
      return [...results].sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
    }
    return results;
  });

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
      {tunerOpen ? 'Hide filters' : 'Filters'}
    </button>
    <button class="tuner-toggle" onclick={() => { debugMode = !debugMode; if (searched) doSearch(); }}>
      {debugMode ? 'Hide scoring' : 'Scoring'}
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
          <button class="sort-toggle" onclick={() => sortBy = sortBy === 'relevance' ? 'date' : 'relevance'}>
            {sortBy === 'relevance' ? 'Sort by date' : 'Sort by relevance'}
          </button>
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

    {#each sortedResults as result, i}
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
        {#if result.content}
          {@const text = result.content.replace(/[ \t]*\n[ \t]*/g, '\n').replace(/\n{2,}/g, '\n\n').trim()}
          {@const terms = query.split(/\s+/).filter(t => t.length > 1).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')}
          {@const html = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(terms ? new RegExp(`\\b(${terms})\\w*`, 'gi') : /(?!x)x/, '<mark>$&</mark>')}
          <div class="body" class:open={expanded.has(result.id)}>{@html html}</div>
        {:else if result.snippet}
          <div class="body">{@html result.snippet}</div>
        {/if}
        {#if result.content}
          <button class="expand-toggle" onclick={() => {
            const s = new Set(expanded);
            if (s.has(result.id)) s.delete(result.id); else s.add(result.id);
            expanded = s;
          }}>{expanded.has(result.id) ? 'Less' : 'More'}</button>
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
  /* -- All interactive text uses one shared style -- */
  .tuner-toggle, .sort-toggle, .expand-toggle {
    background: none; border: none; padding: 0; cursor: pointer;
    font: var(--font-weight-semibold) var(--font-size-xs) var(--font-family-data);
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
  }

  /* -- Layout -- */
  main { max-width: 580px; margin: 0 auto; padding: 32px 24px 64px; }
  header { margin-bottom: 16px; }

  /* -- Type hierarchy: 3 tiers -- */
  h1 {
    font: var(--font-weight-bold) 15px/1.2 var(--font-family);
    text-transform: uppercase; letter-spacing: 0.06em;
    margin: 0 0 4px; color: var(--color-text-primary);
  }
  .subtitle, .date-range {
    font: 10px/1.4 var(--font-family-data);
    color: var(--color-text-tertiary); letter-spacing: 0.02em; margin: 0;
  }
  h3 { font: var(--font-weight-semibold) 13px/1.35 var(--font-family); margin: 0; }
  h3 a { color: var(--color-text-primary); text-decoration: none; }

  /* -- Search input -- */
  .search-box { position: relative; margin-bottom: 4px; }
  .search-icon {
    position: absolute; left: 10px; top: 50%; transform: translateY(-50%);
    color: var(--color-text-tertiary); pointer-events: none; width: 13px; height: 13px;
  }
  input[type='search'] {
    width: 100%; padding: 7px 32px 7px 30px;
    font: 13px var(--font-family); border: 1px solid var(--color-border);
    outline: none; box-sizing: border-box;
    background: var(--color-bg-primary); color: var(--color-text-primary);
  }
  input[type='search']:focus { border-color: var(--color-text-primary); }
  input[type='search']::-webkit-search-cancel-button { display: none; }
  .clear-btn {
    position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
    border: none; background: none; color: var(--color-text-tertiary);
    cursor: pointer; font-size: 10px; padding: 4px; line-height: 1;
  }
  .spinner {
    position: absolute; right: 28px; top: 50%; transform: translateY(-50%);
    width: 11px; height: 11px; border: 1.5px solid var(--color-border);
    border-top-color: var(--color-text-primary); border-radius: 50%;
    animation: spin 0.6s linear infinite;
  }
  @keyframes spin { to { transform: translateY(-50%) rotate(360deg); } }

  /* -- Controls -- */
  .controls-row { display: flex; gap: 12px; margin-bottom: 8px; }
  .tuner-panel { border-top: 1px solid var(--color-border-light); padding: 10px 0 8px; margin-bottom: 4px; }

  /* -- Results chrome -- */
  .results-header {
    display: flex; align-items: baseline; gap: 6px;
    font: var(--font-weight-semibold) var(--font-size-xs) var(--font-family-data);
    text-transform: uppercase; letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    padding-bottom: 6px; margin-bottom: 0;
    border-bottom: 1px solid var(--color-border-light);
  }
  .sort-toggle { margin-left: auto; }

  /* -- Result items -- */
  .result { padding: 10px 0; border-bottom: 1px solid var(--color-border-light); }
  .result-meta {
    display: flex; align-items: baseline; gap: 6px;
    font: var(--font-size-xs) var(--font-family-data);
    color: var(--color-text-tertiary); margin-bottom: 2px;
  }
  .issue { font-weight: var(--font-weight-semibold); color: var(--color-text-tertiary); text-decoration: none; }
  .section, .match-type { color: var(--color-text-tertiary); }
  .body {
    margin: 4px 0 0; font-size: 13px; color: var(--color-text-secondary); line-height: 1.55;
    display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  }
  .body.open { display: block; -webkit-line-clamp: unset; overflow: visible; white-space: pre-line; }
  .body :global(mark) { background: var(--color-highlight); padding: 0 1px; }
  .expand-toggle { margin-top: 3px; }

  /* -- Empty state -- */
  .no-results { text-align: center; padding: 40px 0; color: var(--color-text-tertiary); font-size: 12px; }
  .no-results p { margin: 4px 0; }

  /* -- Score receipt -- */
  .receipt {
    margin-top: 4px; border-collapse: collapse;
    font: var(--font-size-xs) var(--font-family-data);
    color: var(--color-text-tertiary); line-height: 1;
  }
  .receipt td { padding: 1px 0; }
  .receipt td:first-child { padding-right: 16px; white-space: nowrap; }
  .receipt td:last-child { text-align: right; font-variant-numeric: tabular-nums; }
  .receipt-rule td { border-bottom: 1px dashed var(--color-border); padding-bottom: 2px; }
  .receipt-rule + tr td { padding-top: 2px; }
  .receipt-total td { font-weight: var(--font-weight-bold); color: var(--color-text-primary); }

  /* -- Recent issues -- */
  .recent { margin-top: 32px; border-top: 1px solid var(--color-border); padding-top: 10px; }
  .recent h2 {
    font: var(--font-weight-semibold) var(--font-size-xs) var(--font-family-data);
    color: var(--color-text-tertiary); text-transform: uppercase;
    letter-spacing: 0.04em; margin: 0 0 8px;
  }
  .issues-list { display: flex; flex-direction: column; }
  .issue-card {
    display: flex; align-items: baseline; gap: 10px;
    padding: 4px 0; border-bottom: 1px solid var(--color-border-light);
    text-decoration: none; color: var(--color-text-primary); font-size: 12px;
  }
  .issue-num {
    font: var(--font-weight-semibold) 12px var(--font-family-data);
    min-width: 2.5rem; color: var(--color-text-tertiary);
  }
  .issue-date { color: var(--color-text-secondary); }
  .issue-count { font-family: var(--font-family-data); color: var(--color-text-tertiary); margin-left: auto; }

  @media (max-width: 600px) {
    main { padding: 20px 16px 48px; }
    input[type='search'] { font-size: 16px; }
    .result-meta { flex-wrap: wrap; }
    .results-header { flex-wrap: wrap; }
  }
</style>

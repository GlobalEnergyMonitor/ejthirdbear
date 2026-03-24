<script lang="ts">
  import { formatDate } from '$lib/format';
  import type { SearchResult } from '$lib/db';

  interface Props {
    apiBase?: string;
    query?: string;
    articleId?: number | null;
    limit?: number;
    title?: string;
    compact?: boolean;
  }

  let {
    apiBase = '',
    query = '',
    articleId = null,
    limit = 5,
    title = 'Related from Coal Wire',
    compact = false,
  }: Props = $props();

  let results = $state<SearchResult[]>([]);
  let loading = $state(true);

  $effect(() => {
    loadRelated();
  });

  async function loadRelated() {
    loading = true;
    try {
      let url: string;
      if (articleId) {
        url = `${apiBase}/api/similar?id=${articleId}&limit=${limit}`;
      } else if (query) {
        url = `${apiBase}/api/search?q=${encodeURIComponent(query)}&limit=${limit}`;
      } else {
        results = [];
        loading = false;
        return;
      }

      const res = await fetch(url);
      const data = await res.json();
      results = data.results ?? [];
    } catch {
      results = [];
    } finally {
      loading = false;
    }
  }

</script>

<div class="related" class:compact>
  {#if title}
    <h3 class="related-title">{title}</h3>
  {/if}

  {#if loading}
    <div class="loading-items">
      {#each Array(limit) as _}
        <div class="skeleton"></div>
      {/each}
    </div>
  {:else if results.length === 0}
    <p class="empty">No related articles found</p>
  {:else}
    <ul class="related-list">
      {#each results as result}
        <li>
          <a href={result.url || '#'} target="_blank" rel="noopener">
            <span class="item-title">{result.title}</span>
            <span class="item-meta">
              #{result.issue_number} · {formatDate(result.date)}
            </span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .related {
    font-family: inherit;
  }

  .related-title {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin: 0 0 0.6rem;
    font-weight: 600;
  }

  .compact .related-title {
    font-size: 0.75rem;
  }

  .related-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .related-list li {
    border-bottom: 1px solid #eee;
  }

  .related-list a {
    display: block;
    padding: 0.5rem 0;
    text-decoration: none;
    color: inherit;
  }

  .related-list a:hover .item-title {
    text-decoration: underline;
  }

  .item-title {
    display: block;
    font-size: 0.85rem;
    font-weight: 500;
    line-height: 1.35;
  }

  .compact .item-title {
    font-size: 0.78rem;
  }

  .item-meta {
    display: block;
    font-size: 0.7rem;
    color: #999;
    margin-top: 0.1rem;
  }

  .empty {
    color: #999;
    font-size: 0.82rem;
    text-align: center;
    padding: 1rem 0;
  }

  /* Loading skeleton */
  .loading-items {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .skeleton {
    height: 2.5rem;
    background: linear-gradient(90deg, #f0f0f0 25%, #e8e8e8 50%, #f0f0f0 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: 4px;
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>

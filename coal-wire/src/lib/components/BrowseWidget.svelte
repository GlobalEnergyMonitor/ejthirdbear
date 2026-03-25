<script lang="ts">
  import { formatDate } from '$lib/format';
  import type { IssueInfo } from '$lib/db';

  interface Props {
    apiBase?: string;
    limit?: number;
    title?: string;
    compact?: boolean;
  }

  let {
    apiBase = '',
    limit = 15,
    title = 'Coal Wire Archive',
    compact = false,
  }: Props = $props();

  let issues = $state<IssueInfo[]>([]);
  let loading = $state(true);

  $effect(() => {
    fetch(`${apiBase}/api/issues?limit=${limit}`)
      .then((r) => r.json())
      .then((d) => { issues = d.issues ?? []; })
      .catch(() => {})
      .finally(() => { loading = false; });
  });

</script>

<div class="browse" class:compact>
  {#if title}
    <h3 class="browse-title">{title}</h3>
  {/if}

  {#if loading}
    <div class="loading-items">
      {#each Array(5) as _}
        <div class="skeleton"></div>
      {/each}
    </div>
  {:else}
    <ul class="issue-list">
      {#each issues as issue}
        <li>
          <a href={issue.url || `${apiBase}/issue/${issue.issue_number}`} target="_blank" rel="noopener">
            <span class="issue-num">#{issue.issue_number}</span>
            <span class="issue-date">{formatDate(issue.date)}</span>
            <span class="issue-count">{issue.article_count} items</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .browse {
    font-family: inherit;
  }

  .browse-title {
    font-size: var(--font-size-base);
    font-family: var(--font-family-data);
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    margin: 0 0 0.6rem;
    font-weight: var(--font-weight-semibold);
  }

  .issue-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .issue-list li + li {
    border-top: 1px solid var(--color-border-light);
  }

  .issue-list a {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.45rem 0;
    text-decoration: none;
    color: inherit;
    font-size: var(--font-size-base);
  }

  .compact .issue-list a {
    font-size: var(--font-size-sm);
    padding: 0.35rem 0;
  }

  .issue-list a:hover {
    background: var(--color-bg-hover);
  }

  .issue-num {
    font-weight: var(--font-weight-semibold);
    font-family: var(--font-family-data);
    min-width: 2.5rem;
    color: var(--color-text-secondary);
  }

  .issue-date {
    color: var(--color-text-secondary);
    flex: 1;
  }

  .issue-count {
    color: var(--color-text-tertiary);
    font-family: var(--font-family-data);
    font-size: var(--font-size-xs);
  }

  .loading-items {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .skeleton {
    height: 2rem;
    background: linear-gradient(90deg, var(--color-bg-tertiary) 25%, var(--color-border) 50%, var(--color-bg-tertiary) 75%);
    background-size: 200% 100%;
    animation: shimmer 1.5s infinite;
    border-radius: var(--radius-md);
  }

  @keyframes shimmer {
    0% { background-position: 200% 0; }
    100% { background-position: -200% 0; }
  }
</style>

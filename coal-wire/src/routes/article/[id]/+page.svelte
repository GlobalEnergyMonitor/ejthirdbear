<script lang="ts">
  import { formatDate } from '$lib/format';

  let { data } = $props();
</script>

<svelte:head>
  <title>{data.article?.title ?? 'Article'} — Coal Wire</title>
</svelte:head>

<main>
  <nav>
    <a href="/">← Search</a>
    {#if data.article}
      <a href="/issue/{data.article.issue_number}">Issue #{data.article.issue_number}</a>
    {/if}
  </nav>

  {#if !data.article}
    <p class="empty">Article not found.</p>
  {:else}
    <header>
      <h1>{data.article.title}</h1>
      <div class="meta">
        <span class="date">{formatDate(data.article.date, 'long')}</span>
        {#if data.article.section}
          <span class="section">{data.article.section}</span>
        {/if}
      </div>

      {#if data.tags.length > 0}
        <div class="tags">
          {#each data.tags as tag}
            <span class="tag" class:country={tag.tag_type === 'country'} class:topic={tag.tag_type === 'topic'}>
              {tag.tag_value}
            </span>
          {/each}
        </div>
      {/if}
    </header>

    <div class="content">
      <p>{data.article.content}</p>
    </div>

    {#if data.article.url}
      <a class="source-link" href={data.article.url} target="_blank" rel="noopener">
        View original issue →
      </a>
    {/if}

    {#if data.similar.length > 0}
      <section class="related">
        <h2>Related articles</h2>
        <ul>
          {#each data.similar as item}
            <li>
              <a href="/article/{item.id}">
                <span class="related-title">{item.title}</span>
                <span class="related-meta">#{item.issue_number} · {formatDate(item.date)}</span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/if}
  {/if}
</main>

<style>
  main {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  nav {
    display: flex;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  nav a {
    color: #666;
    text-decoration: none;
    font-size: 0.85rem;
  }

  nav a:hover {
    color: #333;
  }

  h1 {
    font-size: 1.4rem;
    margin: 0 0 0.4rem;
    line-height: 1.3;
  }

  .meta {
    display: flex;
    gap: 0.6rem;
    align-items: center;
    font-size: 0.85rem;
    color: #888;
    margin-bottom: 0.5rem;
  }

  .section {
    background: #f0f0f0;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.03em;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 0.5rem;
  }

  .tag {
    font-size: 0.7rem;
    padding: 2px 8px;
    border-radius: 100px;
    border: 1px solid #ddd;
    color: #555;
  }

  .tag.country {
    background: #fef3e2;
    border-color: #f0d9a8;
    color: #8b5e00;
  }

  .tag.topic {
    background: #e8f5e9;
    border-color: #c8e6c9;
    color: #2e7d32;
  }

  .content {
    margin: 1.5rem 0;
  }

  .content p {
    font-size: 0.95rem;
    line-height: 1.7;
    color: #333;
    margin: 0;
  }

  .source-link {
    display: inline-block;
    font-size: 0.85rem;
    color: #1565c0;
    text-decoration: none;
    margin-bottom: 2rem;
  }

  .source-link:hover {
    text-decoration: underline;
  }

  .empty {
    text-align: center;
    color: #888;
    padding: 3rem 0;
  }

  .related {
    border-top: 1px solid #eee;
    padding-top: 1.5rem;
  }

  .related h2 {
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: #888;
    margin: 0 0 0.6rem;
  }

  .related ul {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .related li {
    border-bottom: 1px solid #eee;
  }

  .related a {
    display: block;
    padding: 0.5rem 0;
    text-decoration: none;
    color: inherit;
  }

  .related a:hover .related-title {
    text-decoration: underline;
  }

  .related-title {
    display: block;
    font-size: 0.88rem;
    font-weight: 500;
  }

  .related-meta {
    display: block;
    font-size: 0.72rem;
    color: #999;
    margin-top: 0.1rem;
  }
</style>

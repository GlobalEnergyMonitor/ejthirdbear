<script lang="ts">
  import { formatDate } from '$lib/format';

  let { data } = $props();
</script>

<svelte:head>
  <title>Coal Wire #{data.issue_number}</title>
</svelte:head>

<main>
  <nav>
    <a href="/">← Back to search</a>
  </nav>

  <header>
    <h1>Coal Wire #{data.issue_number}</h1>
    {#if data.articles.length > 0}
      <p class="date">{formatDate(data.articles[0].date, 'long')}</p>
    {/if}
  </header>

  {#if data.articles.length === 0}
    <p class="empty">No articles found for this issue.</p>
  {:else}
    <div class="articles">
      {#each data.articles as article}
        <article>
          {#if article.section}
            <span class="section">{article.section}</span>
          {/if}
          <p class="content">{article.content}</p>
          {#if article.links}
            {@const links = typeof article.links === 'string' ? JSON.parse(article.links) : article.links}
            {#if links.length > 0}
              <div class="links">
                {#each links as link}
                  <a href={link.url} target="_blank" rel="noopener">{link.text || 'Source'}</a>
                {/each}
              </div>
            {/if}
          {/if}
        </article>
      {/each}
    </div>
  {/if}
</main>

<style>
  main {
    max-width: 680px;
    margin: 0 auto;
    padding: 2rem 1rem 4rem;
  }

  nav {
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
    font-size: 1.5rem;
    margin: 0 0 0.25rem;
  }

  .date {
    color: #888;
    margin: 0;
    font-size: 0.9rem;
  }

  .empty {
    text-align: center;
    color: #888;
    padding: 3rem 0;
  }

  .articles {
    margin-top: 2rem;
  }

  article {
    padding: 1rem 0;
    border-bottom: 1px solid #eee;
  }

  .section {
    display: inline-block;
    background: #f0f0f0;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 0.72rem;
    color: #666;
    text-transform: uppercase;
    letter-spacing: 0.03em;
    margin-bottom: 0.4rem;
  }

  .content {
    margin: 0.4rem 0;
    font-size: 0.9rem;
    line-height: 1.6;
    color: #333;
  }

  .links {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 0.4rem;
  }

  .links a {
    font-size: 0.78rem;
    color: #1565c0;
    text-decoration: none;
  }

  .links a:hover {
    text-decoration: underline;
  }
</style>

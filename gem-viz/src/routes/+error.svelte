<script>
  // ============================================================================
  // ERROR PAGE
  // Displays when a route fails to load or doesn't exist
  // ============================================================================

  import { page } from '$app/stores';
  import { link } from '$lib/links';

  const status = $derived($page.status);
  const message = $derived($page.error?.message || 'Something went wrong');

  // Helpful suggestions based on error type
  const suggestions = $derived.by(() => {
    if (status === 404) {
      return [
        'Check the URL for typos',
        'The asset or entity ID may not exist in our database',
        'Try searching from the homepage map',
      ];
    }
    return [
      'Try refreshing the page',
      'Check your internet connection',
      'Return to the homepage and try again',
    ];
  });
</script>

<svelte:head>
  <title>{status} — GEM Viz</title>
</svelte:head>

<main>
  <div class="error-container">
    <div class="error-code">{status}</div>

    <h1>
      {#if status === 404}
        Page Not Found
      {:else if status === 500}
        Server Error
      {:else}
        Error
      {/if}
    </h1>

    <p class="error-message">{message}</p>

    <div class="suggestions">
      <p class="suggestions-title">What you can try:</p>
      <ul>
        {#each suggestions as suggestion}
          <li>{suggestion}</li>
        {/each}
      </ul>
    </div>

    <div class="actions">
      <a href={link('index')} class="btn">Back to Homepage</a>
      <button class="btn btn-outline" onclick={() => history.back()}>Go Back</button>
    </div>

    <div class="footer-note">
      <p>GEM Viz — Global Energy Monitor Data Visualization</p>
      <p class="id-hint">
        Asset IDs start with <code>G</code> (e.g., G100000109409)<br />
        Entity IDs start with <code>E</code> (e.g., E100001000348)
      </p>
    </div>
  </div>
</main>

<style>
  main {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 40px 20px;
    background: var(--color-gray-50);
  }

  .error-container {
    max-width: 500px;
    text-align: center;
  }

  .error-code {
    font-size: 120px;
    font-weight: bold;
    line-height: 1;
    color: var(--color-black);
    margin-bottom: 10px;
    font-family: system-ui, sans-serif;
  }

  h1 {
    font-size: 24px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin: 0 0 15px 0;
    color: var(--color-black);
  }

  .error-message {
    font-size: 14px;
    color: var(--color-text-secondary);
    margin: 0 0 30px 0;
    padding: 15px;
    background: var(--color-white);
    border: 1px solid var(--color-border);
  }

  .suggestions {
    text-align: left;
    margin-bottom: 30px;
    padding: 20px;
    background: var(--color-white);
    border: 1px solid var(--color-border);
  }

  .suggestions-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-tertiary);
    margin: 0 0 10px 0;
    font-weight: bold;
  }

  .suggestions ul {
    margin: 0;
    padding-left: 20px;
  }

  .suggestions li {
    font-size: 13px;
    color: var(--color-gray-700);
    margin-bottom: 6px;
  }

  .actions {
    display: flex;
    gap: 12px;
    justify-content: center;
    margin-bottom: 40px;
  }

  .actions .btn {
    padding: 12px 24px;
  }

  .footer-note {
    border-top: 1px solid var(--color-border);
    padding-top: 20px;
  }

  .footer-note p {
    font-size: 11px;
    color: var(--color-text-tertiary);
    margin: 0 0 10px 0;
  }

  .id-hint {
    font-size: 10px;
    line-height: 1.6;
  }

  .id-hint code {
    background: var(--color-gray-100);
    padding: 2px 6px;
    font-family: 'Monaco', 'Courier New', monospace;
    font-size: 10px;
  }
</style>

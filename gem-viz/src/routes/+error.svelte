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
  <title>Error {status} — Global Energy Monitor</title>
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
    padding: var(--space-10) var(--space-5);
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
    margin-bottom: var(--space-2);
    font-family: var(--font-family-sans);
  }

  h1 {
    font-size: var(--font-size-2xl);
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    margin: 0 0 var(--space-4) 0;
    color: var(--color-black);
  }

  .error-message {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-8) 0;
    padding: var(--space-4);
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
  }

  .suggestions {
    text-align: left;
    margin-bottom: var(--space-8);
    padding: var(--space-5);
    background: var(--color-white);
    border: var(--border-width) solid var(--color-border);
  }

  .suggestions-title {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
    font-weight: bold;
  }

  .suggestions ul {
    margin: 0;
    padding-left: var(--space-5);
  }

  .suggestions li {
    font-size: var(--font-size-md);
    color: var(--color-gray-700);
    margin-bottom: var(--space-1);
  }

  .actions {
    display: flex;
    gap: var(--space-3);
    justify-content: center;
    margin-bottom: var(--space-10);
  }

  .actions .btn {
    padding: var(--space-3) var(--space-6);
  }

  .footer-note {
    border-top: var(--border-width) solid var(--color-border);
    padding-top: var(--space-5);
  }

  .footer-note p {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    margin: 0 0 var(--space-2) 0;
  }

  .id-hint {
    font-size: var(--font-size-base);
    line-height: var(--leading-relaxed);
  }

  .id-hint code {
    background: var(--color-gray-100);
    padding: 2px var(--space-1);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-base);
  }
</style>

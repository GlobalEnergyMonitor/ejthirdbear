<script>
  /**
   * Citation Component
   *
   * Displays data source attribution and citation information.
   * Provides copy-to-clipboard citation in multiple formats.
   */

  /** @type {'footer' | 'compact' | 'full'} */
  let { variant = 'footer', trackers = [] } = $props();

  // Build citation date (use build time or current date)
  const citationDate = new Date().toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const year = new Date().getFullYear();

  // GEM tracker URLs
  const trackerUrls = {
    'Coal Plant': 'https://globalenergymonitor.org/projects/global-coal-plant-tracker/',
    'Coal Mine': 'https://globalenergymonitor.org/projects/global-coal-mine-tracker/',
    'Gas Plant': 'https://globalenergymonitor.org/projects/global-gas-plant-tracker/',
    'Steel Plant': 'https://globalenergymonitor.org/projects/global-steel-plant-tracker/',
    'Iron Mine': 'https://globalenergymonitor.org/projects/global-iron-mine-tracker/',
    'Bioenergy': 'https://globalenergymonitor.org/projects/global-bioenergy-power-tracker/',
    'Oil/Gas': 'https://globalenergymonitor.org/projects/global-oil-gas-extraction-tracker/',
  };

  // Get relevant tracker URLs
  const relevantTrackers = $derived(
    trackers
      .filter((t) => trackerUrls[t])
      .map((t) => ({ name: t, url: trackerUrls[t] }))
  );

  // Citation formats
  const apCitation = $derived(
    `Global Energy Monitor. (${year}). ${
      relevantTrackers.length === 1
        ? relevantTrackers[0].name + ' data'
        : 'Energy infrastructure ownership data'
    }. Retrieved ${citationDate}, from https://globalenergymonitor.org/`
  );

  const academicCitation = $derived(
    `Global Energy Monitor. ${year}. "${
      relevantTrackers.length === 1 ? relevantTrackers[0].name : 'Energy Infrastructure'
    } Ownership Database." Accessed ${citationDate}. https://globalenergymonitor.org/`
  );

  let copied = $state(false);

  async function copyCitation(format = 'ap') {
    const text = format === 'academic' ? academicCitation : apCitation;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

{#if variant === 'footer'}
  <footer class="citation-footer">
    <div class="citation-content">
      <p class="source">
        Data: <a href="https://globalenergymonitor.org/" target="_blank" rel="noopener">Global Energy Monitor</a>
        {#if relevantTrackers.length > 0}
          <span class="tracker-links">
            ({#each relevantTrackers as tracker, i}
              <a href={tracker.url} target="_blank" rel="noopener">{tracker.name}</a>{i < relevantTrackers.length - 1 ? ', ' : ''}
            {/each})
          </span>
        {/if}
      </p>
      <p class="date">Retrieved {citationDate}</p>
    </div>
    <button class="cite-btn" onclick={() => copyCitation('ap')} title="Copy citation">
      {copied ? 'Copied' : 'Cite'}
    </button>
  </footer>

{:else if variant === 'compact'}
  <span class="citation-compact">
    Source: <a href="https://globalenergymonitor.org/" target="_blank" rel="noopener">Global Energy Monitor</a> ({citationDate})
  </span>

{:else if variant === 'full'}
  <section class="citation-full">
    <h3>Data Source & Citation</h3>

    <div class="source-info">
      <p>
        This data is provided by <a href="https://globalenergymonitor.org/" target="_blank" rel="noopener">Global Energy Monitor</a>,
        a nonprofit research organization cataloging fossil fuel and renewable energy projects worldwide.
      </p>

      {#if relevantTrackers.length > 0}
        <p class="tracker-info">
          Data sources:
          {#each relevantTrackers as tracker, i}
            <a href={tracker.url} target="_blank" rel="noopener">{tracker.name}</a>{i < relevantTrackers.length - 1 ? ', ' : ''}
          {/each}
        </p>
      {/if}
    </div>

    <div class="citation-formats">
      <div class="citation-block">
        <span class="format-label">AP Style:</span>
        <blockquote>{apCitation}</blockquote>
        <button class="copy-btn" onclick={() => copyCitation('ap')}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>

      <div class="citation-block">
        <span class="format-label">Academic:</span>
        <blockquote>{academicCitation}</blockquote>
        <button class="copy-btn" onclick={() => copyCitation('academic')}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>

    <p class="license-note">
      GEM data is licensed under <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener">CC BY 4.0</a>.
      Please attribute Global Energy Monitor when using this data.
    </p>
  </section>
{/if}

<style>
  /* Footer variant */
  .citation-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 0;
    margin-top: 40px;
    border-top: 1px solid var(--color-border);
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .citation-content p {
    margin: 0;
    line-height: 1.6;
  }

  .source a {
    color: var(--color-gray-700);
    text-decoration: underline;
  }

  .tracker-links {
    color: var(--color-gray-500);
  }

  .tracker-links a {
    color: var(--color-text-secondary);
  }

  .date {
    font-size: 10px;
    color: var(--color-text-tertiary);
  }

  .cite-btn {
    padding: 4px 10px;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    background: transparent;
    border: 1px solid var(--color-gray-300);
    cursor: pointer;
  }

  .cite-btn:hover {
    background: var(--color-gray-50);
  }

  /* Compact variant */
  .citation-compact {
    font-size: 10px;
    color: var(--color-gray-500);
  }

  .citation-compact a {
    color: var(--color-text-secondary);
  }

  /* Full variant */
  .citation-full {
    padding: 20px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-gray-100);
    margin-top: 40px;
  }

  .citation-full h3 {
    font-size: 14px;
    font-weight: 600;
    margin: 0 0 16px 0;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .source-info {
    margin-bottom: 20px;
  }

  .source-info p {
    font-size: 13px;
    line-height: 1.6;
    margin: 0 0 8px 0;
  }

  .source-info a {
    color: var(--color-gray-700);
    text-decoration: underline;
  }

  .tracker-info {
    font-size: 12px;
    color: var(--color-text-secondary);
  }

  .citation-formats {
    display: flex;
    flex-direction: column;
    gap: 16px;
    margin-bottom: 16px;
  }

  .citation-block {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .format-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-secondary);
  }

  blockquote {
    margin: 0;
    padding: 10px 12px;
    background: var(--color-white);
    border-left: 3px solid var(--color-gray-700);
    font-size: 12px;
    font-family: Georgia, serif;
    line-height: 1.5;
  }

  .copy-btn {
    align-self: flex-start;
    padding: 4px 8px;
    font-size: 10px;
    background: transparent;
    border: 1px solid var(--color-gray-300);
    cursor: pointer;
  }

  .copy-btn:hover {
    background: var(--color-gray-50);
  }

  .license-note {
    font-size: 11px;
    color: var(--color-gray-500);
    margin: 0;
  }

  .license-note a {
    color: var(--color-text-secondary);
  }

  /* Print styles */
  @media print {
    .cite-btn,
    .copy-btn {
      display: none;
    }

    .citation-footer {
      border-top: 1px solid var(--color-black);
    }
  }
</style>

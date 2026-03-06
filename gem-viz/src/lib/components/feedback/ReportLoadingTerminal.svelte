<script lang="ts">
  type QueryStatus = 'pending' | 'running' | 'done' | 'skipped' | 'error';

  type QueryStep = {
    id: string;
    label: string;
    status: QueryStatus;
    rows?: number;
    ms?: number;
  };

  let {
    elapsedMs,
    cartCount,
    entityCount,
    assetCount,
    steps,
  }: {
    elapsedMs: number;
    cartCount: number;
    entityCount: number;
    assetCount: number;
    steps: QueryStep[];
  } = $props();

  const stepIcons: Record<QueryStatus, [string, string]> = {
    pending: ['', '○'],
    running: ['spinning', '◐'],
    done: ['done', '●'],
    skipped: ['skipped', '–'],
    error: ['error', '✕'],
  };
</script>

<section class="loading-terminal">
  <div class="terminal-header">
    <span class="terminal-title">Generating Report</span>
    <span class="terminal-timer">{(elapsedMs / 1000).toFixed(1)}s</span>
  </div>
  <div class="terminal-body">
    <div class="terminal-meta">
      <span>Building report for {cartCount} items</span>
      <span>{entityCount} entities · {assetCount} assets</span>
    </div>
    <ul class="query-steps">
      {#each steps as step}
        {@const [dotClass, dotIcon] = stepIcons[step.status] || stepIcons.error}
        <li class="query-step {step.status}">
          <span class="step-indicator">
            <span class="dot {dotClass}">{dotIcon}</span>
          </span>
          <span class="step-label">{step.label}</span>
          {#if step.status === 'done' && step.ms !== undefined}
            <span class="step-result">
              {#if step.rows !== undefined && step.rows > 0}
                {step.rows} rows ·
              {/if}
              {step.ms}ms
            </span>
          {:else if step.status === 'skipped'}
            <span class="step-result">skipped</span>
          {/if}
        </li>
      {/each}
    </ul>
  </div>
</section>

<style>
  .loading-terminal {
    margin: var(--space-8) 0;
    border: 1px solid var(--color-gray-200);
    font-family: var(--font-family-mono);
    font-size: 12px;
  }

  .terminal-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-100);
    border-bottom: 1px solid var(--color-gray-200);
  }

  .terminal-title {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 10px;
  }

  .terminal-timer {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-variant-numeric: tabular-nums;
  }

  .terminal-body {
    padding: var(--space-4);
    background: var(--color-white);
  }

  .terminal-meta {
    display: flex;
    justify-content: space-between;
    color: var(--color-text-tertiary);
    font-size: 11px;
    margin-bottom: var(--space-4);
    padding-bottom: var(--space-3);
    border-bottom: 1px dashed var(--color-gray-200);
  }

  .query-steps {
    list-style: none;
    padding: 0;
    margin: 0;
  }

  .query-step {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    padding: var(--space-1) 0;
    color: var(--color-text-secondary);
  }

  .query-step.running {
    color: var(--color-black);
  }

  .query-step.done {
    color: var(--color-text-secondary);
  }

  .query-step.skipped {
    color: var(--color-text-tertiary);
    opacity: 0.6;
  }

  .query-step.error {
    color: var(--color-error);
  }

  .step-indicator {
    width: 14px;
    text-align: center;
    flex-shrink: 0;
  }

  .dot {
    display: inline-block;
    font-size: 10px;
  }

  .dot.spinning {
    animation: spin 0.6s linear infinite;
    color: var(--gem-primary-blue);
  }

  .dot.done {
    color: var(--color-status-operating, #2d6a4f);
  }

  .dot.skipped {
    color: var(--color-text-tertiary);
  }

  .dot.error {
    color: var(--color-error);
  }

  .step-label {
    flex: 1;
  }

  .step-result {
    font-size: 10px;
    color: var(--color-text-tertiary);
    font-variant-numeric: tabular-nums;
  }

  .query-step.done .step-result {
    color: var(--color-status-operating, #2d6a4f);
  }

  @keyframes spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
  }
</style>

<script>
  import DebugPanel from '$lib/components/feedback/DebugPanel.svelte';
  import { getApiLog, getApiLogCount, clearApiLog } from '$lib/api-log.svelte';
  import { Copy, Trash2 } from 'lucide-svelte';

  const calls = $derived(getApiLog());
  const count = $derived(getApiLogCount());
  const totalTime = $derived(calls.reduce((sum, c) => sum + c.durationMs, 0));

  let copied = $state(false);

  function copyAll() {
    const text = calls
      .map(
        (c) =>
          `${c.method} ${c.url} → ${c.status ?? 'ERR'} (${c.durationMs.toFixed(0)}ms)${c.reason ? ` [${c.reason}]` : ''}`
      )
      .join('\n');
    navigator.clipboard.writeText(text);
    copied = true;
    setTimeout(() => (copied = false), 1500);
  }
</script>

{#if count > 0}
  <DebugPanel title="API Calls ({count})" time={totalTime} open={true}>
    <div class="log-toolbar">
      <button class="copy-btn" onclick={copyAll}>
        <Copy size={12} />
        {copied ? 'Copied!' : 'Copy all'}
      </button>
      <button class="copy-btn" onclick={clearApiLog}>
        <Trash2 size={12} />
        Clear
      </button>
    </div>
    <div class="call-list">
      {#each calls as call, i (call.timestamp.getTime() + '-' + i)}
        <div class="call-row" class:call-error={call.error}>
          <span class="call-method">{call.method}</span>
          <a class="call-url" href={call.url} target="_blank" rel="noopener" title={call.url}
            >{call.url}</a
          >
          <span
            class="call-status"
            class:status-ok={call.status && call.status < 400}
            class:status-err={!call.status || call.status >= 400}
          >
            {call.status ?? 'ERR'}
          </span>
          <span class="call-time">{call.durationMs.toFixed(0)}ms</span>
          {#if call.reason}<span class="call-reason">{call.reason}</span>{/if}
        </div>
      {/each}
    </div>
  </DebugPanel>
{/if}

<style>
  .log-toolbar {
    display: flex;
    gap: var(--space-2, 8px);
    margin-bottom: var(--space-3, 12px);
  }

  .call-list {
    display: flex;
    flex-direction: column;
    gap: 1px;
    font-family: var(--font-family-mono, monospace);
    font-size: var(--font-size-xs, 11px);
    background: var(--color-border, #e5e5e5);
    border-radius: var(--radius-sm, 2px);
    max-height: 300px;
    overflow-y: auto;
  }

  .call-row {
    display: grid;
    grid-template-columns: 40px 1fr 40px 52px auto;
    gap: var(--space-2, 8px);
    padding: var(--space-1, 4px) var(--space-2, 8px);
    background: var(--color-gray-50, #fafafa);
    align-items: center;
  }

  .call-row:hover {
    background: var(--color-gray-100, #f0f0f0);
  }

  .call-row.call-error {
    background: var(--color-error-bg, #fef2f2);
  }

  .call-method {
    color: var(--color-text-secondary);
    font-weight: 600;
    text-transform: uppercase;
  }

  .call-url {
    color: var(--color-text-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;
    user-select: all;
    text-decoration: none;
  }

  .call-url:hover {
    text-decoration: underline;
  }

  .call-status {
    text-align: right;
    font-weight: 600;
  }

  .status-ok {
    color: var(--color-success, #16a34a);
  }

  .status-err {
    color: var(--color-error, #dc2626);
  }

  .call-time {
    text-align: right;
    color: var(--color-text-tertiary);
  }

  .call-reason {
    color: var(--color-text-tertiary);
    font-style: italic;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>

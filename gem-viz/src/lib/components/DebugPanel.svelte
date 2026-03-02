<script>
  /**
   * DebugPanel - Collapsible debug info panel
   *
   * Usage:
   *   <DebugPanel title="Query Debug" time={queryTime}>
   *     <div class="debug-meta">...</div>
   *   </DebugPanel>
   */

  import { ChevronRight, Settings } from 'lucide-svelte';

  /** @type {{ title?: string, time?: number | null, children?: import('svelte').Snippet }} */
  let { title = 'Debug', time = null, children } = $props();
</script>

<details class="debug-panel">
  <summary class="debug-summary">
    <span class="debug-arrow"><ChevronRight size={12} /></span>
    <span class="debug-icon"><Settings size={14} /></span>
    <span class="debug-title">{title}</span>
    {#if time}
      <span class="debug-time">({time.toFixed(0)}ms)</span>
    {/if}
  </summary>
  <div class="debug-content">
    {@render children?.()}
  </div>
</details>

<style>
  .debug-panel {
    margin-top: var(--space-12);
    border-top: 1px solid var(--color-border);
    padding-top: var(--space-4);
  }

  .debug-summary {
    display: flex;
    gap: var(--space-2);
    align-items: center;
    cursor: pointer;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    padding: var(--space-2) 0;
    list-style: none;
  }

  .debug-summary::-webkit-details-marker {
    display: none;
  }

  .debug-arrow {
    font-size: 10px;
    transition: transform 0.2s ease;
  }

  .debug-panel[open] .debug-arrow {
    transform: rotate(90deg);
  }

  .debug-icon {
    font-size: var(--font-size-body);
  }

  .debug-title {
    font-weight: 500;
  }

  .debug-time {
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
  }

  .debug-content {
    margin-top: var(--space-4);
    padding: var(--space-4);
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
  }

  /* Utility classes for debug content */
  .debug-content :global(.debug-meta) {
    display: grid;
    grid-template-columns: 100px 1fr;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
    font-size: var(--font-size-sm);
  }

  .debug-content :global(.debug-label) {
    color: var(--color-text-tertiary);
    font-weight: 500;
  }

  .debug-content :global(.debug-value) {
    color: var(--color-text-secondary);
    font-family: var(--font-family-mono);
  }

  .debug-content :global(.debug-code) {
    margin: 0;
    padding: var(--space-4);
    background: #1e1e1e;
    color: #d4d4d4;
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    line-height: 1.5;
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .debug-content :global(.copy-btn) {
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-xs);
    background: white;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .debug-content :global(.copy-btn:hover) {
    background: var(--color-gray-100);
  }
</style>

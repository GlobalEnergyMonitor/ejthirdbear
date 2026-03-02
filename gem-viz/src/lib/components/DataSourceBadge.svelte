<script>
  /**
   * DataSourceBadge - Inline indicator showing where data came from
   *
   * Use this to show data provenance on any component or section.
   * For full citation with copy functionality, use Citation.svelte instead.
   */

  import { Zap, Server, HardDrive, AlertTriangle } from 'lucide-svelte';

  /**
   * @type {{
   *   source: 'api' | 'local' | 'server' | 'none' | null,
   *   queryTime?: number | null,
   *   label?: string | null,
   *   size?: 'sm' | 'md',
   * }}
   */
  let { source = null, queryTime = null, label = null, size = 'sm' } = $props();

  const sourceConfig = {
    api: { name: 'REST API', icon: Zap, color: 'green' },
    server: { name: 'Server', icon: Server, color: 'green' },
    local: { name: 'Local', icon: HardDrive, color: 'gray' },
    none: { name: 'No Data', icon: AlertTriangle, color: 'red' },
  };

  const config = $derived(source ? sourceConfig[source] || sourceConfig.none : null);
  const Icon = $derived(config ? config.icon : null);

  const timeDisplay = $derived(
    queryTime != null
      ? queryTime < 1000
        ? `${Math.round(queryTime)}ms`
        : `${(queryTime / 1000).toFixed(1)}s`
      : null
  );
</script>

{#if config}
  <span
    class="badge {config.color} {size}"
    title="{config.name}{timeDisplay ? ` (${timeDisplay})` : ''}"
  >
    {#if Icon}
      <span class="icon"><Icon size={size === 'sm' ? 10 : 12} /></span>
    {/if}
    <span class="label">{label || config.name}</span>
    {#if timeDisplay}
      <span class="time">{timeDisplay}</span>
    {/if}
  </span>
{/if}

<style>
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 4px;
    font-family: var(--font-family-data, 'Barlow Semi-Condensed', sans-serif);
    white-space: nowrap;
  }

  .badge.sm {
    font-size: 10px;
    padding: 2px 6px;
  }

  .badge.md {
    font-size: 11px;
    padding: 3px 8px;
  }

  .icon {
    font-size: 1em;
    line-height: 1;
  }

  .label {
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .time {
    opacity: 0.7;
    font-size: 0.9em;
  }

  /* Colors */
  .green {
    background: #ecfdf5;
    border: 1px solid #6ee7b7;
    color: #065f46;
  }

  .gray {
    background: #f3f4f6;
    border: 1px solid #d1d5db;
    color: #4b5563;
  }

  .red {
    background: #fef2f2;
    border: 1px solid #fca5a5;
    color: #991b1b;
  }
</style>

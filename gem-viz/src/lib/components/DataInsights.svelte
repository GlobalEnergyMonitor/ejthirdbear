<script>
  /**
   * DataInsights - Automatic pattern detection display
   *
   * Shows anomalies and interesting patterns detected in the data.
   * Styled for serious investigative work - no frills.
   */

  import { sortBySeverity } from '$lib/anomaly-detection';

  let {
    /** Array of anomaly objects from detectAssetAnomalies or detectEntityAnomalies */
    anomalies = [],
    /** Compact inline display vs expanded panel */
    compact = false,
  } = $props();

  const sorted = $derived(sortBySeverity(anomalies));
  const hasAnomalies = $derived(sorted.length > 0);

  const warningCount = $derived(
    sorted.filter((a) => a.severity === 'warning' || a.severity === 'critical').length
  );
</script>

{#if hasAnomalies}
  <aside class="data-insights" class:compact>
    <header>
      <h4>
        Data Observations
        {#if warningCount > 0}
          <span class="warning-count">{warningCount}</span>
        {/if}
      </h4>
    </header>

    <ul class="insight-list">
      {#each sorted as anomaly}
        <li class="insight-item {anomaly.severity}">
          <div class="insight-marker"></div>
          <div class="insight-content">
            <span class="insight-title">{anomaly.title}</span>
            {#if !compact}
              <span class="insight-detail">{anomaly.detail}</span>
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </aside>
{/if}

<style>
  .data-insights {
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 12px;
    border-left: 2px solid #e0e0e0;
    padding-left: 16px;
    margin: 24px 0;
  }

  .data-insights.compact {
    margin: 12px 0;
    padding-left: 12px;
  }

  header {
    margin-bottom: 12px;
  }

  h4 {
    margin: 0;
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #666;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .warning-count {
    font-size: 9px;
    background: #000;
    color: #fff;
    padding: 2px 6px;
    font-weight: 600;
  }

  .insight-list {
    list-style: none;
    margin: 0;
    padding: 0;
  }

  .insight-item {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 8px 0;
    border-bottom: 1px solid #f0f0f0;
  }

  .insight-item:last-child {
    border-bottom: none;
  }

  .compact .insight-item {
    padding: 4px 0;
  }

  .insight-marker {
    width: 6px;
    height: 6px;
    margin-top: 5px;
    flex-shrink: 0;
  }

  .insight-item.info .insight-marker {
    background: #e0e0e0;
  }

  .insight-item.warning .insight-marker {
    background: #000;
  }

  .insight-item.critical .insight-marker {
    background: #b10000;
  }

  .insight-content {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .compact .insight-content {
    flex-direction: row;
    gap: 8px;
  }

  .insight-title {
    font-weight: 500;
    color: #000;
  }

  .insight-detail {
    color: #666;
    line-height: 1.4;
  }

  .compact .insight-detail {
    color: #999;
  }

  .compact .insight-detail::before {
    content: '—';
    margin-right: 6px;
  }
</style>

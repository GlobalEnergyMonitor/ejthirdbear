<script lang="ts">
  import { getContext } from 'svelte';
  import { COAL_QUERY_KEY, type CoalQueryState } from '$lib/state/coal-query.svelte';
  import { getField, type Tracker } from '$lib/data-config/coal-field-schema';

  const coalQuery = getContext<CoalQueryState>(COAL_QUERY_KEY);

  const TRACKER_LABELS: Record<Tracker, string> = {
    'coal-plant': 'Coal Plants',
    'coal-mine': 'Coal Mines',
  };

  let copied = $state(false);

  function copyApiUrl() {
    navigator.clipboard.writeText(coalQuery.apiUrls.join('\n')).then(() => {
      copied = true;
      setTimeout(() => (copied = false), 2000);
    });
  }

  // Build an ordered list of tokens to display in the bar.
  // Each token has a label and a clear action.
  const tokens = $derived.by(() => {
    const result: { label: string; key: string; onClear?: () => void }[] = [];
    const f = coalQuery.query.filters;

    if (f.country_area?.length) {
      result.push({
        key: 'country_area',
        label: f.country_area.join(', '),
        onClear: () => coalQuery.clearFilter('country_area'),
      });
    }
    if (f.status?.length) {
      result.push({
        key: 'status',
        label: f.status.join(', '),
        onClear: () => coalQuery.clearFilter('status'),
      });
    }

    const skipKeys = new Set(['country_area', 'status']);
    for (const [key, val] of Object.entries(f)) {
      if (skipKeys.has(key) || val == null) continue;
      const field = getField(key);
      const label = field?.shortLabel ?? field?.label ?? key;

      if (Array.isArray(val) && val.length) {
        result.push({
          key,
          label: `${label}: ${val.join(', ')}`,
          onClear: () => coalQuery.clearFilter(key as keyof typeof f),
        });
      } else if (typeof val === 'object' && ('min' in val || 'max' in val)) {
        const { min, max } = val as { min?: number; max?: number };
        const range = min != null && max != null ? `${min}–${max}` : min != null ? `≥${min}` : `≤${max}`;
        result.push({
          key,
          label: `${label}: ${range}`,
          onClear: () => coalQuery.clearFilter(key as keyof typeof f),
        });
      } else if (typeof val === 'string' && val) {
        result.push({
          key,
          label: `${label}: ${val}`,
          onClear: () => coalQuery.clearFilter(key as keyof typeof f),
        });
      }
    }

    if (coalQuery.query.groupBy.length) {
      const labels = coalQuery.query.groupBy
        .map((k) => getField(k)?.shortLabel ?? getField(k)?.label ?? k)
        .join(' + ');
      result.push({
        key: '__groupBy',
        label: `grouped by ${labels}`,
        onClear: () => coalQuery.setGroupBy([]),
      });
    }

    if (coalQuery.query.aggregates.length) {
      const labels = coalQuery.query.aggregates
        .map((a) => {
          const field = getField(a.field);
          return field?.aggregatable?.find((s) => s.fn === a.fn)?.label ?? `${a.fn}(${a.field})`;
        })
        .join(', ');
      result.push({
        key: '__aggregates',
        label: labels,
        onClear: () => coalQuery.setAggregates([]),
      });
    }

    return result;
  });
</script>

<div class="query-bar">
  <!-- Tracker selector -->
  <div class="tracker-selector">
    {#each (['coal-plant', 'coal-mine'] as Tracker[]) as tracker}
      <button
        class="tracker-btn"
        class:active={coalQuery.query.trackers.includes(tracker)}
        onclick={() => {
          const current = coalQuery.query.trackers;
          const next = current.includes(tracker)
            ? current.filter((t) => t !== tracker)
            : [...current, tracker];
          if (next.length > 0) coalQuery.setTrackers(next);
        }}
      >
        {TRACKER_LABELS[tracker]}
      </button>
    {/each}
  </div>

  <div class="bar-divider"></div>

  <!-- Active filter tokens -->
  <div class="token-row">
    {#if tokens.length === 0}
      <span class="token-empty">No filters applied</span>
    {:else}
      {#each tokens as token (token.key)}
        <span class="token">
          <span class="token-label">{token.label}</span>
          {#if token.onClear}
            <button class="token-clear" onclick={token.onClear} aria-label="Remove filter">×</button>
          {/if}
        </span>
      {/each}
    {/if}
  </div>

  <!-- Actions -->
  <div class="bar-actions">
    {#if coalQuery.isDirty}
      <button class="action-btn" onclick={() => coalQuery.clearAllFilters()}>Clear all</button>
    {/if}
    <button class="action-btn action-btn--api" onclick={copyApiUrl}>
      {copied ? '✓ Copied' : 'Copy API URL'}
    </button>
  </div>
</div>

<style>
  .query-bar {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.6rem 1.25rem;
    background: #f8f8f8;
    border-bottom: 1px solid rgba(0, 0, 0, 0.08);
    font-size: 0.82rem;
    flex-wrap: wrap;
    min-height: 44px;
  }

  /* ── Tracker selector ─────────────────────────────────── */
  .tracker-selector {
    display: flex;
    gap: 0;
    flex-shrink: 0;
    border: 1px solid rgba(0, 0, 0, 0.15);
    border-radius: 5px;
    overflow: hidden;
  }
  .tracker-btn {
    all: unset;
    cursor: pointer;
    padding: 0.3rem 0.75rem;
    font-size: 0.78rem;
    font-weight: 500;
    color: #666;
    background: #fff;
    transition: background 0.1s, color 0.1s;
    border-right: 1px solid rgba(0, 0, 0, 0.1);
  }
  .tracker-btn:last-child {
    border-right: none;
  }
  .tracker-btn.active {
    background: #111;
    color: #fff;
  }
  .tracker-btn:not(.active):hover {
    background: #f0f0f0;
    color: #111;
  }

  /* ── Divider ──────────────────────────────────────────── */
  .bar-divider {
    width: 1px;
    height: 20px;
    background: rgba(0, 0, 0, 0.12);
    flex-shrink: 0;
  }

  /* ── Filter tokens ────────────────────────────────────── */
  .token-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    flex: 1;
    min-width: 0;
  }
  .token-empty {
    color: #aaa;
    font-style: italic;
  }
  .token {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    background: #e8e8e8;
    border-radius: 4px;
    padding: 0.2rem 0.5rem;
    font-size: 0.78rem;
    color: #222;
    white-space: nowrap;
  }
  .token-label {
    max-width: 220px;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .token-clear {
    all: unset;
    cursor: pointer;
    color: #888;
    line-height: 1;
    font-size: 0.9rem;
    padding: 0 0.1rem;
  }
  .token-clear:hover {
    color: #222;
  }

  /* ── Actions ──────────────────────────────────────────── */
  .bar-actions {
    display: flex;
    gap: 0.5rem;
    flex-shrink: 0;
    margin-left: auto;
  }
  .action-btn {
    all: unset;
    cursor: pointer;
    padding: 0.3rem 0.7rem;
    border-radius: 4px;
    font-size: 0.78rem;
    font-weight: 500;
    border: 1px solid rgba(0, 0, 0, 0.15);
    background: #fff;
    color: #444;
    transition: background 0.1s;
  }
  .action-btn:hover {
    background: #f0f0f0;
  }
  .action-btn--api {
    color: #111;
    font-weight: 600;
  }
</style>

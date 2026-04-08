<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { StatusGroup } from './card-types';

  let {
    /** Primary asset name shown in the compact header and full card header */
    name,
    /** Alternative / translated names shown in compact header */
    altNames = null,
    /** Human-readable status label ("Operating", "Abandoned", …) */
    statusLabel,
    /** Status group for badge color */
    statusGroup,
    /** Formatted location string ("Artemus, Kentucky, United States") */
    locationStr = '',
    /** GEM Wiki URL — rendered in footer */
    wikiUrl = null,
    /** Database/source label — rendered in footer */
    sourceLabel = null,
    /** Tab labels in display order */
    tabs,
    /** Tab to show on first render; defaults to first tab */
    initialTab,
    /** Whether the <details> element starts expanded */
    open = false,
    /** Extra class(es) forwarded to the root <details> element */
    class: extraClass = '',
    /** Currently active tab — bindable so parent can react (e.g. lazy-load ownership) */
    activeTab = $bindable<string>(''),
    // ── Snippets ──────────────────────────────────────────────────────────────
    /**
     * Right-hand side of the compact summary row.
     * Use for capacity chips, status badge, or any compact summary content.
     * If omitted, a simple StatusBadge is rendered automatically.
     */
    compactRight,
    /**
     * Tab content — called with the currently active tab label.
     * The parent renders the appropriate content per tab:
     *   {#snippet tabContent(tab)}
     *     {#if tab === 'Overview'}…{/if}
     *   {/snippet}
     */
    tabContent,
    /**
     * Optional footer override. If omitted, the standard footer
     * (sourceLabel + wikiUrl) is rendered.
     */
    footer,
  }: {
    name: string;
    altNames?: string | null;
    statusLabel: string;
    statusGroup: StatusGroup;
    locationStr?: string;
    wikiUrl?: string | null;
    sourceLabel?: string | null;
    tabs: readonly string[];
    initialTab?: string;
    open?: boolean;
    class?: string;
    activeTab?: string;
    compactRight?: Snippet;
    tabContent: Snippet<[string]>;
    footer?: Snippet;
  } = $props();

  // Initialise activeTab from initialTab prop (or first tab)
  $effect.pre(() => {
    if (!activeTab) {
      activeTab = (initialTab && (tabs as string[]).includes(initialTab))
        ? initialTab
        : tabs[0];
    }
  });

  function stopSelectPropagation(e: MouseEvent) {
    if (window.getSelection()?.toString()) e.preventDefault();
  }
</script>

<details class="tracker-card {extraClass}" {open}>
  <!-- ── Compact summary ──────────────────────────────────────────────────── -->
  <summary class="card-compact" onclick={stopSelectPropagation}>
    <div class="compact-left">
      <h3 class="compact-name">{name}</h3>
      {#if locationStr}
        <div class="compact-location">{locationStr}</div>
      {/if}
      {#if altNames}
        <div class="compact-also">Also: {altNames}</div>
      {/if}
    </div>
    <div class="compact-right">
      {#if compactRight}
        {@render compactRight()}
      {:else}
        <!-- Default: plain status badge -->
        <span class="default-badge badge-{statusGroup}">{statusLabel}</span>
      {/if}
    </div>
  </summary>

  <!-- ── Full card ────────────────────────────────────────────────────────── -->
  <div class="card-full">
    <!-- Tab bar -->
    <div class="tab-bar" role="tablist" aria-label="{name} detail tabs">
      {#each tabs as tab}
        <button
          class="tab-btn"
          class:active={activeTab === tab}
          role="tab"
          aria-selected={activeTab === tab}
          onclick={() => (activeTab = tab)}
        >{tab}</button>
      {/each}
    </div>

    <!-- Tab panels — grid-stacked so wrapper height = tallest panel -->
    <div class="tabs-wrapper">
      {#each tabs as tab}
        <div class="tab-panel" class:active={activeTab === tab}>
          {@render tabContent(tab)}
        </div>
      {/each}
    </div>

    <!-- Footer -->
    <footer class="card-footer">
      {#if footer}
        {@render footer()}
      {:else}
        {#if sourceLabel}<span>{sourceLabel}</span>{/if}
        {#if wikiUrl}
          {sourceLabel ? ' · ' : ''}<a href={wikiUrl} target="_blank" rel="noopener noreferrer"
            >Learn more on the GEM Wiki</a
          >
        {/if}
      {/if}
    </footer>
  </div>
</details>

<style>
  .tracker-card {
    font-family: var(--gem-font, 'Plus Jakarta Sans', system-ui, sans-serif);
    background: #fff;
    border-radius: 8px;
    border: 1px solid rgba(0, 0, 0, 0.1);
    overflow: hidden;
  }

  /* ── Compact summary ──────────────────────────────────────────── */
  .card-compact {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.25rem;
    cursor: pointer;
    list-style: none;
    user-select: none;
  }
  .card-compact::-webkit-details-marker {
    display: none;
  }

  .compact-left {
    min-width: 0;
  }
  .compact-name,
  .compact-location,
  .compact-also {
    user-select: text;
  }
  .compact-name {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
    color: #111;
  }
  .compact-location {
    font-size: 0.8rem;
    color: #666;
    margin-top: 0.15rem;
  }
  .compact-also {
    font-size: 0.75rem;
    color: #999;
    margin-top: 0.15rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  details[open] .compact-also {
    white-space: normal;
    overflow: visible;
    text-overflow: unset;
  }

  .compact-right {
    display: flex;
    gap: 0.4rem;
    flex-wrap: wrap;
    justify-content: flex-end;
    flex-shrink: 0;
    align-items: center;
  }

  /* Default badge (used when compactRight snippet is not provided) */
  .default-badge {
    display: inline-block;
    padding: 0.3rem 0.75rem;
    border-radius: 999px;
    font-size: 0.72rem;
    font-weight: 600;
    white-space: nowrap;
  }
  .badge-operating { background: #7f142a; color: #fff; }
  .badge-planned   { background: #ca4a50; color: #fff; }
  .badge-retired   { background: #e0e0e0; color: #444; }
  .badge-cancelled { background: #e0e0e0; color: #444; }

  /* ── Full card ────────────────────────────────────────────────── */
  .card-full {
    border-top: 1px solid rgba(0, 0, 0, 0.08);
  }

  /* ── Tab bar ──────────────────────────────────────────────────── */
  .tab-bar {
    display: flex;
    padding: 0 1.75rem;
    border-bottom: 1px solid rgba(0, 0, 0, 0.1);
    overflow-x: auto;
    overflow-y: hidden;
    -webkit-overflow-scrolling: touch;
  }
  .tab-btn {
    all: unset;
    cursor: pointer;
    padding: 0.85rem 1.25rem;
    font-size: 0.85rem;
    font-weight: 500;
    color: #666;
    border-bottom: 2px solid transparent;
    white-space: nowrap;
    transition: color 0.15s, border-color 0.15s;
    margin-bottom: -1px;
  }
  .tab-btn:hover { color: #111; }
  .tab-btn.active {
    color: #111;
    border-bottom-color: #111;
    font-weight: 600;
  }

  /* ── Tab panels ───────────────────────────────────────────────── */
  .tabs-wrapper {
    display: grid;
    min-width: 0;
    overflow: hidden;
  }
  .tab-panel {
    grid-area: 1 / 1;
    min-width: 0;
    padding: 1.5rem 1.75rem;
    min-height: 220px;
    max-height: 80vh;
    overflow-x: hidden;
    overflow-y: auto;
  }
  .tab-panel:not(.active) {
    visibility: hidden;
    pointer-events: none;
    overflow: hidden;
  }

  /* ── Footer ───────────────────────────────────────────────────── */
  .card-footer {
    padding: 0.65rem 1.75rem;
    font-size: 0.75rem;
    color: #aaa;
    border-top: 1px solid rgba(0, 0, 0, 0.06);
  }
  .card-footer a {
    color: #888;
  }
  .card-footer a:hover {
    color: #444;
  }
</style>

<script lang="ts">
  /**
   * Compact filter breadcrumb row for screener results.
   *
   * Single source of truth — consumed by both the /screener/results route
   * and the GemScreener widget so their header chrome can't drift again.
   *
   * If `onEdit` is omitted, the "Edit filters" link is suppressed (the widget
   * doesn't have an edit-filters modal yet).
   */
  import type { ScreenerSelectedClass } from '$lib/data-config/screener-types';

  interface Props {
    selectedClasses: ScreenerSelectedClass[];
    onEdit?: () => void;
  }

  let { selectedClasses, onEdit }: Props = $props();
</script>

{#if selectedClasses.length > 0}
  <div class="filter-bar">
    <span class="filter-crumbs">
      {#each selectedClasses as cls}
        <span class="crumb">{cls.name || cls.tracker}</span>
        {#if (cls.filters?.statuses?.length ?? 0) > 0}
          <span class="crumb-sep">/</span>
          <span class="crumb">
            {(cls.filters?.statuses?.length ?? 0) <= 3
              ? cls.filters?.statuses?.join(', ')
              : `${cls.filters?.statuses?.length} statuses`}
          </span>
        {:else if cls.filters?.status}
          <span class="crumb-sep">/</span>
          <span class="crumb">{cls.filters.status}</span>
        {/if}
        {#if cls.filters?.geography}
          {@const geo = cls.filters.geography}
          <span class="crumb-sep">/</span>
          <span class="crumb">
            {Array.isArray(geo)
              ? geo.length <= 3
                ? geo.join(', ')
                : `${geo.length} countries`
              : geo}
          </span>
        {/if}
        {#if cls.filters?.geofence}
          <span class="crumb-sep">/</span>
          <span class="crumb">custom region</span>
        {/if}
      {/each}
    </span>
    {#if onEdit}
      <button class="edit-link" onclick={onEdit}>Edit filters</button>
    {/if}
  </div>
{/if}

<style>
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3);
    padding: 8px 12px;
    margin-bottom: var(--space-4);
    background: var(--color-gray-50, #f8fafc);
    border: 1px solid var(--color-gray-200, #e5e7eb);
    border-radius: 2px;
    font-size: var(--font-size-sm);
  }

  .filter-crumbs {
    color: var(--color-text-secondary);
  }

  .crumb {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .crumb-sep {
    margin: 0 6px;
    color: var(--color-text-tertiary);
  }

  .edit-link {
    background: none;
    border: none;
    font: inherit;
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-decoration: underline;
    text-underline-offset: 2px;
    cursor: pointer;
    white-space: nowrap;
    padding: 0;
  }

  .edit-link:hover {
    color: var(--gem-teal);
  }
</style>

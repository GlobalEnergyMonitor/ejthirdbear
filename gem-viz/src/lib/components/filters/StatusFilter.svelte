<script lang="ts">
  import {
    STATUS_GROUP_DESCRIPTIONS,
    STATUS_VALUE_DESCRIPTIONS,
  } from '$lib/data-config/tracker-schema';
  import type { DynamicStatusGroup } from '$lib/data-config/tracker-schema';
  import { slide } from 'svelte/transition';

  let {
    statusGroups,
    statusChecks = $bindable({}),
  }: {
    statusGroups: DynamicStatusGroup[];
    statusChecks?: Record<string, boolean>;
  } = $props();

  let expandedRefine: Record<string, boolean> = $state({});

  const selectedCount = $derived(Object.values(statusChecks).filter(Boolean).length);

  function getStatusIds(groupId: string): string[] {
    const g = statusGroups.find((sg) => sg.id === groupId);
    return g ? g.statuses.map((s) => `status-${groupId}-${s.value}`) : [];
  }

  function isGroupAllChecked(groupId: string): boolean {
    return getStatusIds(groupId).every((id) => statusChecks[id]);
  }

  function isGroupNoneChecked(groupId: string): boolean {
    return getStatusIds(groupId).every((id) => !statusChecks[id]);
  }

  function isGroupIndeterminate(groupId: string): boolean {
    return !isGroupAllChecked(groupId) && !isGroupNoneChecked(groupId);
  }

  function toggleGroup(groupId: string) {
    const wasAll = isGroupAllChecked(groupId);
    const next = { ...statusChecks };
    for (const id of getStatusIds(groupId)) next[id] = !wasAll;
    statusChecks = next;
  }

  function setPreset(preset: 'default' | 'all' | 'none') {
    const next: Record<string, boolean> = {};
    for (const sg of statusGroups) {
      for (const s of sg.statuses) {
        const key = `status-${sg.id}-${s.value}`;
        if (preset === 'all') {
          next[key] = true;
        } else if (preset === 'none') {
          next[key] = false;
        } else {
          next[key] = sg.id === 'operating' || sg.id === 'planned';
        }
      }
    }
    statusChecks = next;
  }

  function toggleRefine(id: string) {
    expandedRefine = { ...expandedRefine, [id]: !expandedRefine[id] };
  }
</script>

<div class="filter-section">
  <span class="section-heading">Operating status</span>
  <div class="status-toolbar">
    <div class="status-presets" role="group" aria-label="Status presets">
      <button type="button" class="preset-btn" onclick={() => setPreset('default')}>
        Operating + planned
      </button>
      <button type="button" class="preset-btn" onclick={() => setPreset('all')}>
        All statuses
      </button>
      <button type="button" class="preset-btn" onclick={() => setPreset('none')}>Clear</button>
    </div>
    <span class="status-count">{selectedCount} selected</span>
  </div>

  <div class="group-row">
    {#each statusGroups as sg (sg.id)}
      {@const hasRefine = sg.statuses.length > 1}
      <div class="group-item">
        <label class="group-checkbox">
          <input
            type="checkbox"
            checked={isGroupAllChecked(sg.id)}
            indeterminate={isGroupIndeterminate(sg.id)}
            onchange={() => toggleGroup(sg.id)}
          />
          <span class="group-label">{sg.label}</span>
          {#if sg.totalCount > 0}
            <span class="count-badge">{sg.totalCount.toLocaleString()}</span>
          {/if}
        </label>
        {#if STATUS_GROUP_DESCRIPTIONS[sg.id]}
          <span class="group-desc">{STATUS_GROUP_DESCRIPTIONS[sg.id]}</span>
        {/if}
        {#if hasRefine}
          <button class="refine-toggle" onclick={() => toggleRefine(`status-${sg.id}`)}>
            {expandedRefine[`status-${sg.id}`] ? '▼' : '▶'} Refine
          </button>
        {/if}
        {#if hasRefine && expandedRefine[`status-${sg.id}`]}
          <div class="refine-panel" transition:slide={{ duration: 150 }}>
            {#each sg.statuses as statusItem}
              <label class="refine-option">
                <input
                  type="checkbox"
                  bind:checked={statusChecks[`status-${sg.id}-${statusItem.value}`]}
                />
                <span class="refine-copy">
                  <span class="refine-label">{statusItem.value}</span>
                  {#if STATUS_VALUE_DESCRIPTIONS[statusItem.value]}
                    <span class="refine-desc">{STATUS_VALUE_DESCRIPTIONS[statusItem.value]}</span>
                  {/if}
                </span>
                {#if statusItem.count > 0}
                  <span class="count-badge small">{statusItem.count.toLocaleString()}</span>
                {/if}
              </label>
            {/each}
          </div>
        {/if}
      </div>
    {/each}
  </div>

  {#if selectedCount === 0}
    <p class="status-warning">Select at least one status to continue.</p>
  {/if}
</div>

<style>
  .filter-section {
    margin-bottom: var(--space-4, 16px);
  }

  .section-heading {
    display: block;
    font-size: var(--font-size-sm, 13px);
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps, 0.05em);
    color: var(--color-text-tertiary);
    margin-bottom: var(--space-3, 12px);
  }

  .status-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-3, 12px);
    margin-bottom: var(--space-3, 12px);
    flex-wrap: wrap;
  }

  .status-presets {
    display: flex;
    gap: var(--space-2, 8px);
    flex-wrap: wrap;
  }

  .preset-btn {
    font-size: var(--font-size-sm, 13px);
    border: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-secondary);
    border-radius: var(--radius-sm, 4px);
    padding: 2px var(--space-2, 8px);
    cursor: pointer;
    font-family: inherit;
  }

  .preset-btn:hover {
    border-color: var(--gem-teal, #2a7f8f);
    color: var(--color-text-primary);
  }

  .status-count {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
  }

  .status-warning {
    margin: var(--space-2, 8px) 0 0 0;
    font-size: var(--font-size-sm, 13px);
    color: #b45309;
  }

  .group-row {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
    gap: var(--space-3, 12px);
    align-items: start;
  }

  .group-item {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    min-width: 0;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-primary, #fff);
  }

  .group-checkbox {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-body, 15px);
  }

  .group-checkbox input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .group-label {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .group-desc {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary);
  }

  .count-badge {
    font-size: 11px;
    font-weight: 500;
    color: var(--color-text-tertiary);
    background: var(--color-gray-100, #f1f5f9);
    padding: 1px 6px;
    border-radius: 9999px;
    margin-left: auto;
  }

  .count-badge.small {
    font-size: 10px;
    padding: 0 4px;
  }

  .refine-toggle {
    background: none;
    border: none;
    padding: 0;
    font-size: 11px;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--color-text-tertiary);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-family: inherit;
  }

  .refine-toggle:hover {
    color: var(--gem-teal, #2a7f8f);
  }

  .refine-panel {
    display: flex;
    flex-direction: column;
    gap: var(--space-1, 4px);
    padding: var(--space-2, 8px) 0 var(--space-2, 8px) var(--space-4, 16px);
    border-left: 2px solid var(--color-border, #e5e7eb);
    margin-top: var(--space-1, 4px);
  }

  .refine-option {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2, 8px);
    cursor: pointer;
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-secondary);
  }

  .refine-option input[type='checkbox'] {
    margin: 0;
    cursor: pointer;
  }

  .refine-copy {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
  }

  .refine-label {
    font-weight: 500;
    color: var(--color-text-primary);
  }

  .refine-desc {
    font-size: 11px;
    color: var(--color-text-tertiary);
  }
</style>

<script>
  /**
   * AssetClassesPanel - Collapsible panel showing selected asset classes
   * Reusable across screener pages for consistency
   *
   * @example
   * <AssetClassesPanel
   *   classesParam={$page.url.searchParams.get('classes')}
   *   onRemove={(cls) => removeClass(cls)}
   *   editHref="/screener"
   * />
   */

  import { link } from '$lib/links';
  import { parseJsonSearchParam } from '$lib/screener-url';

  let {
    classesParam = '',
    expanded = true,
    onRemove = null,
    editHref = '/screener',
    variant = 'default', // 'default' | 'badge' | 'compact'
  } = $props();

  let isExpanded = $state(true);

  $effect(() => {
    isExpanded = expanded;
  });

  // Parse selected classes from URL param
  const selectedClasses = $derived.by(() => {
    if (!classesParam) return [];
    const parsed = parseJsonSearchParam(classesParam);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => ({
        id: item.id || item.assetClassId || '',
        name: item.name || item.id || 'Unknown',
        description: item.description || '',
        tracker: item.tracker || '',
        filters: item.filters || null,
      }));
    }

    // Legacy format: comma-separated
    if (!classesParam.startsWith('[')) {
      return classesParam.split(',').map((c) => ({ name: c.trim() }));
    }

    return [];
  });

  // Build human-readable description of a class
  function getClassDescription(cls) {
    if (cls.description) return cls.description;

    const parts = [];
    if (cls.filters?.status) parts.push(cls.filters.status);
    parts.push(cls.tracker || cls.name || 'assets');
    if (cls.filters?.geography) parts.push(`in ${cls.filters.geography}`);

    return parts.join(' ');
  }

  function handleRemove(cls) {
    if (onRemove) onRemove(cls);
  }
</script>

{#if variant === 'badge'}
  <!-- Compact badge variant for header -->
  <div class="classes-badge" class:has-selection={selectedClasses.length > 0}>
    {#if selectedClasses.length === 0}
      <span class="badge-text">None selected</span>
    {:else if selectedClasses.length === 1}
      <span class="badge-text">{getClassDescription(selectedClasses[0])}</span>
    {:else}
      <span class="badge-text">{selectedClasses.length} classes selected</span>
    {/if}
    {#if selectedClasses.length > 0 && onRemove}
      <button class="badge-clear" onclick={() => selectedClasses.forEach(handleRemove)}>×</button>
    {/if}
  </div>
{:else if variant === 'compact'}
  <!-- Inline compact list -->
  <div class="classes-compact">
    {#if selectedClasses.length === 0}
      <span class="no-classes">No asset classes selected</span>
    {:else}
      {#each selectedClasses as cls, i}
        {#if i > 0}<span class="sep">,</span>{/if}
        <span class="class-tag">
          {cls.name}
          {#if onRemove}
            <button class="remove-btn" onclick={() => handleRemove(cls)}>×</button>
          {/if}
        </span>
      {/each}
    {/if}
    <a href={link(editHref)} class="edit-link">Edit</a>
  </div>
{:else}
  <!-- Default: Full collapsible panel -->
  <div class="classes-panel" class:expanded={isExpanded}>
    <button class="panel-header" onclick={() => (isExpanded = !isExpanded)}>
      <span class="toggle-icon">{isExpanded ? '▼' : '▶'}</span>
      <span class="panel-title">Selected Asset Classes</span>
      {#if selectedClasses.length > 0}
        <span class="count">{selectedClasses.length}</span>
      {/if}
    </button>

    {#if isExpanded}
      <div class="panel-content">
        {#if selectedClasses.length === 0}
          <p class="no-classes">No asset classes selected. Add classes to filter results.</p>
        {:else}
          <ul class="class-list">
            {#each selectedClasses as cls}
              <li class="class-item">
                <span class="class-name">{getClassDescription(cls)}</span>
                {#if onRemove}
                  <button class="remove-btn" onclick={() => handleRemove(cls)}>Remove</button>
                {/if}
              </li>
            {/each}
          </ul>
        {/if}

        <a href={link(editHref)} class="edit-btn">
          {selectedClasses.length === 0 ? 'Select asset classes' : 'Edit selection'}
        </a>
      </div>
    {/if}
  </div>
{/if}

<style>
  /* Badge variant - grid for no overlap */
  .classes-badge {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: var(--space-3);
    align-items: center;
    padding: var(--space-3) var(--space-5);
    background: var(--gem-teal);
    color: white;
    font-size: var(--font-size-body);
    min-width: 160px;
    max-width: 300px;
  }

  .classes-badge.has-selection {
    background: var(--gem-primary-blue);
  }

  .badge-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badge-clear {
    font-size: var(--font-size-lg);
    color: rgba(255, 255, 255, 0.7);
    background: none;
    border: none;
    cursor: pointer;
    line-height: 1;
    padding: 0;
  }

  .badge-clear:hover {
    color: white;
  }

  /* Compact variant */
  .classes-compact {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-body);
    color: var(--color-text-secondary);
  }

  .classes-compact .sep {
    color: var(--color-text-tertiary);
  }

  .classes-compact .class-tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-primary);
  }

  .classes-compact .remove-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-body);
    color: var(--color-text-tertiary);
    cursor: pointer;
  }

  .classes-compact .remove-btn:hover {
    color: var(--color-error);
  }

  .classes-compact .edit-link {
    margin-left: var(--space-2);
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    text-decoration: underline;
  }

  .classes-compact .no-classes {
    color: var(--color-text-tertiary);
    font-style: italic;
  }

  /* Default panel variant */
  .classes-panel {
    background: var(--color-bg-secondary);
    border: var(--border-width) solid var(--color-border);
    min-width: 260px;
    max-width: 300px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: none;
    border: none;
    border-bottom: var(--border-width) solid var(--color-border-light);
    color: var(--color-text-secondary);
    font-size: var(--font-size-sm);
    font-weight: 500;
    letter-spacing: var(--tracking-caps);
    text-transform: uppercase;
    cursor: pointer;
    text-align: left;
  }

  .toggle-icon {
    font-size: var(--font-size-xs);
    color: var(--color-text-tertiary);
  }

  .panel-title {
    flex: 1;
  }

  .count {
    font-variant-numeric: tabular-nums;
    background: var(--color-text-primary);
    color: var(--color-white);
    padding: 2px 6px;
    font-size: var(--font-size-xs);
    min-width: 18px;
    text-align: center;
  }

  .panel-content {
    padding: var(--space-3) var(--space-4) var(--space-4);
    animation: panelExpand 0.2s ease-out;
  }

  @keyframes panelExpand {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .no-classes {
    color: var(--color-text-tertiary);
    font-size: var(--font-size-body);
    margin: 0 0 var(--space-3) 0;
    font-style: italic;
  }

  .class-list {
    list-style: none;
    padding: 0;
    margin: 0 0 var(--space-3) 0;
  }

  .class-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) 0;
    border-bottom: var(--border-width) solid var(--color-border-light);
  }

  .class-item:last-child {
    border-bottom: none;
  }

  .class-name {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
  }

  .class-item .remove-btn {
    padding: 2px 6px;
    font-size: var(--font-size-xs);
    background: var(--color-bg-primary);
    border: var(--border-width) solid var(--color-border);
    cursor: pointer;
    color: var(--color-text-secondary);
  }

  .class-item .remove-btn:hover {
    color: var(--color-error);
    border-color: var(--color-error);
  }

  .edit-btn {
    display: block;
    width: 100%;
    padding: var(--space-2) 0;
    background: none;
    border: none;
    border-top: var(--border-width) solid var(--color-border-light);
    color: var(--color-text-secondary);
    font-size: var(--font-size-body);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-align: center;
  }

  .edit-btn:hover {
    color: var(--color-text-primary);
  }

  @media (max-width: 768px) {
    .classes-panel {
      width: 100%;
      max-width: none;
    }
  }
</style>

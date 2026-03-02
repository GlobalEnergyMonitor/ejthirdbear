<script lang="ts">
  type SelectedOwner = { id: string; name: string };

  let {
    selectedOwners = [],
    onContinue,
  }: {
    selectedOwners?: SelectedOwner[];
    onContinue: () => void;
  } = $props();
</script>

{#if selectedOwners.length > 0}
  <div class="selected-footer-content">
    <div class="selected-info">
      <strong
        >{selectedOwners.length}
        {selectedOwners.length === 1 ? 'company' : 'companies'} selected</strong
      >
      <span class="selected-names">
        {selectedOwners
          .slice(0, 3)
          .map((o) => o.name)
          .join(', ')}
        {#if selectedOwners.length > 3}
          + {selectedOwners.length - 3} more
        {/if}
      </span>
    </div>
    <button class="continue-btn" onclick={onContinue}>Continue to Results</button>
  </div>
{/if}

<style>
  .selected-footer-content {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: var(--space-6);
    align-items: center;
    max-width: 960px;
    margin: 0 auto;
  }

  .selected-info {
    font-size: var(--font-size-body);
    color: var(--color-text-primary);
    min-width: 0;
    overflow: hidden;
  }

  .selected-info strong {
    font-weight: 500;
    white-space: nowrap;
  }

  .selected-names {
    color: var(--color-text-tertiary);
    margin-left: 6px;
    font-size: var(--font-size-body);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .continue-btn {
    padding: var(--space-4) var(--space-8);
    font-size: var(--font-size-lg);
    font-weight: 600;
    background: var(--color-text-primary);
    color: var(--color-white);
    border: none;
    cursor: pointer;
    transition: background var(--duration-slow) var(--ease-in-out-quad);
    letter-spacing: var(--tracking-wide);
    white-space: nowrap;
    flex-shrink: 0;
  }

  .continue-btn:hover {
    background: var(--color-black);
  }

  @media (max-width: 768px) {
    .selected-footer-content {
      grid-template-columns: 1fr;
      gap: var(--space-3);
      text-align: center;
    }

    .selected-info {
      display: grid;
      grid-template-columns: 1fr;
      gap: var(--space-1);
    }

    .selected-names {
      margin-left: 0;
    }

    .continue-btn {
      width: 100%;
    }
  }
</style>

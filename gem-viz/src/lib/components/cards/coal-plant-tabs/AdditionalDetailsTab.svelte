<script lang="ts">
  let {
    additionalDetails,
  }: {
    additionalDetails: { label: string; values: string[] }[];
  } = $props();
</script>

{#if additionalDetails.length > 0}
  <dl class="details-list">
    {#each additionalDetails as row}
      <div class="details-row">
        <dt>{row.label}</dt>
        <dd>{row.values.join(' · ')}</dd>
      </div>
    {/each}
  </dl>
{:else}
  <p class="narrative muted">No additional fields with data for this plant.</p>
{/if}

<style>
  .narrative {
    font-size: 0.9rem;
    color: #222;
    margin: 0 0 1.5rem;
    line-height: 1.6;
  }
  .narrative.muted {
    color: #999;
    font-style: italic;
  }
  .details-list {
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .details-row {
    display: grid;
    grid-template-columns: 220px 1fr;
    gap: 0 1.5rem;
    padding: 0.45rem 0;
    border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    align-items: baseline;
  }
  .details-row:last-child {
    border-bottom: none;
  }
  .details-row dt {
    font-size: 0.78rem;
    font-weight: 600;
    color: #555;
  }
  .details-row dd {
    margin: 0;
    font-size: 0.85rem;
    color: #222;
    font-family: 'SF Mono', 'Fira Code', monospace;
  }
</style>

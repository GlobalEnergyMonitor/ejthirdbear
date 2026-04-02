<script lang="ts">
  /**
   * Search filter controls: country, topic, section, date range.
   */

  interface TagOption {
    value: string;
    count: number;
  }

  interface Props {
    section: string;
    sections: string[];
    dateFrom: string;
    dateTo: string;
    country: string;
    topic: string;
    countries: TagOption[];
    topics: TagOption[];
    onchange: () => void;
  }

  let {
    section = $bindable(''),
    sections = [],
    dateFrom = $bindable(''),
    dateTo = $bindable(''),
    country = $bindable(''),
    topic = $bindable(''),
    countries = [],
    topics = [],
    onchange,
  }: Props = $props();
</script>

<div class="tuner">
  <div class="filter-row">
    {#if countries.length > 0}
      <label class="filter">
        <span class="filter-label">Country</span>
        <select bind:value={country} onchange={onchange}>
          <option value="">All countries</option>
          {#each countries as c}
            <option value={c.value}>{c.value} ({c.count})</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if topics.length > 0}
      <label class="filter">
        <span class="filter-label">Topic</span>
        <select bind:value={topic} onchange={onchange}>
          <option value="">All topics</option>
          {#each topics as t}
            <option value={t.value}>{t.value} ({t.count})</option>
          {/each}
        </select>
      </label>
    {/if}

    {#if sections.length > 0}
      <label class="filter">
        <span class="filter-label">Section</span>
        <select bind:value={section} onchange={onchange}>
          <option value="">All sections</option>
          {#each sections as s}
            <option value={s}>{s}</option>
          {/each}
        </select>
      </label>
    {/if}

    <label class="filter">
      <span class="filter-label">From</span>
      <input type="date" bind:value={dateFrom} onchange={onchange} />
    </label>

    <label class="filter">
      <span class="filter-label">To</span>
      <input type="date" bind:value={dateTo} onchange={onchange} />
    </label>
  </div>
</div>

<style>
  .tuner {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    font-family: inherit;
  }

  .filter-row {
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .filter {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }

  .filter-label {
    font-size: var(--font-size-xs);
    font-family: var(--font-family-data);
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .filter select,
  .filter input[type='date'] {
    padding: 0.3rem 0.45rem;
    font-size: var(--font-size-sm);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-md);
    background: var(--color-bg-primary);
    font-family: var(--font-family);
    color: var(--color-text-primary);
  }

  .filter select:focus,
  .filter input[type='date']:focus {
    border-color: var(--color-text-secondary);
    outline: none;
  }

  @media (max-width: 600px) {
    .filter-row {
      flex-direction: column;
      gap: 0.4rem;
    }

    .filter select,
    .filter input[type='date'] {
      width: 100%;
      font-size: 16px;
    }
  }
</style>

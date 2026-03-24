<script lang="ts">
  /**
   * Friendly search tuning controls.
   *
   * Instead of "BM25 weight: 0.7", this gives users
   * plain-language presets and a slider with human labels.
   */

  interface TagOption {
    value: string;
    count: number;
  }

  interface Props {
    bm25Weight: number;
    section: string;
    sections: string[];
    hasEmbeddings: boolean;
    dateFrom: string;
    dateTo: string;
    country: string;
    topic: string;
    countries: TagOption[];
    topics: TagOption[];
    onchange: () => void;
  }

  let {
    bm25Weight = $bindable(0.5),
    section = $bindable(''),
    sections = [],
    hasEmbeddings = false,
    dateFrom = $bindable(''),
    dateTo = $bindable(''),
    country = $bindable(''),
    topic = $bindable(''),
    countries = [],
    topics = [],
    onchange,
  }: Props = $props();

  let showAdvanced = $state(false);

  const presets = [
    { label: 'Exact words', value: 1.0, desc: 'Find these specific words and phrases' },
    { label: 'Mostly words', value: 0.75, desc: 'Prioritize exact words, sprinkle in related ideas' },
    { label: 'Balanced', value: 0.5, desc: 'Equal mix of exact words and related meaning' },
    { label: 'Mostly meaning', value: 0.25, desc: 'Prioritize conceptually related content' },
    { label: 'Vibes only', value: 0.0, desc: 'Find articles about similar topics, even without matching words' },
  ];

  const activePreset = $derived(
    presets.find((p) => Math.abs(p.value - bm25Weight) < 0.05)
  );

  function selectPreset(value: number) {
    bm25Weight = value;
    onchange();
  }

  // Friendly label for current slider position
  const sliderLabel = $derived(
    bm25Weight > 0.85 ? 'Exact words only' :
    bm25Weight > 0.65 ? 'Leaning toward exact words' :
    bm25Weight > 0.35 ? 'Balanced' :
    bm25Weight > 0.15 ? 'Leaning toward meaning' :
    'Meaning only'
  );
</script>

<div class="tuner">
  {#if hasEmbeddings}
    <div class="mode-presets">
      <span class="presets-label">Search style</span>
      <div class="preset-pills">
        {#each presets as preset}
          <button
            class="preset"
            class:active={activePreset === preset}
            onclick={() => selectPreset(preset.value)}
            title={preset.desc}
          >
            {preset.label}
          </button>
        {/each}
      </div>
    </div>

    <button
      class="advanced-toggle"
      onclick={() => showAdvanced = !showAdvanced}
    >
      {showAdvanced ? 'Less options' : 'Fine-tune'}
    </button>

    {#if showAdvanced}
      <div class="advanced">
        <div class="slider-row">
          <span class="slider-end">Exact words</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            bind:value={bm25Weight}
            oninput={onchange}
            aria-label="Search balance between exact words and meaning"
          />
          <span class="slider-end">Related meaning</span>
        </div>
        <div class="slider-readout">{sliderLabel}</div>
      </div>
    {/if}
  {/if}

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

  /* Presets */
  .presets-label {
    font-size: 0.72rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    margin-bottom: 0.2rem;
    display: block;
  }

  .preset-pills {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .preset {
    padding: 0.3rem 0.6rem;
    font-size: 0.78rem;
    border: 1px solid #ddd;
    border-radius: 100px;
    background: #fff;
    color: #555;
    cursor: pointer;
    transition: all 0.12s;
    font-family: inherit;
    white-space: nowrap;
  }

  .preset:hover {
    border-color: #aaa;
    color: #222;
  }

  .preset.active {
    background: #1a1a1a;
    color: #fff;
    border-color: #1a1a1a;
  }

  /* Advanced toggle */
  .advanced-toggle {
    align-self: flex-start;
    background: none;
    border: none;
    color: #999;
    font-size: 0.72rem;
    cursor: pointer;
    padding: 0;
    font-family: inherit;
  }

  .advanced-toggle:hover {
    color: #555;
  }

  /* Slider */
  .advanced {
    padding: 0.5rem 0;
  }

  .slider-row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .slider-end {
    font-size: 0.72rem;
    color: #888;
    white-space: nowrap;
    min-width: 5.5rem;
  }

  .slider-end:last-child {
    text-align: right;
  }

  .slider-row input[type='range'] {
    flex: 1;
    height: 6px;
    accent-color: #1a1a1a;
    cursor: pointer;
    /* Flip direction: left=1.0 (exact), right=0.0 (semantic) */
    direction: rtl;
  }

  .slider-readout {
    text-align: center;
    font-size: 0.7rem;
    color: #aaa;
    margin-top: 0.2rem;
  }

  /* Filters */
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
    font-size: 0.68rem;
    color: #999;
    text-transform: uppercase;
    letter-spacing: 0.04em;
  }

  .filter select,
  .filter input[type='date'] {
    padding: 0.3rem 0.45rem;
    font-size: 0.8rem;
    border: 1px solid #ddd;
    border-radius: 4px;
    background: #fff;
    font-family: inherit;
    color: #333;
  }

  .filter select:focus,
  .filter input[type='date']:focus {
    border-color: #888;
    outline: none;
  }
</style>

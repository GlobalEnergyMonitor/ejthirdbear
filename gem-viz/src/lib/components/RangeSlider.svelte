<script>
  /**
   * RangeSlider - Dual-handle range slider for numeric filters
   *
   * A shopping-style range filter with:
   * - Min/max value inputs
   * - Visual slider with two handles
   * - Histogram preview of data distribution (optional)
   * - Live updating
   */

  import { formatCompact } from '$lib/format';

  /**
   * @type {{
   *   label: string,
   *   min?: number | null,
   *   max?: number | null,
   *   dataMin?: number,
   *   dataMax?: number,
   *   step?: number,
   *   unit?: string,
   *   histogram?: number[],
   * }}
   */
  let {
    label = '',
    min = $bindable(null),
    max = $bindable(null),
    dataMin = 0,
    dataMax = 1000,
    step = 1,
    unit = '',
    histogram = [],
  } = $props();

  // Internal state for slider positions
  let sliderMin = $state(0);
  let sliderMax = $state(0);

  // Sync external values to slider
  $effect(() => {
    sliderMin = min ?? dataMin;
    sliderMax = max ?? dataMax;
  });

  // Update external values when slider changes
  function updateMin(value) {
    const num = Number(value);
    if (num <= sliderMax) {
      sliderMin = num;
      min = num === dataMin ? null : num;
    }
  }

  function updateMax(value) {
    const num = Number(value);
    if (num >= sliderMin) {
      sliderMax = num;
      max = num === dataMax ? null : num;
    }
  }

  function handleMinInput(e) {
    updateMin(e.target.value);
  }

  function handleMaxInput(e) {
    updateMax(e.target.value);
  }

  function clearRange() {
    min = null;
    max = null;
    sliderMin = dataMin;
    sliderMax = dataMax;
  }

  // Calculate slider track fill percentage
  const fillLeft = $derived(((sliderMin - dataMin) / (dataMax - dataMin)) * 100);
  const fillWidth = $derived(((sliderMax - sliderMin) / (dataMax - dataMin)) * 100);

  const hasValue = $derived(min !== null || max !== null);

  // Histogram bars (normalize to max height)
  const histogramBars = $derived.by(() => {
    if (!histogram.length) return [];
    const maxCount = Math.max(...histogram);
    return histogram.map((count) => (count / maxCount) * 100);
  });
</script>

<div class="range-slider">
  <div class="range-header">
    <span class="range-label">{label}</span>
    {#if hasValue}
      <button class="range-clear" onclick={clearRange}>Clear</button>
    {/if}
  </div>

  <!-- Histogram preview -->
  {#if histogramBars.length > 0}
    <div class="histogram">
      {#each histogramBars as height, i}
        <div
          class="histogram-bar"
          style:height="{height}%"
          class:in-range={i >= (sliderMin - dataMin) / ((dataMax - dataMin) / histogram.length) &&
            i < (sliderMax - dataMin) / ((dataMax - dataMin) / histogram.length)}
        ></div>
      {/each}
    </div>
  {/if}

  <!-- Dual range slider -->
  <div class="slider-container">
    <div class="slider-track">
      <div class="slider-fill" style:left="{fillLeft}%" style:width="{fillWidth}%"></div>
    </div>
    <input
      type="range"
      class="slider slider-min"
      min={dataMin}
      max={dataMax}
      {step}
      value={sliderMin}
      oninput={handleMinInput}
    />
    <input
      type="range"
      class="slider slider-max"
      min={dataMin}
      max={dataMax}
      {step}
      value={sliderMax}
      oninput={handleMaxInput}
    />
  </div>

  <!-- Value inputs -->
  <div class="value-inputs">
    <div class="value-input">
      <input
        type="number"
        min={dataMin}
        max={sliderMax}
        {step}
        value={sliderMin}
        oninput={handleMinInput}
        placeholder="Min"
      />
      {#if unit}<span class="unit">{unit}</span>{/if}
    </div>
    <span class="separator">to</span>
    <div class="value-input">
      <input
        type="number"
        min={sliderMin}
        max={dataMax}
        {step}
        value={sliderMax}
        oninput={handleMaxInput}
        placeholder="Max"
      />
      {#if unit}<span class="unit">{unit}</span>{/if}
    </div>
  </div>

  <!-- Quick labels -->
  <div class="range-labels">
    <span>{formatCompact(dataMin)}{unit}</span>
    <span>{formatCompact(dataMax)}{unit}</span>
  </div>
</div>

<style>
  .range-slider {
    margin-bottom: 12px;
  }

  .range-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  }

  .range-label {
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
  }

  .range-clear {
    font-size: 10px;
    font-weight: 400;
    color: var(--color-link, var(--color-accent));
    background: none;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .range-clear:hover {
    text-decoration: underline;
  }

  /* Histogram */
  .histogram {
    display: flex;
    align-items: flex-end;
    gap: 1px;
    height: 20px;
    margin-bottom: 2px;
  }

  .histogram-bar {
    flex: 1;
    background: var(--color-gray-200);
    min-height: 2px;
    transition: background 0.15s;
  }

  .histogram-bar.in-range {
    background: var(--color-text-secondary);
  }

  /* Slider */
  .slider-container {
    position: relative;
    height: 18px;
    margin-bottom: 6px;
  }

  .slider-track {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    height: 4px;
    background: var(--color-gray-200);
    transform: translateY(-50%);
    border-radius: 2px;
  }

  .slider-fill {
    position: absolute;
    top: 0;
    height: 100%;
    background: var(--color-black);
    border-radius: 2px;
  }

  .slider {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: transparent;
    pointer-events: none;
    -webkit-appearance: none;
    appearance: none;
  }

  .slider::-webkit-slider-thumb {
    -webkit-appearance: none;
    appearance: none;
    width: 16px;
    height: 16px;
    background: var(--color-black);
    border: 2px solid var(--color-white);
    border-radius: 50%;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  .slider::-moz-range-thumb {
    width: 16px;
    height: 16px;
    background: var(--color-black);
    border: 2px solid var(--color-white);
    border-radius: 50%;
    cursor: pointer;
    pointer-events: auto;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.3);
  }

  /* Value inputs */
  .value-inputs {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .value-input {
    display: flex;
    align-items: center;
    gap: 2px;
    flex: 1;
  }

  .value-input input {
    width: 100%;
    padding: 4px 6px;
    font-size: 11px;
    border: 1px solid var(--color-border);
    text-align: center;
  }

  .value-input input:focus {
    outline: none;
    border-color: var(--color-text-secondary);
  }

  .unit {
    font-size: 10px;
    color: var(--color-text-secondary);
    flex-shrink: 0;
  }

  .separator {
    font-size: 10px;
    color: var(--color-text-secondary);
  }

  /* Range labels */
  .range-labels {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    color: var(--color-text-tertiary);
    margin-top: 2px;
  }
</style>

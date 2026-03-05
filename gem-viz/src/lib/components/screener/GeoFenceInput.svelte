<script lang="ts">
  /**
   * GeoFenceInput — paste GeoJSON to define a custom geographic region filter.
   * Supports Polygon, LineString, Feature, and FeatureCollection inputs.
   */
  import { slide } from 'svelte/transition';
  import { parseGeoFence } from '$lib/geo-utils';

  interface Props {
    geofence: number[][] | null;
  }

  let { geofence = $bindable() }: Props = $props();

  let expanded = $state(false);
  let rawInput = $state('');
  let error = $state('');

  function handleInput() {
    const text = rawInput.trim();
    if (!text) {
      geofence = null;
      error = '';
      return;
    }
    const parsed = parseGeoFence(text);
    if (parsed) {
      geofence = parsed;
      error = '';
    } else {
      geofence = null;
      error = 'Could not parse GeoJSON — needs a Polygon or LineString';
    }
  }

  function clear() {
    rawInput = '';
    geofence = null;
    error = '';
  }

  const vertexCount = $derived(
    geofence
      ? geofence.length -
          (geofence.length > 0 &&
          geofence[0][0] === geofence[geofence.length - 1][0] &&
          geofence[0][1] === geofence[geofence.length - 1][1]
            ? 1
            : 0)
      : 0
  );
</script>

<div class="geofence-input">
  <button type="button" class="toggle-btn" onclick={() => (expanded = !expanded)}>
    {expanded ? '\u25BC' : '\u25B6'} Custom region
    {#if geofence}
      <span class="active-badge">{vertexCount} vertices</span>
    {/if}
  </button>

  {#if expanded}
    <div class="geofence-body" transition:slide={{ duration: 150 }}>
      <p class="hint">
        Draw a region on
        <a href="https://geojson.io" target="_blank" rel="noopener noreferrer">geojson.io</a>, then
        paste the GeoJSON here.
      </p>
      <textarea
        class="geojson-textarea"
        class:has-error={!!error}
        placeholder="Paste GeoJSON (Polygon or LineString)..."
        bind:value={rawInput}
        oninput={handleInput}
        rows="4"
      ></textarea>
      {#if error}
        <p class="error-msg">{error}</p>
      {/if}
      {#if geofence}
        <div class="summary-row">
          <span class="summary-text">Polygon with {vertexCount} vertices</span>
          <button type="button" class="clear-btn" onclick={clear}>Clear</button>
        </div>
      {/if}
    </div>
  {/if}
</div>

<style>
  .geofence-input {
    margin-top: var(--space-3, 12px);
  }

  .toggle-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-sm, 13px);
    font-weight: 500;
    color: var(--color-text-tertiary, #a0aec0);
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .toggle-btn:hover {
    color: var(--gem-teal, #2a7f8f);
  }

  .active-badge {
    padding: 1px var(--space-2, 8px);
    font-size: 11px;
    background: rgba(42, 127, 143, 0.1);
    color: var(--gem-teal, #2a7f8f);
    border-radius: var(--radius-sm, 4px);
  }

  .geofence-body {
    margin-top: var(--space-2, 8px);
    padding-left: var(--space-3, 12px);
    border-left: 2px solid var(--color-border, #e5e7eb);
  }

  .hint {
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary, #a0aec0);
    margin: 0 0 var(--space-2, 8px) 0;
  }

  .hint a {
    color: var(--gem-teal, #2a7f8f);
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .geojson-textarea {
    width: 100%;
    font-family: var(--font-family-mono, monospace);
    font-size: var(--font-size-sm, 13px);
    padding: var(--space-2, 8px);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: var(--radius-sm, 4px);
    background: var(--color-bg-primary, #fff);
    color: var(--color-text-primary, #1a202c);
    resize: vertical;
  }

  .geojson-textarea:focus {
    outline: none;
    border-color: var(--gem-teal, #2a7f8f);
  }

  .geojson-textarea.has-error {
    border-color: #e53e3e;
  }

  .error-msg {
    font-size: var(--font-size-sm, 13px);
    color: #e53e3e;
    margin: var(--space-1, 4px) 0 0 0;
  }

  .summary-row {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    margin-top: var(--space-2, 8px);
  }

  .summary-text {
    font-size: var(--font-size-sm, 13px);
    color: var(--gem-teal, #2a7f8f);
    font-weight: 500;
  }

  .clear-btn {
    background: none;
    border: none;
    padding: 0;
    font-size: var(--font-size-sm, 13px);
    color: var(--color-text-tertiary, #a0aec0);
    cursor: pointer;
    text-decoration: underline;
    text-underline-offset: 2px;
  }

  .clear-btn:hover {
    color: var(--color-text-secondary, #718096);
  }
</style>

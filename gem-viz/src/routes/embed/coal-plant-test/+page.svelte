<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchCoalPlantLocation } from '$lib/ownership-api';
  import type { CoalPlantLocation } from '$lib/components/cards/coal-plant-types';
  import CoalPlantCard from '$lib/components/cards/CoalPlantCard.svelte';

  const COAL_PRESETS = [
    { label: 'Boundary Dam',        id: 'L100000100176' },
    { label: 'Eraring',             id: 'L100000100005' },
    { label: 'Yancheng Binhai',     id: 'L100000100973' },
    { label: 'Maritsa 3',           id: 'L100000100136' },
    { label: 'Gubin Power Project', id: 'L100000103227' },
    { label: 'Liuzhi',              id: 'L100000100463' },
    { label: 'Worsley Refinery',    id: 'L100000100043' },
    { label: 'Zhunger Weijiamao',   id: 'L100000100896' },
    { label: 'Huaiyin',             id: 'L100000100991' },
    { label: 'Zhenxiong',           id: 'L100000101719' },
    { label: 'Rovinari',            id: 'L100000103294' },
    { label: 'Nabinagar Thermal',   id: 'L100000102114' },
    { label: 'Shanying Cogen',      id: 'L100000101755' },
    { label: 'Lixin Banji',         id: 'L100000100233' },
    { label: 'Gansu Huating',       id: 'L100000100340' },
  ];

  // If ?id= param is provided, use it as the initial selection
  const urlId = $page.url.searchParams.get('id');
  const initialId = urlId && urlId.trim() ? urlId.trim() : COAL_PRESETS[0].id;
  const isPreset = COAL_PRESETS.some(p => p.id === initialId);

  let selectedPreset = $state(isPreset ? initialId : COAL_PRESETS[0].id);
  let useCustom = $state(!isPreset && !!urlId);
  let customId = $state(!isPreset && urlId ? urlId : '');
  let locationId = $derived(useCustom ? customId : selectedPreset);

  let location = $state<CoalPlantLocation | null>(null);
  let loading = $state(false);
  let error = $state('');

  // Detect if we're inside an iframe — if so, hide only the embed code sidebar
  let isEmbedded = $state(false);

  // Embed code
  let copied = $state(false);
  let embedId = $state(initialId);

  function embedSnippet(id: string) {
    const p = `/embed/coal-plant?id=${id}`;
    return `<div class="gem-embed" data-src="${p}" data-height="900">\n<script src="https://gem-viz.fly.dev/embed.js"><` + `/script>\n</div>`;
  }

  async function copy() {
    const text = embedSnippet(embedId);
    try { await navigator.clipboard.writeText(text); }
    catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove();
    }
    copied = true;
    setTimeout(() => { copied = false; }, 2000);
  }

  async function load() {
    const id = locationId.trim();
    if (!id) return;
    loading = true;
    error = '';
    location = null;
    try {
      location = await fetchCoalPlantLocation(id);
      embedId = id;
    } catch (e: any) {
      error = e?.message || 'Failed to load';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    isEmbedded = window.self !== window.top;
    load();
  });
</script>

<svelte:head>
  <title>Coal Plant Card — Test Harness</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="test-wrapper" class:embedded={isEmbedded}>
  <div class="controls">
    <div class="presets">
      {#each COAL_PRESETS as preset}
        <label class="preset-btn" class:active={!useCustom && selectedPreset === preset.id}>
          <input
            type="radio"
            name="preset"
            value={preset.id}
            checked={!useCustom && selectedPreset === preset.id}
            onchange={() => { selectedPreset = preset.id; useCustom = false; load(); }}
          />
          <span class="preset-name">{preset.label}</span>
          <span class="preset-id">{preset.id}</span>
        </label>
      {/each}
    </div>

    <div class="custom-row">
      <label class="preset-btn custom-btn" class:active={useCustom}>
        <input
          type="radio"
          name="preset"
          checked={useCustom}
          onchange={() => { useCustom = true; }}
        />
        <span class="preset-name">Custom</span>
      </label>
      <input
        class="id-input"
        type="text"
        bind:value={customId}
        placeholder="e.g. L100000103058"
        onfocus={() => { useCustom = true; }}
        onkeydown={(e) => e.key === 'Enter' && load()}
      />
      <button class="load-btn" onclick={load} disabled={loading}>
        {loading ? 'Loading…' : 'Load'}
      </button>
    </div>
  </div>

  <div class="main-area" class:embedded={isEmbedded}>
    <div class="card-area">
      {#if loading}
        <div class="status">Loading…</div>
      {:else if error}
        <div class="status error">{error}</div>
      {:else if location}
        <CoalPlantCard units={location.units} open={true} />
      {/if}
    </div>

    {#if !isEmbedded}
      <div class="embed-sidebar">
        <h3 class="sidebar-heading">Embed Code</h3>
        <p class="sidebar-desc">Copy this snippet to embed the coal plant card on any page. The <code>id</code> sets the initially loaded plant.</p>

        <h4 class="param-heading">Parameters</h4>
        <table class="param-table">
          <tbody>
            <tr><td><code>id</code></td><td>G-prefix, compound L_G, or L-prefix ID</td></tr>
          </tbody>
        </table>

        <h4 class="param-heading">Current ID</h4>
        <div class="current-id">{embedId}</div>

        <div class="code-block">
          <button class="cp-btn" class:ok={copied} onclick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <pre>{embedSnippet(embedId)}</pre>
        </div>

        <p class="sidebar-note">Embed script hosted at <code>gem-viz.fly.dev</code>. See the <a href="/embed">full widget catalog</a> for global options.</p>
      </div>
    {/if}
  </div>
</div>

<style>
  .test-wrapper {
    width: 100%;
    max-width: 1100px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    padding: 1.5rem;
    box-sizing: border-box;
  }

  /* ── Preset buttons ──────────────────────────────── */
  .controls {
    margin-bottom: 1.5rem;
  }

  .presets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    margin-bottom: 0.75rem;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    padding: 0.35rem 0.7rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    cursor: pointer;
    background: #fafafa;
    transition: border-color 0.12s, background 0.12s;
    line-height: 1.3;
  }
  .preset-btn input[type="radio"] { display: none; }
  .preset-btn:hover { border-color: #999; background: #f0f0f0; }
  .preset-btn.active { border-color: #111; background: #111; }
  .preset-btn.active .preset-name,
  .preset-btn.active .preset-id { color: #fff; }

  .preset-name { font-size: 0.8rem; font-weight: 600; color: #111; }
  .preset-id   { font-size: 0.68rem; color: #888; font-family: 'SF Mono', monospace; }

  /* ── Custom row ──────────────────────────────────── */
  .custom-row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .custom-btn {
    flex-direction: row;
    align-items: center;
    gap: 0.3rem;
    padding: 0.4rem 0.75rem;
  }

  .id-input {
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.82rem;
    padding: 0.4rem 0.65rem;
    border: 1px solid #ddd;
    border-radius: 6px;
    width: 220px;
    outline: none;
  }
  .id-input:focus { border-color: #111; }

  .load-btn {
    padding: 0.4rem 0.9rem;
    background: #111;
    color: #fff;
    border: none;
    border-radius: 6px;
    font-size: 0.82rem;
    font-weight: 600;
    cursor: pointer;
  }
  .load-btn:disabled { opacity: 0.5; cursor: default; }
  .load-btn:not(:disabled):hover { background: #333; }

  /* ── Main layout ─────────────────────────────────── */
  .main-area {
    display: grid;
    grid-template-columns: 1fr 280px;
    gap: 2rem;
    align-items: start;
  }
  .main-area.embedded {
    grid-template-columns: 1fr;
  }
  .test-wrapper.embedded {
    padding: 0;
    max-width: 900px;
  }

  /* ── Card area ───────────────────────────────────── */
  .card-area {
    min-height: 500px;
  }

  .status {
    font-size: 0.9rem;
    color: #666;
    padding: 1rem 0;
  }
  .status.error { color: #b00; }

  /* ── Embed sidebar ───────────────────────────────── */
  .embed-sidebar {
    border: 1px solid #e5e5e5;
    border-radius: 8px;
    padding: 1.25rem;
    background: #fafafa;
    font-size: 0.8125rem;
  }

  .sidebar-heading {
    font-size: 0.6875rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #555;
    margin: 0 0 0.625rem;
  }

  .sidebar-desc {
    font-size: 0.78rem;
    color: #555;
    line-height: 1.5;
    margin: 0 0 1rem;
  }
  .sidebar-desc code {
    font-family: 'SF Mono', monospace;
    font-size: 0.72rem;
    background: #eee;
    padding: 0.1em 0.3em;
    border-radius: 3px;
  }

  .param-heading {
    font-size: 0.5625rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #888;
    margin: 0.875rem 0 0.375rem;
  }

  .param-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
  }
  .param-table tr { border-bottom: 1px solid #eee; }
  .param-table td {
    padding: 0.25rem 0;
    font-size: 0.78rem;
    vertical-align: top;
  }
  .param-table td:first-child {
    width: 40px;
    padding-right: 0.75rem;
    white-space: nowrap;
  }
  .param-table td:last-child { color: #666; }
  .param-table code {
    font-family: 'SF Mono', monospace;
    font-size: 0.68rem;
    font-weight: 600;
    background: none;
  }

  .current-id {
    font-family: 'SF Mono', monospace;
    font-size: 0.72rem;
    color: #333;
    background: #eee;
    padding: 0.3rem 0.6rem;
    border-radius: 4px;
    margin-bottom: 0.75rem;
  }

  .code-block {
    position: relative;
    border: 1px solid #ccc;
    border-radius: 5px;
    overflow: hidden;
    margin-bottom: 1rem;
  }
  .code-block pre {
    margin: 0;
    padding: 0.6rem 0.75rem;
    padding-right: 3.5rem;
    background: #1a1a1a;
    color: #d4d4d4;
    font-family: 'SF Mono', 'Fira Code', monospace;
    font-size: 0.625rem;
    line-height: 1.7;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .cp-btn {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    padding: 1px 0.5rem;
    font-size: 0.5625rem;
    font-family: 'SF Mono', monospace;
    border: 1px solid #555;
    background: #333;
    color: #ccc;
    border-radius: 3px;
    cursor: pointer;
  }
  .cp-btn:hover { background: #444; }
  .cp-btn.ok { background: #1a3a2a; border-color: #34a853; color: #34a853; }

  .sidebar-note {
    font-size: 0.72rem;
    color: #888;
    line-height: 1.5;
    margin: 0;
  }
  .sidebar-note code {
    font-family: 'SF Mono', monospace;
    font-size: 0.68rem;
  }
  .sidebar-note a { color: #555; }
  .sidebar-note a:hover { color: #111; }

  @media (max-width: 800px) {
    .main-area { grid-template-columns: 1fr; }
    .card-area { min-height: 300px; }
  }
</style>

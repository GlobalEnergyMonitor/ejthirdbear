<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { fetchCoalMineAsset } from '$lib/ownership-api';
  import type { CoalMineAsset } from '$lib/components/cards/coal-mine-types';
  import CoalMineCard from '$lib/components/cards/CoalMineCard.svelte';

  const MINE_PRESETS: { label: string; id: string }[] = [
    { label: 'M3239', id: 'M3239' },
    { label: 'M3990', id: 'M3990' },
    { label: 'M2406', id: 'M2406' },
    { label: 'M3968', id: 'M3968' },
    { label: 'M2922', id: 'M2922' },
    { label: 'M2504', id: 'M2504' },
    { label: 'M4305', id: 'M4305' },
    { label: 'M0988', id: 'M0988' },
    { label: 'M0885', id: 'M0885' },
    { label: 'M3947', id: 'M3947' },
    { label: 'M1324', id: 'M1324' },
    { label: 'M3599', id: 'M3599' },
    { label: 'M2720', id: 'M2720' },
    { label: 'M6492', id: 'M6492' },
    { label: 'M6746', id: 'M6746' },
    { label: 'M0612', id: 'M0612' },
    { label: 'M4240', id: 'M4240' },
    { label: 'M7152', id: 'M7152' },
    { label: 'M6488', id: 'M6488' },
    { label: 'M2089', id: 'M2089' },
  ];

  const urlId = $page.url.searchParams.get('id');
  const initialId = urlId?.trim() ?? (MINE_PRESETS[0]?.id ?? '');
  const isPreset = MINE_PRESETS.some((p) => p.id === initialId);

  let selectedPreset = $state(isPreset ? initialId : (MINE_PRESETS[0]?.id ?? ''));
  let useCustom = $state(!isPreset && !!urlId);
  let customId = $state(!isPreset && urlId ? urlId : '');
  let mineId = $derived(useCustom ? customId : selectedPreset);

  let asset = $state<CoalMineAsset | null>(null);
  let loading = $state(false);
  let error = $state('');

  let isEmbedded = $state(false);
  let copied = $state(false);
  let embedId = $state(initialId);

  function embedSnippet(id: string) {
    const p = `/embed/coal-mine?id=${id}`;
    return (
      `<div class="gem-embed" data-src="${p}" data-height="900">\n<script src="https://gem-viz.fly.dev/embed.js"><` +
      `/script>\n</div>`
    );
  }

  async function copy() {
    const text = embedSnippet(embedId);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const t = Object.assign(document.createElement('textarea'), { value: text });
      t.style.cssText = 'position:fixed;opacity:0';
      document.body.appendChild(t);
      t.select();
      document.execCommand('copy');
      t.remove();
    }
    copied = true;
    setTimeout(() => (copied = false), 2000);
  }

  async function load() {
    const id = mineId.trim();
    if (!id) return;
    loading = true;
    error = '';
    asset = null;
    try {
      asset = await fetchCoalMineAsset(id);
      embedId = id;
    } catch (e: unknown) {
      error = e instanceof Error ? e.message : 'Failed to load';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    isEmbedded = window.self !== window.top;
    if (mineId) load();
  });
</script>

<svelte:head>
  <title>Coal Mine Card — Test Harness</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="test-wrapper" class:embedded={isEmbedded}>
  <div class="controls">
    {#if MINE_PRESETS.length > 0}
      <div class="presets">
        {#each MINE_PRESETS as preset}
          <label class="preset-btn" class:active={!useCustom && selectedPreset === preset.id}>
            <input
              type="radio"
              name="preset"
              value={preset.id}
              checked={!useCustom && selectedPreset === preset.id}
              onchange={() => {
                selectedPreset = preset.id;
                useCustom = false;
                load();
              }}
            />
            <span class="preset-name">{preset.label}</span>
            <span class="preset-id">{preset.id}</span>
          </label>
        {/each}
      </div>
    {/if}

    <div class="custom-row">
      {#if MINE_PRESETS.length > 0}
        <label class="preset-btn custom-btn" class:active={useCustom}>
          <input
            type="radio"
            name="preset"
            checked={useCustom}
            onchange={() => { useCustom = true; }}
          />
          <span class="preset-name">Custom</span>
        </label>
      {/if}
      <input
        class="id-input"
        type="text"
        bind:value={customId}
        placeholder="Mine asset ID e.g. C100000100001"
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
      {:else if asset}
        <CoalMineCard {asset} open={true} />
      {:else if !mineId}
        <div class="status">Enter a mine asset ID above to load a card.</div>
      {/if}
    </div>

    {#if !isEmbedded}
      <div class="embed-sidebar">
        <h3 class="sidebar-heading">Embed Code</h3>
        <p class="sidebar-desc">
          Copy this snippet to embed the coal mine card on any page. The <code>id</code> sets the
          initially loaded mine.
        </p>

        <h4 class="param-heading">Parameters</h4>
        <table class="param-table">
          <tbody>
            <tr><td><code>id</code></td><td>Coal mine asset ID</td></tr>
          </tbody>
        </table>

        <h4 class="param-heading">Current ID</h4>
        <div class="current-id">{embedId || '—'}</div>

        <div class="code-block">
          <button class="cp-btn" class:ok={copied} onclick={copy}>
            {copied ? 'Copied' : 'Copy'}
          </button>
          <pre>{embedSnippet(embedId)}</pre>
        </div>

        <p class="sidebar-note">
          Embed script hosted at <code>gem-viz.fly.dev</code>. See the
          <a href="/embed">full widget catalog</a> for global options.
        </p>
      </div>
    {/if}
  </div>
</div>

<style>
  .test-wrapper {
    width: 100%;
    max-width: var(--container-lg);
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
  .preset-btn input[type='radio'] {
    display: none;
  }
  .preset-btn:hover {
    border-color: #999;
    background: #f0f0f0;
  }
  .preset-btn.active {
    border-color: #111;
    background: #111;
  }
  .preset-btn.active .preset-name,
  .preset-btn.active .preset-id {
    color: #fff;
  }

  .preset-name {
    font-size: 0.8rem;
    font-weight: 600;
    color: #111;
  }
  .preset-id {
    font-size: 0.68rem;
    color: #888;
    font-family: 'SF Mono', monospace;
  }

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
    width: 280px;
    outline: none;
  }
  .id-input:focus {
    border-color: #111;
  }

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
  .load-btn:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .load-btn:not(:disabled):hover {
    background: #333;
  }

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
    max-width: var(--container-md);
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
  .status.error {
    color: #b00;
  }

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
  .param-table tr {
    border-bottom: 1px solid #eee;
  }
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
  .param-table td:last-child {
    color: #666;
  }
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
  .cp-btn:hover {
    background: #444;
  }
  .cp-btn.ok {
    background: #1a3a2a;
    border-color: #34a853;
    color: #34a853;
  }

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
  .sidebar-note a {
    color: #555;
  }
  .sidebar-note a:hover {
    color: #111;
  }

  @media (max-width: 768px) {
    .main-area {
      grid-template-columns: 1fr;
    }
    .card-area {
      min-height: 300px;
    }
  }
</style>

<script>
  import { base } from '$app/paths';

  const widgets = [
    { name: 'Tracker Factsheet', slug: 'tracker-factsheet', desc: 'Two-column metadata explorer with field definitions.', key: 'tracker', val: 'coal-plant', h: 550,
      params: [{ k: 'tracker', d: 'coal-plant, gas-plant, steel-plant, etc.' }, { k: 'title', d: 'Title override' }, { k: 'height', d: 'Max height (default: 500)' }],
      samples: [
        { label: 'Coal Plant', val: 'coal-plant' },
        { label: 'Gas Plant', val: 'gas-plant' },
        { label: 'Steel Plant', val: 'steel-plant' },
        { label: 'Gas Pipeline', val: 'gas-pipeline' },
      ] },
    { name: 'Entity Card', slug: 'entity', desc: 'Entity profile with ownership flower and asset list.', key: 'id', val: 'E100001000558', h: 600,
      params: [{ k: 'id', d: 'Entity ID' }, { k: 'showFlower', d: 'Flower (default: true)' }, { k: 'showAssets', d: 'Asset list (default: true)' }, { k: 'showMap', d: 'Map (default: false)' }, { k: 'maxAssets', d: 'Max assets (default: 10)' }],
      samples: [
        { label: 'BlackRock', val: 'E100001000558' },
        { label: 'China Energy', val: 'E100000001926' },
        { label: 'Vanguard', val: 'E100001000562' },
      ] },
    { name: 'Asset Card', slug: 'asset', desc: 'Asset profile with status, metadata, and owners.', key: 'id', val: 'L100000104168_G100000100057', h: 500,
      params: [{ k: 'id', d: 'Asset ID / GEM unit ID' }, { k: 'showOwners', d: 'Owners list (default: true)' }, { k: 'showMap', d: 'Map (default: false)' }] },
    { name: 'Project Card', slug: 'project-card', desc: 'Tabbed asset detail with ownership tree and location map.', key: 'id', val: 'G100001000201', h: 700,
      params: [{ k: 'id', d: 'Asset ID / GEM unit ID' }, { k: 'showOwnership', d: 'Ownership tree (default: true)' }, { k: 'showMap', d: 'Map (default: true)' }],
      samples: [
        { label: 'Belchatow (Coal)', val: 'G100001000201' },
        { label: 'Datang Tuoketuo (Coal)', val: 'G100000102961' },
        { label: 'Surgutskaya GRES-2 (Gas)', val: 'G100001002347' },
        { label: 'ArcelorMittal Ghent (Steel)', val: 'G100001004521' },
      ] },
    { name: 'Coal Plant Card', slug: 'coal-plant', desc: 'Six-tab coal plant detail: overview, timeline, coal, emissions, ownership, additional.', key: 'id', val: 'G100000102961', h: 700,
      params: [{ k: 'id', d: 'G-prefix, compound L_G, or L-prefix ID' }],
      samples: [
        { label: 'Datang Tuoketuo', val: 'G100000102961' },
        { label: 'Belchatow', val: 'G100001000201' },
        { label: 'Kusile', val: 'G100001000489' },
      ] },
    { name: 'Ownership Flower', slug: 'ownership-flower', desc: 'Radial visualization of portfolio composition by tracker type.', key: 'entityId', val: 'E100000001926', h: 520,
      params: [{ k: 'entityId', d: 'Entity ID' }, { k: 'size', d: 'small / medium / large' }, { k: 'showLabels', d: 'Labels (default: true)' }, { k: 'showTitle', d: 'Title (default: true)' }],
      samples: [
        { label: 'China Energy', val: 'E100000001926' },
        { label: 'BlackRock', val: 'E100001000558' },
        { label: 'Vanguard', val: 'E100001000562' },
      ] },
    { name: 'Ownership Graph', slug: 'ownership-graph', desc: 'Interactive ownership hierarchy tree, upstream or downstream.', key: 'entityId', val: 'E100001000558', h: 600,
      params: [{ k: 'entityId', d: 'Entity ID' }, { k: 'direction', d: 'up (default) or down' }] },
    { name: 'Ultimate Owners', slug: 'ultimate-owners', desc: 'Terminal ancestors at the top of the ownership chain.', key: 'entityId', val: 'E100001000558', h: 400,
      params: [{ k: 'entityId', d: 'Entity ID' }] },
    { name: 'Network Graph', slug: 'network-3d', desc: 'Force-directed ownership network.', key: 'entityId', val: 'E100001000558', h: 600,
      params: [{ k: 'entityId', d: 'Entity ID' }, { k: 'height', d: 'Height in px (default: 500)' }, { k: 'maxHops', d: 'Max hops (default: 3)' }] },
    { name: 'Asset Ring', slug: 'asset-ring', desc: 'Circular distribution of assets by type and status.', key: 'entityId', val: 'E100000001926', h: 500,
      params: [{ k: 'entityId', d: 'Entity ID' }, { k: 'maxAssets', d: 'Max assets (default: 150)' }] },
    { name: 'Search', slug: 'asset-search', desc: 'Configurable search bar with asset, owner, and universal modes.', key: 'q', val: '', h: 140,
      params: [{ k: 'q', d: 'Initial query' }, { k: 'modes', d: 'asset, owner, universal' }, { k: 'mode', d: 'Default mode' }, { k: 'open', d: 'self or new-tab' }] },
  ];

  let copied = $state({});
  let selected = $state({});

  function activeVal(w) {
    return selected[w.slug] ?? w.val;
  }

  function src(w) { return `${base}/embed/${w.slug}?${w.key}=${activeVal(w)}`; }

  function snippet(w) {
    const p = `/embed/${w.slug}?${w.key}=${activeVal(w)}`;
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    return `<div class="gem-embed" data-src="${p}" data-height="${w.h}">\n<script src="${origin}/embed.js"><` + `/script>\n</div>`;
  }

  async function copy(text, key) {
    try { await navigator.clipboard.writeText(text); }
    catch { const t = Object.assign(document.createElement('textarea'), { value: text }); t.style.cssText = 'position:fixed;opacity:0'; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); }
    copied[key] = true;
    setTimeout(() => { copied[key] = false; }, 2000);
  }
</script>

<svelte:head>
  <title>Widget Specimens — Global Energy Monitor</title>
  <meta name="description" content="Embeddable widget catalog for Global Energy Monitor." />
</svelte:head>

<div class="specimens">
  <header>
    <div class="rule"></div>
    <h1>Widget Specimens</h1>
    <p>{widgets.length} embeddable components for integration into external sites</p>
    <div class="rule"></div>
  </header>

  <nav class="toc">
    <span class="toc-label">Contents</span>
    <div class="toc-list">
      {#each widgets as w, i}
        <a href="#{w.slug}">{String(i + 1).padStart(2, '0')} {w.name}</a>
      {/each}
    </div>
  </nav>

  {#each widgets as w, i}
    <section class="specimen" id={w.slug}>
      <div class="specimen-head">
        <span class="num">{String(i + 1).padStart(2, '0')}</span>
        <h2>{w.name}</h2>
        <code>/embed/{w.slug}</code>
      </div>

      <div class="specimen-body">
        <div class="preview">
          {#if w.samples}
            <div class="sample-picker">
              {#each w.samples as s}
                <button
                  class="sample-btn"
                  class:active={activeVal(w) === s.val}
                  onclick={() => { selected[w.slug] = s.val; }}
                >{s.label}</button>
              {/each}
            </div>
          {/if}
          <iframe
            src={src(w)}
            title={w.name}
            width="100%"
            height={w.h}
            frameborder="0"
            loading="lazy"
          ></iframe>
        </div>

        <div class="sidebar">
          <p class="desc">{w.desc}</p>

          <h3>Parameters</h3>
          <table class="meta-params">
            {#each w.params as p}
              <tr><td><code>{p.k}</code></td><td>{p.d}</td></tr>
            {/each}
          </table>

          <h3>Embed Code</h3>
          <div class="code-block">
            <button class="cp" class:ok={copied[w.slug]} onclick={() => copy(snippet(w), w.slug)}>
              {copied[w.slug] ? 'Copied' : 'Copy'}
            </button>
            <pre>{snippet(w)}</pre>
          </div>
        </div>
      </div>
    </section>
  {/each}

  <section class="appendix">
    <div class="rule"></div>
    <h2>Global Options</h2>
    <p class="appendix-note">Applied via <code>data-*</code> attributes on the embed container or as URL parameters.</p>
    <table class="options">
      <thead><tr><th>Attribute</th><th>URL Param</th><th>Description</th></tr></thead>
      <tbody>
        <tr><td><code>data-src</code></td><td></td><td>Embed path or full URL (required)</td></tr>
        <tr><td><code>data-height</code></td><td></td><td>Height in px (default: 600)</td></tr>
        <tr><td><code>data-theme</code></td><td><code>theme</code></td><td>"light" or "dark" (auto-detects from host page)</td></tr>
        <tr><td><code>data-branding</code></td><td><code>branding</code></td><td>"true" to show "Powered by GEM" footer</td></tr>
        <tr><td><code>data-link-base</code></td><td><code>linkBase</code></td><td>CMS link rewrite base. Internal links prefixed with this URL.</td></tr>
        <tr><td><code>data-link-target</code></td><td><code>linkTarget</code></td><td>Where rewritten links open: "_blank" (default), "_top", "_self"</td></tr>
        <tr><td><code>data-padding</code></td><td><code>padding</code></td><td>Container padding in px (default: 16)</td></tr>
        <tr><td><code>data-params</code></td><td></td><td>Extra params as querystring or JSON object</td></tr>
        <tr><td><code>data-mode</code></td><td></td><td>"iframe" (default) or "dynamic" (Shadow DOM, no iframe)</td></tr>
      </tbody>
    </table>
  </section>
</div>

<style>
  .specimens {
    width: 100%;
    max-width: 100%;
    padding: 3rem 3rem 6rem;
    font-family: var(--font-family);
    color: var(--color-text-primary);
  }

  /* ── Header ── */
  .rule { height: 1px; background: var(--color-text-primary); margin: 1rem 0; }

  header h1 {
    font-size: 1.75rem;
    font-weight: 300;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    margin: 1.5rem 0 0.5rem;
  }
  header p {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
  }

  /* ── TOC ── */
  .toc {
    margin-bottom: 4rem;
    border-top: 1px solid var(--color-border);
    padding-top: 0.75rem;
  }
  .toc-label {
    display: block;
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-tertiary);
    margin-bottom: 0.5rem;
  }
  .toc-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
  }
  .toc-list a {
    padding: 0.1875rem 1rem 0.1875rem 0;
    font-size: 0.75rem;
    font-family: var(--font-family-mono);
    color: var(--color-text-secondary);
    text-decoration: none;
    white-space: nowrap;
  }
  .toc-list a:hover { color: var(--color-text-primary); }

  /* ── Specimen ── */
  .specimen {
    margin-bottom: 4rem;
    scroll-margin-top: 2rem;
  }

  .specimen-head {
    display: flex;
    gap: 0.75rem;
    align-items: baseline;
    padding-bottom: 0.625rem;
    margin-bottom: 1rem;
    border-bottom: 1px solid var(--color-text-primary);
  }
  .num {
    font-family: var(--font-family-mono);
    font-size: 0.6875rem;
    color: var(--color-text-tertiary);
    flex-shrink: 0;
  }
  .specimen-head h2 {
    font-size: 1.125rem;
    font-weight: 500;
    margin: 0;
    flex: 1;
  }
  .specimen-head code {
    font-family: var(--font-family-mono);
    font-size: 0.625rem;
    color: var(--color-text-tertiary);
    background: none;
    padding: 0;
    flex-shrink: 0;
  }

  .specimen-body {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 1.5rem;
    align-items: start;
  }

  .desc {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
    line-height: 1.5;
  }

  /* ── Preview ── */
  .preview {
    border: 1px solid var(--color-border);
    background: var(--color-bg-secondary);
  }
  .preview iframe { display: block; border: none; }

  .sample-picker {
    display: flex;
    flex-wrap: wrap;
    gap: 0;
    border-bottom: 1px solid var(--color-border);
    padding: 0.25rem 0.5rem;
    background: var(--color-bg-primary);
  }
  .sample-btn {
    padding: 0.1875rem 0.625rem;
    font-size: 0.625rem;
    font-family: var(--font-family-mono);
    border: 1px solid transparent;
    background: none;
    color: var(--color-text-secondary);
    cursor: pointer;
    border-radius: 2px;
  }
  .sample-btn:hover { color: var(--color-text-primary); background: var(--color-bg-secondary); }
  .sample-btn.active {
    color: var(--color-text-primary);
    border-color: var(--color-border);
    background: var(--color-bg-secondary);
  }

  /* ── Sidebar ── */
  .sidebar h3 {
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-tertiary);
    margin: 1rem 0 0.375rem;
  }
  .sidebar h3:first-of-type { margin-top: 0; }

  .meta-params {
    width: 100%;
    border-collapse: collapse;
  }
  .meta-params tr { border-bottom: 1px solid var(--color-border-light); }
  .meta-params td {
    padding: 0.25rem 0;
    font-size: 0.8125rem;
    vertical-align: top;
  }
  .meta-params td:first-child {
    width: 90px;
    padding-right: 0.75rem;
    white-space: nowrap;
  }
  .meta-params td:last-child { color: var(--color-text-secondary); }
  .meta-params code {
    font-family: var(--font-family-mono);
    font-size: 0.6875rem;
    font-weight: 600;
    background: none;
    padding: 0;
  }

  .code-block {
    position: relative;
    border: 1px solid var(--color-border);
  }
  .code-block pre {
    margin: 0;
    padding: 0.5rem 0.75rem;
    padding-right: 3.5rem;
    background: var(--color-gray-900);
    color: var(--color-gray-200);
    font-family: var(--font-family-mono);
    font-size: 0.625rem;
    line-height: 1.7;
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-all;
  }
  .cp {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    padding: 1px 0.5rem;
    font-size: 0.5625rem;
    font-family: var(--font-family-mono);
    border: 1px solid var(--color-gray-700);
    background: var(--color-gray-800);
    color: var(--color-gray-300);
    cursor: pointer;
  }
  .cp:hover { background: var(--color-gray-700); }
  .cp.ok { background: #1a3a2a; border-color: #34a853; color: #34a853; }

  /* ── Appendix ── */
  .appendix { margin-top: 2rem; }
  .appendix h2 {
    font-size: 1.125rem;
    font-weight: 300;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    margin: 1.5rem 0 0.375rem;
  }
  .appendix-note {
    font-size: 0.8125rem;
    color: var(--color-text-secondary);
    margin: 0 0 1rem;
  }
  .appendix-note code { font-family: var(--font-family-mono); font-size: 0.6875rem; }

  .options {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.8125rem;
  }
  .options th {
    text-align: left;
    padding: 0.375rem 0.625rem;
    font-size: 0.5625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: var(--color-text-tertiary);
    border-bottom: 1px solid var(--color-text-primary);
  }
  .options td {
    padding: 0.375rem 0.625rem;
    border-bottom: 1px solid var(--color-border-light);
  }
  .options code {
    font-family: var(--font-family-mono);
    font-size: 0.6875rem;
    font-weight: 500;
  }

  @media (max-width: 900px) {
    .specimens { padding: 2rem 1rem 4rem; }
    .specimen-body { grid-template-columns: 1fr; }
    header h1 { font-size: 1.25rem; }
  }
</style>

<script>
  /**
   * Embed Index
   * Interactive code generator for embeddable widgets with copy-to-clipboard.
   */
  import { base } from '$app/paths';

  /** Widget definitions */
  const widgets = [
    {
      name: 'Entity Card',
      slug: 'entity',
      description: 'Compact entity profile with ownership flower and asset list.',
      paramKey: 'id',
      paramLabel: 'Entity ID',
      placeholder: 'E100001000558',
      defaultHeight: 600,
      params: [
        { key: 'id', desc: 'Required. Entity ID (e.g., E12345).' },
        { key: 'showFlower', desc: 'Optional. Show ownership flower (default: true).' },
        { key: 'showAssets', desc: 'Optional. Show asset list (default: true).' },
        { key: 'showMap', desc: 'Optional. Show interactive asset location map (default: false).' },
        { key: 'maxAssets', desc: 'Optional. Max assets to display (default: 10).' },
      ],
    },
    {
      name: 'Asset Card',
      slug: 'asset',
      description: 'Compact asset profile with status, metadata, and owners.',
      paramKey: 'id',
      paramLabel: 'Asset ID',
      placeholder: 'L100000104168_G100000100057',
      defaultHeight: 500,
      params: [
        { key: 'id', desc: 'Required. Asset ID / GEM unit ID (e.g., G12345).' },
        { key: 'showOwners', desc: 'Optional. Show owners list (default: true).' },
        { key: 'showMap', desc: 'Optional. Show location map (default: false).' },
      ],
    },
    {
      name: 'Asset/Owner Search',
      slug: 'asset-search',
      description:
        'Configurable URL-based search bar with asset, owner, and universal modes for CMS embeds.',
      paramKey: 'q',
      paramLabel: 'Initial query',
      placeholder: 'G100000100057',
      defaultHeight: 140,
      params: [
        { key: 'q', desc: 'Optional. Initial query value shown in the search input.' },
        {
          key: 'modes',
          desc: 'Optional. Comma-separated modes: asset, owner, universal (default: all three).',
        },
        {
          key: 'mode',
          desc: 'Optional. Default active mode (asset, owner, or universal).',
        },
        {
          key: 'open',
          desc: 'Optional. "self" (default) or "new-tab" for where results open.',
        },
        { key: 'showButton', desc: 'Optional. "false" to hide the submit button.' },
      ],
    },
    {
      name: 'Tracker Factsheet',
      slug: 'tracker-factsheet',
      description: 'Two-column metadata explorer with field definitions and value distributions.',
      paramKey: 'tracker',
      paramLabel: 'Tracker slug',
      placeholder: 'coal-plant',
      defaultHeight: 550,
      params: [
        {
          key: 'tracker',
          desc: 'Required. Tracker slug: coal-mine, coal-plant, gas-plant, steel-plant, iron-mine, gas-pipeline, bioenergy',
        },
        { key: 'title', desc: 'Optional. Custom title override.' },
        { key: 'height', desc: 'Optional. Max height in pixels (default: 500).' },
      ],
    },
    {
      name: 'Ownership Flower',
      slug: 'ownership-flower',
      description: "Radial visualization showing an entity's portfolio mix by tracker type.",
      paramKey: 'entityId',
      paramLabel: 'Entity ID',
      placeholder: 'E100000001926',
      defaultHeight: 520,
      params: [
        { key: 'entityId', desc: 'Required. The entity ID to display.' },
        { key: 'size', desc: 'Optional. "small", "medium" (default), or "large".' },
        { key: 'showLabels', desc: 'Optional. "true" (default) or "false".' },
        { key: 'showTitle', desc: 'Optional. "true" (default) or "false".' },
      ],
    },
    {
      name: 'Ownership Graph',
      slug: 'ownership-graph',
      description:
        'Interactive ownership hierarchy graph showing upstream or downstream relationships.',
      paramKey: 'entityId',
      paramLabel: 'Entity ID',
      placeholder: 'E100001000558',
      defaultHeight: 600,
      params: [
        { key: 'entityId', desc: 'Required. The entity ID to display.' },
        {
          key: 'direction',
          desc: 'Optional. "up" (who owns this entity) or "down" (what this entity owns). Default: "up".',
        },
      ],
    },
    {
      name: 'Ultimate Owners',
      slug: 'ultimate-owners',
      description: 'Shows the ultimate parent owners at the top of the ownership chain.',
      paramKey: 'entityId',
      paramLabel: 'Entity ID',
      placeholder: 'E100001000558',
      defaultHeight: 400,
      params: [{ key: 'entityId', desc: 'Required. The entity ID to display.' }],
    },
    {
      name: 'Network Graph',
      slug: 'network-3d',
      description: 'Interactive force-directed ownership network visualization.',
      paramKey: 'entityId',
      paramLabel: 'Entity ID',
      placeholder: 'E100001000558',
      defaultHeight: 600,
      params: [
        { key: 'entityId', desc: 'Required. The entity ID to display.' },
        { key: 'height', desc: 'Optional. Height in pixels (default: 500).' },
        { key: 'maxHops', desc: 'Optional. Maximum relationship hops to show (default: 3).' },
      ],
    },
    {
      name: 'Asset Ring',
      slug: 'asset-ring',
      description: 'Circular visualization of asset distribution by type and status.',
      paramKey: 'entityId',
      paramLabel: 'Entity ID',
      placeholder: 'E100000001926',
      defaultHeight: 500,
      params: [
        { key: 'entityId', desc: 'Required. The entity ID to display.' },
        { key: 'maxAssets', desc: 'Optional. Maximum assets to display (default: 150).' },
      ],
    },
  ];

  // Per-widget input state
  let inputValues = $state(Object.fromEntries(widgets.map((w) => [w.slug, ''])));
  let copiedStates = $state(
    Object.fromEntries(widgets.map((w) => [`${w.slug}-iframe`, false, `${w.slug}-script`, false]))
  );

  function getEmbedPath(widget) {
    const val = inputValues[widget.slug] || widget.placeholder;
    return `${base}/embed/${widget.slug}?${widget.paramKey}=${val}`;
  }

  function getIframeSnippet(widget) {
    const val = inputValues[widget.slug] || widget.placeholder;
    const path = `/embed/${widget.slug}?${widget.paramKey}=${val}`;
    return `<iframe\n  src="${path}"\n  width="100%"\n  height="${widget.defaultHeight}"\n  frameborder="0"\n></iframe>`;
  }

  function getScriptSnippet(widget) {
    const val = inputValues[widget.slug] || widget.placeholder;
    const path = `/embed/${widget.slug}?${widget.paramKey}=${val}`;
    // Build closing tag via concatenation to avoid ending this Svelte <script> block.
    return (
      `<div class="gem-embed" data-src="${path}" data-height="${widget.defaultHeight}">\n<script src="/embed.js"><` +
      `/script>\n</div>`
    );
  }

  async function copyToClipboard(text, key) {
    try {
      await navigator.clipboard.writeText(text);
      copiedStates[key] = true;
      setTimeout(() => {
        copiedStates[key] = false;
      }, 2000);
    } catch {
      // Fallback for older browsers
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      copiedStates[key] = true;
      setTimeout(() => {
        copiedStates[key] = false;
      }, 2000);
    }
  }
</script>

<svelte:head>
  <title>Embeddable Widgets — Global Energy Monitor</title>
  <meta
    name="description"
    content="Embed interactive ownership visualizations from Global Energy Monitor on your website or in reports."
  />
</svelte:head>

<div class="embed-index">
  <h1>Embeddable Widgets</h1>
  <p class="lead">Standalone visualizations for embedding in external sites via iframe.</p>

  <section class="widget-list">
    {#each widgets as widget}
      <article class="widget-card">
        <h2>{widget.name}</h2>
        <p>{widget.description}</p>

        <div class="preview-frame">
          <iframe
            src={getEmbedPath(widget)}
            title="{widget.name} preview"
            width="100%"
            height={widget.defaultHeight}
            frameborder="0"
            loading="lazy"
          ></iframe>
        </div>

        <details class="params-section">
          <summary>Parameters</summary>
          <dl>
            {#each widget.params as param}
              <dt>{param.key}</dt>
              <dd>{param.desc}</dd>
            {/each}
          </dl>
        </details>

        <details class="code-gen">
          <summary>Generate embed code</summary>
          <div class="code-gen-body">
            <label class="id-input-label">
              <span>{widget.paramLabel}</span>
              <input
                type="text"
                bind:value={inputValues[widget.slug]}
                placeholder={widget.placeholder}
              />
            </label>

            <div class="snippet-block">
              <div class="snippet-header">
                <span class="snippet-label">iframe</span>
                <button
                  class="copy-btn"
                  class:copied={copiedStates[`${widget.slug}-iframe`]}
                  onclick={() => copyToClipboard(getIframeSnippet(widget), `${widget.slug}-iframe`)}
                >
                  {copiedStates[`${widget.slug}-iframe`] ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre><code>{getIframeSnippet(widget)}</code></pre>
            </div>

            <div class="snippet-block">
              <div class="snippet-header">
                <span class="snippet-label">embed.js</span>
                <button
                  class="copy-btn"
                  class:copied={copiedStates[`${widget.slug}-script`]}
                  onclick={() => copyToClipboard(getScriptSnippet(widget), `${widget.slug}-script`)}
                >
                  {copiedStates[`${widget.slug}-script`] ? 'Copied' : 'Copy'}
                </button>
              </div>
              <pre><code>{getScriptSnippet(widget)}</code></pre>
            </div>

            <a href={getEmbedPath(widget)} target="_blank" rel="noopener" class="try-btn">
              Try it
            </a>
          </div>
        </details>
      </article>
    {/each}
  </section>

  <section class="usage">
    <h2>Usage</h2>
    <p>Embed any widget using an iframe:</p>
    <pre><code
        >&lt;iframe
  src="/embed/tracker-factsheet?tracker=coal-mine"
  width="900"
  height="550"
  frameborder="0"
&gt;&lt;/iframe&gt;</code
      ></pre>

    <p>Or use the embed script for CMS-friendly snippets:</p>
    <pre><code
        >&lt;div class="gem-embed" data-src="/embed/ownership-flower?entityId=E12345" data-height="520"&gt;
&lt;script src="/embed.js"&gt;&lt;/script&gt;
&lt;/div&gt;</code
      ></pre>

    <h3>Script Attributes</h3>
    <dl>
      <dt>data-src</dt>
      <dd>Required. Embed path or full URL (e.g., /embed/entity?id=E12345).</dd>
      <dt>data-height</dt>
      <dd>Optional. Initial iframe height in pixels (default: 600).</dd>
      <dt>data-width</dt>
      <dd>Optional. Width (default: 100%).</dd>
      <dt>data-title</dt>
      <dd>Optional. Iframe title for accessibility.</dd>
      <dt>data-autoheight</dt>
      <dd>Optional. "false" to disable auto-resizing (default: true).</dd>
      <dt>data-theme</dt>
      <dd>Optional. "light" or "dark" (passed to embed as ?theme=...).</dd>
      <dt>data-padding</dt>
      <dd>Optional. Padding in pixels (passed to embed as ?padding=...).</dd>
      <dt>data-branding</dt>
      <dd>Optional. "true" to show "Powered by GEM" footer.</dd>
      <dt>data-params</dt>
      <dd>
        Optional. Extra params as querystring or JSON (e.g., "showMap=true" or {'{"showMap":true}'}).
      </dd>
      <dt>data-allow</dt>
      <dd>Optional. Sets iframe allow attribute (e.g., "fullscreen").</dd>
      <dt>data-sandbox</dt>
      <dd>Optional. Sets iframe sandbox attribute.</dd>
    </dl>

    <h3>Common Parameters</h3>
    <dl>
      <dt>theme</dt>
      <dd>"light" (default) or "dark"</dd>
      <dt>padding</dt>
      <dd>Container padding in pixels (default: 16)</dd>
      <dt>branding</dt>
      <dd>"true" to show "Powered by Global Energy Monitor" footer</dd>
    </dl>
  </section>
</div>

<style>
  .embed-index {
    max-width: 800px;
    width: 100%;
    padding: var(--space-8);
    font-family: var(--font-family);
  }

  h1 {
    font-size: var(--font-size-2xl);
    margin: 0 0 var(--space-2) 0;
  }

  .lead {
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-8) 0;
  }

  .widget-list {
    display: flex;
    flex-direction: column;
    gap: var(--space-6);
    margin-bottom: var(--space-8);
  }

  .widget-card {
    padding: var(--space-5);
    border: var(--border-width) solid var(--color-border-dark);
    background: var(--color-bg-primary);
  }

  .widget-card h2 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-2) 0;
  }

  .widget-card p {
    color: var(--color-text-secondary);
    margin: 0 0 var(--space-3) 0;
  }

  .preview-frame {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-bg-secondary);
    margin-bottom: var(--space-4);
    overflow: hidden;
  }

  .preview-frame iframe {
    display: block;
    border: none;
  }

  .params-section {
    margin-bottom: var(--space-2);
    border: var(--border-width) solid var(--color-border);
  }

  .params-section summary {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    background: var(--color-bg-tertiary);
    user-select: none;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
  }

  .params-section summary:hover {
    background: var(--color-bg-secondary);
  }

  .params-section dl {
    padding: var(--space-3);
  }

  dl {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-1) var(--space-4);
    font-size: var(--font-size-body);
  }

  dt {
    font-family: var(--font-family-mono);
    font-weight: 600;
  }

  dd {
    margin: 0;
    color: var(--color-text-secondary);
  }

  /* ── Code generator ── */
  .code-gen {
    margin-top: var(--space-4);
    border: var(--border-width) solid var(--color-border);
  }

  .code-gen summary {
    padding: var(--space-2) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    cursor: pointer;
    background: var(--color-bg-tertiary);
    user-select: none;
  }

  .code-gen summary:hover {
    background: var(--color-bg-secondary);
  }

  .code-gen-body {
    padding: var(--space-3);
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .id-input-label {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    font-size: var(--font-size-sm);
    font-weight: 600;
  }

  .id-input-label input {
    flex: 1;
    padding: var(--space-1) var(--space-2);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    border: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
  }

  .snippet-block {
    border: var(--border-width) solid var(--color-border);
  }

  .snippet-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-1) var(--space-2);
    background: var(--color-bg-tertiary);
    border-bottom: var(--border-width) solid var(--color-border);
  }

  .snippet-label {
    font-size: var(--font-size-xs);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
  }

  .copy-btn {
    padding: 2px 8px;
    font-size: var(--font-size-xs);
    font-family: var(--font-family-mono);
    border: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .copy-btn:hover {
    background: var(--color-bg-secondary);
  }

  .copy-btn.copied {
    background: var(--color-success-light, #e6f4ea);
    border-color: var(--color-success, #34a853);
    color: var(--color-success, #34a853);
  }

  .snippet-block pre {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    background: var(--color-gray-900);
    color: var(--color-gray-100);
    overflow-x: auto;
  }

  .snippet-block code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-xs);
    background: none;
    padding: 0;
  }

  .try-btn {
    display: inline-block;
    align-self: flex-start;
    padding: var(--space-1) var(--space-3);
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-decoration: none;
    color: var(--color-bg-primary);
    background: var(--color-text-primary);
    border: none;
    transition: opacity var(--transition-fast);
  }

  .try-btn:hover {
    opacity: 0.85;
  }

  /* ── Usage section ── */
  .usage h2 {
    font-size: var(--font-size-lg);
    margin: 0 0 var(--space-3) 0;
  }

  .usage h3 {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: var(--space-5) 0 var(--space-2) 0;
  }

  pre {
    padding: var(--space-4);
    background: var(--color-gray-900);
    color: var(--color-gray-100);
    overflow-x: auto;
  }

  pre code {
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    background: none;
    padding: 0;
  }
</style>

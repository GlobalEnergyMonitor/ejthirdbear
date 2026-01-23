<script>
  /**
   * Embed Index
   * Lists available embeddable widgets with usage examples
   */
  import { base } from '$app/paths';
</script>

<svelte:head>
  <title>Embeddable Widgets | GEM Viz</title>
</svelte:head>

<div class="embed-index">
  <h1>Embeddable Widgets</h1>
  <p class="lead">Standalone visualizations for embedding in external sites via iframe.</p>

  <section class="widget-list">
    <article class="widget-card">
      <h2>Entity Card</h2>
      <p>Compact entity profile with ownership flower and asset list.</p>
      <code class="example-url">{base}/embed/entity?id=E12345</code>
      <h3>Parameters</h3>
      <dl>
        <dt>id</dt>
        <dd>Required. Entity ID (e.g., E12345).</dd>
        <dt>showFlower</dt>
        <dd>Optional. Show ownership flower (default: true).</dd>
        <dt>showAssets</dt>
        <dd>Optional. Show asset list (default: true).</dd>
        <dt>maxAssets</dt>
        <dd>Optional. Max assets to display (default: 10).</dd>
      </dl>
    </article>

    <article class="widget-card">
      <h2>Asset Card</h2>
      <p>Compact asset profile with status, metadata, and owners.</p>
      <code class="example-url">{base}/embed/asset?id=G12345</code>
      <h3>Parameters</h3>
      <dl>
        <dt>id</dt>
        <dd>Required. Asset ID / GEM unit ID (e.g., G12345).</dd>
        <dt>showOwners</dt>
        <dd>Optional. Show owners list (default: true).</dd>
        <dt>showMap</dt>
        <dd>Optional. Show location map (default: false).</dd>
      </dl>
    </article>

    <article class="widget-card">
      <h2>Tracker Factsheet</h2>
      <p>Two-column metadata explorer. Click field categories on the left to see definitions and value distributions on the right.</p>
      <code class="example-url">{base}/embed/tracker-factsheet?tracker=coal-mine</code>
      <h3>Parameters</h3>
      <dl>
        <dt>tracker</dt>
        <dd>Required. Tracker slug: coal-mine, coal-plant, gas-plant, steel-plant, iron-mine, gas-pipeline, bioenergy</dd>
        <dt>title</dt>
        <dd>Optional. Custom title override.</dd>
        <dt>height</dt>
        <dd>Optional. Max height in pixels (default: 500).</dd>
      </dl>
    </article>

    <article class="widget-card">
      <h2>Ownership Flower</h2>
      <p>Radial visualization showing an entity's portfolio mix by tracker type.</p>
      <code class="example-url">{base}/embed/ownership-flower?entityId=E12345</code>
      <h3>Parameters</h3>
      <dl>
        <dt>entityId</dt>
        <dd>Required. The entity ID to display.</dd>
        <dt>size</dt>
        <dd>Optional. "small", "medium" (default), or "large".</dd>
        <dt>showLabels</dt>
        <dd>Optional. "true" (default) or "false".</dd>
        <dt>showTitle</dt>
        <dd>Optional. "true" (default) or "false".</dd>
      </dl>
    </article>
  </section>

  <section class="usage">
    <h2>Usage</h2>
    <p>Embed any widget using an iframe:</p>
    <pre><code>&lt;iframe
  src="{base}/embed/tracker-factsheet?tracker=coal-mine"
  width="900"
  height="550"
  frameborder="0"
&gt;&lt;/iframe&gt;</code></pre>

    <h3>Common Parameters</h3>
    <dl>
      <dt>theme</dt>
      <dd>"light" (default) or "dark"</dd>
      <dt>padding</dt>
      <dd>Container padding in pixels (default: 16)</dd>
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

  .widget-card h3 {
    font-size: var(--font-size-sm);
    text-transform: uppercase;
    letter-spacing: var(--tracking-caps);
    color: var(--color-text-tertiary);
    margin: var(--space-4) 0 var(--space-2) 0;
  }

  .example-url {
    display: block;
    padding: var(--space-2) var(--space-3);
    background: var(--color-bg-tertiary);
    font-family: var(--font-family-mono);
    font-size: var(--font-size-sm);
    word-break: break-all;
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

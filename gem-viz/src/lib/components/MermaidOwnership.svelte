<script>
  /**
   * MermaidOwnership - Auto-generated ownership flow diagram
   * Ported from Observable notebook mermaid pattern
   * Props-only component - expects data from parent
   */
  import { onMount, tick } from 'svelte';
  import { goto } from '$app/navigation';
  import { assetLink, entityLink } from '$lib/links';
  import { colors } from '$lib/ownership-theme';

  let {
    edges = [],
    nodeMap = new Map(),
    assetId = '',
    assetName = '',
    zoom = 0.6,
    direction = 'TD',
  } = $props();

  const MIN_HEIGHT = 380;

  let mermaidSvg = $state('');
  let loading = $state(true);
  let error = $state(null);
  let containerEl;
  let containerWidth = $state(0);

  const diagramHeight = $derived(Math.max(MIN_HEIGHT, containerWidth * 0.4));

  function generateMermaidSyntax() {
    if (!edges.length) return '';
    const sanitize = (s) => s.replace(/[()[\]{}]/g, '').replace(/"/g, "'");
    const seen = new Set();
    const uniqueEdges = edges.filter((e) => {
      const key = `${e.source}->${e.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const fullNodeMap = new Map(nodeMap);
    if (assetId && assetName) fullNodeMap.set(assetId, { Name: assetName });

    const lines = uniqueEdges.map((e, i) => {
      const sourceName = fullNodeMap.get(e.source)?.Name || e.source;
      const targetName = fullNodeMap.get(e.target)?.Name || e.target;
      const specialNames = ['small shareholder(s)', 'natural person(s)'];
      const sourceId = specialNames.includes(sourceName.toLowerCase())
        ? `${e.source}_${i}`
        : e.source.replace(/[^a-zA-Z0-9]/g, '_');
      const targetId = e.target.replace(/[^a-zA-Z0-9]/g, '_');
      const pctLabel = e.value ? `|${e.value.toFixed(1)}%|` : '';
      return `  ${sourceId}["${sanitize(sourceName)}"] -->${pctLabel} ${targetId}["${sanitize(targetName)}"]`;
    });

    return `graph ${direction};\n${lines.join('\n')}`;
  }

  async function renderMermaid() {
    if (typeof window === 'undefined') return;
    loading = true;
    error = null;

    try {
      const mermaid = (await import('mermaid')).default;
      mermaid.initialize({
        startOnLoad: false,
        theme: 'base',
        themeVariables: {
          primaryColor: colors.navy,
          primaryTextColor: '#fff',
          primaryBorderColor: colors.navy,
          lineColor: colors.navy,
          secondaryColor: colors.warmWhite,
          tertiaryColor: colors.mint,
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif',
          fontSize: '12px',
        },
        flowchart: { curve: 'basis', padding: 15, nodeSpacing: 50, rankSpacing: 50 },
      });

      const syntax = generateMermaidSyntax();
      if (!syntax) {
        mermaidSvg = '';
        loading = false;
        return;
      }

      const { svg } = await mermaid.render('mermaid-ownership', syntax);
      mermaidSvg = svg;

      // After svelte updates the DOM, attach click handlers to nodes
      await tick();
      attachNodeClickHandlers();
    } catch (err) {
      console.error('Mermaid render error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Build a reverse lookup map from sanitized IDs to original IDs
  function buildIdLookup() {
    const lookup = new Map();
    const sanitize = (id) => id.replace(/[^a-zA-Z0-9]/g, '_');

    // Add all edges' source and target IDs
    edges.forEach((e, i) => {
      const sourceName = nodeMap.get(e.source)?.Name || e.source;
      const specialNames = ['small shareholder(s)', 'natural person(s)'];
      const sourceId = specialNames.includes(sourceName.toLowerCase())
        ? `${e.source}_${i}`
        : sanitize(e.source);
      const targetId = sanitize(e.target);

      lookup.set(sourceId, e.source);
      lookup.set(targetId, e.target);
    });

    // Add asset ID
    if (assetId) {
      lookup.set(sanitize(assetId), assetId);
    }

    return lookup;
  }

  function attachNodeClickHandlers() {
    if (!containerEl) return;

    const svgEl = containerEl.querySelector('svg');
    if (!svgEl) return;

    const idLookup = buildIdLookup();
    const nodes = svgEl.querySelectorAll('.node');

    nodes.forEach((node) => {
      // Mermaid node IDs are like "flowchart-E100001000348-0" or just the sanitized ID
      const nodeId = node.id || '';

      // Extract the original ID - try different patterns
      let originalId = null;

      // Pattern: flowchart-{sanitizedId}-{number}
      const flowchartMatch = nodeId.match(/^flowchart-(.+?)-\d+$/);
      if (flowchartMatch) {
        originalId = idLookup.get(flowchartMatch[1]);
      }

      // If no match, try direct lookup
      if (!originalId) {
        for (const [sanitized, original] of idLookup) {
          if (nodeId.includes(sanitized)) {
            originalId = original;
            break;
          }
        }
      }

      if (originalId) {
        node.style.cursor = 'pointer';
        node.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();

          const isAsset = originalId.startsWith('G');
          const link = isAsset ? assetLink(originalId) : entityLink(originalId);
          goto(link);
        });
      }
    });
  }

  function trackSize() {
    if (typeof ResizeObserver === 'undefined' || !containerEl) return;
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries?.[0];
      if (!entry) return;
      const nextWidth = entry.contentRect?.width ?? 0;
      if (Math.abs(nextWidth - containerWidth) > 1) {
        containerWidth = nextWidth;
      }
    });
    resizeObserver.observe(containerEl);
    return () => resizeObserver.disconnect();
  }

  onMount(() => {
    const cleanup = trackSize();
    renderMermaid();
    return cleanup;
  });

  let transform = $derived(`scale(${zoom})`);
</script>

<div class="mermaid-ownership" bind:this={containerEl}>
  {#if loading}
    <div class="status"><p>Generating diagram...</p></div>
  {:else if error}
    <div class="status error">
      <p>Error: {error}</p>
      <details>
        <summary>Mermaid syntax</summary>
        <pre>{generateMermaidSyntax()}</pre>
      </details>
    </div>
  {:else if mermaidSvg}
    <div class="controls">
      <label
        >Zoom: <input type="range" min="0.2" max="2" step="0.1" bind:value={zoom} />
        <span>{(zoom * 100).toFixed(0)}%</span></label
      >
    </div>
    <div class="diagram-container">
      <div class="diagram" style="transform: {transform}; transform-origin: top left;">
        {@html mermaidSvg}
      </div>
    </div>
  {:else}
    <div class="status"><p>No ownership data to display</p></div>
  {/if}
</div>

<style>
  .mermaid-ownership {
    border: none;
    background: transparent;
    min-height: 240px;
    width: 100%;
  }
  .controls {
    padding: 10px;
    border-bottom: 1px solid #ddd;
    background: #fff;
    font-size: 11px;
    display: flex;
    gap: 10px;
    align-items: center;
  }
  .controls label {
    display: flex;
    align-items: center;
    gap: 8px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }
  .controls input[type='range'] {
    width: 100px;
  }
  .diagram-container {
    padding: 20px;
    max-height: 720px;
    overflow: auto;
    width: 100%;
    min-height: 380px;
  }
  .diagram {
    display: block;
    width: 100%;
  }
  .diagram :global(svg) {
    width: 100% !important;
    height: auto !important;
    max-width: none !important;
    display: block;
  }
  .diagram :global(.node rect),
  .diagram :global(.node polygon) {
    fill: var(--navy, #333) !important;
    stroke: var(--navy, #333) !important;
  }
  .diagram :global(.edgeLabel) {
    background-color: #fff !important;
    font-size: 10px !important;
  }
  .status {
    padding: 40px;
    text-align: center;
  }
  .status p {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: #666;
  }
  .status.error {
    color: red;
  }
  .status.error pre {
    text-align: left;
    font-size: 10px;
    background: transparent;
    padding: 10px;
    overflow: auto;
    max-height: 200px;
  }
</style>

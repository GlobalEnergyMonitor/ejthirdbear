<script>
  /**
   * MermaidOwnership - Auto-generated ownership flow diagram
   * Ported from Observable notebook mermaid pattern
   * Props-only component - expects data from parent
   */
  import { onMount } from 'svelte';
  import { colors } from '$lib/ownership-theme';

  let {
    edges = [],
    nodeMap = new Map(),
    assetId = '',
    assetName = '',
    zoom = 0.6,
    direction = 'TD'
  } = $props();

  let mermaidSvg = $state('');
  let loading = $state(true);
  let error = $state(null);

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
      const sourceId = specialNames.includes(sourceName.toLowerCase()) ? `${e.source}_${i}` : e.source.replace(/[^a-zA-Z0-9]/g, '_');
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
          primaryColor: colors.navy, primaryTextColor: '#fff', primaryBorderColor: colors.navy,
          lineColor: colors.navy, secondaryColor: colors.warmWhite, tertiaryColor: colors.mint,
          fontFamily: '"Plus Jakarta Sans", system-ui, sans-serif', fontSize: '12px',
        },
        flowchart: { curve: 'basis', padding: 15, nodeSpacing: 50, rankSpacing: 50 },
      });

      const syntax = generateMermaidSyntax();
      if (!syntax) { mermaidSvg = ''; loading = false; return; }

      const { svg } = await mermaid.render('mermaid-ownership', syntax);
      mermaidSvg = svg;
    } catch (err) {
      console.error('Mermaid render error:', err);
      error = err.message;
    } finally {
      loading = false;
    }
  }

  onMount(() => renderMermaid());

  let transform = $derived(`scale(${zoom})`);
</script>

<div class="mermaid-ownership">
  {#if loading}
    <div class="status"><p>Generating diagram...</p></div>
  {:else if error}
    <div class="status error">
      <p>Error: {error}</p>
      <details><summary>Mermaid syntax</summary><pre>{generateMermaidSyntax()}</pre></details>
    </div>
  {:else if mermaidSvg}
    <div class="controls">
      <label>Zoom: <input type="range" min="0.2" max="2" step="0.1" bind:value={zoom} /> <span>{(zoom * 100).toFixed(0)}%</span></label>
    </div>
    <div class="diagram-container">
      <div class="diagram" style="transform: {transform}; transform-origin: top left;">{@html mermaidSvg}</div>
    </div>
  {:else}
    <div class="status"><p>No ownership data to display</p></div>
  {/if}
</div>

<style>
  .mermaid-ownership { border: 1px solid #000; background: #fafafa; min-height: 200px; }
  .controls { padding: 10px; border-bottom: 1px solid #ddd; background: #fff; font-size: 11px; display: flex; gap: 10px; align-items: center; }
  .controls label { display: flex; align-items: center; gap: 8px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
  .controls input[type='range'] { width: 100px; }
  .diagram-container { padding: 20px; max-height: 600px; overflow: auto; }
  .diagram { display: inline-block; }
  .diagram :global(svg) { max-width: none !important; }
  .diagram :global(.node rect), .diagram :global(.node polygon) { fill: var(--navy, #004a63) !important; stroke: var(--navy, #004a63) !important; }
  .diagram :global(.edgeLabel) { background-color: #fff !important; font-size: 10px !important; }
  .status { padding: 40px; text-align: center; }
  .status p { font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; color: #666; }
  .status.error { color: red; }
  .status.error pre { text-align: left; font-size: 10px; background: #f5f5f5; padding: 10px; overflow: auto; max-height: 200px; }
</style>

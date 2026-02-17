<script lang="ts">
  /**
   * OwnershipMiniTree - Compact ownership tree for screener results
   * Shows: Entity → Intermediaries → Assets
   * Horizontal layout optimized for inline display in tables
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import * as d3 from 'd3';
  import type {
    GraphNode, GraphEdge, LayoutPoint, MiniLayoutNode, LayoutEdge,
    OwnershipGraphAPIResponse, RawOwnershipAPINode, RawOwnershipAPIEdge, DagreEdge,
  } from '$lib/component-data/graph-types';

  interface Props {
    entityId: string;
    entityName: string;
    assetFilter?: {
      tracker?: string;
      status?: string;
      country?: string;
    };
  }

  let { entityId, entityName, assetFilter = {} }: Props = $props();

  // Colors from Observable
  const colors = {
    navy: '#1a3a4a',
    teal: '#2a7f8f',
    mint: '#97E6DE',
    warmWhite: '#fafaf7',
    nodeFill: '#cce1e6',
    edge: '#9fc6d0',
    assetFill: '#e8f4f4',
  };

  // State
  let loading = $state(true);
  let error = $state<string | null>(null);
  let graphData = $state<{ nodes: GraphNode[]; edges: GraphEdge[] } | null>(null);
  let dagre: typeof import('dagre') | null = null;

  // Layout results
  let layoutNodes = $state<MiniLayoutNode[]>([]);
  let layoutEdges = $state<LayoutEdge[]>([]);
  let gWidth = $state(600);
  let gHeight = $state(200);

  // Fetch ownership data for this entity
  async function fetchOwnershipGraph() {
    try {
      // Fetch entity's owned assets/subsidiaries
      const cleanId = entityId.startsWith('E') ? entityId.slice(1) : entityId;
      const res = await fetch(
        `https://gem-api.thirdbear.net/ownership/graph?root=E${cleanId}&direction=down&max_depth=4`
      );
      if (!res.ok) throw new Error(`API error: ${res.status}`);
      const data: OwnershipGraphAPIResponse = await res.json();

      // Process nodes
      const nodes: GraphNode[] = (data.nodes || []).map((n: RawOwnershipAPINode) => ({
        id: n.entity_id || n.asset_id || n.id || '',
        name: n.name || n.asset_name || n.full_name || '',
        type: n.node_type || (n.asset_id ? 'asset' : 'entity'),
        isRoot: n.is_root,
        assetType: n.asset_type,
        country: n.country,
        status: n.operating_status,
      }));

      // Process edges
      const edges: GraphEdge[] = (data.edges || []).map((e: RawOwnershipAPIEdge) => ({
        source: e.source,
        target: e.target,
        value: e.value ?? e.ownership_percentage,
      }));

      graphData = { nodes, edges };
      loading = false;

      // Run layout after data loads
      if (dagre) runLayout();
    } catch (err: unknown) {
      console.error('Failed to fetch ownership graph:', err);
      error = err instanceof Error ? err.message : String(err);
      loading = false;
    }
  }

  // Filter assets based on screener criteria
  const filteredNodes = $derived.by(() => {
    if (!graphData) return [];
    return graphData.nodes.filter((n) => {
      if (n.type !== 'asset') return true; // Keep all entities
      // Apply asset filters
      if (assetFilter.tracker && n.assetType !== assetFilter.tracker) return false;
      if (assetFilter.status && n.status !== assetFilter.status) return false;
      if (assetFilter.country && n.country !== assetFilter.country) return false;
      return true;
    });
  });

  // Get edges that connect filtered nodes
  const filteredEdges = $derived.by(() => {
    if (!graphData) return [];
    const nodeIds = new Set(filteredNodes.map((n) => n.id));
    return graphData.edges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target));
  });

  // Asset count stats
  const assetCount = $derived(filteredNodes.filter((n) => n.type === 'asset').length);
  const totalAssets = $derived(graphData?.nodes.filter((n: GraphNode) => n.type === 'asset').length || 0);
  const hiddenCount = $derived(totalAssets - assetCount);

  // Run dagre layout - horizontal left to right
  function runLayout() {
    if (!dagre || filteredNodes.length === 0) return;

    const g = new dagre.graphlib.Graph();
    g.setGraph({
      rankdir: 'LR', // Left to right
      nodesep: 20,
      ranksep: 60,
      marginx: 20,
      marginy: 20,
    });
    g.setDefaultEdgeLabel(() => ({}));

    // Add nodes
    filteredNodes.forEach((n) => {
      const isEntity = n.type !== 'asset';
      const isRoot = n.id === entityId || n.id === `E${entityId}` || n.isRoot;
      g.setNode(n.id, {
        width: isRoot ? 100 : isEntity ? 80 : 120,
        height: isRoot ? 40 : isEntity ? 30 : 24,
      });
    });

    // Add edges
    filteredEdges.forEach((e) => g.setEdge(e.source, e.target));

    // Compute layout
    dagre.layout(g);

    // Extract positioned nodes
    layoutNodes = g.nodes().map((id: string) => {
      const pos = g.node(id);
      const orig = filteredNodes.find((n) => n.id === id);
      const isRoot = id === entityId || id === `E${entityId}` || !!orig?.isRoot;
      return {
        id,
        x: pos.x,
        y: pos.y,
        w: pos.width,
        h: pos.height,
        isRoot,
        isAsset: orig?.type === 'asset',
        label: orig?.name || id,
        pct: 0,
      };
    });

    // Extract edges with points
    layoutEdges = g.edges().map((e: DagreEdge) => {
      const ed = g.edge(e);
      const orig = filteredEdges.find((x) => x.source === e.v && x.target === e.w);
      return {
        source: e.v,
        target: e.w,
        points: ed.points,
        value: orig?.value || 0,
      };
    });

    const graphMeta = g.graph();
    gWidth = Math.max(graphMeta.width || 400, 400);
    gHeight = Math.max(graphMeta.height || 150, 150);
  }

  // Edge path generator
  function edgePath(pts: LayoutPoint[]): string {
    if (!pts || pts.length < 2) return '';
    return d3.line<LayoutPoint>().x((d) => d.x).y((d) => d.y).curve(d3.curveBasis)(pts) || '';
  }

  // Truncate text
  function truncate(str: string, len: number): string {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
  }

  // Click handlers
  function clickNode(n: MiniLayoutNode) {
    if (n.isAsset) {
      goto(assetLink(n.id));
    } else {
      goto(entityLink(n.id));
    }
  }

  onMount(async () => {
    try {
      dagre = await import('dagre');
      await fetchOwnershipGraph();
    } catch (e) {
      console.error('Failed to load dagre:', e);
      error = 'Failed to load graph library';
      loading = false;
    }
  });

  // Re-run layout when data changes
  $effect(() => {
    if (dagre && filteredNodes.length > 0) runLayout();
  });
</script>

<div class="mini-tree">
  {#if loading}
    <div class="loading">Loading ownership structure...</div>
  {:else if error}
    <div class="error">Failed to load: {error}</div>
  {:else if layoutNodes.length === 0}
    <div class="empty">No ownership data available</div>
  {:else}
    <div class="tree-header">
      <span class="entity-name">{entityName}'s ownership of</span>
      <span class="asset-count">{assetCount} matching assets</span>
      {#if hiddenCount > 0}
        <span class="hidden-note">({hiddenCount} other assets not shown)</span>
      {/if}
    </div>

    <div class="graph-container">
      <svg viewBox="0 0 {gWidth} {gHeight}" preserveAspectRatio="xMidYMid meet">
        <defs>
          <marker id="mini-arr" markerWidth="6" markerHeight="4" refX="5" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill={colors.edge} />
          </marker>
        </defs>

        <!-- Edges -->
        {#each layoutEdges as e (e.source + e.target)}
          <path
            d={edgePath(e.points)}
            stroke={colors.edge}
            stroke-width="1.5"
            fill="none"
            marker-end="url(#mini-arr)"
          />
        {/each}

        <!-- Nodes -->
        {#each layoutNodes as n (n.id)}
          <g
            class="node"
            class:root={n.isRoot}
            class:asset={n.isAsset}
            transform="translate({n.x},{n.y})"
            role="button"
            tabindex="0"
            onclick={() => clickNode(n)}
            onkeydown={(ev) => ev.key === 'Enter' && clickNode(n)}
          >
            {#if n.isRoot}
              <!-- Root entity: larger rounded rect -->
              <rect
                x={-n.w / 2}
                y={-n.h / 2}
                width={n.w}
                height={n.h}
                rx="4"
                fill={colors.navy}
              />
              <text fill={colors.warmWhite} class="root-label">{truncate(n.label, 14)}</text>
            {:else if n.isAsset}
              <!-- Asset: small pill -->
              <rect
                x={-n.w / 2}
                y={-n.h / 2}
                width={n.w}
                height={n.h}
                rx="3"
                fill={colors.assetFill}
                stroke={colors.teal}
                stroke-width="1"
              />
              <text fill={colors.navy} class="asset-label">{truncate(n.label, 20)}</text>
            {:else}
              <!-- Intermediate entity: circle -->
              <circle r={12} fill={colors.nodeFill} stroke="white" stroke-width="1.5" />
              <text y={22} fill={colors.navy} class="entity-label">{truncate(n.label, 12)}</text>
            {/if}
          </g>
        {/each}
      </svg>
    </div>

    <div class="tree-footer">
      <a href={entityLink(entityId)} class="view-full">View full ownership details →</a>
    </div>
  {/if}
</div>

<style>
  .mini-tree {
    padding: 16px;
    background: #fafaf7;
    border-radius: 4px;
    font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 24px;
    color: #718096;
    font-size: 13px;
  }

  .error {
    color: #c53030;
  }

  .tree-header {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-bottom: 12px;
    flex-wrap: wrap;
  }

  .entity-name {
    font-weight: 600;
    color: #1a3a4a;
    font-size: 14px;
  }

  .asset-count {
    color: #2a7f8f;
    font-size: 13px;
  }

  .hidden-note {
    color: #a0aec0;
    font-size: 12px;
  }

  .graph-container {
    background: white;
    border: 1px solid #e2e8f0;
    border-radius: 4px;
    overflow: hidden;
  }

  svg {
    display: block;
    width: 100%;
    height: auto;
    min-height: 120px;
    max-height: 250px;
  }

  .node {
    cursor: pointer;
  }

  .node:hover rect,
  .node:hover circle {
    filter: brightness(0.95);
  }

  .root-label,
  .entity-label,
  .asset-label {
    font-size: 10px;
    text-anchor: middle;
    dominant-baseline: middle;
    pointer-events: none;
  }

  .root-label {
    font-weight: 600;
  }

  .entity-label {
    dominant-baseline: hanging;
    font-size: 9px;
  }

  .asset-label {
    font-size: 9px;
  }

  .tree-footer {
    margin-top: 12px;
    text-align: right;
  }

  .view-full {
    font-size: 12px;
    color: #2a7f8f;
    text-decoration: none;
  }

  .view-full:hover {
    text-decoration: underline;
  }
</style>

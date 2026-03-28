<script lang="ts">
  /**
   * OwnershipMiniTree - Compact ownership tree for screener results
   * Shows: Entity → Intermediaries → Assets
   * Horizontal layout optimized for inline display in tables
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { entityLink, assetLink } from '$lib/links';
  import { line, curveBasis } from 'd3-shape';
  import { ownershipColors } from '$lib/design-tokens';
  import { getAPIBase } from '$lib/ownership-api';
  import type {
    GraphNode,
    GraphEdge,
    LayoutPoint,
    MiniLayoutNode,
    LayoutEdge,
    OwnershipGraphAPIResponse,
    RawOwnershipAPINode,
    RawOwnershipAPIEdge,
    DagreEdge,
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

  // Colors from design-tokens (GEM brand)
  const clr = {
    navy: ownershipColors.treeNavy,
    teal: ownershipColors.treeTeal,
    mint: ownershipColors.treeMint,
    warmWhite: ownershipColors.treeWarmWhite,
    nodeFill: ownershipColors.treeNodeFill,
    edge: ownershipColors.treeEdge,
    assetFill: ownershipColors.entityOtherLight,
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
        `${getAPIBase()}/ownership/graph?root=E${cleanId}&direction=down&max_depth=4&format=json`
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
      if (import.meta.env.DEV) console.error('Failed to fetch ownership graph:', err);
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
  const totalAssets = $derived(
    graphData?.nodes.filter((n: GraphNode) => n.type === 'asset').length || 0
  );
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
    return (
      line<LayoutPoint>()
        .x((d) => d.x)
        .y((d) => d.y)
        .curve(curveBasis)(pts) || ''
    );
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
      if (import.meta.env.DEV) console.error('Failed to load dagre:', e);
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
            <polygon points="0 0, 6 2, 0 4" fill={clr.edge} />
          </marker>
        </defs>

        <!-- Edges -->
        {#each layoutEdges as e (e.source + e.target)}
          <path
            d={edgePath(e.points)}
            stroke={clr.edge}
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
              <rect x={-n.w / 2} y={-n.h / 2} width={n.w} height={n.h} rx="4" fill={clr.navy} />
              <text fill={clr.warmWhite} class="root-label">{truncate(n.label, 14)}</text>
            {:else if n.isAsset}
              <!-- Asset: small pill -->
              <rect
                x={-n.w / 2}
                y={-n.h / 2}
                width={n.w}
                height={n.h}
                rx="3"
                fill={clr.assetFill}
                stroke={clr.teal}
                stroke-width="1"
              />
              <text fill={clr.navy} class="asset-label">{truncate(n.label, 20)}</text>
            {:else}
              <!-- Intermediate entity: circle -->
              <circle r={12} fill={clr.nodeFill} stroke="white" stroke-width="1.5" />
              <text y={22} fill={clr.navy} class="entity-label">{truncate(n.label, 12)}</text>
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
    background: var(--color-bg-secondary, #f2f2eb);
    border-radius: 4px;
    font-family: var(--font-family-sans, 'Plus Jakarta Sans', system-ui, sans-serif);
  }

  .loading,
  .error,
  .empty {
    text-align: center;
    padding: 24px;
    color: var(--color-text-secondary, #4c6267);
    font-size: 13px;
  }

  .error {
    color: var(--color-error, #7f142a);
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
    color: var(--color-text-primary, #1d4961);
    font-size: 14px;
  }

  .asset-count {
    color: var(--color-text-primary, #1d4961);
    font-size: 13px;
  }

  .hidden-note {
    color: var(--color-text-tertiary, #9eaaad);
    font-size: 12px;
  }

  .graph-container {
    background: white;
    border: 1px solid var(--color-border, #dce3e5);
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
    color: var(--color-text-primary, #1d4961);
    text-decoration: none;
  }

  .view-full:hover {
    text-decoration: underline;
  }
</style>

<script>
  /**
   * InvestigationNetwork - Force-directed network for investigation cart
   * Shows entities and assets as nodes, ownership relationships as edges
   */

  import { onMount, onDestroy } from 'svelte';
  import { assetLink, entityLink } from '$lib/links';
  import { goto } from '$app/navigation';
  import * as d3 from 'd3';
  import { colorByTracker, colors } from '$lib/design-tokens';

  // Props
  let {
    entityIds = [],
    assetIds = [],
    sharedAssets = [],
    commonOwners = [],
    height = 400,
  } = $props();

  let svgEl;
  let simulation;

  // Build graph data from investigation results
  const graphData = $derived.by(() => {
    const nodes = [];
    const links = [];
    const nodeSet = new Set();

    // Add entity nodes
    for (const entityId of entityIds) {
      if (!nodeSet.has(entityId)) {
        nodes.push({
          id: entityId,
          type: 'entity',
          name: entityId,
          inCart: true,
        });
        nodeSet.add(entityId);
      }
    }

    // Add asset nodes from cart
    for (const assetId of assetIds) {
      if (!nodeSet.has(assetId)) {
        nodes.push({
          id: assetId,
          type: 'asset',
          name: assetId,
          inCart: true,
        });
        nodeSet.add(assetId);
      }
    }

    // Add shared assets and their connections
    for (const asset of sharedAssets) {
      if (!nodeSet.has(asset.asset_id)) {
        nodes.push({
          id: asset.asset_id,
          type: 'asset',
          name: asset.asset_name || asset.asset_id,
          tracker: asset.tracker,
          shared: true,
          coOwnerCount: asset.co_owner_count,
        });
        nodeSet.add(asset.asset_id);
      }

      // Parse co-owner IDs and create links
      const ownerIds = (asset.co_owner_ids || '').split('; ').filter(Boolean);
      for (const ownerId of ownerIds) {
        if (nodeSet.has(ownerId)) {
          links.push({
            source: ownerId,
            target: asset.asset_id,
            type: 'ownership',
          });
        }
      }
    }

    // Add common owners and their connections
    for (const owner of commonOwners) {
      if (!nodeSet.has(owner.entity_id)) {
        nodes.push({
          id: owner.entity_id,
          type: 'entity',
          name: owner.entity_name || owner.entity_id,
          assetCount: owner.asset_count,
          discovered: true,
        });
        nodeSet.add(owner.entity_id);
      }

      // Link to assets in cart
      for (const assetId of assetIds) {
        links.push({
          source: owner.entity_id,
          target: assetId,
          type: 'ownership',
        });
      }
    }

    return { nodes, links };
  });

  function render() {
    if (!svgEl || graphData.nodes.length === 0) return;

    const width = svgEl.clientWidth || 600;
    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();

    const { nodes, links } = graphData;

    // Create force simulation
    simulation = d3
      .forceSimulation(/** @type {any[]} */ (nodes))
      .force(
        'link',
        d3
          .forceLink(/** @type {any[]} */ (links))
          .id((/** @type {any} */ d) => d.id)
          .distance(80)
      )
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(30));

    // Container group with zoom
    const g = svg.append('g');

    const zoom = d3
      .zoom()
      .scaleExtent([0.3, 3])
      .on('zoom', (event) => g.attr('transform', event.transform));

    svg.call(zoom);

    // Draw links
    const link = g
      .append('g')
      .attr('stroke', '#999')
      .attr('stroke-opacity', 0.4)
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.5);

    // Draw nodes
    const node = g
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('cursor', 'pointer')
      .call(d3.drag().on('start', dragstarted).on('drag', dragged).on('end', dragended));

    // Node circles
    node
      .append('circle')
      .attr('r', (d) => {
        if (d.inCart) return 14;
        if (d.shared) return 10 + Math.min(d.coOwnerCount || 1, 5);
        if (d.discovered) return 8 + Math.min(d.assetCount || 1, 6);
        return 8;
      })
      .attr('fill', (d) => {
        if (d.type === 'entity') return d.inCart ? colors.navy : colors.midnightPurple;
        if (d.tracker) return colorByTracker.get(d.tracker) || colors.mint;
        return d.inCart ? colors.grey : '#ccc';
      })
      .attr('stroke', (d) => (d.inCart ? colors.black : '#fff'))
      .attr('stroke-width', (d) => (d.inCart ? 2 : 1));

    // Node type labels
    node
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.35em')
      .attr('font-size', (d) => (d.inCart ? '10px' : '8px'))
      .attr('font-weight', 'bold')
      .attr('fill', '#fff')
      .text((d) => (d.type === 'entity' ? 'E' : 'A'));

    // Node name labels
    node
      .append('text')
      .attr('x', 0)
      .attr('y', (d) => (d.inCart ? 24 : 18))
      .attr('text-anchor', 'middle')
      .attr('font-size', '9px')
      .attr('fill', '#333')
      .text((d) => {
        const name = d.name || d.id;
        return name.length > 15 ? name.slice(0, 15) + '...' : name;
      });

    // Click handler
    node.on('click', (event, d) => {
      event.stopPropagation();
      if (d.type === 'entity') {
        goto(entityLink(d.id));
      } else {
        goto(assetLink(d.id));
      }
    });

    // Tooltip
    node
      .append('title')
      .text(
        (d) =>
          `${d.name || d.id}\n${d.type === 'entity' ? 'Entity' : 'Asset'}${d.inCart ? ' (in cart)' : ''}`
      );

    // Simulation tick
    simulation.on('tick', () => {
      link
        .attr('x1', (d) => /** @type {any} */ (d.source).x)
        .attr('y1', (d) => /** @type {any} */ (d.source).y)
        .attr('x2', (d) => /** @type {any} */ (d.target).x)
        .attr('y2', (d) => /** @type {any} */ (d.target).y);

      node.attr(
        'transform',
        (d) => `translate(${/** @type {any} */ (d).x},${/** @type {any} */ (d).y})`
      );
    });

    function dragstarted(event) {
      if (!event.active) simulation.alphaTarget(0.3).restart();
      event.subject.fx = event.subject.x;
      event.subject.fy = event.subject.y;
    }

    function dragged(event) {
      event.subject.fx = event.x;
      event.subject.fy = event.y;
    }

    function dragended(event) {
      if (!event.active) simulation.alphaTarget(0);
      event.subject.fx = null;
      event.subject.fy = null;
    }
  }

  onMount(() => {
    render();
  });

  $effect(() => {
    void graphData;
    render();
  });

  onDestroy(() => {
    if (simulation) simulation.stop();
  });
</script>

{#if graphData.nodes.length > 0}
  <div class="network-viz">
    <h3>Ownership Network</h3>
    <p class="network-hint">Drag nodes to rearrange. Click to navigate. Scroll to zoom.</p>
    <svg bind:this={svgEl} width="100%" {height}></svg>
    <div class="legend">
      <span class="legend-item"><span class="dot entity cart"></span> Entity (in cart)</span>
      <span class="legend-item"><span class="dot entity"></span> Entity (discovered)</span>
      <span class="legend-item"><span class="dot asset cart"></span> Asset (in cart)</span>
      <span class="legend-item"><span class="dot asset"></span> Asset (shared)</span>
    </div>
  </div>
{/if}

<style>
  .network-viz {
    background: var(--color-white);
    padding: 16px;
    margin-bottom: 24px;
  }

  h3 {
    margin: 0 0 8px 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .network-hint {
    font-size: 11px;
    color: var(--color-text-tertiary);
    margin: 0 0 12px 0;
  }

  svg {
    display: block;
    background: #fafafa;
    border: 1px solid var(--color-border);
  }

  .legend {
    display: flex;
    gap: 16px;
    margin-top: 12px;
    flex-wrap: wrap;
  }

  .legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }

  .dot.entity {
    background: var(--color-entity-text, #7b1fa2);
  }

  .dot.entity.cart {
    background: var(--color-navy, #002b5c);
    border: 2px solid var(--color-black);
  }

  .dot.asset {
    background: #ccc;
  }

  .dot.asset.cart {
    background: var(--color-grey, #666);
    border: 2px solid var(--color-black);
  }

  @media print {
    .network-viz {
      page-break-inside: avoid;
    }
    .network-hint {
      display: none;
    }
    svg {
      max-height: 300px;
    }
  }
</style>

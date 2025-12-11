<script>
  /**
   * OwnershipFlower - Nadieh Bremer–style flower/Chernoff icon
   * Self-contained: pulls owner portfolio via MotherDuck and renders a radial flower
   * encoding tracker mix and capacity/asset counts.
   *
   * Petal angle -> tracker share (by asset count)
   * Petal length -> total capacity for that tracker (scaled)
   * Petal color -> tracker color palette
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import * as d3 from 'd3';
  import { colorByTracker, colors } from '$lib/ownership-theme';
  import { fetchAssetBasics, fetchOwnerPortfolio } from '$lib/component-data/schema';

  export let ownerId: string | null = null; // optional override

  let svgEl;
  let loading = $state(true);
  let error = $state<string | null>(null);
  let title = $state('');

  function buildPetals(portfolio) {
    const trackerGroups = d3.group(portfolio.assets, (d) => d.tracker || 'Unknown');
    const entries = Array.from(trackerGroups, ([tracker, list]) => {
      const count = list.length;
      const capacity = d3.sum(list, (d) => d.capacityMw || 0);
      return { tracker, count, capacity };
    }).sort((a, b) => b.count - a.count);

    const totalCount = d3.sum(entries, (d) => d.count) || 1;
    let angleAcc = 0;
    const maxCapacity = d3.max(entries, (d) => d.capacity) || 1;

    return entries.map((d) => {
      const angle = (d.count / totalCount) * 2 * Math.PI;
      const angleStart = angleAcc;
      const angleEnd = angleAcc + angle;
      angleAcc = angleEnd;
      return {
        tracker: d.tracker,
        count: d.count,
        capacity: d.capacity,
        angleStart,
        angleEnd,
        length: 30 + 60 * (d.capacity / maxCapacity), // base + scaled length
        color: colorByTracker.get(d.tracker) || colors.mint,
      };
    });
  }

  function render(petalsData) {
    if (!svgEl) return;
    const width = 260;
    const height = 260;
    const cx = width / 2;
    const cy = height / 2;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${cx}, ${cy})`);

    const petal = d3.arc().innerRadius(8).cornerRadius(8);

    g.selectAll('path.petal')
      .data(petalsData)
      .join('path')
      .attr('class', 'petal')
      .attr('d', (d) =>
        petal({
          startAngle: d.angleStart,
          endAngle: d.angleEnd,
          innerRadius: 8,
          outerRadius: d.length,
        })
      )
      .attr('fill', (d) => d.color)
      .attr('stroke', '#111')
      .attr('stroke-width', 1)
      .attr('fill-opacity', 0.9);

    // Center disk
    g.append('circle')
      .attr('r', 12)
      .attr('fill', '#fff')
      .attr('stroke', '#111')
      .attr('stroke-width', 1.5);

    // Labels
    g.selectAll('text.label')
      .data(petalsData)
      .join('text')
      .attr('class', 'label')
      .attr('x', (d) => Math.cos((d.angleStart + d.angleEnd) / 2) * (d.length + 10))
      .attr('y', (d) => Math.sin((d.angleStart + d.angleEnd) / 2) * (d.length + 10))
      .attr('dy', '0.35em')
      .attr('text-anchor', (d) => {
        const mid = (d.angleStart + d.angleEnd) / 2;
        if (mid > Math.PI / 2 && mid < (3 * Math.PI) / 2) return 'end';
        return 'start';
      })
      .text((d) => `${d.tracker} (${d.count})`)
      .style('font-size', '10px')
      .style('fill', '#111');
  }

  onMount(async () => {
    try {
      loading = true;
      error = null;

      let resolvedOwner = ownerId;
      if (!resolvedOwner) {
        const $p = get(page);
        const pathname = $p.url?.pathname || '';
        const paramId = $p.params?.id;
        if (pathname.includes('/asset/')) {
          const basics = await fetchAssetBasics(paramId);
          resolvedOwner = basics?.ownerEntityId || null;
        } else if (pathname.includes('/entity/')) {
          resolvedOwner = paramId;
        }
      }

      if (!resolvedOwner) {
        throw new Error('Owner ID not available');
      }

      const portfolio = await fetchOwnerPortfolio(resolvedOwner);
      if (!portfolio) throw new Error('Portfolio not found');

      title = portfolio.spotlightOwner.Name;
      const petalsData = buildPetals(portfolio);
      render(petalsData);
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  });
</script>

<div class="ownership-flower">
  {#if loading}
    <p>Loading flower…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    <div class="header">
      <div class="title">{title}</div>
      <div class="subtitle">Tracker mix flower</div>
    </div>
    <svg bind:this={svgEl} aria-label="Ownership flower icon"></svg>
  {/if}
</div>

<style>
  .ownership-flower {
    border: 1px solid #000;
    padding: 12px;
    background: #fdfbf7;
    max-width: 320px;
  }

  .header {
    margin-bottom: 8px;
  }

  .title {
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .subtitle {
    font-size: 12px;
    color: #555;
  }

  .error {
    color: #b10000;
    margin: 0;
  }
</style>

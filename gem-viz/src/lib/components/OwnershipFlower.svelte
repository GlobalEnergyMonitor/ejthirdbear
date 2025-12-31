<script>
  /**
   * OwnershipFlower - Nadieh Bremer–style flower/Chernoff icon
   * Renders a radial flower encoding tracker mix and capacity/asset counts.
   *
   * Petal angle -> tracker share (by asset count)
   * Petal length -> total capacity for that tracker (scaled)
   * Petal color -> tracker color palette
   *
   * Can receive data via props (for static builds) or fetch from MotherDuck (dev mode).
   */
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { get } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { entityLink } from '$lib/links';
  import * as d3 from 'd3';
  import { colorByTracker, colors } from '$lib/ownership-theme';
  // Dynamic import to avoid SSR issues - schema.ts imports WASM client
  /** @type {typeof import('$lib/component-data/schema').fetchAssetBasics} */
  let fetchAssetBasics;
  /** @type {typeof import('$lib/component-data/schema').fetchOwnerPortfolio} */
  let fetchOwnerPortfolio;

  /** @type {{ ownerId?: string | null, portfolio?: any, size?: 'small' | 'medium' | 'large', showLabels?: boolean, showTitle?: boolean, title?: string }} */
  let {
    ownerId = null,
    portfolio: prebakedPortfolio = null,
    size = 'medium',
    showLabels = true,
    showTitle = true,
    title: propsTitle = '',
  } = $props();

  // Size presets
  const sizes = {
    small: { width: 120, height: 120, labelSize: 8, baseRadius: 15, maxRadius: 45 },
    medium: { width: 260, height: 260, labelSize: 10, baseRadius: 30, maxRadius: 90 },
    large: { width: 400, height: 400, labelSize: 12, baseRadius: 40, maxRadius: 140 },
  };

  let svgEl;
  let loading = $state(!prebakedPortfolio);
  /** @type {string | null} */
  let error = $state(null);
  let title = $state(propsTitle);
  let resolvedOwnerId = $state(ownerId);

  // Navigate to entity page when clicked
  function handleFlowerClick() {
    if (resolvedOwnerId) {
      goto(entityLink(resolvedOwnerId));
    }
  }

  function buildPetals(portfolio, sizeConfig) {
    const trackerGroups = d3.group(portfolio.assets, (d) => d.tracker || 'Unknown');
    const entries = Array.from(trackerGroups, ([tracker, list]) => {
      const count = list.length;
      const capacity = d3.sum(list, (d) => d.capacityMw || 0);
      return { tracker, count, capacity };
    }).sort((a, b) => b.count - a.count);

    const totalCount = d3.sum(entries, (d) => d.count) || 1;
    let angleAcc = 0;
    const maxCapacity = d3.max(entries, (d) => d.capacity) || 1;

    const baseLen = sizeConfig.baseRadius;
    const maxLen = sizeConfig.maxRadius;

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
        length: baseLen + (maxLen - baseLen) * (d.capacity / maxCapacity),
        color: colorByTracker.get(d.tracker) || colors.mint,
      };
    });
  }

  function render(petalsData, sizeConfig) {
    if (!svgEl) return;
    const { width, height, labelSize } = sizeConfig;
    const cx = width / 2;
    const cy = height / 2;
    const innerRadius = size === 'small' ? 4 : 8;
    const centerRadius = size === 'small' ? 6 : 12;

    const svg = d3.select(svgEl);
    svg.selectAll('*').remove();
    svg.attr('width', width).attr('height', height);

    const g = svg.append('g').attr('transform', `translate(${cx}, ${cy})`);

    const petal = d3
      .arc()
      .innerRadius(innerRadius)
      .cornerRadius(size === 'small' ? 4 : 8);

    g.selectAll('path.petal')
      .data(petalsData)
      .join('path')
      .attr('class', 'petal')
      .attr('d', (d) =>
        petal({
          startAngle: d.angleStart,
          endAngle: d.angleEnd,
          innerRadius: innerRadius,
          outerRadius: d.length,
        })
      )
      .attr('fill', (d) => d.color)
      .attr('stroke', '#111')
      .attr('stroke-width', size === 'small' ? 0.5 : 1)
      .attr('fill-opacity', 0.9);

    // Center disk
    g.append('circle')
      .attr('r', centerRadius)
      .attr('fill', '#fff')
      .attr('stroke', '#111')
      .attr('stroke-width', size === 'small' ? 1 : 1.5);

    // Labels (only if showLabels is true and not small size)
    if (showLabels && size !== 'small') {
      g.selectAll('text.label')
        .data(petalsData)
        .join('text')
        .attr('class', 'label')
        .attr('x', (d) => Math.cos((d.angleStart + d.angleEnd) / 2 - Math.PI / 2) * (d.length + 10))
        .attr('y', (d) => Math.sin((d.angleStart + d.angleEnd) / 2 - Math.PI / 2) * (d.length + 10))
        .attr('dy', '0.35em')
        .attr('text-anchor', (d) => {
          const mid = (d.angleStart + d.angleEnd) / 2 - Math.PI / 2;
          if (mid > Math.PI / 2 && mid < (3 * Math.PI) / 2) return 'end';
          return 'start';
        })
        .text((d) => `${d.tracker} (${d.count})`)
        .style('font-size', `${labelSize}px`)
        .style('fill', '#111');
    }
  }

  onMount(async () => {
    const sizeConfig = sizes[size] || sizes.medium;

    // If we have prebaked portfolio data, use it immediately
    if (prebakedPortfolio) {
      try {
        if (!title && prebakedPortfolio.spotlightOwner?.Name) {
          title = prebakedPortfolio.spotlightOwner.Name;
        }
        // Extract owner ID from portfolio if not provided
        if (!resolvedOwnerId && prebakedPortfolio.spotlightOwner?.id) {
          resolvedOwnerId = prebakedPortfolio.spotlightOwner.id;
        }
        const petalsData = buildPetals(prebakedPortfolio, sizeConfig);
        render(petalsData, sizeConfig);
        loading = false;
      } catch (err) {
        error = err?.message || String(err);
        loading = false;
      }
      return;
    }

    // Otherwise fetch from MotherDuck (dev mode)
    // Dynamic import to avoid SSR bundling of WASM client
    const schema = await import('$lib/component-data/schema');
    fetchAssetBasics = schema.fetchAssetBasics;
    fetchOwnerPortfolio = schema.fetchOwnerPortfolio;

    try {
      loading = true;
      error = null;

      let fetchOwnerId = ownerId;
      if (!fetchOwnerId) {
        const pageStore = get(page);
        const pathname = pageStore.url?.pathname || '';
        const paramId = pageStore.params?.id;
        if (pathname.includes('/asset/')) {
          const basics = await fetchAssetBasics(paramId);
          fetchOwnerId = basics?.ownerEntityId || null;
        } else if (pathname.includes('/entity/')) {
          fetchOwnerId = paramId;
        }
      }

      if (!fetchOwnerId) {
        throw new Error('Owner ID not available');
      }

      resolvedOwnerId = fetchOwnerId;
      const portfolio = await fetchOwnerPortfolio(fetchOwnerId);
      if (!portfolio) throw new Error('Portfolio not found');

      title = portfolio.spotlightOwner.Name;
      const petalsData = buildPetals(portfolio, sizeConfig);
      render(petalsData, sizeConfig);
    } catch (err) {
      error = err?.message || String(err);
    } finally {
      loading = false;
    }
  });
</script>

<div
  class="ownership-flower"
  class:small={size === 'small'}
  class:medium={size === 'medium'}
  class:large={size === 'large'}
>
  {#if loading}
    <p class="loading-msg">Loading flower…</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else}
    {#if showTitle && title}
      <div class="header">
        {#if resolvedOwnerId}
          <button class="title clickable" onclick={handleFlowerClick}>{title}</button>
        {:else}
          <div class="title">{title}</div>
        {/if}
        <div class="subtitle">Tracker mix</div>
      </div>
    {/if}
    <svg
      bind:this={svgEl}
      aria-label="Ownership flower showing tracker distribution"
      class:clickable={Boolean(resolvedOwnerId)}
      onclick={resolvedOwnerId ? handleFlowerClick : undefined}
      role={resolvedOwnerId ? 'button' : 'img'}
      tabindex={resolvedOwnerId ? 0 : undefined}
      onkeydown={(e) => resolvedOwnerId && e.key === 'Enter' && handleFlowerClick()}
    ></svg>
  {/if}
</div>

<style>
  .ownership-flower {
    display: inline-flex;
    flex-direction: column;
    align-items: center;
  }

  .ownership-flower:not(.small) {
    border: none;
    padding: 12px;
    background: transparent;
  }

  .ownership-flower.small {
    padding: 0;
    background: transparent;
    border: none;
  }

  .ownership-flower.large {
    padding: 20px;
  }

  .header {
    margin-bottom: 8px;
    text-align: center;
  }

  .title {
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .title.clickable {
    background: none;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: text-decoration-color 0.15s;
  }

  .title.clickable:hover {
    text-decoration-color: currentColor;
  }

  svg.clickable {
    cursor: pointer;
    transition: transform 0.15s ease;
  }

  svg.clickable:hover {
    transform: scale(1.02);
  }

  .subtitle {
    font-size: 11px;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .loading-msg {
    font-size: 11px;
    color: #888;
    margin: 0;
  }

  .error {
    color: #b10000;
    margin: 0;
    font-size: 11px;
  }
</style>

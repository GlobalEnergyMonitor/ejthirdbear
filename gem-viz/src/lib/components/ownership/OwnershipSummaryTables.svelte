<script lang="ts">
  /**
   * OwnershipSummaryTables - Tabular breakdown of ownership data
   * Shows aggregated views by Entity, Country, and Entity Type
   *
   * Features:
   * - Collapsible sections
   * - Sorted by ownership share
   * - Links to entity pages
   */
  import { entityLink } from '$lib/links';
  import OwnershipPie from '$lib/components/charts/OwnershipPie.svelte';
  import { colors } from '$lib/design-tokens';
  import { Minus, Plus } from 'lucide-svelte';

  interface GraphNode {
    id: string;
    Name?: string;
    name?: string;
    type?: string;
    country?: string;
    entityType?: string;
    [key: string]: unknown;
  }

  interface GraphEdge {
    source: string;
    target: string;
    value?: number | null;
    depth?: number;
    type?: string;
    [key: string]: unknown;
  }

  interface Props {
    nodes?: GraphNode[];
    edges?: GraphEdge[];
    rootId?: string;
    showByEntity?: boolean;
    showByCountry?: boolean;
    showByType?: boolean;
  }

  let {
    nodes = [],
    edges = [],
    rootId = '',
    showByEntity = true,
    showByCountry = true,
    showByType = true,
  }: Props = $props();

  // Collapsible states
  let entityExpanded = $state(true);
  let countryExpanded = $state(false);
  let typeExpanded = $state(false);

  // Build node map
  const nodeMap = $derived(new Map(nodes.map((n) => [n.id, n])));

  // Get direct owners (edges where target is the root)
  const directOwnerEdges = $derived(edges.filter((e) => e.target === rootId));

  // Aggregate by entity
  const byEntity = $derived.by(() => {
    const map = new Map<string, { node: GraphNode; totalShare: number; count: number }>();

    directOwnerEdges.forEach((edge) => {
      const node = nodeMap.get(edge.source);
      if (!node) return;

      const existing = map.get(edge.source);
      if (existing) {
        existing.totalShare += edge.value || 0;
        existing.count += 1;
      } else {
        map.set(edge.source, {
          node,
          totalShare: edge.value || 0,
          count: 1,
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalShare - a.totalShare);
  });

  // Aggregate by country
  const byCountry = $derived.by(() => {
    const map = new Map<
      string,
      { country: string; totalShare: number; count: number; entities: string[] }
    >();

    directOwnerEdges.forEach((edge) => {
      const node = nodeMap.get(edge.source);
      const country = node?.country || 'Unknown';

      const existing = map.get(country);
      if (existing) {
        existing.totalShare += edge.value || 0;
        existing.count += 1;
        if (!existing.entities.includes(edge.source)) {
          existing.entities.push(edge.source);
        }
      } else {
        map.set(country, {
          country,
          totalShare: edge.value || 0,
          count: 1,
          entities: [edge.source],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalShare - a.totalShare);
  });

  // Aggregate by entity type
  const byType = $derived.by(() => {
    const map = new Map<
      string,
      { type: string; totalShare: number; count: number; entities: string[] }
    >();

    directOwnerEdges.forEach((edge) => {
      const node = nodeMap.get(edge.source);
      const type = node?.entityType || node?.type || 'Unknown';

      const existing = map.get(type);
      if (existing) {
        existing.totalShare += edge.value || 0;
        existing.count += 1;
        if (!existing.entities.includes(edge.source)) {
          existing.entities.push(edge.source);
        }
      } else {
        map.set(type, {
          type,
          totalShare: edge.value || 0,
          count: 1,
          entities: [edge.source],
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => b.totalShare - a.totalShare);
  });

  const totalOwnership = $derived(directOwnerEdges.reduce((sum, e) => sum + (e.value || 0), 0));
</script>

<div class="ownership-summary-tables">
  {#if showByEntity && byEntity.length > 0}
    <section class="summary-section">
      <button
        class="section-header"
        onclick={() => (entityExpanded = !entityExpanded)}
        aria-expanded={entityExpanded}
      >
        <span class="section-title">By Entity</span>
        <span class="section-count">{byEntity.length}</span>
        <span class="toggle-icon"
          >{#if entityExpanded}<Minus size={14} />{:else}<Plus size={14} />{/if}</span
        >
      </button>

      {#if entityExpanded}
        <div class="table-wrapper">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Entity</th>
                <th class="numeric">Share</th>
              </tr>
            </thead>
            <tbody>
              {#each byEntity as row}
                <tr>
                  <td>
                    <a href={entityLink(row.node.id)} class="entity-link">
                      {row.node.Name || row.node.name || row.node.id}
                    </a>
                  </td>
                  <td class="numeric share-cell">
                    <OwnershipPie percentage={row.totalShare} size={16} fillColor={colors.navy} />
                    <span>{row.totalShare.toFixed(1)}%</span>
                  </td>
                </tr>
              {/each}
            </tbody>
            <tfoot>
              <tr>
                <td>Total</td>
                <td class="numeric share-cell">
                  <OwnershipPie
                    percentage={Math.min(totalOwnership, 100)}
                    size={16}
                    fillColor={colors.navy}
                  />
                  <span>{totalOwnership.toFixed(1)}%</span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  {#if showByCountry && byCountry.length > 0}
    <section class="summary-section">
      <button
        class="section-header"
        onclick={() => (countryExpanded = !countryExpanded)}
        aria-expanded={countryExpanded}
      >
        <span class="section-title">By Country</span>
        <span class="section-count">{byCountry.length}</span>
        <span class="toggle-icon"
          >{#if countryExpanded}<Minus size={14} />{:else}<Plus size={14} />{/if}</span
        >
      </button>

      {#if countryExpanded}
        <div class="table-wrapper">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Country</th>
                <th class="numeric">Entities</th>
                <th class="numeric">Share</th>
              </tr>
            </thead>
            <tbody>
              {#each byCountry as row}
                <tr>
                  <td>{row.country}</td>
                  <td class="numeric">{row.entities.length}</td>
                  <td class="numeric share-cell">
                    <OwnershipPie percentage={row.totalShare} size={16} fillColor={colors.navy} />
                    <span>{row.totalShare.toFixed(1)}%</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}

  {#if showByType && byType.length > 0}
    <section class="summary-section">
      <button
        class="section-header"
        onclick={() => (typeExpanded = !typeExpanded)}
        aria-expanded={typeExpanded}
      >
        <span class="section-title">By Type</span>
        <span class="section-count">{byType.length}</span>
        <span class="toggle-icon"
          >{#if typeExpanded}<Minus size={14} />{:else}<Plus size={14} />{/if}</span
        >
      </button>

      {#if typeExpanded}
        <div class="table-wrapper">
          <table class="summary-table">
            <thead>
              <tr>
                <th>Type</th>
                <th class="numeric">Entities</th>
                <th class="numeric">Share</th>
              </tr>
            </thead>
            <tbody>
              {#each byType as row}
                <tr>
                  <td class="type-label">{row.type}</td>
                  <td class="numeric">{row.entities.length}</td>
                  <td class="numeric share-cell">
                    <OwnershipPie percentage={row.totalShare} size={16} fillColor={colors.navy} />
                    <span>{row.totalShare.toFixed(1)}%</span>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </section>
  {/if}
</div>

<style>
  .ownership-summary-tables {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .summary-section {
    border: var(--border-width) solid var(--color-border);
    background: var(--color-bg-primary);
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3) var(--space-4);
    background: var(--color-bg-secondary);
    border: none;
    cursor: pointer;
    text-align: left;
    font-family: inherit;
    transition: background 0.15s ease;
  }

  .section-header:hover {
    background: var(--color-bg-tertiary);
  }

  .section-title {
    flex: 1;
    font-size: var(--font-size-md);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
  }

  .section-count {
    font-size: var(--font-size-sm);
    color: var(--color-text-tertiary);
    font-family: var(--font-family-mono);
  }

  .toggle-icon {
    font-size: var(--font-size-lg);
    color: var(--color-text-secondary);
    width: 20px;
    text-align: center;
  }

  .table-wrapper {
    overflow-x: auto;
    padding: var(--space-3);
  }

  .summary-table {
    width: 100%;
    border-collapse: collapse;
    font-size: var(--font-size-body);
  }

  .summary-table th,
  .summary-table td {
    padding: var(--space-2) var(--space-3);
    text-align: left;
    border-bottom: var(--border-width) solid var(--color-gray-100);
  }

  .summary-table th {
    font-size: var(--font-size-sm);
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: var(--tracking-wide);
    color: var(--color-text-secondary);
    border-bottom-color: var(--color-gray-300);
  }

  .summary-table tbody tr:hover {
    background: var(--color-gray-50);
  }

  .summary-table tfoot td {
    font-weight: 600;
    border-top: var(--border-width) solid var(--color-gray-300);
    border-bottom: none;
    padding-top: var(--space-3);
  }

  .numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  .share-cell {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }

  .entity-link {
    color: var(--color-black);
    text-decoration: underline;
  }

  .entity-link:hover {
    text-decoration: none;
  }

  .type-label {
    text-transform: capitalize;
  }
</style>

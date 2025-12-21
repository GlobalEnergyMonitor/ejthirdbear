<script>
  /**
   * Ultimate Owners Component
   *
   * Traces ownership chains upward to find terminal ancestors.
   * Shows effective ownership percentages through intermediate holdings.
   *
   * Uses the ownership API's graph/up endpoint to traverse the ownership tree.
   */

  import { onMount } from 'svelte';
  import { entityLink } from '$lib/links';
  import { getEntityGraphUp } from '$lib/ownership-api';

  // Props
  let { entityId = '' } = $props();

  // State
  let loading = $state(true);
  let error = $state(null);
  let ultimateOwners = $state([]);

  /**
   * Calculate effective ownership percentage through a chain
   * Uses multiplication: if A owns 50% of B, and B owns 60% of C,
   * then A effectively owns 30% of C (0.5 * 0.6 = 0.3)
   */
  function calculateEffectiveOwnership(path, edges) {
    if (!path || path.length < 2) return null;

    const edgeMap = new Map();
    for (const edge of edges || []) {
      const key = `${edge.source}->${edge.target}`;
      edgeMap.set(key, edge.value || 0);
    }

    let effective = 1;
    for (let i = 0; i < path.length - 1; i++) {
      const key = `${path[i]}->${path[i + 1]}`;
      const pct = edgeMap.get(key);
      if (pct && pct > 0) {
        effective *= pct / 100;
      } else {
        // Unknown ownership in chain - can't calculate effective
        return null;
      }
    }

    return effective * 100;
  }

  /**
   * Find all paths from a node to terminal nodes (ultimate owners)
   * Uses BFS to find all paths to nodes with no outgoing edges (no owners above them)
   */
  function findPathsToTerminals(startId, nodes, edges) {
    const adjList = new Map();
    const nodeMap = new Map();

    // Build adjacency list (target -> sources, i.e., owned -> owners)
    for (const node of nodes || []) {
      nodeMap.set(node.id, node);
      adjList.set(node.id, []);
    }

    for (const edge of edges || []) {
      // Edge goes from owner (source) to owned (target)
      // We want to traverse upward: from target to source
      const owners = adjList.get(edge.target) || [];
      owners.push(edge.source);
      adjList.set(edge.target, owners);
    }

    // Find terminal nodes (no owners above them)
    const terminals = new Set();
    for (const node of nodes || []) {
      const owners = adjList.get(node.id) || [];
      if (owners.length === 0 && node.id !== startId) {
        terminals.add(node.id);
      }
    }

    // Also check is_terminal flag from API
    for (const node of nodes || []) {
      if (node.is_terminal) {
        terminals.add(node.id);
      }
    }

    // BFS to find all paths to terminals
    const paths = [];
    const queue = [[startId]];

    while (queue.length > 0) {
      const path = queue.shift();
      const current = path[path.length - 1];

      if (terminals.has(current)) {
        paths.push(path);
        continue;
      }

      const owners = adjList.get(current) || [];
      if (owners.length === 0 && current !== startId) {
        // Dead end that's not a recognized terminal - still include
        paths.push(path);
      } else {
        for (const owner of owners) {
          if (!path.includes(owner)) {
            // Avoid cycles
            queue.push([...path, owner]);
          }
        }
      }
    }

    return paths;
  }

  async function loadUltimateOwners() {
    if (!entityId) {
      loading = false;
      return;
    }

    loading = true;
    error = null;

    try {
      const graph = await getEntityGraphUp(entityId);

      // Find all paths to terminal owners
      const paths = findPathsToTerminals(entityId, graph.nodes, graph.edges);

      // Build ultimate owner data
      const nodeMap = new Map((graph.nodes || []).map((n) => [n.id, n]));
      const owners = [];

      for (const path of paths) {
        if (path.length < 2) continue;

        const terminalId = path[path.length - 1];
        const terminalNode = nodeMap.get(terminalId);
        if (!terminalNode) continue;

        const effectivePct = calculateEffectiveOwnership(
          [...path].reverse(), // Reverse: owner -> owned direction for calculation
          graph.edges
        );

        // Build path display (exclude the starting entity)
        const pathNodes = path.slice(1).map((id) => {
          const node = nodeMap.get(id);
          return {
            id,
            name: node?.Name || id,
            type: node?.type || 'entity',
          };
        });

        owners.push({
          id: terminalId,
          name: terminalNode.Name || terminalId,
          effectiveOwnership: effectivePct,
          pathLength: path.length - 1,
          path: pathNodes,
        });
      }

      // Sort by effective ownership (highest first), then by path length
      owners.sort((a, b) => {
        if (a.effectiveOwnership !== null && b.effectiveOwnership !== null) {
          return b.effectiveOwnership - a.effectiveOwnership;
        }
        if (a.effectiveOwnership !== null) return -1;
        if (b.effectiveOwnership !== null) return 1;
        return a.pathLength - b.pathLength;
      });

      // Dedupe by terminal ID (keep highest effective ownership)
      const seen = new Set();
      ultimateOwners = owners.filter((o) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      });
    } catch (err) {
      console.error('[UltimateOwners] Error:', err);
      error = err?.message || 'Failed to trace ownership';
    } finally {
      loading = false;
    }
  }

  onMount(() => {
    loadUltimateOwners();
  });
</script>

<section class="ultimate-owners">
  <h2>Ultimate Owners</h2>
  <p class="section-subtitle">
    Terminal entities in the ownership chain with no further owners on record
  </p>

  {#if loading}
    <p class="loading">Tracing ownership chain...</p>
  {:else if error}
    <p class="error">{error}</p>
  {:else if ultimateOwners.length === 0}
    <p class="no-data">No ultimate owners found in the ownership data.</p>
  {:else}
    <div class="owners-list">
      {#each ultimateOwners as owner}
        <div class="owner-card">
          <div class="owner-header">
            <a href={entityLink(owner.id)} class="owner-name">
              {owner.name}
            </a>
            {#if owner.effectiveOwnership !== null}
              <span class="effective-pct" title="Effective ownership through chain">
                {owner.effectiveOwnership.toFixed(1)}%
              </span>
            {/if}
          </div>

          {#if owner.path.length > 0}
            <div class="ownership-path">
              <span class="path-label">via:</span>
              <span class="path-chain">
                {#each owner.path as node, i}
                  {#if i > 0}
                    <span class="path-arrow">→</span>
                  {/if}
                  {#if node.id === owner.id}
                    <span class="path-terminal">{node.name}</span>
                  {:else}
                    <a href={entityLink(node.id)} class="path-node">{node.name}</a>
                  {/if}
                {/each}
              </span>
            </div>
          {/if}

          <div class="owner-meta">
            <span class="chain-length"
              >{owner.pathLength} step{owner.pathLength !== 1 ? 's' : ''} up</span
            >
          </div>
        </div>
      {/each}
    </div>

    {#if ultimateOwners.length > 0}
      <p class="methodology-note">
        Effective ownership calculated by multiplying ownership percentages through the chain. Only
        includes ownership relationships recorded in GEM data.
      </p>
    {/if}
  {/if}
</section>

<style>
  .ultimate-owners {
    margin: 40px 0;
  }

  h2 {
    font-size: 18px;
    font-weight: normal;
    margin: 0 0 8px 0;
    border-bottom: 1px solid var(--color-border);
    padding-bottom: 10px;
  }

  .section-subtitle {
    font-size: 12px;
    color: var(--color-text-secondary);
    margin: 0 0 20px 0;
  }

  .loading,
  .error,
  .no-data {
    font-size: 13px;
    color: var(--color-text-secondary);
    padding: 20px 0;
  }

  .error {
    color: var(--color-error);
  }

  .owners-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .owner-card {
    padding: 12px 16px;
    background: var(--color-gray-50);
    border-left: 3px solid var(--color-gray-700);
  }

  .owner-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    margin-bottom: 8px;
  }

  .owner-name {
    font-size: 14px;
    font-weight: 600;
    color: var(--color-black);
    text-decoration: none;
  }

  .owner-name:hover {
    text-decoration: underline;
  }

  .effective-pct {
    font-size: 14px;
    font-weight: bold;
    color: var(--color-gray-700);
    font-family: monospace;
  }

  .ownership-path {
    font-size: 11px;
    color: var(--color-text-secondary);
    margin-bottom: 6px;
    line-height: 1.6;
  }

  .path-label {
    color: var(--color-text-tertiary);
    margin-right: 4px;
  }

  .path-chain {
    display: inline;
  }

  .path-arrow {
    margin: 0 4px;
    color: var(--color-gray-300);
  }

  .path-node {
    color: var(--color-text-secondary);
    text-decoration: none;
  }

  .path-node:hover {
    text-decoration: underline;
    color: var(--color-gray-700);
  }

  .path-terminal {
    font-weight: 600;
    color: var(--color-gray-700);
  }

  .owner-meta {
    font-size: 10px;
    color: var(--color-text-tertiary);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }

  .methodology-note {
    font-size: 10px;
    color: var(--color-text-tertiary);
    margin-top: 16px;
    padding-top: 12px;
    border-top: 1px solid var(--color-gray-100);
    font-style: italic;
  }
</style>

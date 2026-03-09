/**
 * Narrative text builder for OwnershipTreeGraph.
 * Pure function — takes all inputs as parameters, returns structured text.
 */

import type { GraphNode, GraphEdge, OwnershipPathEntry } from '$lib/component-data/graph-types';

export interface NarrativeResult {
  lines: string[];
  mode: 'entity' | 'summary';
}

interface NarrativeParams {
  renderNodes: GraphNode[];
  renderEdges: GraphEdge[];
  nodes: GraphNode[];
  rootId: string;
  graphDirection: 'upstream' | 'downstream';
  focusId: string | null;
  pathsMap: Map<string, number>;
  edgePctMap: Map<string, number>;
  paths: Record<string, OwnershipPathEntry[]> | undefined;
}

/** Build the context-panel narrative text for the ownership tree. */
export function buildNarrativeText(params: NarrativeParams): NarrativeResult {
  const {
    renderNodes, renderEdges, nodes, rootId,
    graphDirection, focusId, pathsMap, edgePctMap, paths,
  } = params;

  const entityNodes = renderNodes.filter((n) => n.type !== 'asset' && n.id !== rootId);
  const isDownstream = graphDirection === 'downstream';
  const totalAccountedPct = Math.min(100, entityNodes.reduce((s, n) => {
    const directEdge = isDownstream
      ? renderEdges.find((e) => e.source === rootId && e.target === n.id)
      : renderEdges.find((e) => e.source === n.id && e.target === rootId);
    return s + (directEdge?.value || 0);
  }, 0));
  const unknownPct = Math.max(0, 100 - totalAccountedPct);
  const terminalCount = entityNodes.filter((n) => n.is_terminal).length;
  const assetName = nodes.find((n) => n.type === 'asset' || n.id === rootId)?.Name ||
                    nodes.find((n) => n.type === 'asset' || n.id === rootId)?.name || 'this asset';

  // Entity-specific narrative
  const focusNode = focusId ? nodes.find((n) => n.id === focusId) : null;

  if (focusNode && focusNode.type !== 'asset' && focusNode.id !== rootId) {
    const name = focusNode.name || focusNode.Name || focusNode.id;
    const nid = focusNode.entity_id || focusNode.id;
    const pct = pathsMap.get(nid) || edgePctMap.get(nid) || 0;
    const country = focusNode.headquarters_country;
    const eType = focusNode.entity_type;
    const isTerminal = focusNode.is_terminal;

    const pathEntries = paths ? paths[nid] : null;
    const longestRoute = pathEntries
      ? Math.max(...pathEntries.map((p: OwnershipPathEntry) => p.route?.length || 0))
      : 0;
    const intermediaries = Math.max(0, longestRoute - 2);

    const parts: string[] = [];

    let identity = name;
    if (eType && country) identity += ` is a ${eType} based in ${country}`;
    else if (country) identity += ` is based in ${country}`;
    else if (eType) identity += ` is a ${eType}`;
    parts.push(identity + '.');

    if (pct > 0) {
      let ownershipLine = isDownstream
        ? `${assetName} holds ${pct.toFixed(1)}% cumulative ownership of ${name}`
        : `Holds ${pct.toFixed(1)}% cumulative ownership of ${assetName}`;
      if (intermediaries > 0) {
        ownershipLine += ` through ${intermediaries} intermediar${intermediaries === 1 ? 'y' : 'ies'}`;
      }
      parts.push(ownershipLine + '.');
    }

    if (isTerminal) {
      parts.push(
        isDownstream
          ? 'Terminal downstream entity — no further controlled subsidiaries identified.'
          : 'Ultimate owner — no further parent entities identified.'
      );
    }

    return { lines: parts, mode: 'entity' };
  }

  // Default: graph summary
  const lines: string[] = [];
  const directRel = entityNodes.filter((n) =>
    isDownstream
      ? renderEdges.some((e) => e.source === rootId && e.target === n.id)
      : renderEdges.some((e) => e.source === n.id && e.target === rootId)
  );
  lines.push(
    isDownstream
      ? `${assetName} has ${directRel.length} directly held entit${directRel.length === 1 ? 'y' : 'ies'}` +
        ` and ${entityNodes.length} entities in this downstream structure.`
      : `${assetName} has ${directRel.length} direct owner${directRel.length !== 1 ? 's' : ''}` +
        ` and ${entityNodes.length} entities in its ownership structure.`
  );
  if (unknownPct > 1) {
    lines.push(`${unknownPct.toFixed(0)}% of ownership is unaccounted for in available records.`);
  } else if (totalAccountedPct >= 99) {
    lines.push('Ownership is fully accounted for in available records.');
  }
  if (terminalCount > 0) {
    lines.push(
      isDownstream
        ? `${terminalCount} terminal downstream entit${terminalCount === 1 ? 'y' : 'ies'} identified.`
        : `${terminalCount} ultimate owner${terminalCount !== 1 ? 's' : ''} identified at the top of the chain.`
    );
  }
  return { lines, mode: 'summary' };
}

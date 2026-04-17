/**
 * Portfolio ownership path construction — ported from the Observable notebook
 * (5a1f34aee34fe4cf), which Nadieh designed to play nice with d3.tree/cluster.
 *
 * The core trick: a d3 tree wants exactly one parent per node, but ownership is
 * a DAG. The notebook resolves this by picking one "best" path per leaf
 * (longest first — preserves the deepest intermediary chain), then exposing
 * the *unused* nodes/edges separately so the UI can surface them.
 *
 * Pipeline:
 *   1. buildGraphLookups            — adjacency + edge values + asset→project map
 *   2. collectAllPathsDFS           — DFS every root→leaf path (DROP: dead-end entities, cycles)
 *   3. selectBestPathPerLeaf        — pick ONE path per leaf: longest, then highest %
 *   4. findUnusedGraphElements      — nodes + edges NOT on any selected path
 *   5. computeEntityCumulativePct   — BFS cumulative % for every entity node
 *   6. buildHierarchyFromPaths      — materialize as nested {name, children}
 *   7. pruneBranchesWithoutLeaves   — drop subtrees that don't reach a valid leaf
 *   8. collapseLinearOwnershipChains — merge single-child ≥95% chains into one node
 *   9. dropSingleSyntheticRoot      — if root has one child, promote that child
 *
 * The renderer uses selected paths for the tree backbone AND renders
 * unused edges as additional links, so alternate routes stay visible.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

// =============================================================================
// Types
// =============================================================================

export interface GraphNode {
  node_type?: string;
  entity_id?: string;
  asset_id?: string;
  location_id?: string;
  unit_id?: string;
  name?: string;
  full_name?: string;
  [k: string]: any;
}

export interface GraphEdge {
  source: string;
  target: string;
  value?: number | null;
  imputed_share?: boolean;
}

export interface RawPath {
  /** Full node-id sequence: [rootId, ...intermediaries, leafProjectId] */
  path: string[];
  /** Cumulative ownership % at the leaf (product of edge shares along the path) */
  pct: number;
  /** path.length — used to pick the longest route per leaf */
  depth: number;
}

export interface UnusedElements {
  /** Nodes that never appeared on a selected path */
  unusedNodes: Set<string>;
  /** "source→target" keys for edges not traversed by any selected path */
  unusedEdges: GraphEdge[];
}

export interface HierNode {
  name: string;
  children: HierNode[];
  collapsedEntities?: string[];
}

export interface GraphLookups {
  /** source → list of child ids */
  childrenOf: Map<string, string[]>;
  /** source → target → edge value (ownership %) */
  edgeValue: Map<string, Map<string, number | null | undefined>>;
  /** "source→target" → imputed flag */
  edgeImputed: Map<string, boolean>;
  /** asset_id → project id (location_id or unit_id, fallback asset_id) */
  assetToProject: Map<string, string>;
}

export interface MakeTreePathsResult {
  /** Every root→leaf path the DFS found (before leaf-selection) */
  paths: RawPath[];
  /** The "best" (longest) path per leaf — what the tree renders */
  selected: RawPath[];
  /** `selected` flattened into "a/b/c" strings for d3 */
  pathStrings: string[];
  /** projectID → cumulative ownership %, summed across distinct top-level chains */
  cumulativePctMap: Map<string, number>;
  /** entity_id → cumulative ownership %, summed across all paths (full DAG) */
  cumulativeEntityPctMap: Map<string, number>;
  /** Max path depth across all raw paths */
  maxDepth: number;
  /** "source→target" → imputed flag */
  edgeImputed: Map<string, boolean>;
  /** Nodes + edges NOT on any selected path — for "duplicative intermediaries" UI and ghost-line rendering */
  unused: UnusedElements;
}

// =============================================================================
// 1. Graph lookups
// =============================================================================

export function buildGraphLookups(nodes: GraphNode[], edges: GraphEdge[]): GraphLookups {
  const childrenOf = new Map<string, string[]>();
  const edgeValue = new Map<string, Map<string, number | null | undefined>>();
  const edgeImputed = new Map<string, boolean>();

  for (const e of edges) {
    let kids = childrenOf.get(e.source);
    if (!kids) {
      kids = [];
      childrenOf.set(e.source, kids);
    }
    kids.push(e.target);

    let vmap = edgeValue.get(e.source);
    if (!vmap) {
      vmap = new Map();
      edgeValue.set(e.source, vmap);
    }
    vmap.set(e.target, e.value ?? null);

    edgeImputed.set(`${e.source}→${e.target}`, !!e.imputed_share);
  }

  const assetToProject = new Map<string, string>();
  for (const n of nodes) {
    if (n.node_type === 'asset' && n.asset_id) {
      const projId = n.location_id || n.unit_id || n.asset_id;
      assetToProject.set(n.asset_id, projId);
    }
  }

  return { childrenOf, edgeValue, edgeImputed, assetToProject };
}

// =============================================================================
// 2. DFS — collect ALL root→leaf paths
// =============================================================================

/**
 * DFS every root→leaf-project path with cumulative ownership % on each edge.
 *
 * Port of the Observable notebook's `generateAllPathsFromRoot` — uses a
 * per-descent copy of `visitedInPath` (`new Set(visitedInPath)`) so branches
 * don't share state.
 *
 * DROPS:
 *  - Cycles within a single root→leaf descent.
 *  - Dead-end entities: leaf with no children that isn't a known project.
 */
export function collectAllPathsDFS(
  lookups: GraphLookups,
  rootEntityId: string,
  projectIds: Set<string>
): RawPath[] {
  const { childrenOf, edgeValue, assetToProject } = lookups;
  const paths: RawPath[] = [];

  function dfs(nodeId: string, path: string[], cumPct: number, visitedInPath: Set<string>): void {
    if (visitedInPath.has(nodeId)) return;
    visitedInPath.add(nodeId);
    path.push(nodeId);

    const children = childrenOf.get(nodeId) || [];

    if (children.length === 0) {
      const projId = assetToProject.get(nodeId) || nodeId;
      if (projectIds.has(projId) || projectIds.has(nodeId)) {
        const full = projId === nodeId ? [...path] : [...path, projId];
        paths.push({ path: full, pct: cumPct, depth: full.length });
      }
      path.pop();
      return;
    }

    for (const child of children) {
      const ev = edgeValue.get(nodeId)?.get(child);
      const childPct = ev != null ? (cumPct * ev) / 100 : cumPct;

      // Asset child resolves directly to a project leaf — record without recursing.
      const resolved = assetToProject.get(child);
      if (resolved && projectIds.has(resolved)) {
        const full = [...path, resolved];
        paths.push({ path: full, pct: childPct, depth: full.length });
      } else {
        dfs(child, path, childPct, new Set(visitedInPath));
      }
    }

    path.pop();
  }

  dfs(rootEntityId, [], 100, new Set());
  return paths;
}

// =============================================================================
// 3. Pick ONE best path per leaf — longest first, then highest ownership
// =============================================================================

/**
 * Group paths by leaf, pick the best per group.
 *
 * "Best" = longest path (preserves deepest intermediary chain);
 * tiebreak: highest cumulative ownership %.
 *
 * Port of the Observable notebook's `selectBestPathPerLeaf`. The non-selected
 * paths aren't lost — `findUnusedGraphElements` surfaces them as edges/nodes
 * to overlay + to list as "duplicative intermediaries hidden".
 */
export function selectBestPathPerLeaf(paths: RawPath[]): RawPath[] {
  const grouped = new Map<string, RawPath[]>();
  for (const p of paths) {
    const leaf = p.path[p.path.length - 1];
    let bucket = grouped.get(leaf);
    if (!bucket) {
      bucket = [];
      grouped.set(leaf, bucket);
    }
    bucket.push(p);
  }

  const selected: RawPath[] = [];
  for (const bucket of grouped.values()) {
    bucket.sort((a, b) => b.depth - a.depth || b.pct - a.pct);
    selected.push(bucket[0]);
  }
  return selected;
}

/** Sum cumulative % per leaf project across all selected (rendered) paths. */
export function sumSelectedPathPctByLeaf(selected: RawPath[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const { path, pct } of selected) {
    const leaf = path[path.length - 1];
    out.set(leaf, (out.get(leaf) || 0) + pct);
  }
  return out;
}

// =============================================================================
// 4. Find graph elements NOT on any selected path
// =============================================================================

/**
 * Given the full graph and the winning paths, compute the nodes and edges
 * the tree won't render. Port of the notebook's `findUnusedGraphElements`.
 *
 * Critical detail: the DFS short-circuits entity→asset children by recording
 * the *project id* the asset resolves to (so tree leaves align with project
 * rows). That means `usedEdges` holds "entity→project" keys while
 * `apiData.edges` holds "entity→asset" keys. Without normalization every
 * real tree edge would be flagged unused — doubling every link with a ghost.
 * We use `assetToProject` here to match the DFS shortcut and also treat an
 * asset as "used" when its project sits on a selected path.
 */
export function findUnusedGraphElements(
  nodes: GraphNode[],
  edges: GraphEdge[],
  selected: RawPath[],
  assetToProject: Map<string, string>
): UnusedElements {
  const usedNodes = new Set<string>();
  const usedEdges = new Set<string>();

  for (const { path } of selected) {
    for (let i = 0; i < path.length; i++) {
      usedNodes.add(path[i]);
      if (i < path.length - 1) usedEdges.add(`${path[i]}→${path[i + 1]}`);
    }
  }

  const normalize = (id: string) => assetToProject.get(id) || id;

  const unusedNodes = new Set<string>();
  for (const n of nodes) {
    const id = n.entity_id || n.asset_id;
    if (!id) continue;
    if (usedNodes.has(id)) continue;
    if (usedNodes.has(normalize(id))) continue;
    unusedNodes.add(id);
  }

  const unusedEdges = edges.filter((e) => {
    const normTarget = normalize(e.target);
    if (usedEdges.has(`${e.source}→${e.target}`)) return false;
    if (usedEdges.has(`${e.source}→${normTarget}`)) return false;
    return true;
  });

  return { unusedNodes, unusedEdges };
}

// =============================================================================
// 5. Entity cumulative % — BFS over the whole DAG
// =============================================================================

/**
 * BFS root→descendants, summing cumulative % for every entity node.
 * Each edge is processed once (`processedEdges`), but a node reached via multiple
 * edges accumulates their contributions.
 *
 * DROPS: nothing. Operates on the whole graph regardless of project filtering.
 */
export function computeEntityCumulativePct(
  lookups: GraphLookups,
  rootEntityId: string
): Map<string, number> {
  const { childrenOf, edgeValue } = lookups;
  const out = new Map<string, number>();
  const processedEdges = new Set<string>();
  const queue: { nodeId: string; cumPct: number }[] = [{ nodeId: rootEntityId, cumPct: 100 }];

  while (queue.length > 0) {
    const { nodeId, cumPct } = queue.shift()!;
    for (const child of childrenOf.get(nodeId) || []) {
      const edgeKey = `${nodeId}→${child}`;
      if (processedEdges.has(edgeKey)) continue;
      processedEdges.add(edgeKey);
      const ev = edgeValue.get(nodeId)?.get(child);
      const childPct = ev != null ? (cumPct * ev) / 100 : cumPct;
      out.set(child, (out.get(child) || 0) + childPct);
      queue.push({ nodeId: child, cumPct: childPct });
    }
  }

  return out;
}

// =============================================================================
// Top-level composer — mirrors the original `makeTreePaths` behavior
// =============================================================================

export function makeTreePaths(
  graph: { nodes: GraphNode[]; edges: GraphEdge[] },
  rootEntityId: string,
  groups: { projectID: string }[]
): MakeTreePathsResult {
  const lookups = buildGraphLookups(graph.nodes, graph.edges);
  const projectIds = new Set(groups.map((g) => g.projectID));

  const paths = collectAllPathsDFS(lookups, rootEntityId, projectIds);
  const selected = selectBestPathPerLeaf(paths);
  const pathStrings = selected.map((p) => p.path.join('/'));
  const cumulativePctMap = sumSelectedPathPctByLeaf(selected);
  const cumulativeEntityPctMap = computeEntityCumulativePct(lookups, rootEntityId);
  const unused = findUnusedGraphElements(
    graph.nodes,
    graph.edges,
    selected,
    lookups.assetToProject
  );
  const maxDepth = paths.reduce((m, p) => Math.max(m, p.path.length - 1), 0);

  return {
    paths,
    selected,
    pathStrings,
    cumulativePctMap,
    cumulativeEntityPctMap,
    maxDepth,
    edgeImputed: lookups.edgeImputed,
    unused,
  };
}

// =============================================================================
// 6. Materialize nested {name, children} from path strings
// =============================================================================

export function buildHierarchyFromPaths(pathStrings: string[]): HierNode {
  const root: HierNode = { name: 'root', children: [] };
  for (const ps of pathStrings) {
    let cur = root;
    for (const part of ps.split('/')) {
      let child = cur.children.find((c) => c.name === part);
      if (!child) {
        child = { name: part, children: [] };
        cur.children.push(child);
      }
      cur = child;
    }
  }
  return root;
}

// =============================================================================
// 7. Prune — drop subtrees that don't reach a valid leaf
// =============================================================================

/**
 * Recursively remove children that aren't valid leaves and have no surviving descendants.
 *
 * DROPS: any intermediary whose descendants all got filtered out, even if that
 * intermediary is explicitly selected via the intermediary filter.
 */
export function pruneBranchesWithoutLeaves(hier: HierNode, validLeafIds: Set<string>): void {
  hier.children = hier.children.filter((c) => {
    pruneBranchesWithoutLeaves(c, validLeafIds);
    return c.children.length > 0 || validLeafIds.has(c.name);
  });
}

// =============================================================================
// 8. Collapse linear ≥95% chains into one node
// =============================================================================

/**
 * If a node has exactly one child AND the edge to that child is ≥95% ownership,
 * splice the child out (its grandchildren become the node's children).
 *
 * DROPS from the visible tree: single-child intermediaries on near-full ownership
 * chains. They're recorded in `collapsedEntities` for tooltips, but can't be
 * individually selected / highlighted.
 */
export function collapseLinearOwnershipChains(
  hier: HierNode,
  edgeValueMap: Map<string, number | null | undefined>
): void {
  for (const child of hier.children) {
    collapseLinearOwnershipChains(child, edgeValueMap);
  }
  while (hier.children.length === 1 && hier.children[0].children.length > 0) {
    const only = hier.children[0];
    const edgeVal = edgeValueMap.get(`${hier.name}→${only.name}`);
    if (edgeVal != null && edgeVal < 95) break;
    if (!hier.collapsedEntities) hier.collapsedEntities = [];
    hier.collapsedEntities.push(only.name);
    hier.children = only.children;
  }
}

// =============================================================================
// 9. Drop synthetic root if it only has one real child
// =============================================================================

/**
 * When the DFS produces a single top-level branch, the synthetic "root" node
 * is redundant. This returns the child so d3.hierarchy starts at the real owner.
 *
 * SIDE EFFECT: if anywhere downstream expects the `root` label to exist
 * (e.g. to render the spotlight owner at depth 0), this step shifts depth by 1.
 */
export function dropSingleSyntheticRoot(hier: HierNode): HierNode {
  return hier.children.length === 1 ? hier.children[0] : hier;
}

// =============================================================================
// Composer for the render-time hierarchy
// =============================================================================

export interface BuildRenderHierarchyOptions {
  applyPrune?: boolean;
  applyCollapse?: boolean;
  applyRootPromotion?: boolean;
}

/** Compose steps 6–9 with per-step toggles so we can A/B where the bug lives. */
export function buildRenderHierarchy(
  pathStrings: string[],
  validLeafIds: Set<string>,
  edges: GraphEdge[],
  opts: BuildRenderHierarchyOptions = {}
): HierNode {
  const { applyPrune = true, applyCollapse = true, applyRootPromotion = true } = opts;

  const hier = buildHierarchyFromPaths(pathStrings);

  if (applyPrune) pruneBranchesWithoutLeaves(hier, validLeafIds);

  if (applyCollapse) {
    const edgeValueMap = new Map<string, number | null | undefined>();
    for (const e of edges) edgeValueMap.set(`${e.source}→${e.target}`, e.value ?? null);
    collapseLinearOwnershipChains(hier, edgeValueMap);
  }

  return applyRootPromotion ? dropSingleSyntheticRoot(hier) : hier;
}

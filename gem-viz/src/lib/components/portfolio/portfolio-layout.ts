/**
 * Portfolio Explorer layout algorithm.
 *
 * One file for all the sizing math. The component measures its container,
 * passes dimensions + tree metadata here, and gets back pixel values for
 * the tree SVG and asset grid.
 *
 * Key idea: the tree claims more horizontal space when there are fewer
 * assets (no dead whitespace) and less when there are many (assets need room).
 *
 * Common tweaks:
 *  - Tree too narrow/wide   -> TREE_MAX_SHARE_BY_LEAF_COUNT
 *  - Nodes too close horiz  -> DEPTH_PX_MIN / DEPTH_PX_MAX
 *  - Rows too tight/loose   -> ROW_HEIGHT
 *  - Entity circles size    -> NODE_RADIUS
 *  - Grid columns narrow    -> GRID_MIN_COL_WIDTH
 */

// -- Tree width share by leaf count --
// Fewer leaves = tree gets more room. First match wins.
//   <=5  -> 0.55 (few assets, fill the space)
//   <=10 -> 0.45 (balanced)
//   <=20 -> 0.40 (give assets more room)
//   >20  -> 0.35 (tree stays compact)
const TREE_MAX_SHARE_BY_LEAF_COUNT: [number, number][] = [
  [5, 0.55],
  [10, 0.45],
  [20, 0.40],
];
const TREE_MAX_SHARE_DEFAULT = 0.35;

// -- Depth spacing --
// px per depth level (one hop in the ownership chain). Clamped to min/max.
const DEPTH_PX_MIN = 60;
const DEPTH_PX_MAX = 100;
const DEPTH_PX_PADDING = 60; // extra px after depth calc for label room
const MIN_TREE_WIDTH = 100;  // absolute floor

// -- Tree SVG margins --
const TREE_MARGIN_LEFT = 50;  // room for root entity label
const TREE_MARGIN_TOP = 20;
const TREE_MARGIN_RIGHT = 4;
const TREE_MARGIN_BOTTOM = 20;

// -- Vertical spacing --
const ROW_HEIGHT = 28;           // px per leaf row
const SIBLING_SEPARATION = 1.0;  // d3.cluster separation for same-parent
const COUSIN_SEPARATION = 1.4;   // d3.cluster separation for different-parent
const NODE_RADIUS = 8;           // intermediary entity circle radius

// -- Grid --
const GRID_MIN_COL_WIDTH = 200;    // min px before dropping to fewer columns
const GRID_MAX_COLS = 2;           // max columns when tree is hidden
const GRID_HORIZONTAL_PAD = 8;     // px subtracted from container width
const GRID_ROW_HEIGHT = 28;        // default asset row height
const GRID_ROW_HEIGHT_MIN = 20;    // floor when condensing
const GRID_SINGLE_COL_ROW_CAP = 22;
const GRID_CONDENSE_THRESHOLD = 15; // condense rows when tree visible + more than this


// -- Types --

export interface LayoutInputs {
  containerWidth: number;   // chart-area width in px (excludes sidebar)
  containerHeight: number;  // chart-area height in px
  depth: number;            // root.height (0 = just root, 4 = five levels)
  leafCount: number;        // number of leaf assets in tree
  isMobile: boolean;        // viewport below "sm" breakpoint
  showTree: boolean;        // ownership tree visible (<=30 assets & depth <7)
  projectCount: number;     // total project groups after filtering
}

export interface TreeLayout {
  margin: { left: number; top: number; right: number; bottom: number };
  width: number;              // inner width for d3.cluster (excludes margins)
  height: number;             // inner height for d3.cluster
  svgWidth: number;           // full SVG width (inner + margins)
  svgHeight: number;          // full SVG height
  rowHeight: number;
  siblingSeparation: number;
  cousinSeparation: number;
  nodeRadius: number;
}

export interface GridLayout {
  cols: number;
  colWidth: number;
  rows: number;
  availableWidth: number;
  assetMarkHeight: number;
  assetMarkSingle: number;    // condensed height for single-column tree mode
  isSingleColumn: boolean;    // true when aligned to tree leaf Y positions
}


// -- Helpers --

function getTreeMaxShare(leafCount: number): number {
  for (const [threshold, share] of TREE_MAX_SHARE_BY_LEAF_COUNT) {
    if (leafCount <= threshold) return share;
  }
  return TREE_MAX_SHARE_DEFAULT;
}

function getDepthPx(containerWidth: number, depth: number): number {
  const raw = containerWidth / (depth + 1) / 3;
  return Math.max(DEPTH_PX_MIN, Math.min(DEPTH_PX_MAX, raw));
}


// -- Public API --

/** Compute tree SVG dimensions. Called once per drawTree(). */
export function computeTreeLayout(inputs: LayoutInputs): TreeLayout {
  const { containerWidth, containerHeight, depth, leafCount } = inputs;

  // Width: idealWidth = depthPx * levels + padding, capped by max share
  const maxShare = getTreeMaxShare(leafCount);
  const depthPx = getDepthPx(containerWidth, depth);
  const idealWidth = depthPx * (depth + 1) + DEPTH_PX_PADDING;
  const maxWidth = containerWidth * maxShare;
  const treeTotalWidth = Math.min(idealWidth, maxWidth);

  const margin = {
    left: TREE_MARGIN_LEFT,
    top: TREE_MARGIN_TOP,
    right: TREE_MARGIN_RIGHT,
    bottom: TREE_MARGIN_BOTTOM,
  };
  const innerWidth = Math.max(treeTotalWidth - margin.left - margin.right, MIN_TREE_WIDTH);

  // Height: estimate from leafCount, refined by computeTreeHeight()
  const estimatedContentHeight = leafCount * ROW_HEIGHT * 1.2;
  const availableHeight = Math.max(200, containerHeight - 80);
  const innerHeight = Math.max(estimatedContentHeight, availableHeight);

  return {
    margin,
    width: innerWidth,
    height: innerHeight,
    svgWidth: innerWidth + margin.left + margin.right,
    svgHeight: innerHeight + margin.top + margin.bottom,
    rowHeight: ROW_HEIGHT,
    siblingSeparation: SIBLING_SEPARATION,
    cousinSeparation: COUSIN_SEPARATION,
    nodeRadius: NODE_RADIUS,
  };
}

/**
 * Exact tree height from real gap data. Call after building the d3 hierarchy
 * and counting sibling vs cousin gaps between consecutive leaves.
 */
export function computeTreeHeight(
  leafCount: number,
  sibGaps: number,
  cousinGaps: number,
  containerHeight: number,
): number {
  const contentHeight =
    leafCount * ROW_HEIGHT +
    sibGaps * SIBLING_SEPARATION +
    cousinGaps * COUSIN_SEPARATION;
  const availableHeight = Math.max(200, containerHeight - 80);
  return Math.max(contentHeight, availableHeight);
}

/** Compute asset grid dimensions. Called once per drawAssets(). */
export function computeGridLayout(inputs: LayoutInputs): GridLayout {
  const { containerWidth, containerHeight, isMobile, showTree, projectCount } = inputs;

  const availableWidth = Math.max(containerWidth - GRID_HORIZONTAL_PAD, 200);
  const maxCols = isMobile || showTree ? 1 : GRID_MAX_COLS;
  const cols = Math.max(1, Math.min(maxCols, Math.floor(availableWidth / GRID_MIN_COL_WIDTH)));
  const colWidth = Math.floor(availableWidth / cols);
  const rows = Math.ceil(projectCount / cols);

  // Condense row height when tree visible + many assets
  let assetMarkHeight = GRID_ROW_HEIGHT;
  if (showTree && projectCount > GRID_CONDENSE_THRESHOLD) {
    assetMarkHeight = Math.max(
      GRID_ROW_HEIGHT_MIN,
      Math.floor((containerHeight - 100) / projectCount),
    );
  }
  const assetMarkSingle = Math.min(GRID_SINGLE_COL_ROW_CAP, assetMarkHeight);

  return {
    cols,
    colWidth,
    rows,
    availableWidth,
    assetMarkHeight,
    assetMarkSingle,
    isSingleColumn: showTree && cols === 1,
  };
}

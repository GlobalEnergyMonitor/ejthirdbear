# GEM Ownership Analytics: Technical White Paper

**DRAFT v0.1 - February 2026**

---

## Abstract

This paper documents the algorithmic framework for analyzing corporate ownership structures in global energy infrastructure. We present methods for ownership path computation, market concentration analysis, and graph-based visualization of complex multi-layered corporate relationships. Current evaluation metrics are identified, along with gaps requiring additional validation.

---

## 1. Introduction

### 1.1 Problem Statement

Global energy infrastructure ownership is characterized by:
- Multi-layered corporate structures (shell companies, holding companies, SPVs)
- Cross-border ownership chains spanning 10+ jurisdictions
- Partial ownership stakes requiring cumulative percentage calculations
- Cyclic ownership relationships in complex corporate structures

### 1.2 Contributions

1. **Ownership Path Algorithm** - Traversal and cumulative calculation across ownership chains
2. **Concentration Metrics** - HHI and Gini coefficient applied to energy sector ownership
3. **Graph Layout Algorithm** - Modified Dagre with label collision detection
4. **Co-Investment Analysis** - Entity pair frequency detection for syndication patterns

---

## 2. Data Model

### 2.1 Entity Types

| Type | Description | ID Format |
|------|-------------|-----------|
| Asset | Physical infrastructure (plant, mine, pipeline) | G*, M*, P* prefixes |
| Entity | Legal owner (corporation, government, fund) | E* prefix |
| Path | Ownership chain from entity to asset | Array of edges |

### 2.2 Ownership Edge Schema

```
{
  source: EntityID,      // Parent owner
  target: EntityID|AssetID,  // Child owned
  value: Number,         // Percentage (0-100)
  depth: Number,         // Distance from asset (0 = direct owner)
  imputed_share: Boolean // Whether percentage was estimated
}
```

### 2.3 Data Quality Assumptions

| Assumption | Status | Validation |
|------------|--------|------------|
| Percentages sum to ≤100% per asset | **UNTESTED** | No constraint enforcement |
| No orphan nodes in graph | Tested | 156,004 rows, 0 orphans |
| Unique asset IDs across trackers | **UNTESTED** | COALESCE relies on mutual exclusivity |
| Path depths are consistent | **UNTESTED** | Same entity can appear at multiple depths |

---

## 3. Algorithms

### 3.1 Cumulative Ownership Calculation

**Problem**: Calculate total ownership stake when entity owns asset through multiple paths.

**Algorithm**:
```
CumulativeOwnership(entity, asset, paths) =
  Σ (path.cumulative_pct) for all paths from entity to asset
```

**Example**:
- Entity A owns 50% of Intermediary X
- Entity A owns 30% of Intermediary Y
- Intermediary X owns 40% of Asset Z
- Intermediary Y owns 60% of Asset Z

```
Path 1: A → X → Z = 50% × 40% = 20%
Path 2: A → Y → Z = 30% × 60% = 18%
Total: 20% + 18% = 38%
```

#### EVAL GAP #1: Path Completeness
- **Current state**: Assumes all paths are enumerated in data
- **Missing eval**: Validate that Σ(all owner cumulative%) ≈ 100% per asset
- **Proposed metric**: `PathCompleteness = Σ(cumulative_pct) / 100` per asset
- **Expected range**: 0.95 - 1.05 (allowing for rounding)

#### EVAL GAP #2: Imputation Accuracy
- **Current state**: `imputed_share` flag marks estimated percentages
- **Missing eval**: No accuracy measurement for imputed values
- **Proposed metric**: Compare imputed vs actual when ground truth available
- **Data source**: SEC 13F filings, company annual reports

---

### 3.2 Herfindahl-Hirschman Index (HHI)

**Formula**:
```
HHI = Σ(share_i²) where share_i is percentage of total (0-100)
```

**Implementation**:
```javascript
function calculateHHI(shares) {
  const total = shares.reduce((sum, s) => sum + s, 0);
  const normalized = shares.map(s => (s / total) * 100);
  return normalized.reduce((sum, s) => sum + s * s, 0);
}
```

**Interpretation** (DOJ Guidelines):
| HHI Range | Classification |
|-----------|----------------|
| < 1,500 | Unconcentrated |
| 1,500 - 2,500 | Moderately concentrated |
| > 2,500 | Highly concentrated |

#### EVAL GAP #3: HHI Calibration
- **Current state**: Direct application of DOJ merger guidelines
- **Missing eval**: Validation that energy sector follows same thresholds
- **Proposed study**: Compare HHI distribution against known competitive/monopolistic markets
- **Hypothesis**: Energy infrastructure may have structurally higher baseline HHI

---

### 3.3 Gini Coefficient

**Formula**:
```
G = Σ|x_i - x_j| / (2n² × mean(x)) for all i,j pairs
```

**Complexity**: O(n²) - acceptable for owner counts < 1000

#### EVAL GAP #4: Gini Interpretation
- **Current state**: Generic inequality thresholds (0.2/0.4/0.6)
- **Missing eval**: Energy-sector-specific benchmarks
- **Proposed metric**: Compare against S&P 500 ownership Gini as baseline

---

### 3.4 Graph Layout (Modified Dagre)

**Algorithm**:
1. Construct DAG with `rankdir: 'BT'` (bottom-to-top)
2. Apply Sugiyama-style layering
3. Post-process with label collision detection

**Label Collision Rules**:
```
Rule 1a: Single node at rank → center below
Rule 1b: All gaps ≥ minGapNeeded → center all
Rule 2:  Two nodes, tight gap → shift left label left
Rule 3:  Fallback → stack below with reduced font
```

#### EVAL GAP #5: Layout Quality
- **Current state**: No quantitative layout metrics
- **Missing evals**:
  - Edge crossing count
  - Label overlap percentage
  - Aspect ratio deviation from golden ratio
- **Proposed metric**: `LayoutQuality = 1 - (crossings/maxCrossings) - (overlaps/labels)`

---

### 3.5 Spine Detection (nodesToShowText)

**Algorithm**:
```
1. Start at asset node
2. While exactly 1 parent exists:
   - Add parent to spine set
   - Move to parent
3. Stop when 0 or 2+ parents found
```

**Purpose**: Identify the "trunk" of ownership tree for always-visible labels.

#### EVAL GAP #6: Spine Representativeness
- **Current state**: Shows arbitrary single path when multiple exist
- **Missing eval**: Does spine represent majority ownership?
- **Proposed metric**: `SpineOwnership = Σ(spine path %) / Σ(all paths %)`
- **Threshold**: Spine should represent > 50% of ownership

---

### 3.6 Co-Investment Pattern Detection

**Algorithm**:
```
For each asset with multiple owners:
  For each pair (owner_i, owner_j):
    Increment pairCount[(i,j)]
Return top K pairs by frequency
```

**Complexity**: O(assets × owners²)

#### EVAL GAP #7: Co-Investment Significance
- **Current state**: Raw frequency counts only
- **Missing eval**: Statistical significance testing
- **Proposed metric**: Chi-squared test vs random co-occurrence baseline
- **Null hypothesis**: Entity pairs appear together by chance given individual frequencies

---

## 4. System Architecture

### 4.1 Data Pipeline

```
[GEM Trackers] → [REST API] → [MotherDuck] → [DuckDB WASM] → [Visualization]
                     ↓              ↓              ↓
                 [Cache]      [Parquet]      [IndexedDB]
```

### 4.2 Query Performance

| Query Type | P50 Latency | P99 Latency | Source |
|------------|-------------|-------------|--------|
| Owner aggregation | 2.1s | 8.3s | MotherDuck |
| Asset details | 180ms | 450ms | REST API |
| Graph traversal | 50ms | 200ms | Client-side |

#### EVAL GAP #8: Performance Regression
- **Current state**: No automated performance testing
- **Missing eval**: Latency tracking over time
- **Proposed metric**: Weekly P50/P99 benchmarks with alerting

---

## 5. Known Limitations

### 5.1 Data Limitations

1. **Temporal staleness**: MotherDuck snapshot from October 2025
2. **Coverage gaps**: Coal Mine, Iron Mine, Gas Pipeline not in aggregation DB
3. **Imputation rate**: Unknown % of ownership percentages are estimated

### 5.2 Algorithmic Limitations

1. **Cycle handling**: Cyclic ownership detected but not resolved
2. **Label collisions**: Heuristic-based, not optimal
3. **Large graphs**: >50 nodes cause performance degradation

### 5.3 Evaluation Limitations

| Gap ID | Description | Priority | Effort |
|--------|-------------|----------|--------|
| #1 | Path completeness validation | HIGH | Medium |
| #2 | Imputation accuracy | HIGH | High |
| #3 | HHI calibration for energy | MEDIUM | Medium |
| #4 | Gini benchmarks | LOW | Low |
| #5 | Layout quality metrics | MEDIUM | Medium |
| #6 | Spine representativeness | LOW | Low |
| #7 | Co-investment significance | MEDIUM | Medium |
| #8 | Performance regression | HIGH | Low |

---

## 6. Proposed Evaluation Framework

### 6.1 Data Quality Evals

```javascript
// Proposed: Add to test suite
describe('Data Quality', () => {
  it('ownership percentages sum to ~100% per asset', async () => {
    const assets = await getAllAssets();
    for (const asset of assets) {
      const totalOwnership = sumOwnershipPaths(asset);
      expect(totalOwnership).toBeWithin(95, 105);
    }
  });

  it('no orphan entities in graph', async () => {
    const { nodes, edges } = await getOwnershipGraph();
    const connectedNodes = new Set(edges.flatMap(e => [e.source, e.target]));
    const orphans = nodes.filter(n => !connectedNodes.has(n.id));
    expect(orphans).toHaveLength(0);
  });
});
```

### 6.2 Algorithm Correctness Evals

```javascript
describe('HHI Calculation', () => {
  it('returns 10000 for single owner', () => {
    expect(calculateHHI([100])).toBe(10000);
  });

  it('returns 5000 for two equal owners', () => {
    expect(calculateHHI([50, 50])).toBe(5000);
  });

  it('returns 2500 for four equal owners', () => {
    expect(calculateHHI([25, 25, 25, 25])).toBe(2500);
  });
});

describe('Gini Coefficient', () => {
  it('returns 0 for perfect equality', () => {
    expect(calculateGini([10, 10, 10, 10])).toBeCloseTo(0);
  });

  it('returns ~1 for perfect inequality', () => {
    expect(calculateGini([0, 0, 0, 100])).toBeCloseTo(0.75); // n-1/n
  });
});
```

### 6.3 Visual Regression Evals

```javascript
describe('Graph Layout', () => {
  it('has zero edge crossings for simple trees', async () => {
    const graph = await renderGraph(simpleTreeData);
    const crossings = countEdgeCrossings(graph);
    expect(crossings).toBe(0);
  });

  it('label overlap < 5% for typical graphs', async () => {
    const graph = await renderGraph(typicalData);
    const overlapRatio = measureLabelOverlap(graph);
    expect(overlapRatio).toBeLessThan(0.05);
  });
});
```

---

## 7. Future Work

1. **Temporal analysis**: Track ownership changes over time
2. **Beneficial ownership**: Resolve ultimate beneficial owners through shell companies
3. **Network metrics**: Betweenness centrality, clustering coefficient
4. **Prediction**: ML model for imputing missing ownership percentages
5. **Anomaly detection**: Identify unusual ownership patterns automatically

---

## Appendix A: Glossary

| Term | Definition |
|------|------------|
| Asset | Physical energy infrastructure (plant, mine, pipeline) |
| Entity | Legal owner (corporation, government body, investment fund) |
| Cumulative % | Total ownership through all paths |
| Imputed | Estimated when actual percentage unknown |
| Spine | Direct ownership path with no branching |
| HHI | Herfindahl-Hirschman Index (market concentration) |

---

## Appendix B: References

1. U.S. DOJ Horizontal Merger Guidelines (2010, revised 2023)
2. Gini, C. (1912). "Variabilità e mutabilità"
3. Sugiyama et al. (1981). "Methods for Visual Understanding of Hierarchical System Structures"
4. Global Energy Monitor Methodology Documentation

---

## Appendix C: Code References

| Algorithm | File | Function |
|-----------|------|----------|
| Cumulative ownership | `OwnershipTreeGraph.svelte` | `pathsData` |
| HHI | `src/lib/analysis/patterns.ts` | `calculateHHI` |
| Gini | `src/lib/analysis/patterns.ts` | `calculateGini` |
| Graph layout | `OwnershipTreeGraph.svelte` | `runLayout` |
| Label collision | `OwnershipTreeGraph.svelte` | `computeLabelPositions` |
| Spine detection | `OwnershipTreeGraph.svelte` | `nodesToShowText` |
| Co-investment | `src/lib/analysis/patterns.ts` | `analyzeCoInvestment` |


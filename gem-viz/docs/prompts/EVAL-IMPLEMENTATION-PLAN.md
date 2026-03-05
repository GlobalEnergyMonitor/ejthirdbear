# Evaluation Implementation Plan

**Priority ranking based on impact and effort**

---

## Critical Gaps (Ship Blockers)

### EVAL #1: Path Completeness Validation

**Status**: NOT IMPLEMENTED
**Impact**: HIGH - Core assumption of the entire system
**Effort**: Medium (2-3 days)

**What we need to prove**: Ownership percentages sum to ~100% per asset

**Implementation**:

```sql
-- Add to test suite or monitoring dashboard
SELECT
  "Asset ID",
  SUM(cumulative_pct) as total_ownership,
  CASE
    WHEN SUM(cumulative_pct) < 95 THEN 'INCOMPLETE'
    WHEN SUM(cumulative_pct) > 105 THEN 'OVER_ALLOCATED'
    ELSE 'VALID'
  END as status
FROM ownership_paths
GROUP BY "Asset ID"
HAVING status != 'VALID'
```

**Acceptance criteria**:

- [ ] 95% of assets have total ownership between 95-105%
- [ ] List of exceptions documented with reasons
- [ ] Alert when new data violates constraint

---

### EVAL #8: Performance Regression Testing

**Status**: NOT IMPLEMENTED
**Impact**: HIGH - User experience degradation invisible without tracking
**Effort**: Low (1 day)

**What we need to prove**: Query latencies don't regress over releases

**Implementation**:

```javascript
// Add to CI/CD pipeline
const BENCHMARKS = {
  'screener-query': { p50: 3000, p99: 10000 },
  'owner-aggregation': { p50: 2500, p99: 8000 },
  'asset-details': { p50: 200, p99: 500 },
};

async function runBenchmark(name, queryFn) {
  const times = [];
  for (let i = 0; i < 100; i++) {
    const start = performance.now();
    await queryFn();
    times.push(performance.now() - start);
  }
  times.sort((a, b) => a - b);
  return {
    p50: times[49],
    p99: times[98],
  };
}
```

**Acceptance criteria**:

- [ ] Benchmark runs on every PR
- [ ] Fails if P99 exceeds threshold by >20%
- [ ] Historical tracking in dashboard

---

## High Priority (Should Have)

### EVAL #2: Imputation Accuracy

**Status**: NOT IMPLEMENTED
**Impact**: HIGH - Affects all downstream calculations
**Effort**: High (1 week+)

**What we need to prove**: Imputed ownership percentages are accurate

**Challenge**: Need ground truth data from external sources

**Proposed approach**:

1. Sample 100 entities with `imputed_share=true`
2. Cross-reference against SEC 13F, company filings
3. Calculate Mean Absolute Error (MAE)

**Acceptance criteria**:

- [ ] MAE < 10 percentage points
- [ ] Document methodology
- [ ] Track imputation rate over time

---

### EVAL #7: Co-Investment Statistical Significance

**Status**: NOT IMPLEMENTED
**Impact**: MEDIUM - Core insight for investigative journalism use case
**Effort**: Medium (2-3 days)

**What we need to prove**: Entity pairs appear together more than chance

**Implementation**:

```javascript
function coInvestmentSignificance(entityA, entityB, data) {
  const totalAssets = data.assets.length;
  const assetsWithA = data.assets.filter((a) => a.owners.includes(entityA)).length;
  const assetsWithB = data.assets.filter((a) => a.owners.includes(entityB)).length;
  const assetsWithBoth = data.assets.filter(
    (a) => a.owners.includes(entityA) && a.owners.includes(entityB)
  ).length;

  // Expected co-occurrence under independence
  const expected = (assetsWithA / totalAssets) * (assetsWithB / totalAssets) * totalAssets;

  // Chi-squared statistic
  const chiSquared = Math.pow(assetsWithBoth - expected, 2) / expected;

  // p-value (1 degree of freedom)
  const pValue = 1 - chiSquaredCDF(chiSquared, 1);

  return {
    observed: assetsWithBoth,
    expected: expected.toFixed(1),
    chiSquared: chiSquared.toFixed(2),
    pValue: pValue < 0.001 ? '<0.001' : pValue.toFixed(3),
    significant: pValue < 0.05,
  };
}
```

**Acceptance criteria**:

- [ ] Top 10 co-investment pairs all have p < 0.05
- [ ] Display significance in UI
- [ ] Filter to show only significant pairs

---

## Medium Priority (Nice to Have)

### EVAL #3: HHI Energy Sector Calibration

**Status**: NOT IMPLEMENTED
**Impact**: MEDIUM - Affects interpretation of concentration metrics
**Effort**: Medium (3-5 days)

**What we need to prove**: DOJ thresholds apply to energy sector

**Proposed study**:

1. Calculate HHI for all asset types
2. Compare distribution against known competitive markets (retail)
3. Compare against known monopolistic markets (utilities)
4. Propose energy-specific thresholds if different

**Deliverable**: Section in white paper with distribution charts

---

### EVAL #5: Layout Quality Metrics

**Status**: NOT IMPLEMENTED
**Impact**: MEDIUM - Affects user comprehension
**Effort**: Medium (3-5 days)

**Metrics to implement**:

```javascript
function layoutQuality(graph) {
  return {
    edgeCrossings: countEdgeCrossings(graph.edges),
    labelOverlap: measureLabelOverlap(graph.nodes),
    aspectRatio: graph.width / graph.height,
    nodeSpread: calculateNodeSpread(graph.nodes),
  };
}

function countEdgeCrossings(edges) {
  let crossings = 0;
  for (let i = 0; i < edges.length; i++) {
    for (let j = i + 1; j < edges.length; j++) {
      if (edgesIntersect(edges[i], edges[j])) {
        crossings++;
      }
    }
  }
  return crossings;
}
```

**Acceptance criteria**:

- [ ] < 5% label overlap on graphs with < 20 nodes
- [ ] Edge crossings minimized (compare to naive layout)

---

### EVAL #6: Spine Representativeness

**Status**: NOT IMPLEMENTED
**Impact**: LOW - Affects label display decisions
**Effort**: Low (1 day)

**What we need to prove**: Spine represents majority ownership

**Implementation**:

```javascript
function spineRepresentativeness(graph, spine) {
  const spineOwnership = spine.reduce((sum, nodeId) => {
    const paths = graph.paths.get(nodeId) || [];
    return sum + paths.reduce((s, p) => s + p.cumulative_pct, 0);
  }, 0);

  const totalOwnership = [...graph.paths.values()]
    .flat()
    .reduce((sum, p) => sum + p.cumulative_pct, 0);

  return spineOwnership / totalOwnership;
}
```

**Acceptance criteria**:

- [ ] Spine represents > 50% of ownership in 90% of graphs
- [ ] Log cases where spine < 50% for review

---

## Low Priority (Future)

### EVAL #4: Gini Benchmarks

**Status**: NOT IMPLEMENTED
**Impact**: LOW - Interpretation enhancement
**Effort**: Low (1-2 days)

**Proposed**: Compare against S&P 500 ownership Gini as baseline

---

## Test File Structure

```
tests/
├── evals/
│   ├── data-quality/
│   │   ├── path-completeness.test.ts
│   │   └── orphan-detection.test.ts
│   ├── algorithms/
│   │   ├── hhi.test.ts
│   │   ├── gini.test.ts
│   │   └── co-investment.test.ts
│   ├── visualization/
│   │   ├── layout-quality.test.ts
│   │   └── spine-representativeness.test.ts
│   └── performance/
│       └── benchmarks.test.ts
└── fixtures/
    ├── simple-tree.json
    ├── complex-graph.json
    └── edge-cases.json
```

---

## Implementation Order

| Week | Eval                   | Deliverable                 |
| ---- | ---------------------- | --------------------------- |
| 1    | #1 Path Completeness   | SQL validation + monitoring |
| 1    | #8 Performance         | CI benchmark pipeline       |
| 2    | #7 Co-Investment       | Chi-squared implementation  |
| 2    | #3 HHI Study           | White paper section         |
| 3    | #5 Layout Quality      | Metrics + thresholds        |
| 3    | #2 Imputation (start)  | Sampling methodology        |
| 4    | #2 Imputation (finish) | Ground truth comparison     |
| 4    | #6 Spine               | Quick implementation        |

---

## Success Metrics

**For White Paper publication**:

- [ ] All CRITICAL evals passing
- [ ] At least 3 HIGH priority evals implemented
- [ ] Limitations documented with mitigation plans
- [ ] Reproducible methodology section

**For Production confidence**:

- [ ] Path completeness > 95%
- [ ] Performance regression < 20%
- [ ] Co-investment significance p < 0.05 for top pairs

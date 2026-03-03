# Observable Feature Audit

Notebook source audited:

- `/tmp/obs-notebook-a8d94cdc4a420709/a8d94cdc4a420709@929.js` (main screener viz)
- `/tmp/obs-notebook-a8d94cdc4a420709/bdcdb445752833fa@776.js` (data + summaries)
- `/tmp/obs-notebook-a8d94cdc4a420709/eab9bd6720b8c130@628.js` (palette + color maps)
- `/tmp/obs-notebook-a8d94cdc4a420709/efbb591fc88ffd6b@34.js` (chroma import)
- `/tmp/obs-notebook-a8d94cdc4a420709/8f8b5ba824ba1d24@1958.js` (exploratory ownership notebook)
- `/tmp/obs-notebook-a8d94cdc4a420709/181b97a2dbd3de80@138.js` and `da4071373ed0e0ff@97.js` (mermaid/toc docs helpers)

Implementation audited:

- `src/lib/components/screener/AssetScreenerChart.svelte`
- `src/lib/components/screener/screener-chart-data.ts`
- `src/lib/components/screener/screener-chart-render.ts`
- `src/lib/components/screener/ScreenerOwnersResultsTable.svelte`
- `src/routes/screener/results/+page.svelte`

## Feature Matrix

Legend: `Yes` = implemented, `Partial` = exists with limits, `No` = missing by design/priority.

| Observable feature                                                    | Status        | Implementation notes                                                        |
| --------------------------------------------------------------------- | ------------- | --------------------------------------------------------------------------- |
| Ownership screener chart embedded per selected owner                  | Yes           | `ScreenerOwnersResultsTable` renders `AssetScreenerChart` in expanded rows. |
| Graph data fetch + transform from ownership graph                     | Yes           | `fetchChartData()` with edge traversal and entity/asset mapping.            |
| Group units into project/location clusters                            | Yes           | `buildSubsidiaryGroups()` groups by `locationID` and computes geometry.     |
| Subsidiary regions with curved lanes + gradient fill                  | Yes           | `drawSubsidiaryRegions()` + `addGradient()`.                                |
| Vertical spine from spotlight owner                                   | Yes           | Rendered in `renderChart()` main stage.                                     |
| Subsidiary ownership pie marker                                       | Yes           | `drawSubsidiaryLabels()` renders edge-value arc.                            |
| Subsidiary label wrapping (2 lines)                                   | Yes           | `wrapTextTwoLines()`.                                                       |
| Subsidiary ownership percent text                                     | Yes           | In `drawSubsidiaryLabels()`.                                                |
| Mini bar charts per subsidiary (type + status)                        | Yes           | `drawMiniBarChartsForItem()`.                                               |
| Mini bar chart tooltip on hover                                       | Yes           | `showBarTooltip()` + hover handlers.                                        |
| Intermediary path annotation (curved connector + labels)              | Yes           | `drawIntermediaryPathForItem()`.                                            |
| Intermediary descendants bubble markers                               | Yes           | `drawIntermediaryPathForItem()` circles.                                    |
| Intermediary fold-out affordance                                      | Partial       | Visual indicator only (not interactive expansion).                          |
| Asset cluster nodes with multi-unit ring                              | Yes           | `drawAssetGroups()`.                                                        |
| Partial ownership wedge on unit circles                               | Yes           | `unit-ownership-arc` in `drawAssetGroups()`.                                |
| Status icons on units (prospective/retired/cancelled)                 | Yes           | `addStatusIcon()`.                                                          |
| Asset hover expansion into per-unit line list                         | Yes           | `expandAssetHover()` / `collapseAssetHover()`.                              |
| Asset hover shows status + ownership text                             | Yes           | Added in expanded hover labels.                                             |
| Shared-asset curved cross-links between subsidiaries                  | Yes           | `drawCommonAssetLines()`.                                                   |
| Tracker legend                                                        | Yes           | `drawLegend()` when tracker coloring active.                                |
| Status legend with status icons                                       | Yes           | `drawLegend()`.                                                             |
| Color logic: tracker mode if multiple trackers, otherwise status mode | Yes           | `renderChart()` now auto-falls back to status mode for single-tracker data. |
| Aggregated status coloring consistency (`prospective`)                | Yes           | Uses `statusColors[status_agg]` for status mode and bars.                   |
| Subsidiary sort by ownership pct (default notebook behavior)          | Yes           | `fetchChartData()` sorts by root->subsidiary ownership pct, then count.     |
| Case-study selector + tuning controls (`Inputs.radio`, `Inputs.form`) | No            | Notebook prototyping controls intentionally not in production UI.           |
| Notebook hover-data mutable cell diagnostics                          | No            | Not used in production architecture.                                        |
| Sticky top header + sticky bottom legend containers                   | No            | Current chart renders as single SVG without sticky chrome.                  |
| "Additional assets" footer summary text                               | No            | Notebook TODO; no equivalent API summary yet in chart module.               |
| Prospective-only disaggregated legend mode                            | Partial       | Aggregated status legend implemented; prospective split legend not added.   |
| Mermaid exploratory diagrams from imported notebooks                  | No            | Out of scope for screener chart component.                                  |
| DuckDB-local query pipeline from notebook                             | No (replaced) | Replaced by REST ownership API flow in app.                                 |

## Notes on Scope

- The imported notebooks include exploratory views (mermaid diagrams, SQL/debug tables, controls) that are not part of the production screener experience and are intentionally excluded.
- The production app uses the REST API ownership pipeline, not the notebook’s local DuckDB query stack.

# Changelog

All notable changes to this project will be documented in this file.

## [0.1.29] - 2026-02-02

### Added
- **OwnershipTreeGraph component** - New SVG-based ownership visualization ported from Observable notebook
  - Edge percentages hidden by default, shown on hover path only
  - Non-path nodes fade to 10% opacity on hover (matches Observable's `highlightNodes`)
  - `nodesToShowText` walks up ownership chain until split for label visibility
  - `placeOwnerLabels` with Rules 1a, 1b, 2, 3 for collision detection
  - Mint highlight stroke (#97E6DE) on hovered nodes
  - Smooth CSS transitions for opacity changes
- **Tracker availability warnings** - UI now shows warnings for trackers without MotherDuck aggregation data

### Fixed
- Screener preset filters now properly apply status and geography filters
- Enabled status filter clause in screener SQL queries (was commented out)
- Dynamic env imports for production builds (OPENROUTER_API_KEY, MOTHERDUCK_JWT)

## [0.1.28] - 2026-02-02

### Added
- Gembot AI assistant prototype
- MicroCards redesign with Tufte/Swiss design principles

### Fixed
- Changed "exposure to" to "ownership in" for clarity
- Removed investigation filter toggle from screener results

/**
 * GEM Viz Changelog
 * Add new entries at the top
 */

export interface ChangelogEntry {
  version: string;
  date: string;
  changes: string[];
}

export const changelog: ChangelogEntry[] = [
  {
    version: '0.1.21',
    date: '2025-12-17',
    changes: [
      'Integrated new Ownership Tracing API for faster data queries',
      'About page now shows real-time database statistics',
      'Added progress tracking for background deployments',
      'Improved build pipeline with status line integration',
    ],
  },
  {
    version: '0.1.14',
    date: '2025-12-15',
    changes: [
      'Added investigation cart for collecting assets and entities',
      'New /report page with co-ownership analysis and PDF export',
      'Added persistent navigation bar across all pages',
      'Geographic breakdown showing asset distribution by country',
      'Shareable investigation URLs with clipboard copy',
    ],
  },
  {
    version: '0.1.13',
    date: '2025-12-15',
    changes: [
      'Added custom 404 error page with helpful navigation',
      'Refactored all route pages for improved code readability',
      'Added unit test suite with 61 tests (vitest)',
      'Created data manifest page for admin/debugging',
      'Fixed version metadata synchronization',
    ],
  },
  {
    version: '0.1.12',
    date: '2025-12-15',
    changes: [
      'Integrated Observable notebook visualizations (Ownership Flower, Asset Screener)',
      'Added TrackerIcon and StatusIcon components with a warm grayscale palette',
      'Consolidated and removed 13 zombie/duplicate components',
      'Added RelationshipNetwork visualization to asset pages',
    ],
  },
  {
    version: '0.1.11',
    date: '2025-12-12',
    changes: [
      'Fixed Digital Ocean Spaces URL routing (trailing slash handling)',
      'Pre-baked entity portfolio data at build time',
      'Added map color coding by tracker type with legend',
      'Removed dead hydration code from ownership visualizations',
      'Added smart redirects between asset and entity pages',
    ],
  },
  {
    version: '0.1.10',
    date: '2025-12-10',
    changes: [
      'Entity pages now show full portfolio (subsidiaries + direct asset stakes)',
      'Fixed entity link routing with proper ID validation',
      'Replaced API-dependent EntityHeader with simpler version',
      'Removed hydration artifacts from visualization components',
    ],
  },
  {
    version: '0.1.9',
    date: '2025-12-09',
    changes: [
      'Added visual relationship type indicators (ownership, participation, operator)',
      'Entity and asset pages now show portfolio breakdown by tracker',
      'Improved error handling with graceful fallbacks',
    ],
  },
  {
    version: '0.1.8',
    date: '2025-12-08',
    changes: [
      'Significant performance improvements for large ownership chains',
      'Added loading states and skeleton UI for better perceived performance',
      'Reduced initial bundle size with code splitting',
    ],
  },
];

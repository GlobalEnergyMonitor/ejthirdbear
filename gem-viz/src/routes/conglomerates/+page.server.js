import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export const prerender = process.env.NODE_ENV !== 'development';

// Reuse the entity cache from the entity pages
const CACHE_FILE = join(process.cwd(), '.svelte-kit/.entity-cache.json');

/**
 * Load conglomerates data - entities that own assets across 2+ tracker types
 *
 * Uses the existing entity cache to find multi-tracker entities and rank them.
 */
export async function load() {
  // Try to load from cache first
  if (existsSync(CACHE_FILE)) {
    try {
      const cacheData = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
      const entities = Object.values(cacheData.entities);

      // Filter to multi-tracker entities and sort by tracker count, then asset count
      const conglomerates = entities
        .filter(e => e.trackerCount >= 2)
        .map(e => ({
          id: e.id,
          name: e.name,
          trackerCount: e.trackerCount,
          trackers: e.trackers || [],
          assetCount: e.assetCount,
          totalCapacityMw: e.totalCapacityMw,
          countryCount: e.countryCount,
        }))
        .sort((a, b) => {
          // Primary: tracker count (descending)
          if (b.trackerCount !== a.trackerCount) return b.trackerCount - a.trackerCount;
          // Secondary: asset count (descending)
          return b.assetCount - a.assetCount;
        });

      // Stats for the page
      const stats = {
        totalConglomerates: conglomerates.length,
        totalEntities: entities.length,
        avgTrackers: conglomerates.length > 0
          ? (conglomerates.reduce((sum, e) => sum + e.trackerCount, 0) / conglomerates.length).toFixed(1)
          : 0,
        maxTrackers: conglomerates.length > 0
          ? Math.max(...conglomerates.map(e => e.trackerCount))
          : 0,
      };

      return {
        conglomerates,
        stats,
      };
    } catch (err) {
      console.error('Failed to load entity cache for conglomerates:', err.message);
    }
  }

  // Fallback: empty data (dev mode will fetch client-side)
  return {
    conglomerates: [],
    stats: {
      totalConglomerates: 0,
      totalEntities: 0,
      avgTrackers: 0,
      maxTrackers: 0,
    },
  };
}

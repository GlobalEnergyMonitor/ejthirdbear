import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getTopOwnersServer, getTrackerStatsServer } from '$lib/server/motherduck';

export const GET: RequestHandler = async () => {
  try {
    const [topOwners, trackerStats] = await Promise.all([
      getTopOwnersServer({ limit: 5, tracker: 'Coal Plant' }),
      getTrackerStatsServer()
    ]);

    return json({
      topOwners: {
        success: topOwners.success,
        error: topOwners.error,
        data: topOwners.data?.slice(0, 3)
      },
      trackerStats: {
        success: trackerStats.success,
        error: trackerStats.error,
        data: trackerStats.data
      }
    });
  } catch (err) {
    return json({
      error: err instanceof Error ? err.message : 'Unknown error'
    });
  }
};

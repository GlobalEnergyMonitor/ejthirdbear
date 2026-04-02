import { json } from '@sveltejs/kit';
import { getStats } from '$lib/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const stats = getStats();
  return json(stats);
};

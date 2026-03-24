import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  const db = getDb();
  if (!db) {
    return json({ status: 'error', message: 'Database unavailable' }, { status: 503 });
  }

  try {
    const count = db.prepare('SELECT COUNT(*) as n FROM articles').get() as { n: number };
    return json({ status: 'ok', articles: count.n });
  } catch (e) {
    return json({ status: 'error', message: e instanceof Error ? e.message : 'Unknown error' }, { status: 503 });
  }
};

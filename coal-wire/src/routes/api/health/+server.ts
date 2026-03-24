import { json } from '@sveltejs/kit';
import { getDb } from '$lib/db';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
  try {
    const db = getDb();
    if (!db) {
      return json({ status: 'ok', articles: 0, message: 'No database yet' });
    }
    const count = db.prepare('SELECT COUNT(*) as n FROM articles').get() as { n: number };
    return json({ status: 'ok', articles: count.n });
  } catch {
    // App is running, DB just isn't set up yet — still healthy
    return json({ status: 'ok', articles: 0, message: 'Database not initialized' });
  }
};

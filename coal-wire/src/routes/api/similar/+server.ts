import { json } from '@sveltejs/kit';
import { findSimilar } from '$lib/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const articleId = parseInt(url.searchParams.get('id') ?? '0');
  if (!articleId) {
    return json({ results: [], error: 'Missing article id' }, { status: 400 });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5'), 20);
  const results = findSimilar(articleId, limit);

  return json({ results, source_id: articleId });
};

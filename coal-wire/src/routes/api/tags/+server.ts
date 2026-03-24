import { json } from '@sveltejs/kit';
import { getTags } from '$lib/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const type = url.searchParams.get('type') ?? 'country';
  const tags = getTags(type);
  return json({ tags, type });
};

import { json } from '@sveltejs/kit';
import { getDb, type Article } from '$lib/db';
import type { RequestHandler } from './$types';

interface ArticleTag {
  tag_type: string;
  tag_value: string;
  confidence: number;
}

export const GET: RequestHandler = ({ url }) => {
  const id = parseInt(url.searchParams.get('id') ?? '0');
  if (!id) return json({ error: 'Missing id' }, { status: 400 });

  const db = getDb();
  if (!db) return json({ error: 'DB unavailable' }, { status: 500 });

  const article = db.prepare('SELECT * FROM articles WHERE id = ?').get(id) as Article | undefined;
  if (!article) return json({ error: 'Not found' }, { status: 404 });

  let tags: ArticleTag[] = [];
  try {
    tags = db
      .prepare('SELECT tag_type, tag_value, confidence FROM article_tags WHERE article_id = ?')
      .all(id) as ArticleTag[];
  } catch {}

  return json({ article, tags });
};

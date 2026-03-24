import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const [articleRes, similarRes] = await Promise.all([
    fetch(`/api/article?id=${params.id}`),
    fetch(`/api/similar?id=${params.id}&limit=5`),
  ]);

  const articleData = await articleRes.json();
  const similarData = await similarRes.json();

  return {
    article: articleData.article ?? null,
    tags: articleData.tags ?? [],
    similar: similarData.results ?? [],
  };
};

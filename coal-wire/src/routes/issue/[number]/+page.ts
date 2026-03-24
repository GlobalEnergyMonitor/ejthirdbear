import type { PageLoad } from './$types';

export const load: PageLoad = async ({ params, fetch }) => {
  const res = await fetch(`/api/issues?issue=${params.number}`);
  const data = await res.json();
  return {
    issue_number: parseInt(params.number),
    articles: data.articles ?? [],
  };
};

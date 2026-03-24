import { json } from '@sveltejs/kit';
import { browseIssues, getIssue } from '$lib/search';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ url }) => {
  const issueNum = url.searchParams.get('issue');

  if (issueNum) {
    const articles = getIssue(parseInt(issueNum));
    return json({ articles, issue_number: parseInt(issueNum) });
  }

  const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '50'), 200);
  const offset = parseInt(url.searchParams.get('offset') ?? '0');
  const issues = browseIssues(limit, offset);
  return json({ issues });
};

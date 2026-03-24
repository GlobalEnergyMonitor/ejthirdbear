import Database from 'better-sqlite3';
import { building } from '$app/environment';
import path from 'node:path';

let db: ReturnType<typeof Database> | null = null;

const DB_PATH = path.resolve('data/coalwire.db');

export function getDb() {
  if (building) return null;
  if (!db) {
    db = new Database(DB_PATH, { readonly: true });
    db.pragma('journal_mode = WAL');
  }
  return db;
}

export interface Article {
  id: number;
  issue_number: number;
  title: string;
  date: string;
  section: string;
  content: string;
  url: string;
  links: string; // JSON array of external links
}

export interface SearchResult extends Article {
  rank: number;
  snippet: string;
  score: number;
  match_type: 'bm25' | 'semantic' | 'hybrid';
}

export interface IssueInfo {
  issue_number: number;
  title: string;
  date: string;
  url: string;
  article_count: number;
}

export interface Tag {
  tag_type: 'country' | 'topic' | 'company' | 'entity';
  tag_value: string;
  count: number;
}

export interface TagCount {
  value: string;
  count: number;
}

export interface SearchStats {
  total_articles: number;
  total_issues: number;
  date_range: { min: string; max: string };
  has_embeddings: boolean;
  has_tags: boolean;
}

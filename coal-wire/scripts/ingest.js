#!/usr/bin/env node

/**
 * Coal Wire Ingestion Script
 *
 * Fetches Coal Wire issues from the GEM WordPress REST API and stores them
 * in a SQLite database with FTS5 for full-text search.
 *
 * Usage:
 *   node scripts/ingest.js              # fetch all issues
 *   node scripts/ingest.js --resume     # only fetch new issues
 *   node scripts/ingest.js --limit 10   # fetch 10 pages of posts
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = path.resolve('data/coalwire.db');
const WP_API = 'https://globalenergymonitor.org/wp-json/wp/v2';

// CoalWire posts are in the "posts" endpoint; we filter by searching for "coalwire" in the slug
// The category or tag ID for CoalWire may vary — we'll search by slug pattern
const PER_PAGE = 100;

function initDb() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      issue_number INTEGER,
      title TEXT NOT NULL,
      date TEXT,
      section TEXT DEFAULT '',
      content TEXT NOT NULL,
      url TEXT,
      links TEXT DEFAULT '[]',
      wp_post_id INTEGER UNIQUE
    );

    CREATE INDEX IF NOT EXISTS idx_articles_issue ON articles(issue_number);
    CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
  `);

  // FTS5 virtual table for full-text search
  // We use content-sync so FTS stays in sync with the articles table
  db.exec(`
    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title,
      section,
      content,
      url,
      links,
      content=articles,
      content_rowid=id
    );

    -- Triggers to keep FTS in sync
    CREATE TRIGGER IF NOT EXISTS articles_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, section, content, url, links)
      VALUES (new.id, new.title, new.section, new.content, new.url, new.links);
    END;

    CREATE TRIGGER IF NOT EXISTS articles_ad AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, section, content, url, links)
      VALUES ('delete', old.id, old.title, old.section, old.content, old.url, old.links);
    END;

    CREATE TRIGGER IF NOT EXISTS articles_au AFTER UPDATE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, section, content, url, links)
      VALUES ('delete', old.id, old.title, old.section, old.content, old.url, old.links);
      INSERT INTO articles_fts(rowid, title, section, content, url, links)
      VALUES (new.id, new.title, new.section, new.content, new.url, new.links);
    END;
  `);

  return db;
}

/**
 * Extract issue number from title like "CoalWire 594 — January 8, 2025"
 */
function extractIssueNumber(title) {
  const match = title.match(/coal\s*wire\s*#?(\d+)/i);
  return match ? parseInt(match[1]) : null;
}

/**
 * Parse HTML content into sections and clean text.
 * Returns array of { section, text, links }
 */
function parseContent(html) {
  // Strip HTML tags but preserve structure
  const text = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<\/h[1-6]>/gi, '\n\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#8211;|&#8212;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  // Extract all links from the HTML
  const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  const links = [];
  let linkMatch;
  while ((linkMatch = linkRegex.exec(html)) !== null) {
    links.push({ url: linkMatch[1], text: linkMatch[2] });
  }

  return { text, links };
}

/**
 * Try to split an issue into sections based on common CoalWire headers.
 */
function splitIntoSections(text) {
  const sectionHeaders = [
    "Editor's Note",
    'Features',
    'Feature',
    'Top News',
    'News',
    'Companies',
    'Companies + Markets',
    'Companies and Markets',
    'Resources',
    'Events',
    'Commentary',
    'Analysis',
    'Reports',
    'Action',
    'Actions',
  ];

  const sections = [];
  const headerPattern = new RegExp(
    `^(${sectionHeaders.join('|')})\\s*$`,
    'gim'
  );
  const parts = text.split(headerPattern);

  if (parts.length <= 1) {
    // No section headers found — treat whole thing as one section
    return [{ section: 'Full Issue', text: text.trim() }];
  }

  // First part is before any header (intro/editor's note)
  if (parts[0].trim()) {
    sections.push({ section: 'Introduction', text: parts[0].trim() });
  }

  for (let i = 1; i < parts.length; i += 2) {
    const sectionName = parts[i]?.trim();
    const sectionText = parts[i + 1]?.trim();
    if (sectionName && sectionText) {
      sections.push({ section: sectionName, text: sectionText });
    }
  }

  return sections.length ? sections : [{ section: 'Full Issue', text }];
}

async function fetchCoalWirePosts(page = 1) {
  // Search for posts with "coalwire" in slug
  const url = `${WP_API}/posts?search=coalwire&per_page=${PER_PAGE}&page=${page}&_fields=id,title,date,content,link,slug&orderby=date&order=desc`;

  console.log(`  Fetching page ${page}...`);
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'CoalWireSearch/0.1 (GEM internal tool)',
    },
  });

  if (!res.ok) {
    if (res.status === 400) return []; // past last page
    throw new Error(`WP API error: ${res.status} ${res.statusText}`);
  }

  const totalPages = parseInt(res.headers.get('x-wp-totalpages') ?? '1');
  const posts = await res.json();

  return { posts, totalPages };
}

async function main() {
  const args = process.argv.slice(2);
  const resume = args.includes('--resume');
  const limitIdx = args.indexOf('--limit');
  const maxPages = limitIdx >= 0 ? parseInt(args[limitIdx + 1]) : Infinity;

  console.log('Initializing database...');
  const db = initDb();

  const insertArticle = db.prepare(`
    INSERT OR IGNORE INTO articles (issue_number, title, date, section, content, url, links, wp_post_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let existingPostIds = new Set();
  if (resume) {
    const rows = db.prepare('SELECT wp_post_id FROM articles').all();
    existingPostIds = new Set(rows.map((r) => r.wp_post_id));
    console.log(`Resume mode: ${existingPostIds.size} posts already in DB`);
  }

  let page = 1;
  let totalInserted = 0;
  let totalPages = 1;

  console.log('Fetching Coal Wire posts from WordPress API...');

  while (page <= Math.min(totalPages, maxPages)) {
    const result = await fetchCoalWirePosts(page);
    if (!result || !result.posts?.length) break;

    totalPages = result.totalPages;
    console.log(`  Page ${page}/${totalPages} — ${result.posts.length} posts`);

    for (const post of result.posts) {
      // Skip if not actually a CoalWire post
      if (!post.slug?.includes('coalwire')) continue;

      if (resume && existingPostIds.has(post.id)) continue;

      const title = post.title?.rendered ?? post.slug;
      const issueNum = extractIssueNumber(title);
      const date = post.date?.split('T')[0] ?? null;
      const { text, links } = parseContent(post.content?.rendered ?? '');

      // Split into sections and insert each
      const sections = splitIntoSections(text);

      for (const sec of sections) {
        insertArticle.run(
          issueNum,
          title.replace(/<[^>]+>/g, ''), // clean HTML from title
          date,
          sec.section,
          sec.text,
          post.link,
          JSON.stringify(links),
          post.id
        );
        totalInserted++;
      }
    }

    page++;

    // Be nice to the server
    await new Promise((r) => setTimeout(r, 500));
  }

  console.log(`\nDone! Inserted ${totalInserted} article sections.`);

  // Rebuild FTS index
  console.log('Optimizing FTS index...');
  db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");

  const count = db.prepare('SELECT COUNT(*) as n FROM articles').get();
  console.log(`Total articles in DB: ${count.n}`);

  db.close();
}

main().catch((err) => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});

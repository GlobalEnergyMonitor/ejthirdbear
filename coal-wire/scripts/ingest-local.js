#!/usr/bin/env node

/**
 * Ingest Coal Wire content from local files.
 *
 * Supports:
 *   - WordPress XML export:  node scripts/ingest-local.js export.xml
 *   - Directory of HTML:     node scripts/ingest-local.js ./html-files/
 *   - JSON file:             node scripts/ingest-local.js articles.json
 *
 * JSON format expected:
 *   [{ "issue_number": 594, "title": "...", "date": "2025-01-08",
 *      "content": "...", "url": "...", "section": "Top News" }, ...]
 *
 * HTML files: each file is treated as one issue. Filename should contain
 * the issue number, e.g. "coalwire-594.html".
 */

import Database from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = path.resolve('data/coalwire.db');

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
      wp_post_id INTEGER
    );

    CREATE INDEX IF NOT EXISTS idx_articles_issue ON articles(issue_number);
    CREATE INDEX IF NOT EXISTS idx_articles_date ON articles(date);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_dedup ON articles(wp_post_id, section) WHERE wp_post_id IS NOT NULL;

    CREATE VIRTUAL TABLE IF NOT EXISTS articles_fts USING fts5(
      title, section, content, url, links,
      content=articles, content_rowid=id
    );

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

    CREATE TABLE IF NOT EXISTS embeddings (
      article_id INTEGER PRIMARY KEY REFERENCES articles(id),
      embedding BLOB NOT NULL
    );
  `);

  return db;
}

function stripHtml(html) {
  return html
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
}

function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    links.push({ url: m[1], text: m[2] });
  }
  return links;
}

function extractIssueNumber(str) {
  const m = str.match(/coal\s*wire\s*#?(\d+)/i) || str.match(/(\d{2,3})/);
  return m ? parseInt(m[1]) : null;
}

const SECTION_HEADERS = [
  "Editor's Note", 'Features', 'Feature', 'Top News', 'News',
  'Companies', 'Companies + Markets', 'Companies and Markets',
  'Resources', 'Events', 'Commentary', 'Analysis', 'Reports',
];

function splitSections(text) {
  const pattern = new RegExp(`^(${SECTION_HEADERS.join('|')})\\s*$`, 'gim');
  const parts = text.split(pattern);
  if (parts.length <= 1) return [{ section: 'Full Issue', text: text.trim() }];

  const sections = [];
  if (parts[0].trim()) sections.push({ section: 'Introduction', text: parts[0].trim() });
  for (let i = 1; i < parts.length; i += 2) {
    const name = parts[i]?.trim();
    const body = parts[i + 1]?.trim();
    if (name && body) sections.push({ section: name, text: body });
  }
  return sections.length ? sections : [{ section: 'Full Issue', text }];
}

function ingestJson(db, filePath) {
  const data = JSON.parse(readFileSync(filePath, 'utf-8'));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (issue_number, title, date, section, content, url, links, wp_post_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let total = 0;
  let skipped = 0;

  const batch = db.transaction((rows) => {
    for (const r of rows) {
      // Support both formats: simple (issue_number) and fetched (issueNumber)
      const issueNum = r.issue_number ?? r.issueNumber ?? null;
      const content = r.content ?? '';
      const url = r.url ?? r.wpUrl ?? r.archiveUrl ?? null;
      const wpId = r.wp_post_id ?? r.wpPostId ?? null;

      // Skip entries with no meaningful content
      if (!content || content.length < 50) { skipped++; continue; }

      const sections = splitSections(content);
      for (const sec of sections) {
        insert.run(
          issueNum,
          r.title ?? 'Untitled',
          r.date ?? null,
          sec.section,
          sec.text,
          url,
          JSON.stringify(r.links ?? []),
          wpId
        );
        total++;
      }
    }
  });

  batch(data);
  console.log(`Ingested ${total} article sections from ${data.length} JSON entries. (${skipped} skipped)`);
}

function ingestHtmlDir(db, dirPath) {
  const files = readdirSync(dirPath).filter((f) => f.endsWith('.html') || f.endsWith('.htm'));
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (issue_number, title, date, section, content, url, links)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let total = 0;

  for (const file of files) {
    const html = readFileSync(path.join(dirPath, file), 'utf-8');
    const issueNum = extractIssueNumber(file);
    const links = extractLinks(html);
    const text = stripHtml(html);
    const sections = splitSections(text);

    // Try to extract title from <title> or <h1>
    const titleMatch = html.match(/<title>([^<]+)<\/title>/i) || html.match(/<h1[^>]*>([^<]+)<\/h1>/i);
    const title = titleMatch ? titleMatch[1].trim() : file.replace(/\.html?$/, '');

    // Try to extract date
    const dateMatch = html.match(/(\d{4}-\d{2}-\d{2})/) || html.match(/(\w+ \d{1,2},?\s*\d{4})/);
    const date = dateMatch ? dateMatch[1] : null;

    const batch = db.transaction(() => {
      for (const sec of sections) {
        insert.run(issueNum, title, date, sec.section, sec.text, null, JSON.stringify(links));
        total++;
      }
    });
    batch();
  }

  console.log(`Ingested ${total} article sections from ${files.length} HTML files.`);
}

/**
 * Extract text from a WXR field, handling both plain text and CDATA blocks.
 */
function wxrText(item, tagName) {
  // Try CDATA first, then plain text
  const cdataRe = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`);
  const plainRe = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const m = item.match(cdataRe) || item.match(plainRe);
  return m ? m[1] : null;
}

function ingestXml(db, filePath) {
  const xml = readFileSync(filePath, 'utf-8');

  // Parse WordPress XML export (WXR format)
  const items = xml.split('<item>').slice(1);
  const insert = db.prepare(`
    INSERT OR IGNORE INTO articles (issue_number, title, date, section, content, url, links, wp_post_id)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let total = 0;
  let skipped = 0;

  const batch = db.transaction(() => {
    for (const item of items) {
      // Only process coalwire post type
      const postType = wxrText(item, 'wp:post_type');
      if (postType !== 'coalwire') continue;

      // Skip drafts
      const status = wxrText(item, 'wp:status');
      if (status !== 'publish') { skipped++; continue; }

      const title = wxrText(item, 'title') || 'Untitled';
      const issueNum = extractIssueNumber(title);

      const rawDate = wxrText(item, 'wp:post_date');
      const date = rawDate ? rawDate.split(' ')[0] : null;

      const contentMatch = item.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]><\/content:encoded>/);
      const rawHtml = contentMatch ? contentMatch[1] : '';

      // <link> is plain text (not CDATA)
      const linkMatch = item.match(/<link>([^<]+)<\/link>/);
      const url = linkMatch ? linkMatch[1].replace(/&#038;/g, '&') : null;

      const wpIdRaw = wxrText(item, 'wp:post_id');
      const wpId = wpIdRaw ? parseInt(wpIdRaw) : null;

      const links = extractLinks(rawHtml);
      const text = stripHtml(rawHtml);

      if (!text || text.length < 20) { skipped++; continue; }

      const sections = splitSections(text);

      for (const sec of sections) {
        insert.run(issueNum, title, date, sec.section, sec.text, url, JSON.stringify(links), wpId);
        total++;
      }
    }
  });

  batch();
  console.log(`Ingested ${total} article sections from WordPress XML export. (${skipped} skipped)`);
}

function main() {
  const inputPath = process.argv[2];
  if (!inputPath) {
    console.error('Usage: node scripts/ingest-local.js <file.json|file.xml|html-directory/>');
    process.exit(1);
  }

  if (!existsSync(inputPath)) {
    console.error(`File/directory not found: ${inputPath}`);
    process.exit(1);
  }

  console.log('Initializing database...');
  const db = initDb();

  const stat = statSync(inputPath);

  if (stat.isDirectory()) {
    ingestHtmlDir(db, inputPath);
  } else if (inputPath.endsWith('.json')) {
    ingestJson(db, inputPath);
  } else if (inputPath.endsWith('.xml')) {
    ingestXml(db, inputPath);
  } else {
    console.error('Unsupported file type. Use .json, .xml, or a directory of .html files.');
    process.exit(1);
  }

  // Rebuild FTS
  console.log('Rebuilding FTS index...');
  db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");

  const count = db.prepare('SELECT COUNT(*) as n FROM articles').get();
  console.log(`Total articles in DB: ${count.n}`);

  db.close();
}

main();

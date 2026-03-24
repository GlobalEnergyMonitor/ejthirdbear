#!/usr/bin/env node

/**
 * Extract country and topic tags from articles using keyword matching.
 * No external APIs needed — runs locally against the SQLite database.
 *
 * Usage:
 *   node scripts/extract-tags.js              # tag all untagged articles
 *   node scripts/extract-tags.js --force      # re-tag everything
 */

import Database from 'better-sqlite3';
import path from 'node:path';

const DB_PATH = path.resolve('data/coalwire.db');

const COUNTRIES = [
  'Afghanistan', 'Albania', 'Algeria', 'Angola', 'Argentina', 'Armenia',
  'Australia', 'Austria', 'Azerbaijan', 'Bangladesh', 'Belarus', 'Belgium',
  'Bolivia', 'Bosnia', 'Botswana', 'Brazil', 'Bulgaria', 'Cambodia',
  'Cameroon', 'Canada', 'Chile', 'China', 'Colombia', 'Congo', 'Costa Rica',
  'Croatia', 'Cuba', 'Czech Republic', 'Czechia', 'Denmark', 'Dominican Republic',
  'Ecuador', 'Egypt', 'El Salvador', 'Estonia', 'Ethiopia', 'Finland',
  'France', 'Georgia', 'Germany', 'Ghana', 'Greece', 'Guatemala',
  'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq',
  'Ireland', 'Israel', 'Italy', 'Japan', 'Jordan', 'Kazakhstan',
  'Kenya', 'Kosovo', 'Kuwait', 'Kyrgyzstan', 'Laos', 'Latvia',
  'Lebanon', 'Libya', 'Lithuania', 'Madagascar', 'Malawi', 'Malaysia',
  'Mali', 'Mexico', 'Moldova', 'Mongolia', 'Montenegro', 'Morocco',
  'Mozambique', 'Myanmar', 'Namibia', 'Nepal', 'Netherlands', 'New Zealand',
  'Nicaragua', 'Niger', 'Nigeria', 'North Korea', 'North Macedonia', 'Norway',
  'Oman', 'Pakistan', 'Panama', 'Papua New Guinea', 'Paraguay', 'Peru',
  'Philippines', 'Poland', 'Portugal', 'Qatar', 'Romania', 'Russia',
  'Saudi Arabia', 'Senegal', 'Serbia', 'Singapore', 'Slovakia', 'Slovenia',
  'Somalia', 'South Africa', 'South Korea', 'Spain', 'Sri Lanka', 'Sudan',
  'Sweden', 'Switzerland', 'Taiwan', 'Tajikistan', 'Tanzania', 'Thailand',
  'Tunisia', 'Turkey', 'Turkmenistan', 'Uganda', 'Ukraine',
  'United Arab Emirates', 'UAE', 'United Kingdom', 'UK', 'United States', 'US', 'USA',
  'Uruguay', 'Uzbekistan', 'Venezuela', 'Vietnam', 'Yemen', 'Zambia', 'Zimbabwe',
];

// Normalize aliases
const COUNTRY_ALIASES = {
  'US': 'United States', 'USA': 'United States', 'UK': 'United Kingdom',
  'UAE': 'United Arab Emirates', 'Czechia': 'Czech Republic',
};

const TOPICS = {
  'retirement': ['retirement', 'retire', 'phase-out', 'phase out', 'phaseout', 'closure', 'closing', 'shut down', 'shutdown', 'decommission'],
  'new-capacity': ['new plant', 'new coal', 'proposed', 'under construction', 'approved', 'permit', 'new mine', 'expansion', 'new capacity'],
  'financing': ['financing', 'investment', 'investor', 'divest', 'divestment', 'bank', 'lending', 'loan', 'insurance', 'underwrite'],
  'pollution': ['pollution', 'coal ash', 'contamination', 'toxic', 'mercury', 'arsenic', 'heavy metal', 'particulate', 'emissions', 'effluent'],
  'health': ['health', 'respiratory', 'asthma', 'cancer', 'mortality', 'disease', 'illness', 'cardiovascular', 'lung'],
  'policy': ['policy', 'regulation', 'legislation', 'law', 'mandate', 'target', 'pledge', 'commitment', 'paris agreement', 'climate'],
  'labor': ['worker', 'workers', 'job', 'jobs', 'employment', 'union', 'strike', 'protest', 'transition', 'retraining', 'just transition'],
  'mining': ['mine', 'mining', 'coal mine', 'extraction', 'thermal coal', 'coking coal', 'metallurgical'],
  'markets': ['price', 'market', 'import', 'export', 'trade', 'demand', 'supply', 'stockpile', 'spot price', 'futures'],
  'renewables': ['renewable', 'solar', 'wind', 'battery', 'storage', 'clean energy', 'green energy', 'alternative', 'displacing coal'],
  'legal': ['court', 'lawsuit', 'ruling', 'litigation', 'judge', 'appeal', 'injunction', 'legal', 'verdict'],
  'carbon': ['carbon price', 'carbon tax', 'carbon market', 'emissions trading', 'ETS', 'cap and trade', 'CO2', 'greenhouse gas', 'methane'],
};

function extractCountries(text) {
  const found = new Set();
  const lower = text.toLowerCase();
  for (const country of COUNTRIES) {
    if (lower.includes(country.toLowerCase())) {
      found.add(COUNTRY_ALIASES[country] || country);
    }
  }
  return [...found];
}

function extractTopics(text) {
  const found = [];
  const lower = text.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPICS)) {
    const matches = keywords.filter((kw) => lower.includes(kw));
    if (matches.length > 0) {
      found.push({ topic, confidence: Math.min(1.0, matches.length * 0.3) });
    }
  }
  return found;
}

function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS article_tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id INTEGER REFERENCES articles(id),
      tag_type TEXT NOT NULL,
      tag_value TEXT NOT NULL,
      confidence REAL DEFAULT 1.0
    );
    CREATE INDEX IF NOT EXISTS idx_tags_article ON article_tags(article_id);
    CREATE INDEX IF NOT EXISTS idx_tags_type_value ON article_tags(tag_type, tag_value);
  `);

  if (force) {
    db.exec('DELETE FROM article_tags');
    console.log('Cleared existing tags.');
  }

  let articles;
  if (force) {
    articles = db.prepare('SELECT id, title, content FROM articles').all();
  } else {
    articles = db.prepare(
      `SELECT a.id, a.title, a.content FROM articles a
       WHERE a.id NOT IN (SELECT DISTINCT article_id FROM article_tags)`
    ).all();
  }

  if (articles.length === 0) {
    console.log('All articles already tagged.');
    db.close();
    return;
  }

  console.log(`Extracting tags for ${articles.length} articles...`);

  const insert = db.prepare(
    'INSERT INTO article_tags (article_id, tag_type, tag_value, confidence) VALUES (?, ?, ?, ?)'
  );

  let countryTags = 0;
  let topicTags = 0;

  const batch = db.transaction(() => {
    for (const article of articles) {
      const text = `${article.title} ${article.content}`;

      for (const country of extractCountries(text)) {
        insert.run(article.id, 'country', country, 1.0);
        countryTags++;
      }

      for (const { topic, confidence } of extractTopics(text)) {
        insert.run(article.id, 'topic', topic, confidence);
        topicTags++;
      }
    }
  });

  batch();

  console.log(`Done. ${countryTags} country tags, ${topicTags} topic tags.`);

  const total = db.prepare('SELECT COUNT(*) as n FROM article_tags').get();
  console.log(`Total tags in DB: ${total.n}`);

  db.close();
}

main();

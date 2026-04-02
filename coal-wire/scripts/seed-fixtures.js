#!/usr/bin/env node

/**
 * Seed the database with realistic fixture data for development.
 * Run: node scripts/seed-fixtures.js
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const DB_PATH = path.resolve('data/coalwire.db');

const SECTIONS = ['Top News', 'Features', 'News', 'Companies + Markets', 'Resources', 'Introduction'];

const COUNTRIES = [
  'China', 'India', 'Indonesia', 'Vietnam', 'Bangladesh', 'Japan',
  'South Korea', 'Australia', 'Germany', 'Poland', 'South Africa',
  'United States', 'Turkey', 'Philippines', 'Pakistan', 'Colombia',
];

const TOPICS = [
  { title: 'Coal plant retirement announced in {country}', content: 'The government of {country} announced the early retirement of {capacity}MW of coal-fired power capacity as part of its updated climate commitments. The decision affects {n} plants across the country, with closures scheduled between {year} and {year2}. Environmental groups welcomed the move but called for stronger support for affected workers and communities.' },
  { title: '{country} approves new coal mine despite climate pledges', content: 'Regulators in {country} granted approval for a new thermal coal mine with annual production capacity of {mt} million tonnes. The decision has drawn criticism from climate advocates who argue it contradicts the country\'s Paris Agreement commitments. The mine is expected to operate for 30 years and create approximately {jobs} jobs.' },
  { title: 'Major bank exits coal financing in {country}', content: 'One of {country}\'s largest commercial banks announced it will cease financing new coal projects by {year}, joining a growing list of financial institutions restricting coal lending. The bank currently holds approximately ${bn} billion in coal-related assets. The policy applies to both mine and power plant financing.' },
  { title: 'Renewable energy overtakes coal generation in {country}', content: 'For the first time, renewable energy sources generated more electricity than coal in {country} during {quarter}. Wind and solar together produced {pct}% of the country\'s electricity, surpassing coal\'s {pct2}% share. Analysts say the crossover reflects both rapid renewable deployment and declining coal plant utilization.' },
  { title: 'Coal ash contamination threatens water supply in {country}', content: 'Communities near a coal-fired power plant in {country} are reporting elevated levels of heavy metals in groundwater linked to improper coal ash disposal. Testing revealed arsenic levels {x} times above WHO guidelines. Local authorities have ordered the plant operator to remediate the site and provide alternative water supplies.' },
  { title: '{country} coal imports reach record high amid energy crisis', content: 'Coal imports to {country} surged to {mt} million tonnes in {quarter}, driven by high natural gas prices and drought-reduced hydropower output. The increase reversed a multi-year decline in coal consumption and raised questions about the country\'s decarbonization timeline. Government officials described the situation as temporary.' },
  { title: 'Workers protest coal plant closure in {country}', content: 'Thousands of coal workers in {country} staged protests against planned plant closures, demanding better transition support and severance packages. The government has pledged ${m} million in retraining programs but unions say the amount is insufficient. The affected plants employ approximately {jobs} workers directly.' },
  { title: 'New study links coal pollution to {health} in {country}', content: 'Researchers found that populations living within 30km of coal-fired power plants in {country} face significantly elevated rates of {health}. The peer-reviewed study analyzed health records of {pop} people over a {years}-year period. The authors called for stricter emission standards and accelerated plant retirements.' },
  { title: '{company} abandons {capacity}MW coal project in {country}', content: 'Energy company {company} announced the cancellation of its planned {capacity}MW coal-fired power plant in {country}, citing unfavorable economics compared to renewable alternatives. The decision follows similar cancellations across Southeast Asia. The company said it will redirect investment toward solar and battery storage projects.' },
  { title: 'Coal stockpiles surge at {country} ports', content: 'Coal inventories at major ports in {country} have reached their highest levels in {years} years, reflecting weakening demand from the power sector. Analysts attribute the buildup to mild weather and increased competition from natural gas and renewables. Spot coal prices have fallen {pct}% from their peak.' },
  { title: 'EU carbon price drives coal-to-gas switching', content: 'Rising carbon prices in the European emissions trading system have accelerated the shift from coal to natural gas generation across the continent. The carbon price reached €{price} per tonne this week, making gas plants more competitive than coal in most markets. Coal generation in Europe fell {pct}% year-on-year.' },
  { title: '{country} pledges coal phase-out by {year}', content: 'The president of {country} announced at the climate summit a commitment to phase out all coal-fired power generation by {year}. The pledge covers {capacity}GW of installed coal capacity across {n} operating plants. International donors pledged ${bn} billion in financing to support the transition.' },
  { title: 'Global coal consumption reaches new peak in {year}', content: 'Despite climate commitments, global coal consumption rose {pct}% to reach {bt} billion tonnes in {year}, driven primarily by demand in Asia. China and India together accounted for over 70% of global consumption. The International Energy Agency warned that coal use must decline rapidly to meet Paris Agreement targets.' },
  { title: 'Coal mine methane emissions higher than reported in {country}', content: 'Satellite measurements reveal that methane emissions from coal mines in {country} are {x} times higher than officially reported figures. The findings have significant implications for the country\'s greenhouse gas inventory. Researchers used data from the TROPOMI satellite instrument to make the measurements.' },
  { title: 'Insurance companies retreat from coal coverage in {country}', content: '{n} major insurance companies announced they will no longer provide coverage for new coal projects in {country}. The decisions affect both mining operations and power plants. Industry analysts say the withdrawal of insurance is becoming as significant a barrier to coal development as the withdrawal of financing.' },
];

const COMPANIES = ['Adani', 'NTPC', 'Eskom', 'PLN', 'KEPCO', 'J-Power', 'RWE', 'PGE', 'AES', 'Tata Power', 'ACWA Power', 'Marubeni'];
const HEALTH = ['respiratory disease', 'cardiovascular illness', 'childhood asthma', 'premature mortality', 'lung cancer'];

function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

function fillTemplate(tpl, vars) {
  return tpl.replace(/\{(\w+)\}/g, (_, key) => vars[key] ?? key);
}

function generateArticle(issueNum, date) {
  const topic = rand(TOPICS);
  const country = rand(COUNTRIES);
  const vars = {
    country,
    capacity: randInt(200, 4000),
    n: randInt(2, 25),
    year: randInt(2026, 2035),
    year2: randInt(2036, 2045),
    mt: randInt(5, 120),
    jobs: randInt(500, 8000),
    bn: (Math.random() * 20 + 1).toFixed(1),
    m: randInt(50, 500),
    pct: randInt(15, 55),
    pct2: randInt(10, 45),
    quarter: `Q${randInt(1, 4)} ${randInt(2024, 2026)}`,
    x: randInt(2, 15),
    health: rand(HEALTH),
    pop: (randInt(50, 500) * 1000).toLocaleString(),
    years: randInt(5, 20),
    company: rand(COMPANIES),
    bt: (Math.random() * 2 + 7).toFixed(1),
    price: randInt(60, 120),
  };

  return {
    issue_number: issueNum,
    title: fillTemplate(topic.title, vars),
    date,
    section: rand(SECTIONS),
    content: fillTemplate(topic.content, vars),
    url: `https://globalenergymonitor.org/coalwire/coalwire-${issueNum}/`,
    links: JSON.stringify([
      { url: `https://example.com/source-${randInt(1, 9999)}`, text: `${country} energy news` },
      { url: `https://example.com/report-${randInt(1, 9999)}`, text: 'Full report' },
    ]),
  };
}

function main() {
  mkdirSync(path.dirname(DB_PATH), { recursive: true });

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  // Create tables
  db.exec(`
    DROP TABLE IF EXISTS articles_fts;
    DROP TABLE IF EXISTS embeddings;
    DROP TABLE IF EXISTS articles;

    CREATE TABLE articles (
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

    CREATE INDEX idx_articles_issue ON articles(issue_number);
    CREATE INDEX idx_articles_date ON articles(date);

    CREATE VIRTUAL TABLE articles_fts USING fts5(
      title, section, content, url, links,
      content=articles, content_rowid=id
    );

    CREATE TRIGGER articles_ai AFTER INSERT ON articles BEGIN
      INSERT INTO articles_fts(rowid, title, section, content, url, links)
      VALUES (new.id, new.title, new.section, new.content, new.url, new.links);
    END;

    CREATE TRIGGER articles_ad AFTER DELETE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, section, content, url, links)
      VALUES ('delete', old.id, old.title, old.section, old.content, old.url, old.links);
    END;

    CREATE TRIGGER articles_au AFTER UPDATE ON articles BEGIN
      INSERT INTO articles_fts(articles_fts, rowid, title, section, content, url, links)
      VALUES ('delete', old.id, old.title, old.section, old.content, old.url, old.links);
      INSERT INTO articles_fts(rowid, title, section, content, url, links)
      VALUES (new.id, new.title, new.section, new.content, new.url, new.links);
    END;

    CREATE TABLE embeddings (
      article_id INTEGER PRIMARY KEY REFERENCES articles(id),
      embedding BLOB NOT NULL
    );
  `);

  const insert = db.prepare(`
    INSERT INTO articles (issue_number, title, date, section, content, url, links)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((articles) => {
    for (const a of articles) {
      insert.run(a.issue_number, a.title, a.date, a.section, a.content, a.url, a.links);
    }
  });

  // Generate ~150 issues with 3-8 articles each ≈ 750 rows
  const articles = [];
  const startDate = new Date('2013-09-01');

  for (let issue = 1; issue <= 150; issue++) {
    const issueDate = new Date(startDate);
    issueDate.setDate(issueDate.getDate() + (issue - 1) * 7);
    const dateStr = issueDate.toISOString().split('T')[0];
    const numArticles = randInt(3, 8);

    for (let j = 0; j < numArticles; j++) {
      articles.push(generateArticle(issue, dateStr));
    }
  }

  insertMany(articles);

  // Rebuild FTS
  db.exec("INSERT INTO articles_fts(articles_fts) VALUES('rebuild')");

  const count = db.prepare('SELECT COUNT(*) as n FROM articles').get();
  console.log(`Seeded ${count.n} fixture articles across 150 issues.`);

  db.close();
}

main();

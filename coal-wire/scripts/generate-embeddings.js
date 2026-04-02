#!/usr/bin/env node

/**
 * Generate embeddings for all articles using a local model.
 * No API keys needed — runs entirely on your machine.
 *
 * Uses all-MiniLM-L6-v2 (384 dimensions) via @huggingface/transformers.
 * First run downloads the model (~23MB); subsequent runs use the cache.
 *
 * Usage:
 *   node scripts/generate-embeddings.js              # embed all unembedded articles
 *   node scripts/generate-embeddings.js --force       # re-embed everything
 */

import Database from 'better-sqlite3';
import { pipeline } from '@huggingface/transformers';
import path from 'node:path';

const DB_PATH = path.resolve('data/coalwire.db');
const MODEL_ID = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIM = 384;

function float32ToBlob(arr) {
  return Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
}

async function main() {
  const args = process.argv.slice(2);
  const force = args.includes('--force');

  const db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');

  db.exec(`
    CREATE TABLE IF NOT EXISTS embeddings (
      article_id INTEGER PRIMARY KEY REFERENCES articles(id),
      embedding BLOB NOT NULL
    );
  `);

  let articles;
  if (force) {
    articles = db.prepare('SELECT id, title, section, content FROM articles').all();
  } else {
    articles = db
      .prepare(
        `SELECT a.id, a.title, a.section, a.content
         FROM articles a
         LEFT JOIN embeddings e ON e.article_id = a.id
         WHERE e.article_id IS NULL`
      )
      .all();
  }

  if (articles.length === 0) {
    console.log('All articles already have embeddings.');
    db.close();
    return;
  }

  console.log(`Loading model ${MODEL_ID}...`);
  const extractor = await pipeline('feature-extraction', MODEL_ID, {
    dtype: 'fp32',
  });

  console.log(`Generating embeddings for ${articles.length} articles...`);

  const upsert = db.prepare(`
    INSERT INTO embeddings (article_id, embedding) VALUES (?, ?)
    ON CONFLICT(article_id) DO UPDATE SET embedding = excluded.embedding
  `);

  let processed = 0;

  for (const article of articles) {
    const text = `${article.title}\n[${article.section}]\n${article.content}`.slice(0, 512);

    const output = await extractor(text, { pooling: 'mean', normalize: true });
    const embedding = new Float32Array(output.data);

    upsert.run(article.id, float32ToBlob(embedding));
    processed++;

    if (processed % 50 === 0) {
      console.log(`  ${processed}/${articles.length}`);
    }
  }

  console.log(`Done. ${processed} embeddings generated (${EMBEDDING_DIM} dimensions).`);
  db.close();
}

main().catch((err) => {
  console.error('Embedding generation failed:', err);
  process.exit(1);
});

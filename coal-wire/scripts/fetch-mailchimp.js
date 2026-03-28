#!/usr/bin/env node

/**
 * Fetch Coal Wire content from Mailchimp campaign archive URLs.
 *
 * Step 1: Parse WordPress XML export to extract metadata + archive URLs.
 * Step 2: Fetch each archive page and extract the newsletter content.
 * Step 3: Save as JSON ready for ingest-local.js.
 *
 * Usage:
 *   node scripts/fetch-mailchimp.js <wordpress-export.xml>
 *   node scripts/fetch-mailchimp.js <wordpress-export.xml> --resume
 *
 * Output: data/coalwire-fetched.json
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { mkdirSync } from 'node:fs';
import path from 'node:path';

const OUTPUT_PATH = path.resolve('data/coalwire-fetched.json');
const CONCURRENCY = 3;
const DELAY_MS = 500; // polite delay between batches

/**
 * Extract text from a WXR field, handling CDATA and plain text.
 */
function wxrText(item, tagName) {
  const cdataRe = new RegExp(`<${tagName}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tagName}>`);
  const plainRe = new RegExp(`<${tagName}>([^<]*)</${tagName}>`);
  const m = item.match(cdataRe) || item.match(plainRe);
  return m ? m[1] : null;
}

function extractIssueNumber(str) {
  const m = str.match(/coal\s*wire\s*#?\s*(\d+)/i) || str.match(/coalwire\s+(\d+)/i);
  return m ? parseInt(m[1]) : null;
}

/**
 * Parse WordPress XML export → array of { title, date, issueNumber, archiveUrl, wpPostId }
 */
function parseManifest(xmlPath) {
  const xml = readFileSync(xmlPath, 'utf-8');
  const items = xml.split('<item>').slice(1);
  const manifest = [];

  for (const item of items) {
    const postType = wxrText(item, 'wp:post_type');
    if (postType !== 'coalwire') continue;

    const status = wxrText(item, 'wp:status');
    if (status !== 'publish') continue;

    const title = wxrText(item, 'title') || 'Untitled';
    const rawDate = wxrText(item, 'wp:post_date');
    const date = rawDate ? rawDate.split(' ')[0] : null;
    const issueNumber = extractIssueNumber(title);

    // Get the Mailchimp archive link from postmeta
    const linkMatch = item.match(
      /<wp:meta_key>(?:<!\[CDATA\[)?article_link(?:\]\]>)?<\/wp:meta_key>\s*<wp:meta_value>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/wp:meta_value>/
    );
    const archiveUrl = linkMatch ? linkMatch[1].trim() : null;

    const wpIdRaw = wxrText(item, 'wp:post_id');
    const wpPostId = wpIdRaw ? parseInt(wpIdRaw) : null;

    // WordPress canonical link
    const wpLinkMatch = item.match(/<link>([^<]+)<\/link>/);
    const wpUrl = wpLinkMatch ? wpLinkMatch[1].replace(/&#038;/g, '&') : null;

    // Excerpt (some have useful summaries)
    const excerpt = wxrText(item, 'excerpt:encoded') || '';

    manifest.push({ title, date, issueNumber, archiveUrl, wpPostId, wpUrl, excerpt });
  }

  return manifest;
}

/**
 * Strip Mailchimp HTML to clean text content.
 */
function stripMailchimpHtml(html) {
  // Remove style tags and their content
  let text = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove script tags
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Convert common elements
  text = text.replace(/<br\s*\/?>/gi, '\n');
  text = text.replace(/<\/p>/gi, '\n\n');
  text = text.replace(/<\/h[1-6]>/gi, '\n\n');
  text = text.replace(/<\/li>/gi, '\n');
  text = text.replace(/<\/div>/gi, '\n');
  text = text.replace(/<\/tr>/gi, '\n');
  // Remove remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode entities
  text = text.replace(/&nbsp;/g, ' ');
  text = text.replace(/&amp;/g, '&');
  text = text.replace(/&lt;/g, '<');
  text = text.replace(/&gt;/g, '>');
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#8217;|&#x2019;|&rsquo;/g, "'");
  text = text.replace(/&#8216;|&#x2018;|&lsquo;/g, "'");
  text = text.replace(/&#8220;|&#x201C;|&ldquo;/g, '"');
  text = text.replace(/&#8221;|&#x201D;|&rdquo;/g, '"');
  text = text.replace(/&#8211;|&#x2013;|&ndash;/g, '–');
  text = text.replace(/&#8212;|&#x2014;|&mdash;/g, '—');
  text = text.replace(/&#\d+;/g, '');
  text = text.replace(/&[a-z]+;/gi, ''); // strip remaining named entities
  // Strip Mailchimp boilerplate (careful: only strip footers, not mid-content)
  text = text.replace(/Share on Facebook\s*\n\s*Share on Twitter\s*\n\s*Forward to a Friend\s*\n\s*Subscribe/gi, '');
  text = text.replace(/Campaign URL Copy[\s\S]*?Translate[\s\S]*?\n/gi, '');
  text = text.replace(/View this email in your browser/gi, '');
  text = text.replace(/unsubscribe from this list/gi, '');
  text = text.replace(/Copyright\s*©?\s*\d{4}\s*Global Energy Monitor[\s\S]*$/gi, '');
  // Strip Mailchimp footer block at END of content only (last 500 chars)
  const last500 = text.slice(-500);
  const footerIdx = last500.search(/(?:subscribe to CoalWire|update subscription preferences|editor@coalwire\.org\s*\n\s*subscribe)/i);
  if (footerIdx !== -1) {
    text = text.slice(0, text.length - 500 + footerIdx);
  }
  // Clean up whitespace
  text = text.replace(/[ \t]+/g, ' ');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text.trim();
}

/**
 * Extract links from HTML.
 */
function extractLinks(html) {
  const links = [];
  const re = /<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
  let m;
  while ((m = re.exec(html)) !== null) {
    const url = m[1];
    const text = m[2].replace(/<[^>]+>/g, '').trim();
    // Skip Mailchimp tracking/internal links
    if (url.includes('mailchimp.com') || url.includes('campaign-archive') || url.startsWith('#')) continue;
    if (url && text) links.push({ url, text });
  }
  return links;
}

/**
 * Extract the main content area from a Mailchimp archive page.
 */
function extractMailchimpContent(html) {
  // Try to find the main content container (Mailchimp templates vary)
  // Most use mcnTextContent or templateBody
  let content = '';

  // Strategy 1: Find all mcnTextContent blocks
  const textBlocks = html.match(/<td[^>]*class="[^"]*mcnTextContent[^"]*"[^>]*>[\s\S]*?<\/td>/gi);
  if (textBlocks && textBlocks.length > 0) {
    content = textBlocks.join('\n');
  }

  // Strategy 2: If no mcnTextContent, try templateBody
  if (!content) {
    const bodyMatch = html.match(/<table[^>]*id="templateBody"[^>]*>[\s\S]*?<\/table>/i);
    if (bodyMatch) content = bodyMatch[0];
  }

  // Strategy 3: Try the whole body
  if (!content) {
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch) content = bodyMatch[1];
  }

  return content;
}

/**
 * Fetch a single Mailchimp archive page with retry.
 */
async function fetchArchive(url, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'CoalWire-Archiver/1.0 (Global Energy Monitor research tool)',
        },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (attempt === retries) throw err;
      await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
    }
  }
}

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  const xmlPath = process.argv[2];
  if (!xmlPath || !existsSync(xmlPath)) {
    console.error('Usage: node scripts/fetch-mailchimp.js <wordpress-export.xml> [--resume]');
    process.exit(1);
  }

  const resume = process.argv.includes('--resume');

  console.log('Parsing WordPress XML export...');
  const manifest = parseManifest(xmlPath);
  console.log(`Found ${manifest.length} published Coal Wire issues`);

  const withLinks = manifest.filter((m) => m.archiveUrl);
  console.log(`${withLinks.length} have Mailchimp archive URLs`);

  // Load existing results if resuming
  let existing = [];
  if (resume && existsSync(OUTPUT_PATH)) {
    existing = JSON.parse(readFileSync(OUTPUT_PATH, 'utf-8'));
    console.log(`Resuming: ${existing.length} already fetched`);
  }
  const fetchedUrls = new Set(existing.map((e) => e.archiveUrl));

  const toFetch = withLinks.filter((m) => !fetchedUrls.has(m.archiveUrl));
  console.log(`${toFetch.length} to fetch\n`);

  if (toFetch.length === 0) {
    console.log('Nothing to fetch!');
    return;
  }

  mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const results = [...existing];
  let fetched = 0;
  let failed = 0;

  // Process in batches
  for (let i = 0; i < toFetch.length; i += CONCURRENCY) {
    const batch = toFetch.slice(i, i + CONCURRENCY);

    const batchResults = await Promise.allSettled(
      batch.map(async (entry) => {
        const html = await fetchArchive(entry.archiveUrl);
        const contentHtml = extractMailchimpContent(html);
        const links = extractLinks(contentHtml || html);
        const text = stripMailchimpHtml(contentHtml || html);

        return {
          ...entry,
          content: text,
          links,
          contentLength: text.length,
        };
      })
    );

    for (const [j, result] of batchResults.entries()) {
      const entry = batch[j];
      if (result.status === 'fulfilled') {
        results.push(result.value);
        fetched++;
        const len = result.value.contentLength;
        process.stdout.write(`  ✓ ${entry.title.slice(0, 50).padEnd(50)} ${len} chars\n`);
      } else {
        failed++;
        process.stdout.write(`  ✗ ${entry.title.slice(0, 50).padEnd(50)} ${result.reason.message}\n`);
        // Save entry with empty content so we can skip it on resume
        results.push({ ...entry, content: '', links: [], contentLength: 0, error: result.reason.message });
      }
    }

    // Save progress after each batch (crash-safe)
    writeFileSync(OUTPUT_PATH, JSON.stringify(results, null, 2));

    // Progress
    const total = toFetch.length;
    const done = fetched + failed;
    if (done % 10 === 0 || done === total) {
      console.log(`\n  Progress: ${done}/${total} (${fetched} ok, ${failed} failed)\n`);
    }

    if (i + CONCURRENCY < toFetch.length) {
      await sleep(DELAY_MS);
    }
  }

  // Final summary
  const withContent = results.filter((r) => r.contentLength > 100);
  console.log(`\nDone! ${fetched} fetched, ${failed} failed.`);
  console.log(`${withContent.length} issues with substantial content (>100 chars)`);
  console.log(`Saved to ${OUTPUT_PATH}`);
  console.log(`\nNext: node scripts/ingest-local.js data/coalwire-fetched.json`);
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});

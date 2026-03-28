# Coal Wire Search

A search tool for [Global Energy Monitor's Coal Wire](https://globalenergymonitor.org/coalwire/) — the weekly newsletter tracking the global coal industry since 2013. ~600 issues, ~900 articles, one search box.

Runs entirely on your machine. No API keys. No cloud services. The embedding model is 23MB and lives right next to your SQLite database.

**Live:** https://coal-wire-search.fly.dev/

## Quick start (dev with fake data)

```bash
npm install
npm run seed          # generate fixture articles
npm run tags          # extract countries + topics
npm run embeddings    # vectorize (~2 min, all local)
npm run dev           # http://localhost:5173
```

## Loading real data

Coal Wire content lives in Mailchimp, not WordPress. The WordPress XML export only has metadata + Mailchimp archive URLs. So the pipeline is:

```
WordPress XML export
  → fetch-mailchimp.js (fetches content from Mailchimp archive pages)
  → data/coalwire-fetched.json (the source-of-truth artifact)
  → ingest-local.js (loads into SQLite + FTS5)
  → extract-tags.js (country + topic tags)
  → generate-embeddings.js (384-dim vectors)
  → data/coalwire.db (ready to search)
```

### First time (from a fresh WordPress export)

```bash
npm run fetch -- /path/to/export.xml
```

This parses the XML, finds all Mailchimp archive URLs, fetches each one (takes ~5 min for 600 issues), strips the email template chrome, and saves everything to `data/coalwire-fetched.json`.

Then build the database:

```bash
npm run pipeline -- data/coalwire-fetched.json
```

This runs ingest + tags + embeddings in sequence. Takes ~3 min total.

### Updating with a new export

When GEM provides a newer WordPress XML export with new issues:

```bash
npm run update -- /path/to/new-export.xml
```

That's one command. It:
1. Parses the new XML
2. Fetches only issues not already in `coalwire-fetched.json` (`--resume`)
3. Rebuilds the SQLite database from scratch
4. Re-extracts tags
5. Re-generates embeddings

Then deploy:

```bash
fly deploy
```

### What's in `coalwire-fetched.json`

This is the source of truth — 588 issues (as of Nov 2025), ~9MB of cleaned newsletter text. It's gitignored but should be kept safe. If you lose it, you'd need to re-fetch everything from Mailchimp.

Each entry looks like:

```json
{
  "title": "CoalWire 589, November 20, 2025",
  "date": "2025-11-19",
  "issueNumber": 589,
  "archiveUrl": "https://mailchi.mp/globalenergymonitor/...",
  "wpPostId": 15921,
  "content": "Editors Note\n\nSouth Korea announced plans to...",
  "links": [{"url": "https://...", "text": "Reuters"}],
  "contentLength": 14832
}
```

## How search works

Five presets from "find these exact words" to "find me something in the same vibe":

| | |
|---|---|
| **Exact words** | Classic full-text search. SQLite FTS5, BM25 ranking. |
| **Mostly words** | 75% keyword, 25% meaning. |
| **Balanced** | Even split. Best default for most queries. |
| **Mostly meaning** | Finds related concepts even if the words don't match. |
| **Vibes only** | Pure semantic search. "Climate finance developing nations" finds articles about coal divestment in Indonesia. |

There's a fine-tune slider if the presets aren't enough. The hybrid mode uses [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf) to merge the two ranked lists.

### The embedding model

[all-MiniLM-L6-v2](https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2) — 384 dimensions, ~23MB. Runs in Node.js via `@huggingface/transformers`. Downloads once on first use, caches to disk, works offline forever after.

The same model generates document vectors at ingest time and query vectors at search time, so they're always in the same space.

### Tags

`npm run tags` pulls structured metadata out of article text — no LLM needed, just keyword matching:

- **Countries** — 115 countries detected by name mention
- **Topics** — retirement, financing, pollution, health, policy, labor, mining, markets, renewables, legal, carbon, new-capacity

These power the filter dropdowns in the UI. They also work as API query params.

## Embedding in Drupal

Three widgets, each available as an iframe:

```html
<!-- Search box with tuning controls -->
<iframe src="https://coal-wire-search.fly.dev/embed/search?tuner=true&compact=true"
  style="width:100%;border:none;min-height:400px"></iframe>

<!-- "Related from Coal Wire" sidebar -->
<iframe src="https://coal-wire-search.fly.dev/embed/related?q=india+coal+retirement&limit=5&compact=true"
  style="width:100%;border:none;min-height:200px"></iframe>

<!-- Recent issues list -->
<iframe src="https://coal-wire-search.fly.dev/embed/browse?limit=10&compact=true"
  style="width:100%;border:none;min-height:300px"></iframe>
```

All embeds accept: `theme` (light/dark), `padding`, `maxWidth`, `compact`, `autoHeight`.

<details>
<summary>Auto-resize iframes</summary>

The embed shell posts height updates to the parent window:

```js
window.addEventListener('message', (e) => {
  if (e.data.type === 'coalwire-resize') {
    document.querySelector('iframe').style.height = e.data.height + 'px';
  }
});
```
</details>

## API

All JSON, all CORS-enabled, all `GET`.

| Endpoint | What you get |
|----------|-------------|
| `/api/search?q=coal+ash` | Search results. Add `mode=hybrid`, `bm25w=0.7`, `country=India`, `topic=pollution`, `section=Top+News`, `from=2024-01-01`, `to=2025-01-01`, `limit=20` |
| `/api/search?q=` | Empty query = metadata: available sections, countries, topics, corpus stats |
| `/api/stats` | Article/issue counts, date range, whether embeddings and tags exist |
| `/api/issues` | Browse by date. `?limit=50&offset=0` or `?issue=594` for one issue |
| `/api/article?id=42` | Single article with its tags |
| `/api/similar?id=42` | Articles with similar embeddings. `?limit=5` |
| `/api/tags?type=country` | All tag values for a type, ordered by frequency |
| `/api/health` | Is the database alive? Used by Fly.io health checks |

## Deploy

```bash
fly apps create coal-wire-search
fly volumes create coalwire_data --region iad --size 1
fly deploy
```

The `Dockerfile` bakes the current `data/coalwire.db` into the image. On first boot, it copies to the persistent Fly volume. Subsequent deploys update the image; restart the machine to pick up a new database.

## npm scripts

| Script | What it does |
|--------|-------------|
| `npm run dev` | Start dev server |
| `npm run build` | Production build |
| `npm run seed` | Generate fake fixture data |
| `npm run fetch -- export.xml` | Parse WP XML + fetch content from Mailchimp |
| `npm run ingest:local -- data.json` | Load JSON into SQLite |
| `npm run tags` | Extract country + topic tags |
| `npm run embeddings` | Generate vector embeddings |
| `npm run pipeline -- data.json` | ingest + tags + embeddings in one shot |
| `npm run update -- export.xml` | Full update: fetch new + rebuild everything |

## Project structure

```
coal-wire/
├── scripts/
│   ├── seed-fixtures.js        # fake data for dev
│   ├── fetch-mailchimp.js      # WP XML → Mailchimp fetch → JSON
│   ├── ingest-local.js         # JSON / HTML / XML → SQLite + FTS5
│   ├── generate-embeddings.js  # vectorize articles (local model)
│   └── extract-tags.js         # country + topic extraction
├── src/
│   ├── lib/
│   │   ├── db.ts               # SQLite connection + types
│   │   ├── search.ts           # BM25, semantic, hybrid, RRF
│   │   ├── embeddings.ts       # local model (query-time)
│   │   ├── format.ts           # date helpers
│   │   ├── export.ts           # CSV, share links, clipboard
│   │   └── components/         # SearchWidget, SearchTuner,
│   │                           # RelatedArticles, BrowseWidget,
│   │                           # EmbedShell
│   └── routes/
│       ├── +page.svelte        # main search page
│       ├── article/[id]/       # article detail + similar
│       ├── issue/[number]/     # issue detail
│       ├── api/                # search, stats, issues, article,
│       │                       # similar, tags, health
│       └── embed/              # search, related, browse
├── data/
│   ├── coalwire-fetched.json   # source of truth (gitignored)
│   └── coalwire.db             # SQLite database (gitignored)
├── Dockerfile
└── fly.toml
```

## Stack

**SvelteKit** + **SQLite FTS5** + **all-MiniLM-L6-v2** + **Reciprocal Rank Fusion**

No external services. The whole thing fits in a single Fly machine with a 1GB volume.

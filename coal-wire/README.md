# Coal Wire Search

A search tool for [Global Energy Monitor's Coal Wire](https://globalenergymonitor.org/coalwire/) — the weekly newsletter tracking the global coal industry since 2013. About 600 issues, thousands of news items, one search box.

Runs entirely on your machine. No API keys. No cloud services. The embedding model is 23MB and lives right next to your SQLite database.

## Get it running

```bash
npm install
npm run seed          # fake data so you can poke around
npm run tags          # extract countries + topics
npm run embeddings    # vectorize everything (~2 min, all local)
npm run dev           # http://localhost:5173
```

That's it. Search works immediately.

## When you have real data

Feed it a WordPress XML export, a folder of saved HTML files, or a JSON array:

```bash
npm run ingest:local -- export.xml       # WP export from wp-admin
npm run ingest:local -- ./html-files/    # saved pages
npm run ingest:local -- articles.json    # structured JSON
```

Then enrich:

```bash
npm run tags        # countries + topics, instant
npm run embeddings  # vectors, ~2 min per 1000 articles
```

Or just `npm run pipeline -- export.xml` for the whole thing.

<details>
<summary>JSON format</summary>

```json
[{
  "issue_number": 594,
  "title": "CoalWire 594 — January 8, 2025",
  "date": "2025-01-08",
  "section": "Top News",
  "content": "Article text here...",
  "url": "https://globalenergymonitor.org/coalwire/coalwire-594/"
}]
```
</details>

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

The same model generates document vectors at ingest time and query vectors at search time, so they're always in the same space. The model warms up in the background when the server starts.

### Tags

`npm run tags` pulls structured metadata out of article text — no LLM needed, just keyword matching:

- **Countries** — 120+ countries detected by name mention
- **Topics** — retirement, financing, pollution, health, policy, labor, mining, markets, renewables, legal, carbon, new-capacity

These power the filter dropdowns in the UI. They also work as API query params.

## Embedding in Drupal

Three widgets, each available as an iframe:

```html
<!-- Search box with tuning controls -->
<iframe src="https://your-host/embed/search?tuner=true&compact=true"
  style="width:100%;border:none;min-height:400px"></iframe>

<!-- "Related from Coal Wire" sidebar -->
<iframe src="https://your-host/embed/related?q=india+coal+retirement&limit=5&compact=true"
  style="width:100%;border:none;min-height:200px"></iframe>

<!-- Recent issues list -->
<iframe src="https://your-host/embed/browse?limit=10&compact=true"
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

The `Dockerfile` and `fly.toml` are ready. SQLite lives on a persistent Fly volume at `/app/data`.

## Project structure

```
coal-wire/
├── scripts/
│   ├── seed-fixtures.js        # fake data for dev
│   ├── ingest-local.js         # load JSON / HTML / WP XML
│   ├── generate-embeddings.js  # vectorize articles (local model)
│   └── extract-tags.js         # country + topic extraction
├── src/
│   ├── lib/
│   │   ├── db.ts               # SQLite + types
│   │   ├── search.ts           # BM25, semantic, hybrid, tags
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
├── Dockerfile
├── fly.toml
└── data/coalwire.db            # gitignored
```

## Stack

**SvelteKit** + **SQLite FTS5** + **all-MiniLM-L6-v2** + **Reciprocal Rank Fusion**

No external services. The whole thing fits in a single Fly machine with a 1GB volume.

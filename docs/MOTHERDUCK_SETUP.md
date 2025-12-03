# MotherDuck Integration Setup Guide

Complete guide to get your GEM data flowing to MotherDuck.

## Quick Start

```bash
# 1. Install dependencies
just motherduck-setup

# 2. Configure auth
cp scripts/.env.example scripts/.env
# Edit scripts/.env and add your token

# 3. Upload data
just motherduck-upload

# 4. Query interactively
just motherduck-query
```

## Step-by-Step Setup

### 1. Get Your MotherDuck Token

1. Go to https://app.motherduck.com/
2. Sign in (or create account)
3. Click your profile → **Settings**
4. Navigate to **Access Tokens**
5. Click **Create token**
6. Give it a name (e.g., "GEM Data Upload")
7. Select token type:
   - **Read/Write** for upload scripts (recommended to start)
   - **Read Scaling** for production query-only access
8. Copy the token (you can't see it again!)

### 2. Configure Environment

```bash
cd scripts
cp .env.example .env
```

Edit `scripts/.env`:

```bash
MOTHERDUCK_TOKEN=your_actual_token_here
MOTHERDUCK_DB=gem_data
```

**Security:**
- Never commit `.env` to git (already in `.gitignore`)
- Don't share tokens
- Rotate tokens periodically

### 3. Install Dependencies

```bash
just motherduck-setup
```

This installs:
- `duckdb` - Node.js DuckDB driver with MotherDuck support
- `dotenv` - Environment variable loader

### 4. Upload Your Data

```bash
just motherduck-upload
```

This will:
1. Connect to MotherDuck
2. Create (or replace) tables:
   - `trackers_ownership` - 156K ownership records
   - `entities` - Entity master data
   - `ownership` - Ownership graph
3. Upload all parquet files
4. Show summary

**Output:**
```
🚀 GEM Data → MotherDuck Upload

🦆 Connecting to MotherDuck (read_write mode)...
✓ Connected to MotherDuck database: gem_data

📦 Uploading Cross-tracker ownership data...
   ✓ Uploaded 156,004 rows in 3.42s

📊 Upload Summary
✓ Successfully uploaded 3 table(s)
  • trackers_ownership: 156,004 rows
  • entities: 12,456 rows
  • ownership: 45,123 rows

📈 Total: 213,583 rows uploaded
```

## Querying Data

### Interactive CLI

```bash
just motherduck-query
```

Example session:
```sql
motherduck> .samples
📋 Sample Queries:
  show-tables: List all tables
  ownership-summary: Summary by tracker type
  ...

motherduck> show-tables
name
────────────────────
trackers_ownership
entities
ownership

motherduck> SELECT COUNT(*) FROM trackers_ownership
count
────────
156004

motherduck> .exit
```

### Sample Queries

Run predefined queries:

```bash
# Show all available samples
just motherduck-samples

# Run a specific sample
just motherduck-sample ownership-summary
just motherduck-sample top-owners
just motherduck-sample country-capacity
```

### MotherDuck Web UI

Visit https://app.motherduck.com/ to:
- Browse tables visually
- Run SQL queries in notebook interface
- Export results to CSV/Parquet
- Share queries with team
- View query history

## Architecture Options

### Option 1: CLI + Manual Exports (Current)

**Use case:** Quick analysis, one-off queries

```bash
# Query and export
just motherduck-query
motherduck> SELECT * FROM trackers_ownership WHERE "Tracker" = 'Coal Plant' LIMIT 1000
# Copy results → paste into spreadsheet
```

**Pros:**
- Zero additional infrastructure
- Full SQL access
- Works immediately

**Cons:**
- Manual process
- Not integrated with web app

---

### Option 2: Simple API Server (Recommended Next)

**Use case:** Web app integration, shared queries

Create a lightweight Express/Fastify server:

```
scripts/
  api-server.js       # REST API for queries
  motherduck-client.js # (existing)

API endpoints:
  GET  /api/tables           # List tables
  POST /api/query            # Execute SQL (validated)
  GET  /api/samples/:name    # Run predefined query
```

**Svelte integration:**
```js
// In gem-viz
const results = await fetch('/api/query', {
  method: 'POST',
  body: JSON.stringify({ sql: 'SELECT ...' })
});
```

**Pros:**
- Web app can query MotherDuck
- Read-only token for security
- Predefined safe queries

**Cons:**
- Need to run server
- Add CORS configuration

---

### Option 3: MotherDuck + DuckDB Hybrid

**Use case:** Fast local queries + cloud sync

Keep using DuckDB WASM in browser, but sync periodically:

```bash
# Nightly/weekly data sync
just motherduck-upload  # Local → Cloud
# OR
just motherduck-download # Cloud → Local parquet
```

**Pros:**
- Fast browser queries (WASM)
- Cloud backup/sharing
- No server needed

**Cons:**
- Data freshness lag
- Still manual sync

---

## Recommended Path Forward

### Phase 1: CLI Validation (Today)
✅ Upload data
✅ Run sample queries
✅ Validate data quality

### Phase 2: API Server (Next)
- [ ] Create `scripts/api-server.js`
- [ ] Add read-only token
- [ ] Deploy to Railway/Fly.io/Vercel
- [ ] Add CORS for gem-viz domain

### Phase 3: Web Integration (Later)
- [ ] Create Svelte query component
- [ ] Add predefined query dropdowns
- [ ] Results table with export
- [ ] Cache frequent queries

## Data Updates

When you get fresh data:

```bash
# 1. Process new Excel files
just process-all

# 2. Re-upload to MotherDuck
just motherduck-upload

# Tables are replaced automatically
```

MotherDuck will:
- Drop old tables
- Create new tables with fresh data
- Maintain query history

## Security Best Practices

### Tokens

- **Development:** Use Read/Write token
- **Production API:** Use Read Scaling token
- **Team sharing:** Create separate tokens per person
- **Rotation:** Regenerate tokens every 90 days

### SQL Injection Prevention

If building an API:

```js
// ❌ BAD - Direct user input
app.post('/query', (req, res) => {
  const sql = req.body.sql; // User can run ANY SQL!
  await query(conn, sql);
});

// ✅ GOOD - Predefined queries only
const ALLOWED_QUERIES = {
  'top-owners': 'SELECT Owner, COUNT(*) ...',
  'by-country': 'SELECT Country, SUM(...) ...'
};

app.get('/query/:name', (req, res) => {
  const sql = ALLOWED_QUERIES[req.params.name];
  if (!sql) return res.status(404).json({ error: 'Unknown query' });
  const results = await query(conn, sql);
  res.json(results);
});
```

## Troubleshooting

### "MOTHERDUCK_TOKEN not found"

```bash
# Check .env exists
ls scripts/.env

# Verify token is set
cat scripts/.env | grep MOTHERDUCK_TOKEN
```

### "Connection failed"

- Check token is valid (not expired)
- Verify internet connection
- Try generating new token

### "Table already exists"

Scripts use `CREATE OR REPLACE TABLE` - this is intentional.
Old data is replaced on re-upload.

### "Permission denied"

- Read Scaling tokens can't create tables
- Use Read/Write token for uploads
- Use Read Scaling for queries only

## Next Steps

1. **Upload your data** → `just motherduck-upload`
2. **Try sample queries** → `just motherduck-samples`
3. **Explore in web UI** → https://app.motherduck.com/
4. **Check schema docs** → `MOTHERDUCK_SCHEMA.md`

## Resources

- [MotherDuck Docs](https://motherduck.com/docs/)
- [DuckDB SQL Reference](https://duckdb.org/docs/sql/introduction)
- [Schema Reference](./MOTHERDUCK_SCHEMA.md)
- [Node.js DuckDB Docs](https://duckdb.org/docs/api/nodejs/overview)

# MotherDuck Quick Start

All the mise en place is ready. Just add your auth token and go!

## What's Been Set Up

✅ **Data Schemas Documented** - `MOTHERDUCK_SCHEMA.md`
- All 28 columns in `trackers_ownership` table
- Entity and ownership graph schemas
- Sample queries and join patterns

✅ **Node.js Connection Module** - `scripts/motherduck-client.js`
- Connect with read/write or read-only mode
- Query utilities
- Connection pooling ready

✅ **Upload Script** - `scripts/upload-to-motherduck.js`
- Uploads all 3 parquet files
- Creates/replaces tables automatically
- Shows progress and summary

✅ **Query CLI** - `scripts/query-motherduck.js`
- Interactive SQL mode
- 5 predefined sample queries
- Results formatted as tables

✅ **Justfile Commands**
```bash
just motherduck-setup      # Install deps
just motherduck-upload     # Upload data
just motherduck-query      # Interactive queries
just motherduck-sample X   # Run sample query
just motherduck-samples    # List samples
```

✅ **Documentation**
- `MOTHERDUCK_SETUP.md` - Complete setup guide
- `MOTHERDUCK_SCHEMA.md` - Data reference
- `scripts/README.md` - Scripts overview

## What You Need to Do

### 1. Get Your Token (2 minutes)

1. Go to https://app.motherduck.com/
2. Sign in
3. Settings → Access Tokens → Create token
4. Copy the token

### 2. Configure (30 seconds)

```bash
cp scripts/.env.example scripts/.env
# Edit scripts/.env and paste your token
```

### 3. Install & Upload (1 minute)

```bash
just motherduck-setup    # Install Node deps
just motherduck-upload   # Upload ~156K rows
```

### 4. Query! (immediately)

```bash
just motherduck-query
```

Or use web UI: https://app.motherduck.com/

## Your Data

After upload, you'll have:

| Table | Rows | Description |
|-------|------|-------------|
| `trackers_ownership` | 156,004 | Cross-tracker ownership |
| `entities` | ~12K | Entity master data |
| `ownership` | ~45K | Ownership graph |

## Sample Queries

```bash
# List tables
just motherduck-sample show-tables

# Ownership breakdown by tracker type
just motherduck-sample ownership-summary

# Top 20 owners
just motherduck-sample top-owners

# Asset status by tracker
just motherduck-sample tracker-status

# Top countries by coal capacity
just motherduck-sample country-capacity
```

## Next Steps (Optional)

After validating the data upload works:

**For Analysis:**
- Use MotherDuck web UI for visual exploration
- Export results to CSV for sharing
- Build custom SQL queries (see schema docs)

**For Web Integration:**
- Create simple API server (see `MOTHERDUCK_SETUP.md` Option 2)
- Add Svelte components for querying
- Deploy read-only API endpoint

**For Team Sharing:**
- Invite collaborators to MotherDuck
- Share saved queries
- Set up read-only tokens for team

## Architecture

```
Local Files (Parquet)
    ↓
scripts/upload-to-motherduck.js
    ↓
MotherDuck Cloud Database
    ↓
    ├─→ scripts/query-motherduck.js (CLI)
    ├─→ Web UI (app.motherduck.com)
    └─→ Future: API Server → Svelte App
```

## Files Created

```
.
├── MOTHERDUCK_QUICKSTART.md  ← You are here
├── MOTHERDUCK_SETUP.md        ← Complete guide
├── MOTHERDUCK_SCHEMA.md       ← Data reference
├── Justfile                   ← Updated with MD commands
├── .gitignore                 ← Added .env protection
└── scripts/
    ├── package.json           ← Node deps
    ├── motherduck-client.js   ← Connection module
    ├── upload-to-motherduck.js ← Upload script
    ├── query-motherduck.js    ← Query CLI
    ├── .env.example           ← Template
    └── README.md              ← Scripts overview
```

## Questions?

- Setup issues → See `MOTHERDUCK_SETUP.md` Troubleshooting section
- Schema questions → See `MOTHERDUCK_SCHEMA.md`
- MotherDuck docs → https://motherduck.com/docs/

---

**Ready to roll! Just add your token and `just motherduck-upload` 🚀**

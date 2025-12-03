# Global Energy Monitor - Visualization & Analysis

Cross-tracker ownership visualization and geospatial analysis for Global Energy Monitor data.

## 🗂️ Project Structure

- **`gem-viz/`** - Interactive web visualization (SvelteKit static site)
- **`data-processing/`** - Data pipeline and processing scripts
- **`docs/`** - Comprehensive documentation
- **`Onwership_ConvertDataToParquet.R`** - R data conversion script

## 🚀 Quick Start

### Web App Development

```bash
cd gem-viz
npm install
npm run dev
```

Visit http://localhost:3737

### Production Build

```bash
cd gem-viz
npm run build    # Generates 6K+ static pages (~20 min)
npm run preview  # Preview production build locally
```

### Data Processing

```bash
cd data-processing
just check-deps
just process-all
```

## 📚 Documentation

- **[MotherDuck Setup](docs/MOTHERDUCK_QUICKSTART.md)** - Cloud database integration
- **[Deployment Guide](docs/DEPLOY-CHECKLIST.md)** - Deploy to production
- **[Asset Page Enhancement](docs/ASSET-PAGE-ENHANCEMENT.md)** - Relationship networks
- **[Relationship Integration](docs/RELATIONSHIP-INTEGRATION.md)** - Implementation guide
- **[Static Hosting Guide](docs/STATIC-HOSTING-GUIDE.md)** - Object storage deployment

## 🎯 Key Features

### Current (v1)
- ✅ Pre-rendered static site (6,303 US assets, 207 MB)
- ✅ Interactive MapLibre maps on every asset page
- ✅ Cross-tracker ownership data integration
- ✅ MotherDuck cloud database for build-time queries
- ✅ Geographic spatial tiles for performance
- ✅ Zero runtime database queries (everything pre-baked)

### In Progress (v2)
- 🚧 **Ownership network visualization** - Visual ownership chains with percentages
- 🚧 **Related assets** - "This owner owns 12 other assets"
- 🚧 **Co-located assets** - Multiple units at same location
- 🚧 **Parent company portfolios** - Full entity relationship graphs

### Planned (v3)
- 📋 Entity detail pages (one page per GEM Entity ID)
- 📋 Interactive network graphs (D3.js/deck.gl)
- 📋 Advanced search & filtering
- 📋 Global build (62K+ assets, all countries)

## 📊 Data Overview

- **156,004** ownership records across 7 tracker types
- **6,303** US assets (current build)
- **62,000+** global assets (full dataset)
- **Data sources:** Coal plants, gas plants, steel plants, mines, pipelines

### Tracker Type Breakdown

| Tracker | Assets |
|---------|--------|
| Coal Plant | 61,156 |
| Gas Plant | 52,925 |
| Gas Pipeline | 17,364 |
| Coal Mine | 8,561 |
| Steel Plant | 8,029 |
| Bioenergy | 5,022 |
| Iron Mine | 2,947 |

## 🏗️ Architecture

### Build-Time Strategy

```
MotherDuck (Cloud DuckDB)
    ↓
  Query all assets once
    ↓
  Cache to disk (42 MB JSON)
    ↓
  Pre-compute relationships (+30s)
    ↓
  Generate 6K+ static HTML pages
    ↓
  Upload to Digital Ocean Spaces
```

**Result:** Zero runtime queries, instant page loads, perfect for static hosting

### Tech Stack

- **Frontend:** SvelteKit 2.x (static adapter)
- **Database:** MotherDuck (DuckDB in the cloud)
- **Maps:** MapLibre GL
- **Build:** Vite + Node.js
- **Deployment:** Digital Ocean Spaces (S3-compatible)
- **Data Processing:** Just (command runner) + Node.js

## 🎨 Relationship Networks (New!)

Pre-computed at build time, zero runtime cost:

```javascript
// For each asset, we compute:
{
  ownershipChain: [
    { name: "BlackRock Inc", share: 5.07 },
    { name: "RWE AG", share: 6.3 },
    // ...
  ],
  sameOwnerAssets: [...], // Top 10 by capacity
  coLocatedAssets: [...],  // Same physical location
  ownerStats: {
    total_assets: 847,
    total_capacity_mw: 12345,
    countries: 15
  }
}
```

All baked into static HTML at build time!

## 🚀 Deployment

### Current Production
**URL:** https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/index.html
**Status:** US-only test deployment (6,303 assets)

### Deploy Process

```bash
cd gem-viz

# Option 1: Digital Ocean Spaces (current)
npm run deploy

# Option 2: Cloudflare Pages (alternative)
npx wrangler pages deploy build --project-name=gem-viz
```

See [DEPLOY-CHECKLIST.md](docs/DEPLOY-CHECKLIST.md) for detailed instructions.

## 🤝 Contributing

### For Team Members

```bash
# Clone
gh repo clone GlobalEnergyMonitor/ejthirdbear
cd ejthirdbear

# Create feature branch
git checkout -b feature/my-enhancement

# Make changes in gem-viz/
cd gem-viz
npm install
npm run dev

# Commit and push
git add -A
git commit -m "Add feature: description"
git push origin feature/my-enhancement

# Create PR
gh pr create
```

### Development Workflow

1. Make changes to `gem-viz/src/`
2. Test locally: `npm run dev`
3. Build test: `npm run build` (takes ~2 minutes for US-only)
4. Preview: `npm run preview`
5. Commit with descriptive message
6. Push and create PR for review

## 🔧 Environment Setup

### Prerequisites
- Node.js 18+
- npm or pnpm
- Git with GitHub access
- (Optional) MotherDuck token for data queries

### First Time Setup

```bash
# Install dependencies
cd gem-viz
npm install

# (Optional) Configure MotherDuck access
cp .env.example .env
# Edit .env and add MOTHERDUCK_TOKEN
```

### MotherDuck Access

MotherDuck is used **only at build time** to query data. You don't need a token for development unless you're rebuilding pages.

To get a token:
1. Go to https://app.motherduck.com/
2. Sign in
3. Settings → Access Tokens → Create token
4. Add to `.env`: `MOTHERDUCK_TOKEN=your_token_here`

## 📈 Performance Metrics

### Build Performance
- **Fetch all assets:** 3.5 seconds
- **Build relationships:** +30 seconds (optional)
- **Generate 6K pages:** ~2 minutes
- **Total build time:** ~3 minutes (US-only)

### Production Performance
- **Page size:** 15-25 KB HTML + 5.6 MB GeoJSON (cached)
- **Load time:** <1 second (static file serving)
- **Database queries:** 0 (everything pre-rendered)
- **CDN:** Digital Ocean Spaces CDN

## 🐛 Troubleshooting

### Build Issues

**"MotherDuck connection failed"**
- Check `.env` file has valid `MOTHERDUCK_TOKEN`
- Verify token has read access to database

**"Build times out"**
- Reduce asset count (filter by country)
- Check MotherDuck query is efficient
- Verify no infinite loops in relationship computation

**"Pages don't navigate properly"**
- Verify `base: '/gem-viz'` in `svelte.config.js`
- Check all links use `.html` extension
- Test with `npm run preview` locally first

### Deployment Issues

**"403 Forbidden on deployed site"**
- Verify AWS CLI credentials configured
- Check `--acl public-read` flag in deploy script
- Confirm bucket permissions in DO console

**"Directory indexes don't work"**
- This is expected for object storage!
- Users must visit `/index.html` explicitly
- See [STATIC-HOSTING-GUIDE.md](docs/STATIC-HOSTING-GUIDE.md)

## 📝 Recent Changes

### 2025-12-03 - Initial Team Repo Setup
- Migrated gem-viz application to team repo
- Added comprehensive documentation
- Implemented relationship network infrastructure
- Prepared for enhanced asset pages with ownership graphs

## 🎓 Learning Resources

**For new contributors:**
1. Start with [ASSET-PAGE-ENHANCEMENT.md](docs/ASSET-PAGE-ENHANCEMENT.md) to understand the architecture
2. Read [RELATIONSHIP-INTEGRATION.md](docs/RELATIONSHIP-INTEGRATION.md) for implementation details
3. Check `gem-viz/src/routes/asset/[id]/+page.svelte` for page rendering
4. Review `gem-viz/src/lib/buildRelationships.js` for query strategy

**Key concepts:**
- **Static generation:** Everything pre-rendered at build time
- **Zero runtime overhead:** All data baked into HTML
- **Build-time queries:** MotherDuck accessed only during build
- **Relationship networks:** Pre-computed ownership graphs

## 🙏 Contributors

- EJ Fox ([@ejfox](https://github.com/ejfox))
- Thirdbear
- Global Energy Monitor Team

## 📄 License

[Add license information here]

## 🔗 Links

- **Live Demo:** https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/index.html
- **MotherDuck:** https://app.motherduck.com/
- **Global Energy Monitor:** https://globalenergymonitor.org/

---

**Questions?** Check the [docs/](docs/) folder or open an issue!

# Deploy Checklist - GEM Viz Static Site

## Phase 1: US-Only Test Deploy ✅ Ready

### Current Build Stats:
- **Pages:** 6,303 (US assets only)
- **Size:** 207 MB
- **Upload time:** ~2 minutes
- **Status:** ✅ Built and ready

### What We Need:
From Digital Ocean Console → API → Spaces Keys:
1. **Spaces Access Key** (format: `DO00ABC123...`)
2. **Spaces Secret Key** (format: `abc123xyz789...`)

### Deploy Steps:

#### 1. Configure Credentials (One-time, 30 seconds)
```bash
aws configure --profile do-tor1
```
When prompted, enter:
- **Access Key:** `<paste DO key>`
- **Secret Key:** `<paste DO secret>`
- **Region:** `sfo3`
- **Output:** `json`

#### 2. Deploy (2 minutes)
```bash
cd /Users/ejfox/client-code/global-energy-monitor/gem-viz
npm run deploy
```

#### 3. Test
Visit: `https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/index.html`

**Test checklist:**
- [ ] Root page loads
- [ ] Click "View All Assets" → list loads
- [ ] Click an asset → detail page loads
- [ ] Map renders (may take 3-5 sec for GeoJSON)
- [ ] Check console for errors
- [ ] Test on mobile

---

## Phase 2: Global Build (If Phase 1 Looks Good)

### To Enable Global:

#### 1. Remove US Filter
Edit: `src/routes/asset/[id]/+page.server.js`

**Remove these lines (69-72):**
```javascript
let whereClause = '';
if (countryCol) {
  whereClause = `WHERE "${countryCol}" = 'United States'`;
}
```

**Replace with:**
```javascript
const whereClause = ''; // No filter - include all countries
```

#### 2. Rebuild (20 minutes)
```bash
npm run build
```

Expected output:
- **Pages:** ~62,000 (all countries)
- **Size:** ~2 GB
- **Files:** ~125,000

#### 3. Deploy (10-30 min depending on connection)
```bash
npm run deploy
```

#### 4. Announce
Same URL, now with all global assets!

---

## Troubleshooting

### Deploy fails with "The config profile (do-tor1) could not be found"
**Fix:** Run step 1 (credential configuration) again.

### CORS configuration fails
**Result:** Warning message, but deployment continues.
**Action:** Ignore - not critical for static files.

### Upload is slow
**Expected:** 207 MB takes time. Check your upload speed:
- 10 Mbps = ~3 minutes
- 25 Mbps = ~1 minute
- 100 Mbps = ~20 seconds

### Page shows 403 Forbidden
**Cause:** Credentials don't have permission.
**Fix:** Verify keys are for the `ejthirdbear` Space.

---

## Post-Deployment

### Share with Client:
```
🎉 GEM Viz is live!

URL: https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/index.html

Currently showing: 6,303 US assets (test deployment)
If this looks good, we'll expand to all 62,000 global assets.

Note: Users must include /index.html in the URL (object storage limitation).
```

### If Client Wants Clean URLs:
Options:
1. **Cloudflare CDN** - Add in front of DO Spaces
2. **Custom domain** with redirect rules
3. **DigitalOcean App Platform** - Static site hosting

---

## Quick Reference

**Config file location:** `~/.aws/credentials`
**Build output:** `build/` (207 MB)
**Deploy script:** `scripts/deploy.js`
**Deploy command:** `npm run deploy`
**Target URL:** `https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/`

---

**Current Status:** Waiting for DO Spaces credentials to proceed with Phase 1.

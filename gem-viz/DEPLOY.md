# Deployment

GEM Viz runs on Fly.io as a Node.js SSR app (SvelteKit + `@sveltejs/adapter-node`).

## Current topology

| Env | Fly app | URL | Config |
| --- | --- | --- | --- |
| Production | `gem-viz` | https://gem-viz.fly.dev | `fly.toml` |
| Staging | `gem-viz-staging` | https://gem-viz-staging.fly.dev | `fly.staging.toml` |

There is also an optional static-asset mirror on Digital Ocean Spaces at
`https://ejthirdbear.sfo3.digitaloceanspaces.com/gem-viz/v<version>` (see
`scripts/deploy.js`). The app doesn't require it to function.

---

## Auto-deploy (GitHub Actions)

`.github/workflows/deploy.yml` deploys on every push:

| Branch pushed | Job that runs | Target |
| --- | --- | --- |
| `main` | `deploy-production` | **prod** (`gem-viz.fly.dev`) |
| `staging` | `deploy-staging` | staging (`gem-viz-staging.fly.dev`) |

**Footgun to fix when handing off:** `main` is wired as the prod trigger, so
a plain `git push origin main` ships to prod with no approval step. Options
if the client wants a safer default:

1. Rename the prod branch to `production` / `release` / `stable` and update
   the `if: github.ref == 'refs/heads/main'` check in the workflow.
2. Replace the push trigger with a tag trigger (e.g. `on: push: tags: 'v*'`)
   so only `git tag v0.9.6 && git push --tags` deploys prod.
3. Change the prod job to `if: github.event_name == 'workflow_dispatch'`
   only — requires a manual click in the Actions tab.

Staging auto-deploy is the mirror image: only the `staging` branch triggers
it, so pushing to `main` does NOT deploy staging. If you want staging to get
every `main` push too, drop the `if:` on the staging job or add `main` to
its branch list.

### Required GitHub secrets

| Secret | Purpose |
| --- | --- |
| `FLY_API_TOKEN` | `flyctl auth token` output for the account that owns the apps |

Set at **Settings → Secrets and variables → Actions**. Token needs deploy
rights on both apps (or separate tokens, then split the workflow).

---

## Manual CLI deploy

```bash
# staging
fly deploy --config fly.staging.toml

# prod (confirm first)
fly deploy --config fly.toml
```

**CLI deploys currently lose git info in `version.json`** — the Dockerfile
falls back to `GIT_COMMIT=unknown`. If you want parity with CI, wrap in a
script:

```bash
fly deploy --config fly.staging.toml \
  --build-arg GIT_COMMIT=$(git rev-parse HEAD) \
  --build-arg GIT_MESSAGE="$(git log -1 --format=%s)" \
  --build-arg GIT_AUTHOR="$(git log -1 --format=%an)"
```

---

## Build-time pipeline

`npm run build` chains (see `package.json`):

1. `scripts/inject-version.js` — reads git info (or `GIT_COMMIT` build arg),
   writes `static/version.json`.
2. `scripts/generate-geojson.js` — generates `points.geojson` for globe
   map (skips if fresh within 7 days).
3. `npm run build:widgets` — builds Shadow DOM widget bundles into
   `static/widgets/` (separate Vite config: `vite.widgets.config.ts`).
4. `vite build` — SvelteKit SSR build with `NODE_OPTIONS=--max-old-space-size=8192`.

Dockerfile runs all of the above at image build time. No runtime prefetch.

### Build args (Dockerfile `ARG`s)

| Arg | Default | Source |
| --- | --- | --- |
| `PUBLIC_OWNERSHIP_API_BASE_URL` | `https://gem-ownership-api.fly.dev` | `fly.*.toml` `[build.args]` |
| `PUBLIC_SITE_URL` | empty | optional |
| `GIT_COMMIT` | `unknown` | CI workflow or CLI `--build-arg` |
| `GIT_MESSAGE` | empty | CI workflow or CLI `--build-arg` |
| `GIT_AUTHOR` | empty | CI workflow or CLI `--build-arg` |

`PUBLIC_OWNERSHIP_API_BASE_URL` must be set **at build time** (SvelteKit
inlines it into the client bundle — runtime `fly secrets set` won't help
for PUBLIC_ vars). Staging points at `gem-ownership-api-staging.fly.dev`
via `fly.staging.toml`.

---

## Runtime secrets

Set via `fly secrets set --app <app-name>`:

| Secret | Purpose |
| --- | --- |
| `PUBLIC_OWNERSHIP_API_BASE_URL` | Override API base at runtime (rarely needed — already in build args) |

Currently no truly-private secrets. Chat endpoint runs against Anthropic
API via a reverse-proxy — no client-side key.

---

## Embed cache-busting chain

Host pages (e.g. Drupal) load `<script src="https://<app>.fly.dev/embed.js">`.
The chain below guarantees a fresh bundle on every deploy without manual
cache-invalidation:

```
<script src=".../embed.js">
    ↓  SvelteKit endpoint, no-cache, MD5(embed-source.js) baked in
embed-source.js?v=<md5>
    ↓  fetches /version.json (no-cache), gets commit SHA
widgets/index.js?v=<commit>
    ↓  imports by Vite content-hash
widgets/chunks/<Name>-<hash>.js    (cache-control: immutable, 1y)
```

Key files:

| Layer | File | Cache headers | Reason |
| --- | --- | --- | --- |
| Bootstrap | `src/routes/embed.js/+server.ts` | `no-cache, no-store, must-revalidate` | MD5 in body busts on any embed-source.js change |
| Loader | `static/embed-source.js` | `no-cache` | Small; fetches version.json once per page |
| Manifest | `static/version.json` | `no-cache` | Regenerated per deploy by `inject-version.js` |
| Widget entry | `static/widgets/index.js` | `no-cache` | Tiny (~200 B); imports hashed chunk |
| Widget chunks | `static/widgets/chunks/*-<hash>.js` | `public, max-age=31536000, immutable` | Filename contains content hash, safe to cache forever |

### Verifying the chain after a deploy

```bash
# MD5 in bootstrapper should match the deployed embed-source.js
LOCAL_HASH=$(curl -s https://<app>.fly.dev/embed.js | grep -oE 'v=[a-f0-9]+' | cut -d= -f2)
REMOTE_HASH=$(curl -s https://<app>.fly.dev/embed-source.js | md5 -q | cut -c1-12)
[ "$LOCAL_HASH" = "$REMOTE_HASH" ] && echo "ok" || echo "MISMATCH"

# Commit in version.json should match latest deploy
curl -s https://<app>.fly.dev/version.json | jq .commit
```

### Known fragility

If `version.json` fetch ever fails (CDN hiccup, etc.), `embed-source.js`
falls back to `?v=Date.now()` — still busts cache, but uniquely per
request, which defeats CDN caching of `widgets/index.js` for that user.
Not a correctness issue; a performance one.

**Cleaner alternative** (not implemented): inline the commit SHA into
`embed-source.js` at build time (via `inject-version.js`) instead of
fetching `version.json` at runtime. Removes the round-trip and the
fallback-to-Date.now() branch.

---

## Handoff checklist (moving to a different Fly.io org)

1. **Create Fly apps** in the new org:
   ```bash
   fly apps create <client>-gem-viz
   fly apps create <client>-gem-viz-staging
   ```
2. **Update config files**:
   - `fly.toml`: `app = "<client>-gem-viz"`
   - `fly.staging.toml`: `app = "<client>-gem-viz-staging"`
   - Primary region if different (`primary_region = "iad"` etc.)
   - `PUBLIC_OWNERSHIP_API_BASE_URL` in `[build.args]` if they run their own
     ownership API.
3. **Generate deploy token**:
   ```bash
   fly auth token
   ```
   Add as `FLY_API_TOKEN` secret in the client's GitHub repo.
4. **Decide on branch-to-env wiring** (see "Footgun" above) and update
   `.github/workflows/deploy.yml` accordingly.
5. **Rotate embed URLs in Drupal** (or wherever the `<script src>` lives)
   from `gem-viz.fly.dev` → `<client>-gem-viz.fly.dev`. The embed code is
   domain-agnostic (reads base from `document.currentScript.src`), so no
   code change needed — just update the host page's script tag.
6. **Optional: Digital Ocean Spaces mirror** (`scripts/deploy.js`). Set
   `DEPLOY_BASE_URL` and AWS credentials if they want versioned asset
   archives; otherwise delete `scripts/deploy.js` and the `deploy` /
   `deploy:full` npm scripts.
7. **Verify the cache-bust chain** with the curl snippet above after the
   first deploy to each env.

---

## Scripts reference

| Script | Invoked by | What it does |
| --- | --- | --- |
| `scripts/inject-version.js` | `npm run build` | Writes `static/version.json` with git info |
| `scripts/generate-geojson.js` | `npm run build`, `npm run geojson` | Generates map points GeoJSON from API |
| `scripts/prefetch-data.js` | `npm run prefetch:api` | (Optional) pre-fetches API data for faster cold starts |
| `scripts/deploy.js` | `npm run deploy` | Uploads `build/` to Digital Ocean Spaces (optional mirror) |
| `scripts/release.js` | `npm run release` | Version bump helper |
| `scripts/spot-check.js` | `npm run spot-check` | Post-deploy smoke test (partial) |

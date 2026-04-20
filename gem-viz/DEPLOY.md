# Deployment

GEM Viz runs on Fly.io as a Node.js SSR app (SvelteKit + `@sveltejs/adapter-node`).

---

## Prerequisites

### Accounts

| Thing | Notes |
| --- | --- |
| Fly.io account | https://fly.io/app/sign-up — requires a credit card even on the hobby tier. If the client runs a team on Fly, join their existing org; otherwise `fly orgs create <name>` after login. |
| GitHub repo access | Fork of this repo or push rights to the client's copy. The CI workflow lives at `.github/workflows/deploy.yml` at the repo root (the app itself is in `gem-viz/`). |
| Upstream ownership API | GEM Viz is a frontend — it needs a running ownership REST API. Either point at the public GEM API (`https://gem-api.thirdbear.net`) or stand up a private copy and set `PUBLIC_OWNERSHIP_API_BASE_URL` in the Fly build args to it. |

### CLI tools

| Tool | Version | Install |
| --- | --- | --- |
| Node.js | 22+ (matches Dockerfile) | https://nodejs.org or `nvm install 22` |
| npm | bundled with Node | — |
| git | any recent | https://git-scm.com |
| flyctl | latest | `brew install flyctl` (macOS) · `curl -L https://fly.io/install.sh \| sh` (Linux) · `iwr https://fly.io/install.ps1 -useb \| iex` (Windows) |

### Optional

| Tool | Only needed for |
| --- | --- |
| Docker Desktop | Reproducing the Fly build locally (`docker build gem-viz/`). Not required for deploy — Fly's remote builder handles it. |
| AWS CLI v2 | Digital Ocean Spaces asset mirror (`scripts/deploy.js`). Skip if not using that mirror. |
| jq | Reading `version.json` in shell scripts. Not required. |

---

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

## Versioning and releases

### Semver convention

This project follows [semver](https://semver.org/). Pick the bump type
based on the changes:

| Bump | When | Example |
| --- | --- | --- |
| `patch` (0.9.4 → 0.9.5) | Bug fixes, prettier/lint, docs, small tweaks that don't change how anything is used | `fix(controlchain): trim arrow on small nodes` |
| `minor` (0.9.5 → 0.10.0) | New features, additive behavior, new widgets, anything a user might notice | `feat(portfolio): hidden-intermediary hover` |
| `major` (0.x → 1.0.0) | Breaking changes — embed URL scheme changes, removed widgets, API shape changes that break existing host pages | First stable 1.0 release |

### Bumping the version

**Recommended: the release script** (`scripts/release.js`)

```bash
npm run release -- patch       # or: minor / major
```

Interactively confirms, then:

1. Updates `package.json` `version`.
2. Updates `CHANGELOG.md` (moves `## [Unreleased]` and inserts a dated
   section).
3. Creates a git commit: `Release v<new-version>`.
4. Creates an annotated git tag: `v<new-version>`.

After it completes:

```bash
git push && git push --tags
```

**Known gap:** the CHANGELOG update expects a `## [Unreleased]` heading in
`CHANGELOG.md`. If that section is missing, the replace is a silent no-op
and no changelog entry gets added. Keep an `## [Unreleased]` heading at
the top of `CHANGELOG.md` between releases; fill it in as features land,
and the release script will move it into place on bump.

**Alternative: manual bump** (for one-off releases or when the script has
drifted)

```bash
# 1. Edit package.json "version" field by hand
# 2. Edit CHANGELOG.md — add a new section for the new version
# 3. Commit + tag
git add package.json CHANGELOG.md
git commit -m "chore(release): <new-version>"
git tag -a v<new-version> -m "Release v<new-version>"
git push && git push --tags
```

### Where the version shows up

The version in `package.json` is the single source of truth. At build time
it surfaces in three places:

| Surface | How | Purpose |
| --- | --- | --- |
| UI footer | `__APP_VERSION__` compile-time constant defined in `vite.config.js` from `pkg.version` | Visible to users on every page |
| `static/version.json` `semver` field | Written by `scripts/inject-version.js` at build time | Machine-readable for ops/monitoring |
| DO Spaces mirror path | `scripts/inject-version.js` constructs `${DEPLOY_BASE_URL}/v${version}` | Versioned asset archive (if mirror enabled) |

Nothing else reads the version — updating `package.json` is sufficient.
`src/routes/+layout.svelte` reads `__APP_VERSION__` directly, so the old
`release.js` regex that edited `+layout.svelte` is a dead code path
(harmless, just noise).

### Release + deploy flow

Depending on how branch-to-env wiring was set in step 8 of First-time
setup:

**main-as-prod (default)**

```bash
npm run release -- patch
git push && git push --tags
# → CI auto-deploys prod
```

**tag-triggered prod**

```bash
npm run release -- patch
git push && git push --tags
# → tag push triggers prod CI; main branch pushes only affect staging (if
#   wired) or do nothing
```

**manual prod via workflow_dispatch**

```bash
npm run release -- patch
git push && git push --tags
# → GitHub → Actions → Build and Deploy → Run workflow → target: production
```

In all three cases, staging should have already been deployed and
validated from the same commit before promoting prod. See First-time
setup steps 5 + 9 for the verification steps.

### Rollback

Fly keeps every release. To revert without re-building:

```bash
fly releases --app <app-name>              # find the version number to revert to
fly releases rollback <version> --app <app-name>
```

This flips traffic back to a prior image in under a minute — no Docker
rebuild needed. Useful when a bad deploy is already live and you just
want the previous bits back.

If you want to tag the rollback as a real release (so `version.json`
reflects what's running):

```bash
npm run release -- patch    # or minor if the rollback restored a removed feature
# edit CHANGELOG.md to describe what was rolled back and why
git push && git push --tags
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

Automated: `scripts/verify-deploy.sh` walks the entire chain and exits
non-zero on any mismatch. Runs in CI as a post-deploy step in
`.github/workflows/deploy.yml` (fails the workflow if the just-deployed
commit doesn't actually serve).

```bash
# Local usage — just check the chain is internally consistent
scripts/verify-deploy.sh https://gem-viz-staging.fly.dev

# Strict: assert deployed semver + commit match what you expect
EXPECT_SEMVER=0.9.5 EXPECT_COMMIT=$(git rev-parse HEAD) \
  scripts/verify-deploy.sh https://gem-viz-staging.fly.dev
```

Short-SHA prefix matches work (`EXPECT_COMMIT=c592e21` is fine against a
full SHA in `version.json`), so CI can pass `${{ github.sha }}` safely.

Output is 5 numbered sections with ✓/✗ per check:
1. `/embed.js` — 200 OK, `no-cache` header, contains `?v=<hash>`
2. `/embed-source.js` — 200 OK, MD5 matches the bootstrap hash from step 1
3. `/version.json` — 200 OK, has `semver` + `commit` fields
4. `/widgets/index.js` — 200 OK, imports a hashed chunk
5. `/widgets/chunks/<hash>.js` — 200 OK, `cache-control: immutable`

If a deploy half-rolls (one Fly machine updated, one not), or S3 upload
fails partway, or a CDN fronting the app caches stale, step 2 or step 3
will surface the mismatch.

Manual one-liner if the script isn't available:

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

## First-time setup

Cold-start walkthrough for standing up a fresh GEM Viz deployment in a new
Fly.io org. Assumes prerequisites above are installed.

Throughout, `<client>` is a placeholder for whatever short slug you're
using (e.g. `acme`). Fly app names are globally unique across all of Fly —
if `acme-gem-viz` is taken you'll get an error at step 3.

### 1. Clone and install locally

```bash
git clone <repo-url>                      # the client's fork or this repo
cd <repo>/gem-viz
npm install --legacy-peer-deps
```

`--legacy-peer-deps` mirrors the Dockerfile — without it npm errors on
Svelte 5 ecosystem peer-dep conflicts.

Smoke-test that it runs locally before deploying anything:

```bash
npm run dev
# visit http://localhost:5173 — should load the home screen against the
# upstream ownership API configured in .env or falling back to production
```

### 2. Authenticate with Fly

```bash
fly auth login        # opens browser
fly orgs list         # note the slug of the org you want apps under
```

### 3. Create the two Fly apps

One per environment. Names must be globally unique on Fly.io.

```bash
fly apps create <client>-gem-viz         --org <org-slug>
fly apps create <client>-gem-viz-staging --org <org-slug>
```

### 4. Edit the Fly config files

Both `fly.toml` (prod) and `fly.staging.toml` need updating. At minimum:

```toml
# fly.toml
app = "<client>-gem-viz"
primary_region = "iad"        # see `fly platform regions` for options

[build]
  [build.args]
    PUBLIC_OWNERSHIP_API_BASE_URL = "https://<ownership-api-host>"
```

**Important about `PUBLIC_OWNERSHIP_API_BASE_URL`:** SvelteKit inlines
`PUBLIC_*` env vars into the client JS bundle at **build time**. Setting
it via `fly secrets set` at runtime does **not** work — it must live in
`[build.args]`.

Sane defaults already in the committed `fly.toml` that usually don't need
changing:

| Section | Default | Change if |
| --- | --- | --- |
| `[[vm]]` size | 1024 MB, 1 shared CPU | You see OOMs in `fly logs` during peak load |
| `auto_stop_machines` | `suspend` | You want always-on (costs more) |
| `min_machines_running` | `1` | Zero-cost idle is okay AND cold start time is acceptable |
| `[[services]]` ports | 8080 → 80/443 | Don't change |
| `[http_service.checks]` | `/` every 15s | Custom healthcheck path |

### 5. First deploy — manual, to staging

Never wire CI to a blank-state Fly app; always do one manual deploy first
so you can watch the build.

```bash
cd gem-viz
fly deploy --config fly.staging.toml \
  --build-arg GIT_COMMIT=$(git rev-parse HEAD) \
  --build-arg GIT_MESSAGE="$(git log -1 --format=%s)" \
  --build-arg GIT_AUTHOR="$(git log -1 --format=%an)"
```

First deploy takes 5–10 min (no Docker cache yet). Subsequent deploys are
2–4 min.

When it completes, verify with:

```bash
curl https://<client>-gem-viz-staging.fly.dev/version.json
```

You should see the commit SHA you just pushed and a timestamp from seconds
ago. If `commit` is `"unknown"`, the `--build-arg GIT_COMMIT=…` flag was
missed — re-deploy with it included.

### 6. Generate a Fly API token for GitHub Actions

```bash
# Option A: one token with access to everything in your org
fly auth token

# Option B (recommended): per-app deploy tokens, scoped least-privilege
fly tokens create deploy --app <client>-gem-viz         --expiry 8760h
fly tokens create deploy --app <client>-gem-viz-staging --expiry 8760h
```

Copy the output(s).

### 7. Add GitHub secret(s)

In the repo on GitHub:

1. **Settings → Secrets and variables → Actions**
2. **New repository secret**
3. Name: `FLY_API_TOKEN` (or `FLY_API_TOKEN_PROD` / `_STAGING` if using
   per-app tokens)
4. Value: paste the token from step 6
5. Save

If using per-app tokens, split the workflow's `env:` blocks:

```yaml
# deploy-staging job
env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_STAGING }}

# deploy-production job
env:
  FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN_PROD }}
```

### 8. Decide the branch-to-env wiring, then edit the workflow

See the "Footgun" call-out in the Auto-deploy section above. Pick one of:

1. Keep `main` → prod (current behavior — footgun but simple).
2. Rename the prod branch to `production` / `release` and update the
   `if: github.ref == 'refs/heads/main'` check in `deploy.yml`.
3. Tag-triggered prod: replace `on: push: branches: [main]` with
   `on: push: tags: ['v*']` so `git tag v0.0.1 && git push --tags` ships.
4. Manual-only prod: set the prod job to
   `if: github.event_name == 'workflow_dispatch'` — requires a click in
   the Actions tab.

Commit + push the workflow change.

### 9. Trigger a CI deploy to verify the pipeline

```bash
git push origin staging    # or whatever branch triggers staging
```

Watch the run in the GitHub Actions tab. On success, re-check
`version.json` to confirm the commit matches `HEAD`:

```bash
curl -s https://<client>-gem-viz-staging.fly.dev/version.json | jq '.commit'
# should match: git rev-parse HEAD
```

Also run the cache-bust verification snippet from the "Verifying the chain"
section — MD5 hashes should match, all URLs should return 200.

### 10. Rotate embed URLs on host pages

The embed snippet referenced from Drupal (or any other CMS/host) must be
updated. Old:

```html
<script src="https://gem-viz.fly.dev/embed.js"></script>
```

New:

```html
<script src="https://<client>-gem-viz.fly.dev/embed.js"></script>
```

No GEM Viz code change needed — the embed code reads its own base URL from
`document.currentScript.src` at runtime, so it's domain-agnostic.

### 11. (Optional) Digital Ocean Spaces mirror

Only do this if the client wants versioned asset archives outside of Fly.
If not, skip — the main app functions without it.

If yes:

1. Create a DO Space in the client's account.
2. Generate an Access Key pair.
3. Set `~/.aws/credentials` with a named profile matching
   `scripts/deploy.js`'s `PROFILE` constant (or edit the script).
4. Set `DEPLOY_BASE_URL` env var to the public bucket URL.
5. After every build: `npm run deploy` (pushes `build/` to the Space).

If no:

- Delete `scripts/deploy.js`.
- Remove the `deploy` and `deploy:full` npm scripts from `package.json`.
- Delete the DO Spaces reference from `scripts/inject-version.js`
  (it writes `deployUrl` into `version.json` but the app doesn't use it).

### 12. Promote to prod

Once staging has been running clean for a few deploy cycles:

```bash
# if using main=prod wiring (default):
git checkout main
git merge staging
git push origin main

# if using tag trigger:
git tag v0.0.1
git push --tags

# if using manual workflow_dispatch:
# → GitHub → Actions → Build and Deploy → Run workflow → target: production
```

Verify prod the same way as staging: `curl /version.json`, cache-bust chain
smoke test, and load a known-good embed on a real host page.

---

## Scripts reference

| Script | Invoked by | What it does |
| --- | --- | --- |
| `scripts/inject-version.js` | `npm run build` | Writes `static/version.json` with git info |
| `scripts/generate-geojson.js` | `npm run build`, `npm run geojson` | Generates map points GeoJSON from API |
| `scripts/prefetch-data.js` | `npm run prefetch:api` | (Optional) pre-fetches API data for faster cold starts |
| `scripts/deploy.js` | `npm run deploy` | Uploads `build/` to Digital Ocean Spaces (optional mirror) |
| `scripts/release.js` | `npm run release` | Version bump helper |
| `scripts/spot-check.js` | `npm run spot-check` | Data validation (spot-check subset of assets against API) |
| `scripts/verify-deploy.sh` | Manual or CI post-deploy step | Full cache-bust chain verification; fails loudly on hash/commit mismatch |

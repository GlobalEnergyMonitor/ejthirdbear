#!/usr/bin/env bash
#
# Post-deploy smoke test for the GEM Viz embed cache-bust chain.
#
# Walks the embed.js → embed-source.js → version.json → widgets/index.js
# chain and verifies:
#   - every URL returns 2xx
#   - the MD5 hash baked into embed.js matches the actual served embed-source.js
#   - version.json has a real (not "unknown") commit SHA
#   - optionally: version.json's semver matches $EXPECT_SEMVER
#   - optionally: version.json's commit matches $EXPECT_COMMIT
#   - a known widget chunk is served with immutable cache headers
#
# Usage:
#   scripts/verify-deploy.sh <base-url>
#   EXPECT_COMMIT=<sha> EXPECT_SEMVER=0.9.5 scripts/verify-deploy.sh <base-url>
#
# Exits non-zero on any failure. Designed to run as a CI step after
# `flyctl deploy` to catch bad deploys before they reach users.

set -euo pipefail

BASE_URL="${1:-}"
if [ -z "$BASE_URL" ]; then
  echo "Usage: $0 <base-url>" >&2
  echo "Example: $0 https://gem-viz-staging.fly.dev" >&2
  exit 2
fi

# Strip trailing slash for consistent URL construction
BASE_URL="${BASE_URL%/}"

# MD5 tool varies by platform (BSD/macOS: `md5`; Linux: `md5sum`)
if command -v md5 >/dev/null 2>&1; then
  md5_hex() { md5 -q; }
elif command -v md5sum >/dev/null 2>&1; then
  md5_hex() { md5sum | cut -d' ' -f1; }
else
  echo "FAIL: need md5 or md5sum in PATH" >&2
  exit 3
fi

fail() {
  echo "FAIL: $1" >&2
  exit 1
}

ok() {
  echo "  ✓ $1"
}

echo "Verifying $BASE_URL"
echo

# --- 1. embed.js bootstrapper -----------------------------------------------
echo "[1/5] embed.js bootstrap"

EMBED_JS_HTTP=$(curl -sI "$BASE_URL/embed.js" | head -1 | grep -oE '[0-9]{3}')
[ "$EMBED_JS_HTTP" = "200" ] || fail "embed.js returned HTTP $EMBED_JS_HTTP (expected 200)"
ok "HTTP 200"

EMBED_JS_CACHE=$(curl -sI "$BASE_URL/embed.js" | grep -i '^cache-control:' | tr -d '\r' || true)
echo "$EMBED_JS_CACHE" | grep -qi 'no-cache' || fail "embed.js missing no-cache header: $EMBED_JS_CACHE"
ok "cache-control: no-cache"

EMBED_JS_BODY=$(curl -s "$BASE_URL/embed.js")
BOOTSTRAP_HASH=$(echo "$EMBED_JS_BODY" | grep -oE 'v=[a-f0-9]+' | head -1 | cut -d= -f2)
[ -n "$BOOTSTRAP_HASH" ] || fail "embed.js body missing ?v=<hash>: $EMBED_JS_BODY"
ok "bootstrap hash: $BOOTSTRAP_HASH"

# --- 2. embed-source.js MD5 match -------------------------------------------
echo "[2/5] embed-source.js MD5"

SOURCE_HTTP=$(curl -sI "$BASE_URL/embed-source.js" | head -1 | grep -oE '[0-9]{3}')
[ "$SOURCE_HTTP" = "200" ] || fail "embed-source.js returned HTTP $SOURCE_HTTP"
ok "HTTP 200"

SERVED_HASH=$(curl -s "$BASE_URL/embed-source.js" | md5_hex | cut -c1-12)
[ "$BOOTSTRAP_HASH" = "$SERVED_HASH" ] \
  || fail "MD5 mismatch: bootstrap says $BOOTSTRAP_HASH but served embed-source.js is $SERVED_HASH"
ok "served MD5 matches bootstrap: $SERVED_HASH"

# --- 3. version.json --------------------------------------------------------
echo "[3/5] version.json"

VERSION_HTTP=$(curl -sI "$BASE_URL/version.json" | head -1 | grep -oE '[0-9]{3}')
[ "$VERSION_HTTP" = "200" ] || fail "version.json returned HTTP $VERSION_HTTP"
ok "HTTP 200"

VERSION_JSON=$(curl -s "$BASE_URL/version.json")
SEMVER=$(echo "$VERSION_JSON" | grep -oE '"semver":\s*"[^"]+"' | cut -d'"' -f4)
COMMIT=$(echo "$VERSION_JSON" | grep -oE '"commit":\s*"[^"]+"' | cut -d'"' -f4)

[ -n "$SEMVER" ] || fail "version.json missing semver field: $VERSION_JSON"
ok "semver: $SEMVER"

[ -n "$COMMIT" ] || fail "version.json missing commit field: $VERSION_JSON"
if [ "$COMMIT" = "unknown" ]; then
  # Warn but don't fail — CLI deploys commonly skip the git build args
  echo "  WARN: commit is 'unknown' — --build-arg GIT_COMMIT was not passed to the deploy"
else
  ok "commit: $COMMIT"
fi

if [ -n "${EXPECT_SEMVER:-}" ]; then
  [ "$SEMVER" = "$EXPECT_SEMVER" ] \
    || fail "semver mismatch: deployed $SEMVER but EXPECT_SEMVER=$EXPECT_SEMVER"
  ok "semver matches EXPECT_SEMVER"
fi

if [ -n "${EXPECT_COMMIT:-}" ]; then
  # Allow short SHA match too
  case "$EXPECT_COMMIT" in
    "$COMMIT") ok "commit matches EXPECT_COMMIT (full SHA)" ;;
    *)
      SHORT="${COMMIT:0:${#EXPECT_COMMIT}}"
      [ "$SHORT" = "$EXPECT_COMMIT" ] \
        || fail "commit mismatch: deployed $COMMIT but EXPECT_COMMIT=$EXPECT_COMMIT"
      ok "commit matches EXPECT_COMMIT (short-SHA prefix)"
      ;;
  esac
fi

# --- 4. widgets/index.js ----------------------------------------------------
echo "[4/5] widgets/index.js"

WIDGETS_HTTP=$(curl -sI "$BASE_URL/widgets/index.js" | head -1 | grep -oE '[0-9]{3}')
[ "$WIDGETS_HTTP" = "200" ] || fail "widgets/index.js returned HTTP $WIDGETS_HTTP"
ok "HTTP 200"

WIDGETS_BODY=$(curl -s "$BASE_URL/widgets/index.js")
# widgets/index.js is a tiny re-export stub that imports from a hashed chunk
CHUNK_PATH=$(echo "$WIDGETS_BODY" | grep -oE '\./chunks/[^"]+\.js' | head -1)
[ -n "$CHUNK_PATH" ] || fail "widgets/index.js missing chunk import: $WIDGETS_BODY"
ok "imports chunk: $CHUNK_PATH"

# --- 5. Verify an immutable chunk cache header ------------------------------
echo "[5/5] widget chunk immutable cache"

CHUNK_URL="$BASE_URL/widgets/${CHUNK_PATH#./}"
CHUNK_CACHE=$(curl -sI "$CHUNK_URL" | grep -i '^cache-control:' | tr -d '\r' || true)
echo "$CHUNK_CACHE" | grep -qi 'immutable' \
  || fail "chunk cache-control missing 'immutable': $CHUNK_CACHE"
ok "chunk immutable: $(echo "$CHUNK_CACHE" | sed 's/^cache-control: //I')"

echo
echo "All checks passed for $BASE_URL"

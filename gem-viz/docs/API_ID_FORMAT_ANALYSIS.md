# API ID Format Analysis

**Date:** 2026-01-17
**Issue:** Coal plant API lookups failing due to ID format mismatch

## Summary

The app uses G-prefix IDs (e.g., `G100000102961`) but the API requires compound IDs (`L100000104107_G100000102961`).

## The Problem

| Asset Type | App Uses        | API Expects                   | Works? |
| ---------- | --------------- | ----------------------------- | ------ |
| Coal Mine  | `M7043`         | `M7043`                       | ✅ Yes |
| Coal Plant | `G100000102961` | `L100000104107_G100000102961` | ❌ No  |

**Coal mines work** - they use simple M-prefix IDs.
**Coal plants break** - they need Location + Unit IDs combined.

## Evidence

```bash
# Coal mine - works fine
curl "https://gem-ownership-api.fly.dev/assets/M7043"
# ✅ Returns: "# 1" coal mine

# Coal plant with G-prefix - FAILS
curl "https://gem-ownership-api.fly.dev/assets/G100000102961"
# ❌ {"detail": "Asset 'G100000102961' not found"}

# Coal plant with compound ID - works
curl "https://gem-ownership-api.fly.dev/assets/L100000104107_G100000102961"
# ✅ Returns: "Gavin Power Plant Unit 2"
```

## Current Workaround

The app now:

1. Detects G-prefix IDs
2. Looks up location ID from local id-map.json
3. Combines them: `L{location}_G{unit}`
4. Calls API with compound ID

See `src/lib/ownership-api.ts` → `resolveAssetId()`

## Recommended API Fix

API should support lookup by just G-prefix:

```python
def get_asset(asset_id):
    asset = db.query("SELECT * FROM assets WHERE asset_id = ?", asset_id)

    # If G-prefix not found, try compound match
    if not asset and asset_id.startswith('G'):
        asset = db.query("SELECT * FROM assets WHERE asset_id LIKE '%_' || ?", asset_id)

    return asset
```

This would make coal plants work the same way coal mines already do.

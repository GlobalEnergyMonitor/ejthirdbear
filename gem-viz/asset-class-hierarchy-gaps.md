# Asset Class Hierarchy — API Gaps

These filter IDs are referenced in `src/lib/data-config/asset-class-hierarchy.json` but do not yet exist in `GET /catalog/asset-classes`. The UI silently filters them out until the API adds them.

---

## Missing IDs by section

### Coal Plant: Captive (`captive-coal-plants`)
| ID | Description |
|----|-------------|
| `captive-other` | Catch-all for remaining captive industries: machinery, cement & building, oil & refining, industrial park, agriculture, textiles, automobiles, sugar, rubber, electronics, cryptocurrency, and other/unknown |

> **Note:** `captive-data-center` (existing) covers data centers specifically. `captive-other` covers everything else in the narrative "Other" bucket.

### Coal Mine: By Closure Date (`coal-mines-by-closure`)
| ID | Description |
|----|-------------|
| `coal-recently-closed` | Coal mines with a recent or completed closure date |

### Steel & Iron: Fossil-Based Plants (`fossil-steel`)
| ID | Description |
|----|-------------|
| `dri-unknown` | DRI furnaces with unknown reductant — **should default to unchecked** |

> **Relabeling needed:** `gas-dri` (existing) should be relabeled **"Other-Fossil DRI"** — it covers methane and syngas reductants, not just gas.

### Steel & Iron: Blast Furnace Relinings (`bf-relinings`)
| ID | Description |
|----|-------------|
| `bf-relining-other` | Relinings with status: in progress, cancelled, or unknown |

### Cement: By Plant Type (new tile — `cement-by-plant-type`)
| ID | Description |
|----|-------------|
| `cement-by-plant-type` | Parent tile ID for the "by plant type" grouping |
| `cement-clinker-only` | Plants that produce clinker only |
| `cement-grinding` | Grinding-only plants |
| `cement-integrated` | Integrated (clinker + grinding) plants |
| `cement-unknown-type` | Plants with unknown production type |

### Cement: By Kiln Fuel Type (new tile — `cement-by-kiln-fuel`)
Applies only to clinker-producing plants (`clinker-only` or `integrated`).

| ID | Description |
|----|-------------|
| `cement-by-kiln-fuel` | Parent tile ID for the "by kiln fuel" grouping |
| `cement-fossil-fuel` | Plants using fossil-based kiln fuel (Alternate Fuel == "no") |
| `cement-alternate-fuel` | Plants using alternate kiln fuel (Alternate Fuel == "yes") |
| `cement-fuel-unknown` | Plants with unknown kiln fuel type |

### Cement: By Clinker Production Type (new tile — `cement-by-production-type`)
Applies only to clinker-producing plants.

| ID | Description |
|----|-------------|
| `cement-by-production-type` | Parent tile ID for the "by production process" grouping |
| `cement-wet` | Wet clinker production process |
| `cement-semidry` | Semidry clinker production process |
| `cement-dry` | Dry clinker production process |

---

## Summary counts

| Status | Count |
|--------|-------|
| IDs to add | 16 |
| IDs to relabel | 2 (`gas-dri` → "Other-Fossil DRI", `captive-data-center` → "captive-coal-data-center") |
| New parent tiles needed | 3 (cement-by-plant-type, cement-by-kiln-fuel, cement-by-production-type) |

---

## Out of scope for current hierarchy (not in narrative)

- **Oil & Gas** (gas-plants, gas-pipelines, oil-pipelines) — present in JSON, no subclass structure defined in narrative
- **Chemical plants** — present in JSON as a topline tile; subclass definitions described as TBD

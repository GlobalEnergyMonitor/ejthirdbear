# MotherDuck Data Schema Reference

**Last Updated:** 2025-11-19

This document defines the exact schema for all data stored in MotherDuck. Use this as the source of truth for queries and integrations.

## Overview

- **Total Records:** 156,004 ownership records across 7 tracker types
- **Primary Key:** `GEM location ID` (format: `L` + 12 digits)
- **Foreign Keys:** Various GEM Entity IDs, Mine IDs, Asset IDs

## Tables

### 1. `trackers_ownership` (156,004 rows)

**Source:** `all_trackers_ownership@1.parquet`

Cross-tracker ownership data linking entities to assets across all GEM trackers.

#### Tracker Type Breakdown

| Tracker Type    | Row Count |
|----------------|-----------|
| Coal Plant     | 61,156    |
| Gas Plant      | 52,925    |
| Gas Pipeline   | 17,364    |
| Coal Mine      | 8,561     |
| Steel Plant    | 8,029     |
| Bioenergy Power| 5,022     |
| Iron Mine      | 2,947     |

#### Schema (28 columns)

```sql
CREATE TABLE trackers_ownership (
  -- Owner Information
  "Owner" VARCHAR,
  "Owner GEM Entity ID" VARCHAR,
  "Owner Registration Country" VARCHAR,
  "Owner Headquarters Country" VARCHAR,

  -- Ownership Structure
  "Immediate Project Owner" VARCHAR,
  "Immediate Project Owner GEM Entity ID" VARCHAR,
  "Ownership Path" VARCHAR,  -- Full ownership chain
  "Share" DOUBLE,             -- Ownership percentage

  -- Asset Information
  "Project" VARCHAR,
  "ProjectID" VARCHAR,
  "Tracker" VARCHAR,          -- One of: Coal Plant, Gas Plant, etc.
  "Status" VARCHAR,
  "Operating status" VARCHAR,

  -- Location & Asset IDs (tracker-specific)
  "GEM location ID" VARCHAR,  -- PRIMARY KEY for joining
  "GEM unit ID" VARCHAR,
  "GEM Asset ID" VARCHAR,
  "GEM Mine ID" VARCHAR,
  "Steel Plant ID" VARCHAR,

  -- Capacity Metrics (varies by tracker)
  "Capacity (MW)" DOUBLE,              -- Power plants
  "Capacity (Mtpa)" VARCHAR,           -- Coal mines
  "CapacityBcm/y" VARCHAR,             -- Gas pipelines
  "CapacityBOEd" VARCHAR,              -- Oil/gas
  "Design capacity (ttpa)" VARCHAR,     -- Steel/iron
  "Nominal crude steel capacity (ttpa)" VARCHAR,
  "Nominal iron capacity (ttpa)" VARCHAR,

  -- Production Data
  "Production (Mtpa)" VARCHAR,
  "Production 2022 (ttpa)" VARCHAR,
  "Production 2023 (ttpa)" VARCHAR
);
```

#### Key Columns

- **`Tracker`**: Categorizes the asset type (7 distinct values)
- **`GEM location ID`**: Universal identifier for joining with location data
- **`Ownership Path`**: Human-readable chain (e.g., "Company A -> Subsidiary B [50%] -> Asset C [100%]")
- **`Share`**: Numeric ownership percentage

#### Sample Query

```sql
-- Get all coal plant ownership in India
SELECT
  "Owner",
  "Project",
  "Capacity (MW)",
  "Status"
FROM trackers_ownership
WHERE "Tracker" = 'Coal Plant'
  AND "Owner Headquarters Country" = 'India'
ORDER BY "Capacity (MW)" DESC;
```

---

### 2. `entities` (count TBD)

**Source:** `entitites@1.parquet`

Entity master data including companies, governments, and organizations.

#### Schema (25 columns)

```sql
CREATE TABLE entities (
  -- Core Identity
  "Entity ID" VARCHAR,                -- PRIMARY KEY
  "Name" VARCHAR,
  "Full Name" VARCHAR,
  "Abbreviation" VARCHAR,
  "Name Local" VARCHAR,
  "Name Other" VARCHAR,

  -- Entity Classification
  "Entity Type" VARCHAR,
  "Legal Entity Type" VARCHAR,
  "PubliclyListed" BOOLEAN,

  -- Location
  "Headquarters Country" VARCHAR,
  "Headquarters Subdivision" VARCHAR,
  "Registration Country" VARCHAR,
  "Registration Subdivision" VARCHAR,

  -- Ownership Hierarchy
  "Gem parents" VARCHAR,
  "Gem parents IDs" VARCHAR,

  -- External Identifiers
  "Global Legal Entity Identifier Index" VARCHAR,
  "PermID: Refinitiv Permanent Identifier" VARCHAR,
  "S&P Capital IQ" VARCHAR,
  "Home Page" VARCHAR,

  -- Country-Specific IDs
  "Brazil - National Registry of Legal Entities (Federal Revenue Service)" VARCHAR,
  "India - Corporate Identification Number (Ministry of Corporate Affairs)" VARCHAR,
  "Russia - Uniform State Register of Legal Entities of Russian Federation" VARCHAR,
  "UK Companies House" VARCHAR,
  "US SEC Central Index Key" VARCHAR,
  "US-EIA" VARCHAR
);
```

---

### 3. `ownership` (count TBD)

**Source:** `ownership@1.parquet`

Direct ownership relationships between entities (simplified graph).

#### Schema (6 columns)

```sql
CREATE TABLE ownership (
  -- Ownership Relationship
  "Subject Entity ID" VARCHAR,       -- Owned entity
  "Subject Entity Name" VARCHAR,
  "Interested Party ID" VARCHAR,     -- Owning entity
  "Interested Party Name" VARCHAR,
  "% Share of Ownership" DOUBLE,

  -- Metadata
  "Data Source URL" VARCHAR
);
```

#### Sample Query

```sql
-- Find all subsidiaries of a parent company
SELECT
  "Subject Entity Name",
  "% Share of Ownership"
FROM ownership
WHERE "Interested Party Name" = 'China Energy Investment Corporation'
ORDER BY "% Share of Ownership" DESC;
```

---

## Key Join Patterns

### Ownership + Entities

```sql
SELECT
  t."Project",
  e."Full Name" as "Owner Full Name",
  e."Headquarters Country",
  e."PubliclyListed"
FROM trackers_ownership t
JOIN entities e ON t."Owner GEM Entity ID" = e."Entity ID"
WHERE t."Tracker" = 'Coal Plant'
LIMIT 10;
```

### Multi-Tracker Location Analysis

```sql
-- Assets at the same location across different trackers
SELECT
  "GEM location ID",
  COUNT(DISTINCT "Tracker") as tracker_count,
  STRING_AGG(DISTINCT "Tracker", ', ') as tracker_types
FROM trackers_ownership
WHERE "GEM location ID" IS NOT NULL
GROUP BY "GEM location ID"
HAVING COUNT(DISTINCT "Tracker") > 1;
```

---

## Data Quality Notes

- **NULL handling**: Many capacity/production fields are VARCHAR and may contain NULL or empty strings
- **Numeric conversions**: Always cast VARCHAR capacity fields before aggregation
- **GEM location ID**: Not all records have this (asset-level records do, ownership chain records may not)
- **Case sensitivity**: Column names use Title Case with spaces - always quote them in queries

---

## MotherDuck Tables to Create

When uploading to MotherDuck, use these table names:

```bash
# Upload commands
just motherduck-upload-ownership   # -> trackers_ownership
just motherduck-upload-entities    # -> entities
just motherduck-upload-graph       # -> ownership
```

---

## Common Query Patterns

### Geographic Distribution

```sql
SELECT
  "Owner Headquarters Country",
  COUNT(*) as asset_count,
  SUM("Capacity (MW)") as total_capacity_mw
FROM trackers_ownership
WHERE "Tracker" = 'Coal Plant'
  AND "Capacity (MW)" IS NOT NULL
GROUP BY "Owner Headquarters Country"
ORDER BY total_capacity_mw DESC
LIMIT 20;
```

### Status Breakdown

```sql
SELECT
  "Status",
  "Tracker",
  COUNT(*) as count
FROM trackers_ownership
GROUP BY "Status", "Tracker"
ORDER BY "Tracker", count DESC;
```

### Ownership Concentration

```sql
SELECT
  "Owner",
  COUNT(DISTINCT "Project") as project_count,
  COUNT(*) as ownership_records
FROM trackers_ownership
GROUP BY "Owner"
ORDER BY ownership_records DESC
LIMIT 50;
```

<script>
  import { goto } from '$app/navigation';
  import { link, assetLink, entityLink, assetPath } from '$lib/links';
  import { initDuckDB, loadParquetFromPath, query } from '$lib/duckdb-utils';
  import { investigationCart } from '$lib/investigationCart';
  import TrackerIcon from '$lib/components/TrackerIcon.svelte';

  let loading = $state(false);
  let exporting = $state(false);
  let error = $state(null);
  let dbReady = $state(false);
  let exportProgress = $state('');
  let exportLog = $state([]);
  let lastExportManifest = $state(null);

  let analysisLoading = $state(false);
  let analysisError = $state(null);
  let analysis = $state(null);
  let analysisDebounceTimer = $state(null);

  // Derived cart data
  const cartItems = $derived($investigationCart);
  const assetItems = $derived(cartItems.filter((i) => i.type === 'asset'));
  const entityItems = $derived(cartItems.filter((i) => i.type === 'entity'));
  const totalCount = $derived(cartItems.length);
  const assetCount = $derived(assetItems.length);
  const entityCount = $derived(entityItems.length);

  const buildTime = __BUILD_TIME__;
  const buildHash = __BUILD_HASH__;
  const appVersion = __APP_VERSION__;

  // Clear entire list
  function clearAll() {
    if (confirm('Remove all items from cart?')) {
      investigationCart.clear();
    }
  }

  function nowIso() {
    return new Date().toISOString();
  }

  function formatNumber(n) {
    const num = Number(n);
    return Number.isFinite(num) ? num.toLocaleString() : String(n ?? '');
  }

  function formatBytes(bytes) {
    const b = Number(bytes);
    if (!Number.isFinite(b)) return '';
    const units = ['B', 'KB', 'MB', 'GB'];
    let value = b;
    let unitIdx = 0;
    while (value >= 1024 && unitIdx < units.length - 1) {
      value /= 1024;
      unitIdx += 1;
    }
    return `${value.toFixed(unitIdx === 0 ? 0 : 1)} ${units[unitIdx]}`;
  }

  function hashStringFNV1a(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = (hash * 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  }

  function addLog(message, detail = null) {
    exportLog = [
      ...exportLog,
      {
        t: new Date().toLocaleTimeString(),
        message,
        detail,
      },
    ];
  }

  function resetExportUI() {
    exportProgress = '';
    exportLog = [];
    lastExportManifest = null;
  }

  // Initialize DuckDB for export
  async function ensureDB() {
    if (dbReady) return;

    loading = true;
    try {
      await initDuckDB();

      const ownershipResult = await loadParquetFromPath(
        assetPath('all_trackers_ownership@1.parquet'),
        'ownership'
      );
      if (!ownershipResult.success) throw new Error(ownershipResult.error);

      const locResult = await loadParquetFromPath(
        assetPath('asset_locations.parquet'),
        'locations'
      );
      if (!locResult.success) throw new Error(locResult.error);

      dbReady = true;
    } catch (err) {
      error = err.message;
    } finally {
      loading = false;
    }
  }

  // Escape SQL string
  function escapeSQL(str) {
    return str.replace(/'/g, "''");
  }

  // Build ID list for SQL IN clause
  function buildIdList(ids) {
    return ids.map((id) => `'${escapeSQL(id)}'`).join(',');
  }

  async function describeTable(tableName) {
    const res = await query(`DESCRIBE SELECT * FROM ${tableName}`);
    if (!res.success) return null;
    return (res.data || []).map((row) => ({
      name: row.column_name,
      type: row.column_type,
      nullable: row.null ? String(row.null) : undefined,
    }));
  }

  async function getPreflightStats({ assetIds = [], entityIds = [] }) {
    const whereParts = [];
    if (entityIds.length > 0) whereParts.push(`o."Owner GEM Entity ID" IN (${buildIdList(entityIds)})`);
    if (assetIds.length > 0) whereParts.push(`o."GEM unit ID" IN (${buildIdList(assetIds)})`);
    const whereClause = whereParts.length > 0 ? `WHERE ${whereParts.join(' OR ')}` : 'WHERE 1=0';

    const summarySql = `
      SELECT
        COUNT(*) as ownership_rows,
        COUNT(DISTINCT o."GEM unit ID") as distinct_assets,
        COUNT(DISTINCT o."Owner GEM Entity ID") as distinct_entities,
        COUNT(DISTINCT o."Tracker") as distinct_trackers,
        COUNT(DISTINCT o."Status") as distinct_statuses,
        COUNT(DISTINCT COALESCE(l."Country.Area", 'Unknown')) as distinct_countries,
        COALESCE(SUM(CAST(o."Capacity (MW)" AS DOUBLE)), 0) as total_capacity_mw,
        SUM(CASE WHEN l."Latitude" IS NULL OR l."Longitude" IS NULL THEN 1 ELSE 0 END) as rows_missing_coords
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      ${whereClause}
    `;

    const topTrackersSql = `
      SELECT
        COALESCE(o."Tracker", 'Unknown') as key,
        COUNT(*) as rows
      FROM ownership o
      ${whereClause}
      GROUP BY 1
      ORDER BY rows DESC
      LIMIT 10
    `;

    const topStatusesSql = `
      SELECT
        COALESCE(o."Status", 'Unknown') as key,
        COUNT(*) as rows
      FROM ownership o
      ${whereClause}
      GROUP BY 1
      ORDER BY rows DESC
      LIMIT 10
    `;

    const topCountriesSql = `
      SELECT
        COALESCE(l."Country.Area", 'Unknown') as key,
        COUNT(*) as rows
      FROM ownership o
      LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
      ${whereClause}
      GROUP BY 1
      ORDER BY rows DESC
      LIMIT 10
    `;

    const [summary, topTrackers, topStatuses, topCountries] = await Promise.all([
      query(summarySql),
      query(topTrackersSql),
      query(topStatusesSql),
      query(topCountriesSql),
    ]);

    const summaryRow = summary.success && summary.data?.[0] ? summary.data[0] : null;
    return {
      ok: Boolean(summaryRow),
      sql: {
        summary: summarySql.trim(),
        topTrackers: topTrackersSql.trim(),
        topStatuses: topStatusesSql.trim(),
        topCountries: topCountriesSql.trim(),
      },
      summary: summaryRow,
      topTrackers: topTrackers.success ? topTrackers.data || [] : [],
      topStatuses: topStatuses.success ? topStatuses.data || [] : [],
      topCountries: topCountries.success ? topCountries.data || [] : [],
    };
  }

  async function runAnalysis() {
    analysisLoading = true;
    analysisError = null;

    try {
      await ensureDB();
      const startedAt = Date.now();

      const [ownershipSchema, locationsSchema] = await Promise.all([
        describeTable('ownership'),
        describeTable('locations'),
      ]);

      const assetIds = assetItems.map((a) => a.id);
      const entityIds = entityItems.map((e) => e.id);

      const [assets, entities, combined] = await Promise.all([
        assetIds.length > 0 ? getPreflightStats({ assetIds }) : null,
        entityIds.length > 0 ? getPreflightStats({ entityIds }) : null,
        totalCount > 0 ? getPreflightStats({ assetIds, entityIds }) : null,
      ]);

      analysis = {
        generatedAt: nowIso(),
        elapsedMs: Date.now() - startedAt,
        ownershipSchema,
        locationsSchema,
        assets,
        entities,
        combined,
      };
    } catch (e) {
      analysisError = e instanceof Error ? e.message : String(e);
    } finally {
      analysisLoading = false;
    }
  }

  function scheduleAnalysis() {
    if (analysisDebounceTimer) clearTimeout(analysisDebounceTimer);
    analysisDebounceTimer = setTimeout(() => {
      if (totalCount > 0) runAnalysis();
    }, 350);
  }

  $effect(() => {
    void totalCount;
    void assetCount;
    void entityCount;
    scheduleAnalysis();
  });

  function normalizeSeries(values) {
    const nums = values.map((v) => Number(v) || 0);
    const max = Math.max(...nums, 1);
    return nums.map((n) => n / max);
  }

  function sparklinePoints(values, width = 80, height = 18, pad = 2) {
    const series = normalizeSeries(values);
    const usableW = width - pad * 2;
    const usableH = height - pad * 2;
    if (series.length === 1) {
      const x = pad + usableW / 2;
      const y = pad + usableH - series[0] * usableH;
      return `${x},${y}`;
    }
    return series
      .map((v, i) => {
        const x = pad + (i / (series.length - 1)) * usableW;
        const y = pad + usableH - v * usableH;
        return `${x},${y}`;
      })
      .join(' ');
  }

  function downloadTextFile(contents, filename, mimeType = 'text/plain;charset=utf-8') {
    const blob = new Blob([contents], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return blob.size;
  }

  // Export assets CSV
  async function exportAssetsCSV() {
    const ids = assetItems.map((a) => a.id);
    if (ids.length === 0) {
      alert('No assets in cart');
      return;
    }

    exporting = true;
    resetExportUI();
    exportProgress = 'Initializing database...';
    error = null;

    try {
      const startedAt = Date.now();
      addLog('Starting export', { type: 'assets', assetCount: ids.length });
      await ensureDB();
      addLog('DuckDB ready', { elapsedMs: Date.now() - startedAt });

      exportProgress = `Querying data for ${ids.length} assets...`;
      const idList = buildIdList(ids);

      const sql = `
        SELECT
          o.*,
          COALESCE(l."Country.Area", 'Unknown') as "Asset Country",
          l."Latitude",
          l."Longitude"
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE o."GEM unit ID" IN (${idList})
        ORDER BY o."GEM unit ID", o."Owner"
      `;

      addLog('Executing query', { hash: hashStringFNV1a(sql), sqlPreview: sql.trim().slice(0, 260) });
      const result = await query(sql);
      if (!result.success) throw new Error(result.error || 'Query failed');

      const data = result.data || [];
      if (data.length === 0) {
        throw new Error('No data found for selected assets.');
      }

      exportProgress = `Converting ${data.length} rows to CSV...`;
      addLog('Converting to CSV', { rows: data.length });
      const { csv, columns } = await convertToCSVAsync(data, {
        onProgress: ({ done, total }) => {
          const pct = Math.round((done / total) * 100);
          exportProgress = `Converting to CSV… ${pct}% (${formatNumber(done)}/${formatNumber(total)})`;
        },
      });
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const filenameBase = `gem-assets-${ids.length}-${date}`;
      const filename = `${filenameBase}.csv`;
      const fileSize = downloadCSV(csv, filename);

      const manifest = {
        kind: 'assets',
        generatedAt: nowIso(),
        app: { version: appVersion, buildHash, buildTime },
        selection: { assetIds: ids, entityIds: [] },
        sql: { main: sql.trim(), hash: hashStringFNV1a(sql) },
        columns,
        result: { rowCount: data.length, file: { name: filename, bytes: fileSize } },
        analysis: analysis?.assets || null,
        environment: {
          locale: navigator.language,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userAgent: navigator.userAgent,
        },
        timings: { totalMs: Date.now() - startedAt },
      };

      const manifestBytes = downloadTextFile(
        JSON.stringify(manifest, null, 2),
        `${filenameBase}.manifest.json`,
        'application/json;charset=utf-8'
      );
      downloadTextFile(
        [
          'GEM Viz Export Manifest',
          `- Generated: ${manifest.generatedAt}`,
          `- Kind: ${manifest.kind}`,
          `- App: v${manifest.app.version} (${manifest.app.buildHash} @ ${manifest.app.buildTime})`,
          `- Assets requested: ${manifest.selection.assetIds.length}`,
          `- Ownership rows exported: ${manifest.result.rowCount}`,
          `- CSV: ${manifest.result.file.name} (${formatBytes(manifest.result.file.bytes)})`,
          `- Manifest: ${filenameBase}.manifest.json (${formatBytes(manifestBytes)})`,
          '',
          'Notes:',
          '- This CSV is one row per ownership record (asset-owner relationship), not one row per asset.',
          '- "Asset Country"/coordinates come from `asset_locations.parquet` joined on `GEM location ID`.',
        ].join('\n'),
        `${filenameBase}.README.txt`,
        'text/plain;charset=utf-8'
      );

      lastExportManifest = manifest;
      addLog('Downloads created', { csvBytes: fileSize, manifestBytes });

      exportProgress = `Exported ${data.length} rows for ${ids.length} assets`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Export entities CSV - includes their portfolio (owned assets)
  async function exportEntitiesCSV() {
    const ids = entityItems.map((e) => e.id);
    if (ids.length === 0) {
      alert('No entities in cart');
      return;
    }

    exporting = true;
    resetExportUI();
    exportProgress = 'Initializing database...';
    error = null;

    try {
      const startedAt = Date.now();
      addLog('Starting export', { type: 'entities', entityCount: ids.length });
      await ensureDB();
      addLog('DuckDB ready', { elapsedMs: Date.now() - startedAt });

      exportProgress = `Querying portfolio for ${ids.length} entities...`;
      const idList = buildIdList(ids);

      // Query all assets owned by these entities
      const sql = `
        SELECT
          'Entity Portfolio' as "Record Type",
          o."Owner GEM Entity ID" as "Entity ID",
          o."Owner" as "Entity Name",
          o."Owner Registration Country" as "Entity Registration Country",
          o."Owner Headquarters Country" as "Entity HQ Country",
          o."GEM unit ID" as "Asset ID",
          o."Project" as "Asset Name",
          o."Tracker" as "Asset Type",
          o."Status" as "Asset Status",
          COALESCE(l."Country.Area", 'Unknown') as "Asset Country",
          CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
          CAST(o."Share" AS DOUBLE) as "Ownership Share %",
          o."Ownership Path" as "Ownership Path"
        FROM ownership o
        LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
        WHERE o."Owner GEM Entity ID" IN (${idList})
        ORDER BY o."Owner", o."Project"
      `;

      addLog('Executing query', { hash: hashStringFNV1a(sql), sqlPreview: sql.trim().slice(0, 260) });
      const result = await query(sql);
      if (!result.success) throw new Error(result.error || 'Query failed');

      const data = result.data || [];
      if (data.length === 0) {
        throw new Error('No portfolio data found for selected entities.');
      }

      exportProgress = `Converting ${data.length} rows to CSV...`;
      addLog('Converting to CSV', { rows: data.length });
      const { csv, columns } = await convertToCSVAsync(data, {
        onProgress: ({ done, total }) => {
          const pct = Math.round((done / total) * 100);
          exportProgress = `Converting to CSV… ${pct}% (${formatNumber(done)}/${formatNumber(total)})`;
        },
      });
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const filenameBase = `gem-entities-${ids.length}-portfolio-${date}`;
      const filename = `${filenameBase}.csv`;
      const fileSize = downloadCSV(csv, filename);

      const manifest = {
        kind: 'entities',
        generatedAt: nowIso(),
        app: { version: appVersion, buildHash, buildTime },
        selection: { assetIds: [], entityIds: ids },
        sql: { main: sql.trim(), hash: hashStringFNV1a(sql) },
        columns,
        result: { rowCount: data.length, file: { name: filename, bytes: fileSize } },
        analysis: analysis?.entities || null,
        environment: {
          locale: navigator.language,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userAgent: navigator.userAgent,
        },
        timings: { totalMs: Date.now() - startedAt },
      };

      const manifestBytes = downloadTextFile(
        JSON.stringify(manifest, null, 2),
        `${filenameBase}.manifest.json`,
        'application/json;charset=utf-8'
      );
      downloadTextFile(
        [
          'GEM Viz Export Manifest',
          `- Generated: ${manifest.generatedAt}`,
          `- Kind: ${manifest.kind}`,
          `- App: v${manifest.app.version} (${manifest.app.buildHash} @ ${manifest.app.buildTime})`,
          `- Entities requested: ${manifest.selection.entityIds.length}`,
          `- Ownership rows exported: ${manifest.result.rowCount}`,
          `- CSV: ${manifest.result.file.name} (${formatBytes(manifest.result.file.bytes)})`,
          `- Manifest: ${filenameBase}.manifest.json (${formatBytes(manifestBytes)})`,
          '',
          'Notes:',
          '- This CSV is one row per owned asset record (entity portfolio), not one row per entity.',
          '- "Asset Country" comes from `asset_locations.parquet` joined on `GEM location ID`.',
        ].join('\n'),
        `${filenameBase}.README.txt`,
        'text/plain;charset=utf-8'
      );

      lastExportManifest = manifest;
      addLog('Downloads created', { csvBytes: fileSize, manifestBytes });

      exportProgress = `Exported ${data.length} ownership records for ${ids.length} entities`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  // Export everything (combined)
  async function exportAllCSV() {
    if (totalCount === 0) {
      alert('No items in cart');
      return;
    }

    exporting = true;
    resetExportUI();
    exportProgress = 'Initializing database...';
    error = null;

    try {
      const startedAt = Date.now();
      addLog('Starting export', { type: 'all', totalCount, assetCount, entityCount });
      await ensureDB();
      addLog('DuckDB ready', { elapsedMs: Date.now() - startedAt });

      const assetIds = assetItems.map((a) => a.id);
      const entityIds = entityItems.map((e) => e.id);
      const allData = [];
      const querySummaries = [];

      // Query assets
      if (assetIds.length > 0) {
        exportProgress = `Querying ${assetIds.length} assets...`;
        const assetIdList = buildIdList(assetIds);
        const assetSql = `
          SELECT
            'Asset' as "Record Type",
            o."GEM unit ID" as "ID",
            o."Project" as "Name",
            o."Tracker" as "Type",
            o."Status",
            COALESCE(l."Country.Area", 'Unknown') as "Country",
            CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
            o."Owner" as "Owner Name",
            o."Owner GEM Entity ID" as "Owner ID",
            CAST(o."Share" AS DOUBLE) as "Ownership %",
            l."Latitude",
            l."Longitude"
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE o."GEM unit ID" IN (${assetIdList})
        `;
        addLog('Executing asset query', {
          hash: hashStringFNV1a(assetSql),
          sqlPreview: assetSql.trim().slice(0, 240),
        });
        const assetResult = await query(assetSql);
        if (assetResult.success && assetResult.data) {
          allData.push(...assetResult.data);
          querySummaries.push({
            kind: 'assets',
            hash: hashStringFNV1a(assetSql),
            rows: assetResult.data.length,
            sql: assetSql.trim(),
          });
        }
      }

      // Query entity portfolios
      if (entityIds.length > 0) {
        exportProgress = `Querying ${entityIds.length} entity portfolios...`;
        const entityIdList = buildIdList(entityIds);
        const entitySql = `
          SELECT
            'Entity Portfolio' as "Record Type",
            o."Owner GEM Entity ID" as "ID",
            o."Owner" as "Name",
            o."Tracker" as "Type",
            o."Status",
            COALESCE(l."Country.Area", 'Unknown') as "Country",
            CAST(o."Capacity (MW)" AS DOUBLE) as "Capacity MW",
            o."Project" as "Owned Asset",
            o."GEM unit ID" as "Owned Asset ID",
            CAST(o."Share" AS DOUBLE) as "Ownership %",
            NULL as "Latitude",
            NULL as "Longitude"
          FROM ownership o
          LEFT JOIN locations l ON o."GEM location ID" = l."GEM.location.ID"
          WHERE o."Owner GEM Entity ID" IN (${entityIdList})
        `;
        addLog('Executing entity query', {
          hash: hashStringFNV1a(entitySql),
          sqlPreview: entitySql.trim().slice(0, 240),
        });
        const entityResult = await query(entitySql);
        if (entityResult.success && entityResult.data) {
          allData.push(...entityResult.data);
          querySummaries.push({
            kind: 'entities',
            hash: hashStringFNV1a(entitySql),
            rows: entityResult.data.length,
            sql: entitySql.trim(),
          });
        }
      }

      if (allData.length === 0) {
        throw new Error('No data found for selected items.');
      }

      exportProgress = `Converting ${allData.length} rows to CSV...`;
      addLog('Converting to CSV', { rows: allData.length });
      const { csv, columns } = await convertToCSVAsync(allData, {
        onProgress: ({ done, total }) => {
          const pct = Math.round((done / total) * 100);
          exportProgress = `Converting to CSV… ${pct}% (${formatNumber(done)}/${formatNumber(total)})`;
        },
      });
      const date = new Date().toISOString().replace(/[:.]/g, '-');
      const filenameBase = `gem-export-${totalCount}-items-${date}`;
      const filename = `${filenameBase}.csv`;
      const fileSize = downloadCSV(csv, filename);

      const manifest = {
        kind: 'all',
        generatedAt: nowIso(),
        app: { version: appVersion, buildHash, buildTime },
        selection: { assetIds, entityIds },
        sql: {
          parts: querySummaries.map((q) => ({ kind: q.kind, hash: q.hash, sql: q.sql })),
        },
        columns,
        result: { rowCount: allData.length, file: { name: filename, bytes: fileSize } },
        analysis: analysis?.combined || null,
        environment: {
          locale: navigator.language,
          timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          userAgent: navigator.userAgent,
        },
        timings: { totalMs: Date.now() - startedAt },
      };

      const manifestBytes = downloadTextFile(
        JSON.stringify(manifest, null, 2),
        `${filenameBase}.manifest.json`,
        'application/json;charset=utf-8'
      );
      downloadTextFile(
        [
          'GEM Viz Export Manifest',
          `- Generated: ${manifest.generatedAt}`,
          `- Kind: ${manifest.kind}`,
          `- App: v${manifest.app.version} (${manifest.app.buildHash} @ ${manifest.app.buildTime})`,
          `- Cart items: ${totalCount} (${assetCount} assets, ${entityCount} entities)`,
          `- Rows exported: ${manifest.result.rowCount}`,
          `- CSV: ${manifest.result.file.name} (${formatBytes(manifest.result.file.bytes)})`,
          `- Manifest: ${filenameBase}.manifest.json (${formatBytes(manifestBytes)})`,
          '',
          'Notes:',
          '- Combined exports contain multiple record types; use the "Record Type" column to split.',
          '- "Country" in exports comes from `asset_locations.parquet` joined on `GEM location ID`.',
        ].join('\n'),
        `${filenameBase}.README.txt`,
        'text/plain;charset=utf-8'
      );

      lastExportManifest = manifest;
      addLog('Downloads created', { csvBytes: fileSize, manifestBytes });

      exportProgress = `Exported ${allData.length} rows`;
    } catch (err) {
      error = err.message;
      exportProgress = '';
    } finally {
      exporting = false;
    }
  }

  function escapeCSVVal(val) {
    if (val === null || val === undefined) return '';
    if (typeof val === 'object') val = JSON.stringify(val);
    const str = String(val);
    const needsQuoting = /[",\n\r]/.test(str);
    if (needsQuoting) return `"${str.replace(/"/g, '""')}"`;
    return str;
  }

  async function convertToCSVAsync(data, { onProgress = null, chunkSize = 2500 } = {}) {
    if (data.length === 0) return { csv: '', columns: [] };

    const columns = [...new Set(data.flatMap((row) => Object.keys(row)))].sort();
    const lines = new Array(data.length + 1);
    lines[0] = columns.map((col) => escapeCSVVal(col)).join(',');

    const total = data.length;
    for (let i = 0; i < total; i += 1) {
      lines[i + 1] = columns.map((col) => escapeCSVVal(data[i][col])).join(',');

      if (onProgress && (i + 1) % chunkSize === 0) {
        onProgress({ done: i + 1, total });
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => requestAnimationFrame(resolve));
      }
    }

    if (onProgress) onProgress({ done: total, total });
    return { csv: lines.join('\r\n'), columns };
  }

  // Trigger browser download
  function downloadCSV(csv, filename) {
    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    return blob.size;
  }

  function handleRowClick(row) {
    if (row.type === 'entity') {
      goto(entityLink(row.id));
    } else {
      goto(assetLink(row.id));
    }
  }
</script>

<svelte:head>
  <title>Export ({totalCount}) — GEM Viz</title>
</svelte:head>

<main>
  <header>
    <a href={link('index')} class="back-link">Back to Map</a>
    <span class="title">Export List</span>
    <span class="count">
      {totalCount} items
      {#if assetCount > 0 && entityCount > 0}
        ({assetCount} assets, {entityCount} entities)
      {:else if assetCount > 0}
        ({assetCount} assets)
      {:else if entityCount > 0}
        ({entityCount} entities)
      {/if}
    </span>
  </header>

  {#if totalCount === 0}
    <div class="empty-state">
      <h2>No items in export list</h2>
      <p>Add assets or entities to your cart from the map, search, or detail pages.</p>
      <div class="empty-actions">
        <a href={link('index')} class="btn">Go to Map</a>
        <a href={link('explore')} class="btn">Explore Data</a>
      </div>
    </div>
  {:else}
    <div class="export-actions">
      <button class="btn btn-primary" onclick={exportAllCSV} disabled={exporting || loading}>
        {exporting ? 'Exporting...' : `Export All (${totalCount} items)`}
      </button>
      {#if assetCount > 0}
        <button class="btn" onclick={exportAssetsCSV} disabled={exporting || loading}>
          Assets Only ({assetCount})
        </button>
      {/if}
      {#if entityCount > 0}
        <button class="btn" onclick={exportEntitiesCSV} disabled={exporting || loading}>
          Entities Only ({entityCount})
        </button>
      {/if}
      <button class="btn btn-danger" onclick={clearAll} disabled={exporting}>Clear All</button>
      {#if exportProgress}
        <span class="progress">{exportProgress}</span>
      {/if}
    </div>

    {#if error}
      <div class="error-banner">Error: {error}</div>
    {/if}

    <section class="analysis-panel">
      <div class="analysis-header">
        <h2>Export Preflight</h2>
        <div class="analysis-meta">
          {#if analysisLoading}
            <span class="muted">Analyzing…</span>
          {:else if analysis}
            <span class="muted">Updated {new Date(analysis.generatedAt).toLocaleString()}</span>
          {:else}
            <span class="muted">Not analyzed yet</span>
          {/if}
          <button class="btn btn-small" onclick={runAnalysis} disabled={analysisLoading || loading || exporting}>
            Refresh
          </button>
        </div>
      </div>

      {#if analysisError}
        <div class="error-banner">Analysis error: {analysisError}</div>
      {/if}

      {#if analysis}
        <div class="analysis-grid">
          {#if analysis.combined?.summary}
            <div class="stat-card">
              <div class="stat-title">Combined Export</div>
              <div class="stat-value">{formatNumber(analysis.combined.summary.ownership_rows)} rows</div>
              <div class="stat-sub">
                {formatNumber(analysis.combined.summary.distinct_assets)} assets ·
                {formatNumber(analysis.combined.summary.distinct_entities)} entities ·
                {formatNumber(analysis.combined.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
          {#if analysis.assets?.summary}
            <div class="stat-card">
              <div class="stat-title">Assets Export</div>
              <div class="stat-value">{formatNumber(analysis.assets.summary.ownership_rows)} rows</div>
              <div class="stat-sub">
                {formatNumber(analysis.assets.summary.distinct_assets)} assets ·
                {formatNumber(analysis.assets.summary.distinct_entities)} owners ·
                {formatNumber(analysis.assets.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
          {#if analysis.entities?.summary}
            <div class="stat-card">
              <div class="stat-title">Entities Export</div>
              <div class="stat-value">{formatNumber(analysis.entities.summary.ownership_rows)} rows</div>
              <div class="stat-sub">
                {formatNumber(analysis.entities.summary.distinct_assets)} assets ·
                {formatNumber(analysis.entities.summary.distinct_entities)} entities ·
                {formatNumber(analysis.entities.summary.distinct_countries)} countries
              </div>
            </div>
          {/if}
        </div>

        <div class="spark-grid">
          {#if analysis.combined?.topTrackers?.length}
            <div class="spark-card">
              <div class="spark-header">
                <span class="spark-title">Top Trackers</span>
                <svg class="sparkline" viewBox="0 0 80 18" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    points={sparklinePoints(analysis.combined.topTrackers.map((r) => r.rows))}
                  />
                </svg>
              </div>
              <div class="spark-rows">
                {#each analysis.combined.topTrackers as row}
                  <div class="spark-row">
                    <span class="spark-key">{row.key}</span>
                    <span class="spark-val">{formatNumber(row.rows)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if analysis.combined?.topStatuses?.length}
            <div class="spark-card">
              <div class="spark-header">
                <span class="spark-title">Top Statuses</span>
                <svg class="sparkline" viewBox="0 0 80 18" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    points={sparklinePoints(analysis.combined.topStatuses.map((r) => r.rows))}
                  />
                </svg>
              </div>
              <div class="spark-rows">
                {#each analysis.combined.topStatuses as row}
                  <div class="spark-row">
                    <span class="spark-key">{row.key}</span>
                    <span class="spark-val">{formatNumber(row.rows)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          {#if analysis.combined?.topCountries?.length}
            <div class="spark-card">
              <div class="spark-header">
                <span class="spark-title">Top Countries</span>
                <svg class="sparkline" viewBox="0 0 80 18" aria-hidden="true">
                  <polyline
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.5"
                    points={sparklinePoints(analysis.combined.topCountries.map((r) => r.rows))}
                  />
                </svg>
              </div>
              <div class="spark-rows">
                {#each analysis.combined.topCountries as row}
                  <div class="spark-row">
                    <span class="spark-key">{row.key}</span>
                    <span class="spark-val">{formatNumber(row.rows)}</span>
                  </div>
                {/each}
              </div>
            </div>
          {/if}
        </div>

        <details class="details">
          <summary>Schema + SQL details</summary>
          <div class="details-body">
            <div class="details-grid">
              <div>
                <div class="details-title">Ownership Columns</div>
                <div class="details-mono">
                  {analysis.ownershipSchema ? analysis.ownershipSchema.map((c) => `${c.name} (${c.type})`).join('\n') : 'Unavailable'}
                </div>
              </div>
              <div>
                <div class="details-title">Locations Columns</div>
                <div class="details-mono">
                  {analysis.locationsSchema ? analysis.locationsSchema.map((c) => `${c.name} (${c.type})`).join('\n') : 'Unavailable'}
                </div>
              </div>
            </div>
            {#if analysis.combined?.sql?.summary}
              <div class="details-title">Preflight SQL (summary)</div>
              <div class="details-mono">{analysis.combined.sql.summary}</div>
            {/if}
          </div>
        </details>
      {/if}
    </section>

    {#if exportLog.length > 0}
      <section class="log-panel">
        <h2>Export Log</h2>
        <div class="log-rows">
          {#each exportLog as row}
            <div class="log-row">
              <span class="log-time">{row.t}</span>
              <span class="log-msg">{row.message}</span>
              {#if row.detail}
                <span class="log-detail">{JSON.stringify(row.detail)}</span>
              {/if}
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#if lastExportManifest}
      <section class="manifest-panel">
        <h2>Last Export</h2>
        <div class="manifest-grid">
          <div class="manifest-item">
            <div class="manifest-k">Kind</div>
            <div class="manifest-v">{lastExportManifest.kind}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">Rows</div>
            <div class="manifest-v">{formatNumber(lastExportManifest.result.rowCount)}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">CSV</div>
            <div class="manifest-v">{lastExportManifest.result.file.name}</div>
          </div>
          <div class="manifest-item">
            <div class="manifest-k">Build</div>
            <div class="manifest-v">v{lastExportManifest.app.version} ({lastExportManifest.app.buildHash})</div>
          </div>
        </div>
        <p class="muted">
          Each export also downloads a JSON manifest + README with SQL hashes, timings, and selection metadata.
        </p>
      </section>
    {/if}

    <div class="info-box">
      <strong>Export Options:</strong>
      <ul>
        <li><strong>Assets:</strong> Full ownership data with coordinates, capacity, status</li>
        <li>
          <strong>Entities:</strong> Complete portfolio of owned assets with ownership percentages
        </li>
      </ul>
    </div>

    <!-- Assets Section -->
    {#if assetCount > 0}
      <section class="item-section">
        <h2>Assets ({assetCount})</h2>
        <div class="item-grid">
          {#each assetItems as item}
            <div class="item-card asset" onclick={() => handleRowClick(item)} onkeydown={(e) => e.key === 'Enter' && handleRowClick(item)} role="button" tabindex="0">
              <div class="item-header">
                {#if item.tracker}
                  <TrackerIcon tracker={item.tracker} size={12} />
                {/if}
                <span class="item-name">{item.name}</span>
              </div>
              <div class="item-meta">
                <span class="item-id">{item.id}</span>
                {#if item.tracker}
                  <span class="item-tracker">{item.tracker}</span>
                {/if}
              </div>
              <button
                class="remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  investigationCart.remove(item.id);
                }}>×</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <!-- Entities Section -->
    {#if entityCount > 0}
      <section class="item-section">
        <h2>Entities ({entityCount})</h2>
        <div class="item-grid">
          {#each entityItems as item}
            <div class="item-card entity" onclick={() => handleRowClick(item)} onkeydown={(e) => e.key === 'Enter' && handleRowClick(item)} role="button" tabindex="0">
              <div class="item-header">
                <span class="entity-icon">E</span>
                <span class="item-name">{item.name}</span>
              </div>
              <div class="item-meta">
                <span class="item-id">{item.id}</span>
                {#if item.metadata?.assetCount}
                  <span class="asset-count">{item.metadata.assetCount} assets</span>
                {/if}
              </div>
              <button
                class="remove-btn"
                onclick={(e) => {
                  e.stopPropagation();
                  investigationCart.remove(item.id);
                }}>×</button
              >
            </div>
          {/each}
        </div>
      </section>
    {/if}

    <div class="export-actions bottom">
      <button class="btn btn-primary" onclick={exportAllCSV} disabled={exporting || loading}>
        {exporting ? 'Exporting...' : `Export All (${totalCount} items)`}
      </button>
    </div>
  {/if}
</main>

<style>
  main {
    width: 100%;
    margin: 0 auto;
    padding: 20px 40px;
  }

  header {
    border-bottom: 1px solid var(--color-black);
    padding-bottom: 15px;
    margin-bottom: 20px;
    display: flex;
    gap: 20px;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .back-link {
    color: var(--color-black);
    text-decoration: underline;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .back-link:hover {
    text-decoration: none;
  }

  .title {
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .count {
    font-size: 10px;
    color: var(--color-text-secondary);
    margin-left: auto;
  }

  .empty-state {
    text-align: center;
    padding: 60px 20px;
    color: var(--color-text-secondary);
  }

  .empty-state h2 {
    font-size: 18px;
    font-weight: normal;
    margin-bottom: 10px;
  }

  .empty-state p {
    margin-bottom: 20px;
  }

  .empty-actions {
    display: flex;
    gap: 12px;
    justify-content: center;
  }

  .export-actions {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    margin-bottom: 20px;
    flex-wrap: wrap;
  }

  .export-actions.bottom {
    margin-top: 20px;
    margin-bottom: 0;
    justify-content: center;
  }

  .progress {
    font-size: 11px;
    color: var(--color-text-secondary);
    font-style: italic;
  }

  .muted {
    color: var(--color-text-secondary);
    font-size: 11px;
  }

  .analysis-panel,
  .log-panel,
  .manifest-panel {
    border: 1px solid var(--color-border);
    background: var(--color-white);
    padding: 16px;
    margin-bottom: 20px;
  }

  .analysis-header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 10px;
    border-bottom: 1px solid var(--color-gray-100);
    padding-bottom: 10px;
    margin-bottom: 12px;
  }

  .analysis-header h2,
  .log-panel h2,
  .manifest-panel h2 {
    margin: 0;
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .analysis-meta {
    display: flex;
    gap: 10px;
    align-items: center;
  }

  .analysis-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
    margin-bottom: 14px;
  }

  .stat-card {
    border: 1px solid var(--color-gray-100);
    background: var(--color-gray-50);
    padding: 12px;
  }

  .stat-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
    margin-bottom: 4px;
  }

  .stat-value {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 4px;
  }

  .stat-sub {
    font-size: 11px;
    color: var(--color-text-secondary);
  }

  .spark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px;
    margin-bottom: 10px;
  }

  .spark-card {
    border: 1px solid var(--color-gray-100);
    padding: 12px;
    background: var(--color-white);
  }

  .spark-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
  }

  .spark-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-black);
  }

  .sparkline {
    width: 90px;
    height: 18px;
    color: var(--color-black);
    opacity: 0.7;
  }

  .spark-rows {
    display: grid;
    gap: 6px;
  }

  .spark-row {
    display: grid;
    grid-template-columns: 1fr auto;
    gap: 10px;
    font-size: 11px;
  }

  .spark-key {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--color-gray-700);
  }

  .spark-val {
    font-family: monospace;
    color: var(--color-text-secondary);
  }

  .details {
    border-top: 1px dashed var(--color-gray-100);
    padding-top: 10px;
    margin-top: 10px;
  }

  .details summary {
    cursor: pointer;
    font-size: 12px;
  }

  .details-body {
    margin-top: 10px;
    display: grid;
    gap: 10px;
  }

  .details-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 10px;
  }

  .details-title {
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 6px;
    color: var(--color-text-secondary);
  }

  .details-mono {
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    font-size: 10px;
    white-space: pre-wrap;
    border: 1px solid var(--color-gray-100);
    background: var(--color-gray-50);
    padding: 10px;
    color: var(--color-gray-700);
    max-height: 260px;
    overflow: auto;
  }

  .log-rows {
    display: grid;
    gap: 6px;
  }

  .log-row {
    display: grid;
    grid-template-columns: 90px 1fr;
    gap: 10px;
    font-size: 11px;
    border: 1px solid var(--color-gray-100);
    background: var(--color-gray-50);
    padding: 8px 10px;
  }

  .log-time {
    font-family: monospace;
    color: var(--color-text-secondary);
  }

  .log-detail {
    grid-column: 1 / -1;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
    color: var(--color-text-secondary);
    white-space: pre-wrap;
  }

  .manifest-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 10px;
    margin-bottom: 8px;
  }

  .manifest-item {
    border: 1px solid var(--color-gray-100);
    background: var(--color-gray-50);
    padding: 10px;
  }

  .manifest-k {
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: var(--color-text-secondary);
    margin-bottom: 4px;
  }

  .manifest-v {
    font-size: 12px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
  }

  .btn.btn-small {
    padding: 6px 10px;
    font-size: 11px;
  }

  .error-banner {
    padding: 12px 16px;
    background: var(--color-error-bg, #ffebee);
    border: 1px solid var(--color-error-border, #ef9a9a);
    color: var(--color-error-text, #c62828);
    margin-bottom: 20px;
    font-size: 12px;
  }

  .info-box {
    padding: 12px 16px;
    background: var(--color-gray-50);
    border: 1px solid var(--color-border);
    margin-bottom: 20px;
    font-size: 12px;
    line-height: 1.5;
  }

  .info-box strong {
    display: block;
    margin-bottom: 4px;
  }

  .info-box ul {
    margin: 8px 0 0 0;
    padding-left: 20px;
  }

  .info-box li {
    margin-bottom: 4px;
  }

  /* Item sections */
  .item-section {
    margin-bottom: 32px;
  }

  .item-section h2 {
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin: 0 0 12px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }

  .item-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }

  .item-card {
    position: relative;
    padding: 12px 32px 12px 12px;
    background: var(--color-white);
    border: 1px solid var(--color-border);
    cursor: pointer;
    transition: all 0.15s;
  }

  .item-card:hover {
    border-color: var(--color-black);
    background: var(--color-gray-50);
  }

  .item-card.asset {
    border-left: 3px solid var(--color-gray-700);
  }

  .item-card.entity {
    border-left: 3px solid var(--color-entity-text, #7b1fa2);
  }

  .item-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .item-name {
    font-size: 13px;
    font-weight: 500;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .item-meta {
    display: flex;
    gap: 12px;
    font-size: 10px;
    color: var(--color-text-secondary);
  }

  .item-id {
    font-family: monospace;
  }

  .item-tracker {
    text-transform: uppercase;
  }

  .asset-count {
    color: var(--color-entity-text, #7b1fa2);
  }

  .entity-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    background: var(--color-entity-text, #7b1fa2);
    color: white;
    border-radius: 50%;
    font-size: 10px;
    font-weight: bold;
    flex-shrink: 0;
  }

  .remove-btn {
    position: absolute;
    top: 8px;
    right: 8px;
    width: 20px;
    height: 20px;
    padding: 0;
    border: none;
    background: transparent;
    color: var(--color-text-tertiary);
    font-size: 16px;
    cursor: pointer;
    line-height: 1;
  }

  .remove-btn:hover {
    color: var(--color-error-text, #c62828);
  }

  @media (max-width: 768px) {
    main {
      padding: 15px;
    }
    .item-grid {
      grid-template-columns: 1fr;
    }
  }
</style>

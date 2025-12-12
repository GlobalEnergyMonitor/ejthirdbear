<script>
  import motherduck from '$lib/motherduck-wasm';
  import { mapFilter, isPolygonFilter, isBoundsFilter } from '$lib/mapFilter';

  export let tableName = 'data';

  let tables = [];
  let loading = true;

  $: if (tableName || $mapFilter) {
    generateTables();
  }

  function buildGeoFilter() {
    if (!$mapFilter) return '';

    if (isPolygonFilter($mapFilter)) {
      // For polygon filters, get bounding box for initial SQL filter
      const { coordinates, latCol, lonCol } = $mapFilter;
      const lons = coordinates.map((c) => c[0]);
      const lats = coordinates.map((c) => c[1]);

      const west = Math.min(...lons);
      const east = Math.max(...lons);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      return `AND "${latCol}" BETWEEN ${south} AND ${north} AND "${lonCol}" BETWEEN ${west} AND ${east}`;
    } else if (isBoundsFilter($mapFilter)) {
      // Rectangle bounds
      const { north, south, east, west, latCol, lonCol } = $mapFilter;
      return `AND "${latCol}" BETWEEN ${south} AND ${north} AND "${lonCol}" BETWEEN ${west} AND ${east}`;
    }
    return '';
  }

  async function generateTables() {
    try {
      loading = true;
      tables = [];

      // Get schema
      const schemaQuery = await motherduck.query(`
        SELECT column_name, data_type
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position;
      `);

      const columns = schemaQuery.data;

      // Cross-tab: Tracker x Status
      if (
        columns.find((c) => c.column_name === 'Tracker') &&
        columns.find((c) => c.column_name === 'Status')
      ) {
        const geoFilter = buildGeoFilter();
        const crosstabQuery = await motherduck.query(`
          SELECT
            Tracker,
            Status,
            COUNT(*) as count
          FROM ${tableName}
          WHERE Tracker IS NOT NULL AND Status IS NOT NULL ${geoFilter}
          GROUP BY Tracker, Status
          ORDER BY Tracker, count DESC;
        `);

        if (crosstabQuery.success && crosstabQuery.data.length > 0) {
          // Pivot the data
          const pivoted = {};
          const statuses = new Set();

          crosstabQuery.data.forEach((row) => {
            if (!pivoted[row.Tracker]) {
              pivoted[row.Tracker] = {};
            }
            pivoted[row.Tracker][row.Status] = row.count;
            statuses.add(row.Status);
          });

          const statusArray = Array.from(statuses);
          const rows = Object.entries(pivoted).map(([tracker, counts]) => ({
            tracker,
            ...counts,
            total: Object.values(counts).reduce((a, b) => a + b, 0),
          }));

          tables.push({
            title: 'Tracker Type × Status Cross-Tabulation',
            headers: ['Tracker', ...statusArray, 'Total'],
            rows: rows.map((r) => [r.tracker, ...statusArray.map((s) => r[s] || 0), r.total]),
          });
        }
      }

      // Country summary with counts
      const countryCol = columns.find((c) => c.column_name.toLowerCase().includes('country'));

      if (countryCol) {
        const geoFilter = buildGeoFilter();
        const countryQuery = await motherduck.query(`
          SELECT
            ${countryCol.column_name},
            COUNT(*) as records,
            COUNT(DISTINCT CASE WHEN "Owner" IS NOT NULL THEN "Owner" END) as unique_owners
          FROM ${tableName}
          WHERE ${countryCol.column_name} IS NOT NULL ${geoFilter}
          GROUP BY ${countryCol.column_name}
          ORDER BY records DESC
          LIMIT 20;
        `);

        if (countryQuery.success && countryQuery.data.length > 0) {
          tables.push({
            title: `Top 20 Countries (${countryCol.column_name})`,
            headers: ['Country', 'Records', 'Unique Owners'],
            rows: countryQuery.data.map((r) => [
              r[countryCol.column_name],
              r.records.toLocaleString(),
              r.unique_owners ? r.unique_owners.toLocaleString() : 'N/A',
            ]),
          });
        }
      }

      loading = false;
    } catch (error) {
      console.error('Failed to generate tables:', error);
      loading = false;
    }
  }
</script>

<div class="tables-panel">
  <h3>📋 Data Tables</h3>

  {#if loading}
    <div class="loading">Generating tables...</div>
  {:else if tables.length > 0}
    <div class="tables-container">
      {#each tables as table}
        <div class="table-card">
          <h4>{table.title}</h4>
          <div class="table-wrapper">
            <table>
              <thead>
                <tr>
                  {#each table.headers as header}
                    <th>{header}</th>
                  {/each}
                </tr>
              </thead>
              <tbody>
                {#each table.rows as row}
                  <tr>
                    {#each row as cell}
                      <td>{cell}</td>
                    {/each}
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        </div>
      {/each}
    </div>
  {:else}
    <p class="no-data">No table data available</p>
  {/if}
</div>

<style>
  .tables-panel {
    margin: 20px 0;
    padding: 20px;
    background: #fff;
    border: 1px solid #000;
  }

  h3 {
    margin: 0 0 20px 0;
    font-size: 13px;
    font-weight: bold;
    text-transform: uppercase;
    border-bottom: 1px solid #000;
    padding-bottom: 10px;
  }

  .tables-container {
    display: flex;
    flex-direction: column;
    gap: 25px;
  }

  .table-card {
    border: 1px solid #ddd;
    background: #fafafa;
  }

  h4 {
    margin: 0;
    padding: 12px 15px;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    background: #f0f0f0;
    border-bottom: 1px solid #ddd;
  }

  .table-wrapper {
    overflow-x: auto;
    padding: 15px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 10px;
  }

  thead {
    background: #000;
    color: #fff;
  }

  th {
    padding: 8px 10px;
    text-align: left;
    font-weight: bold;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  td {
    padding: 6px 10px;
    border-bottom: 1px solid #e0e0e0;
  }

  tr:last-child td {
    border-bottom: none;
  }

  tbody tr:hover {
    background: #f9f9f9;
  }

  tbody tr:nth-child(odd) {
    background: #fafafa;
  }

  tbody tr:nth-child(odd):hover {
    background: #f5f5f5;
  }

  .loading,
  .no-data {
    padding: 30px;
    text-align: center;
    color: #666;
    font-size: 11px;
  }

  .no-data {
    font-style: italic;
    color: #999;
  }
</style>

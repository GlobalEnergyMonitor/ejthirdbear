<script>
  import motherduck from '$lib/motherduck-wasm';
  import { mapFilter } from '$lib/mapFilter';

  export let tableName = 'data';

  let rankings = [];
  let loading = true;

  $: if (tableName || $mapFilter) {
    generateRankings();
  }

  // Helper function for point-in-polygon check (used in geo filtering)
  // eslint-disable-next-line no-unused-vars
  function pointInPolygon(x, y, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i][0], yi = polygon[i][1];
      const xj = polygon[j][0], yj = polygon[j][1];

      const intersect = ((yi > y) !== (yj > y))
        && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function buildGeoFilter() {
    if (!$mapFilter) return '';

    if ($mapFilter.type === 'polygon') {
      // For polygon filters, get bounding box for initial SQL filter
      // Then do client-side polygon filtering
      const { coordinates, latCol, lonCol } = $mapFilter;
      const lons = coordinates.map(c => c[0]);
      const lats = coordinates.map(c => c[1]);

      const west = Math.min(...lons);
      const east = Math.max(...lons);
      const south = Math.min(...lats);
      const north = Math.max(...lats);

      // Use bounding box as initial filter
      return `AND "${latCol}" BETWEEN ${south} AND ${north} AND "${lonCol}" BETWEEN ${west} AND ${east}`;
    } else {
      // Rectangle bounds
      const { north, south, east, west, latCol, lonCol } = $mapFilter;
      return `AND "${latCol}" BETWEEN ${south} AND ${north} AND "${lonCol}" BETWEEN ${west} AND ${east}`;
    }
  }

  async function generateRankings() {
    try {
      loading = true;
      rankings = [];

      // Get schema to determine what columns exist
      const schemaQuery = await motherduck.query(`
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = '${tableName}'
        ORDER BY ordinal_position;
      `);

      if (!schemaQuery.success || !schemaQuery.data) {
        console.error('Failed to get schema:', schemaQuery.error);
        loading = false;
        return;
      }

      const columns = schemaQuery.data.map((c) => c.column_name);

      // Top Owners
      if (columns.includes('Owner')) {
        const geoFilter = buildGeoFilter();
        const ownersQuery = await motherduck.query(`
          SELECT "Owner", COUNT(*) as count
          FROM ${tableName}
          WHERE "Owner" IS NOT NULL ${geoFilter}
          GROUP BY "Owner"
          ORDER BY count DESC
          LIMIT 10;
        `);

        if (ownersQuery.success && ownersQuery.data.length > 0) {
          rankings.push({
            title: 'Top 10 Owners by Record Count',
            data: ownersQuery.data,
          });
        }
      }

      // Top Projects
      if (columns.includes('Project')) {
        const geoFilter = buildGeoFilter();
        const projectsQuery = await motherduck.query(`
          SELECT "Project", COUNT(*) as count
          FROM ${tableName}
          WHERE "Project" IS NOT NULL ${geoFilter}
          GROUP BY "Project"
          ORDER BY count DESC
          LIMIT 10;
        `);

        if (projectsQuery.success && projectsQuery.data.length > 0) {
          rankings.push({
            title: 'Top 10 Projects',
            data: projectsQuery.data,
          });
        }
      }

      // Top Countries
      const countryColumns = columns.filter((c) => c.toLowerCase().includes('country'));

      if (countryColumns.length > 0) {
        const geoFilter = buildGeoFilter();
        const countryQuery = await motherduck.query(`
          SELECT "${countryColumns[0]}", COUNT(*) as count
          FROM ${tableName}
          WHERE "${countryColumns[0]}" IS NOT NULL ${geoFilter}
          GROUP BY "${countryColumns[0]}"
          ORDER BY count DESC
          LIMIT 10;
        `);

        if (countryQuery.success && countryQuery.data.length > 0) {
          rankings.push({
            title: `Top 10 Countries (${countryColumns[0]})`,
            data: countryQuery.data,
          });
        }
      }

      // Status breakdown
      if (columns.includes('Status')) {
        const geoFilter = buildGeoFilter();
        const statusQuery = await motherduck.query(`
          SELECT "Status", COUNT(*) as count
          FROM ${tableName}
          WHERE "Status" IS NOT NULL ${geoFilter}
          GROUP BY "Status"
          ORDER BY count DESC;
        `);

        if (statusQuery.success && statusQuery.data.length > 0) {
          rankings.push({
            title: 'Status Breakdown',
            data: statusQuery.data,
          });
        }
      }

      loading = false;
    } catch (error) {
      console.error('Failed to generate rankings:', error);
      loading = false;
    }
  }
</script>

<div class="rankings-panel">
  <h3>📊 Top Rankings & Breakdowns</h3>

  {#if loading}
    <div class="loading">Analyzing data...</div>
  {:else if rankings.length > 0}
    <div class="rankings-grid">
      {#each rankings as ranking}
        <div class="ranking-card">
          <h4>{ranking.title}</h4>
          <table>
            <tbody>
              {#each ranking.data as row, i}
                <tr>
                  <td class="rank">#{i + 1}</td>
                  <td class="name">{Object.values(row)[0]}</td>
                  <td class="count">{Object.values(row)[1].toLocaleString()}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  {:else}
    <p class="no-data">No ranking data available</p>
  {/if}
</div>

<style>
  .rankings-panel {
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

  .rankings-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 20px;
  }

  .ranking-card {
    border: 1px solid #ddd;
    padding: 15px;
    background: #fafafa;
  }

  h4 {
    margin: 0 0 10px 0;
    font-size: 11px;
    font-weight: bold;
    text-transform: uppercase;
    color: #333;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  tr {
    border-bottom: 1px solid #e0e0e0;
  }

  tr:last-child {
    border-bottom: none;
  }

  td {
    padding: 6px 4px;
    font-size: 10px;
  }

  .rank {
    width: 30px;
    color: #999;
    font-weight: bold;
  }

  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 200px;
  }

  .count {
    text-align: right;
    font-weight: bold;
    color: #000;
  }

  .loading {
    padding: 30px;
    text-align: center;
    color: #666;
    font-size: 11px;
  }

  .no-data {
    padding: 20px;
    text-align: center;
    color: #999;
    font-style: italic;
  }
</style>
